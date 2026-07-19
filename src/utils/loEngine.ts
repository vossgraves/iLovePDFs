/**
 * LibreOffice WASM conversion engine (lazy singleton).
 *
 * The engine (~236MB) is streamed from unpkg's CDN on first use and cached
 * by the browser afterwards. It powers high-fidelity Office conversions:
 * docx/xlsx/pptx -> pdf and pdf -> docx/xlsx/pptx.
 */

type ProgressFn = (percent: number, message: string) => void;

// Engine files (~236MB) can't live in git/Vercel, so they're streamed from a
// cross-origin mirror that serves the exact v2.7.1 npm package files
// (byte-identical sizes verified). To self-host instead, drop the four wasm
// files on any static host with CORS '*' and change WASM_BASE below.
const CDN_BASE = 'https://unpkg.com/@matbee/libreoffice-converter@2.7.1/';
const WASM_BASE = 'https://erseco.github.io/libreoffice-document-converter/wasm/';

interface ConvertOutput {
    data: Uint8Array;
    filename: string;
    mimeType: string;
}

interface LooseConverter {
    initialize(): Promise<void>;
    convert(
        input: Uint8Array | ArrayBuffer,
        options: { outputFormat: string; inputFormat?: string },
        filename?: string
    ): Promise<ConvertOutput>;
    isReady(): boolean;
}

let converterPromise: Promise<LooseConverter> | null = null;

/** SharedArrayBuffer requires cross-origin isolation (COOP/COEP headers on Vercel). */
export function isEngineSupported(): boolean {
    return typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated === true;
}

async function initEngine(onProgress?: ProgressFn): Promise<LooseConverter> {
    const { WorkerBrowserConverter, createWasmPaths } = await import('@matbee/libreoffice-converter/browser');

    // The worker script must be same-origin — fetch it from the CDN and blob it.
    onProgress?.(1, 'Preparing conversion engine…');
    const workerSource = await fetch(`${CDN_BASE}dist/browser.worker.global.js`).then(r => {
        if (!r.ok) throw new Error(`Could not download the engine worker (HTTP ${r.status}).`);
        return r.text();
    });
    const workerJsUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));

    const converter = new WorkerBrowserConverter({
        ...createWasmPaths(WASM_BASE),
        browserWorkerJs: workerJsUrl,
        onProgress: (p: { percent?: number; message?: string }) =>
            onProgress?.(Math.round(p.percent ?? 0), p.message ?? '')
    });

    onProgress?.(2, 'Downloading conversion engine (~236MB, one-time - cached afterwards)...');
    await converter.initialize();
    onProgress?.(100, 'Engine ready');
    return converter as unknown as LooseConverter;
}

export function getConverter(onProgress?: ProgressFn): Promise<LooseConverter> {
    if (!converterPromise) {
        converterPromise = initEngine(onProgress).catch(err => {
            converterPromise = null; // allow retry after a failed load
            throw err;
        });
    }
    return converterPromise;
}

/** Converts a document with the LibreOffice engine, reporting engine progress. */
export async function engineConvert(
    input: ArrayBuffer,
    filename: string,
    outputFormat: 'pdf' | 'docx' | 'pptx' | 'xlsx',
    onProgress?: ProgressFn
): Promise<ConvertOutput> {
    if (!isEngineSupported()) {
        throw new Error('The conversion engine needs cross-origin isolation (SharedArrayBuffer). Please use a Chromium-based browser or Firefox.');
    }

    const converter = await getConverter(onProgress);
    onProgress?.(100, 'Converting…');
    const result = await converter.convert(new Uint8Array(input), { outputFormat }, filename);

    if (!result.data || result.data.length === 0) {
        throw new Error('Conversion produced an empty file.');
    }

    return result;
}
