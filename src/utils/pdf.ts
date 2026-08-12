/**
 * Shared client-side PDF helpers.
 * Both pdf-lib and pdfjs-dist are lazy-loaded so the landing page stays fast.
 */

export interface InspectedPdf {
    name: string;
    size: number;
    bytes: ArrayBuffer;
    pageCount: number;
}

/** Reads a PDF file into memory and validates it with pdf-lib. */
export async function inspectPdf(file: File): Promise<InspectedPdf> {
    const bytes = await file.arrayBuffer();
    const { PDFDocument } = await import('pdf-lib');

    try {
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        return {
            name: file.name,
            size: file.size,
            bytes,
            pageCount: doc.getPageCount()
        };
    } catch {
        throw new Error('This PDF could not be read. It may be corrupted or password-protected.');
    }
}

/** Triggers a browser download with the correct content type for the generated artifact. */
export function downloadFile(
    data: Uint8Array,
    filename: string,
    mimeType = 'application/octet-stream'
): void {
    const blob = new Blob([data as unknown as BlobPart], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Convenience wrapper for PDF outputs. */
export function downloadPdf(data: Uint8Array, filename: string): void {
    downloadFile(data, filename, 'application/pdf');
}

/** Strips the .pdf extension and appends a suffix, e.g. report.pdf + '-4up' -> report-4up.pdf */
export function outputName(sourceName: string, suffix: string): string {
    return sourceName.replace(/\.pdf$/i, '') + suffix + '.pdf';
}

/**
 * Parses a page-range expression like "1-4, 6, 9-12" into groups of
 * zero-based page indices. Throws with a friendly message on invalid input.
 */
export function parsePageRanges(input: string, pageCount: number): number[][] {
    const tokens = input.split(',').map(t => t.trim()).filter(Boolean);

    if (tokens.length === 0) {
        throw new Error('Enter at least one page or range, e.g. "1-4, 6".');
    }

    return tokens.map(token => {
        const match = token.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
        if (!match) {
            throw new Error(`"${token}" is not a valid page or range. Use formats like 2 or 3-7.`);
        }

        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : start;

        if (start < 1 || start > end || end > pageCount) {
            throw new Error(`"${token}" is outside the valid range 1-${pageCount}.`);
        }

        const pages: number[] = [];
        for (let p = start; p <= end; p++) pages.push(p - 1);
        return pages;
    });
}

// ---------------------------------------------------------------------------
// pdfjs (lazy singleton, used only for N-up preview thumbnails)
// ---------------------------------------------------------------------------

let pdfjsWorkerReady = false;

export async function getPdfJs() {
    const pdfjs = await import('pdfjs-dist');

    if (!pdfjsWorkerReady) {
        pdfjs.GlobalWorkerOptions.workerSrc =
            new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        pdfjsWorkerReady = true;
    }

    return pdfjs;
}

// ---------------------------------------------------------------------------
// Rendering & text extraction helpers (built on pdfjs)
// ---------------------------------------------------------------------------

export interface RenderProgress {
    current: number;
    total: number;
}

/** Renders every page (up to maxPages) of a PDF to a canvas at the given DPI. */
export async function renderPdfPages(
    bytes: ArrayBuffer,
    dpi = 150,
    maxPages = Infinity,
    onProgress?: (p: RenderProgress) => void
): Promise<HTMLCanvasElement[]> {
    const pdfjs = await getPdfJs();
    // pdfjs detaches (transfers) the buffer it receives — hand it a copy.
    const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;

    try {
        const total = Math.min(doc.numPages, maxPages);
        const canvases: HTMLCanvasElement[] = [];

        for (let i = 1; i <= total; i++) {
            const page = await doc.getPage(i);
            const viewport = page.getViewport({ scale: dpi / 72 });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
            canvases.push(canvas);
            onProgress?.({ current: i, total });
        }

        return canvases;
    } finally {
        void doc.destroy();
    }
}

/** Encodes a canvas as JPEG (or PNG) bytes. */
export function canvasToBytes(canvas: HTMLCanvasElement, type: 'image/jpeg' | 'image/png' = 'image/jpeg', quality = 0.85): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (!blob) {
                reject(new Error('Could not encode the rendered page.'));
                return;
            }
            blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)), reject);
        }, type, quality);
    });
}

export interface PageTextItem {
    text: string;
    fontSize: number;
}

/** Extracts text items (with approximate font size) for every page. */
export async function extractTextByPage(bytes: ArrayBuffer): Promise<PageTextItem[][]> {
    const pdfjs = await getPdfJs();
    const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;

    try {
        const pages: PageTextItem[][] = [];

        for (let p = 1; p <= doc.numPages; p++) {
            const page = await doc.getPage(p);
            const content = await page.getTextContent();
            const items: PageTextItem[] = [];

            for (const item of content.items) {
                if ('str' in item && item.str.trim().length > 0) {
                    items.push({
                        text: item.str,
                        fontSize: Math.abs(item.transform?.[3] ?? 0) || item.height || 0
                    });
                }
            }

            pages.push(items);
        }

        return pages;
    } finally {
        void doc.destroy();
    }
}

/** Plain full-document text (pages joined with blank lines). */
export async function extractPlainText(bytes: ArrayBuffer): Promise<string> {
    const pages = await extractTextByPage(bytes);
    return pages
        .map(items => items.map(i => i.text).join(' '))
        .join('\n\n')
        .replace(/[ \t]+/g, ' ')
        .trim();
}
