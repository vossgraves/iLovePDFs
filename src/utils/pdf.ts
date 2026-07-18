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

/** Triggers a browser download for generated PDF bytes. */
export function downloadPdf(data: Uint8Array, filename: string): void {
    const blob = new Blob([data as unknown as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
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
