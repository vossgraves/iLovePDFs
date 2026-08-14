import { mmToPt, getPaperSize, sheetDims } from './nupEngine';

/**
 * Image → PDF helpers (JPG to PDF, Scan to PDF).
 */

export interface ImagesToPdfOptions {
    /** 'a4' = fit every image onto A4 pages; 'original' = page sized to the image. */
    pageSize: 'a4' | 'original';
    marginMm: number;
}

const A4 = sheetDims(getPaperSize('a4'), 'portrait');

async function embedImage(pdf: import('pdf-lib').PDFDocument, bytes: ArrayBuffer, mime: string) {
    const data = new Uint8Array(bytes);
    if (mime.includes('png')) return pdf.embedPng(data);
    if (mime.includes('jpeg') || mime.includes('jpg')) return pdf.embedJpg(data);

    // Other formats (webp, heic, bmp…): decode through a canvas and re-encode as JPEG.
    const blob = new Blob([data]);
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);

    const jpeg = await new Promise<Uint8Array>((resolve, reject) => {
        canvas.toBlob(b => {
            if (!b) return reject(new Error('Unsupported image format.'));
            b.arrayBuffer().then(buf => resolve(new Uint8Array(buf)), reject);
        }, 'image/jpeg', 0.92);
    });

    return pdf.embedJpg(jpeg);
}

/**
 * Grayscale + contrast-stretch a canvas in place. Cheap, dependency-free
 * preprocessing that measurably improves Tesseract accuracy on low-contrast
 * or unevenly lit scans — no external service involved.
 */
export function enhanceForOcr(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d')!;
    const { width, height } = canvas;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    const gray = new Uint8ClampedArray(width * height);
    let min = 255;
    let max = 0;
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        gray[p] = g;
        if (g < min) min = g;
        if (g > max) max = g;
    }

    const range = Math.max(1, max - min);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        const stretched = ((gray[p] - min) / range) * 255;
        data[i] = data[i + 1] = data[i + 2] = stretched;
    }

    ctx.putImageData(imageData, 0, 0);
}

export async function imagesToPdf(files: File[], options: ImagesToPdfOptions): Promise<Uint8Array> {
    if (files.length === 0) throw new Error('Add at least one image.');

    const { PDFDocument } = await import('pdf-lib');
    const pdf = await PDFDocument.create();
    const margin = mmToPt(options.marginMm);

    for (const file of files) {
        const bytes = await file.arrayBuffer();
        const image = await embedImage(pdf, bytes, file.type || 'image/jpeg');
        const imgW = image.width;
        const imgH = image.height;

        if (options.pageSize === 'original') {
            const pageW = imgW + margin * 2;
            const pageH = imgH + margin * 2;
            const page = pdf.addPage([pageW, pageH]);
            page.drawImage(image, { x: margin, y: margin, width: imgW, height: imgH });
        } else {
            const page = pdf.addPage([A4.width, A4.height]);
            const maxW = A4.width - margin * 2;
            const maxH = A4.height - margin * 2;
            const scale = Math.min(maxW / imgW, maxH / imgH);
            const w = imgW * scale;
            const h = imgH * scale;
            page.drawImage(image, {
                x: (A4.width - w) / 2,
                y: (A4.height - h) / 2,
                width: w,
                height: h
            });
        }
    }

    return pdf.save();
}
