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
