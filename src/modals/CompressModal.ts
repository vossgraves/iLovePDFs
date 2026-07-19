import { ToolModal } from './ToolModal';
import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';
import { downloadPdf, outputName, renderPdfPages, canvasToBytes } from '../utils/pdf';
import { recordProcessed } from '../utils/stats';

interface Preset {
    id: string;
    label: string;
    sub: string;
    dpi: number;
    quality: number;
}

const PRESETS: Preset[] = [
    { id: 'extreme', label: 'Extreme', sub: '72 DPI · smallest size', dpi: 72, quality: 0.5 },
    { id: 'recommended', label: 'Recommended', sub: '150 DPI · balanced', dpi: 150, quality: 0.75 },
    { id: 'less', label: 'High quality', sub: '200 DPI · light compression', dpi: 200, quality: 0.88 }
];

/**
 * Compress PDF — real compression by re-rendering pages at a lower
 * resolution and re-encoding them as JPEG. Honestly labeled as lossy.
 */
export class CompressModal extends ToolModal {
    private preset: Preset = PRESETS[1];

    constructor(modalManager: ModalManager, toastManager: ToastManager) {
        super('compress-modal', modalManager, toastManager);
    }

    show(): void {
        this.renderModal();
        this.modalManager.show(this.modalId);
        this.setupEventListeners();
    }

    private renderModal(): void {
        const container = document.getElementById('modal-container')!;

        const chips = PRESETS.map(p => `
            <div class="option-chip cursor-pointer px-3 py-2.5 bg-[#f4f4f5] dark:bg-[#262626] hover:bg-[#e5e5e5] dark:hover:bg-[#333333] rounded-2xl text-center ${p.id === this.preset.id ? 'active-option' : ''}" data-preset="${p.id}">
                <div class="font-semibold text-sm">${p.label}</div>
                <div class="text-[10px] opacity-70 mt-0.5">${p.sub}</div>
            </div>
        `).join('');

        const content = `
            <div id="compress-upload-area">
                ${this.dropzoneHTML('compress-dropzone', 'compress-file-input', 'Upload your PDF', 'Choose a compression level below after uploading')}
            </div>

            <div id="compress-options" class="hidden mt-5">
                ${this.fileRowHTML('compress-file-name', 'compress-file-info', 'compress-change-btn')}

                <div class="font-semibold text-sm mb-2 px-1">Compression level</div>
                <div class="grid grid-cols-3 gap-2" id="compress-presets">${chips}</div>

                <div class="text-xs text-[#666] dark:text-[#a1a1aa] px-1 mt-3">
                    <i class="fa-solid fa-circle-info mr-1"></i>
                    Pages are re-rendered as images — great size savings, but text becomes non-selectable.
                </div>

                <div id="compress-status" class="text-xs text-[#666] dark:text-[#a1a1aa] px-1 mt-2"></div>
            </div>
        `;

        const footer = `
            <button id="compress-btn" class="mono-btn px-7 py-2.5 text-sm font-semibold rounded-2xl flex items-center gap-x-2 disabled:opacity-50" disabled>
                <span>Compress</span>
            </button>
        `;

        container.innerHTML = this.createModalHTML('Compress PDF', 'compress-arrows-alt', content, footer);
    }

    protected setupEventListeners(): void {
        this.wireUpload('compress-dropzone', 'compress-file-input', files => void this.handleFile(files[0]));
        this.wireChangeButton('compress-change-btn', 'compress-upload-area', 'compress-options', 'compress-btn');

        document.querySelectorAll('#compress-presets .option-chip').forEach(el => {
            el.addEventListener('click', () => {
                document.querySelectorAll('#compress-presets .option-chip').forEach(e => e.classList.remove('active-option'));
                el.classList.add('active-option');
                this.preset = PRESETS.find(p => p.id === (el as HTMLElement).dataset.preset)!;
            });
        });

        document.getElementById('compress-btn')!.addEventListener('click', () =>
            this.run('compress-btn', 'Compressing…', () => this.process()));
    }

    private async handleFile(file: File): Promise<void> {
        if (!(await this.inspect(file))) return;
        this.showOptions('compress-upload-area', 'compress-options', 'compress-btn', 'compress-file-name', 'compress-file-info');
    }

    private async process(): Promise<void> {
        const { dpi, quality } = this.preset;
        const originalSize = this.pdfBytes!.byteLength;

        const canvases = await renderPdfPages(this.pdfBytes!, dpi, Infinity, p =>
            this.setStatus('compress-status', `Processing page ${p.current} of ${p.total}…`));

        const { PDFDocument } = await import('pdf-lib');
        const out = await PDFDocument.create();

        for (const canvas of canvases) {
            const jpeg = await canvasToBytes(canvas, 'image/jpeg', quality);
            const image = await out.embedJpg(jpeg);
            const page = out.addPage([(canvas.width * 72) / dpi, (canvas.height * 72) / dpi]);
            page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
        }

        const bytes = await out.save();
        this.setStatus('compress-status', '');

        const ratio = ((1 - bytes.length / originalSize) * 100).toFixed(0);
        downloadPdf(bytes, outputName(this.fileName, '-compressed'));
        recordProcessed({ pdfs: 1, pages: canvases.length });

        this.hide();
        const grew = bytes.length >= originalSize;
        this.showToast(
            grew
                ? 'Note: output is not smaller than the original (already well-compressed).'
                : `Compressed by ${ratio}% — ${(originalSize / 1024 / 1024).toFixed(1)} MB → ${(bytes.length / 1024 / 1024).toFixed(1)} MB.`,
            true
        );
    }
}
