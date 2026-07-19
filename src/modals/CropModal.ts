import { ToolModal } from './ToolModal';
import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';
import { downloadPdf, outputName, renderPdfPages } from '../utils/pdf';
import { recordProcessed } from '../utils/stats';
import { mmToPt } from '../utils/nupEngine';

/**
 * Crop PDF — trims equal or per-side margins from every page (CropBox).
 */
export class CropModal extends ToolModal {
    private previewCanvas: HTMLCanvasElement | null = null;

    constructor(modalManager: ModalManager, toastManager: ToastManager) {
        super('crop-modal', modalManager, toastManager);
    }

    show(): void {
        this.renderModal();
        this.modalManager.show(this.modalId);
        this.setupEventListeners();
    }

    private margins(): { top: number; right: number; bottom: number; left: number } {
        const val = (id: string) => Math.min(100, Math.max(0, parseInt((document.getElementById(id) as HTMLInputElement).value, 10) || 0));
        return { top: val('crop-top'), right: val('crop-right'), bottom: val('crop-bottom'), left: val('crop-left') };
    }

    private renderModal(): void {
        const container = document.getElementById('modal-container')!;

        const side = (id: string, label: string) => `
            <div>
                <div class="font-semibold text-xs mb-1 px-1">${label}</div>
                <input type="number" id="${id}" min="0" max="100" step="1" value="10" class="border border-[#d1d5db] dark:border-[#404040] px-3 py-2 text-sm font-medium rounded-2xl w-full crop-margin-input">
            </div>
        `;

        const content = `
            <div id="crop-upload-area">
                ${this.dropzoneHTML('crop-dropzone', 'crop-file-input', 'Upload your PDF', 'Trim margins from every page')}
            </div>

            <div id="crop-options-area" class="hidden mt-2">
                ${this.fileRowHTML('crop-file-name', 'crop-file-info', 'crop-change-btn')}

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div class="grid grid-cols-2 gap-3">
                        ${side('crop-top', 'Top (mm)')}
                        ${side('crop-right', 'Right (mm)')}
                        ${side('crop-bottom', 'Bottom (mm)')}
                        ${side('crop-left', 'Left (mm)')}
                    </div>
                    <div>
                        <div class="font-semibold text-sm mb-2 px-1">Preview (first page)</div>
                        <div class="flex justify-center bg-[#111111] dark:bg-black p-3 rounded-2xl">
                            <div id="crop-preview" class="relative overflow-hidden rounded" style="max-width: 200px;"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const footer = `
            <button id="crop-process-btn" class="mono-btn px-7 py-2.5 text-sm font-semibold rounded-2xl flex items-center gap-x-2 disabled:opacity-40" disabled>
                <span>Crop PDF</span>
            </button>
        `;

        container.innerHTML = this.createModalHTML('Crop PDF', 'crop-alt', content, footer);
    }

    protected setupEventListeners(): void {
        this.wireUpload('crop-dropzone', 'crop-file-input', files => void this.handleFile(files[0]));
        this.wireChangeButton('crop-change-btn', 'crop-upload-area', 'crop-options-area', 'crop-process-btn');
        document.getElementById('crop-process-btn')!.addEventListener('click', () =>
            this.run('crop-process-btn', 'Cropping…', () => this.process()));

        document.querySelectorAll('.crop-margin-input').forEach(el => {
            el.addEventListener('input', () => this.updateOverlay());
        });
    }

    private async handleFile(file: File): Promise<void> {
        if (!(await this.inspect(file))) return;
        this.showOptions('crop-upload-area', 'crop-options-area', 'crop-process-btn', 'crop-file-name', 'crop-file-info');

        try {
            const [canvas] = await renderPdfPages(this.pdfBytes!, 60, 1);
            this.previewCanvas = canvas;
            const preview = document.getElementById('crop-preview')!;
            preview.innerHTML = '';
            canvas.style.width = '100%';
            canvas.style.height = 'auto';
            canvas.style.display = 'block';
            preview.appendChild(canvas);

            const overlay = document.createElement('div');
            overlay.id = 'crop-overlay';
            overlay.style.cssText = 'position:absolute;border:1.5px dashed #111;background:rgba(17,17,17,0.08);pointer-events:none;';
            preview.appendChild(overlay);
            this.updateOverlay();
        } catch {
            // preview is best-effort
        }
    }

    private updateOverlay(): void {
        const overlay = document.getElementById('crop-overlay');
        if (!overlay || !this.previewCanvas || !this.pdfBytes) return;

        // overlay positioned over the canvas using mm fractions of the page
        const m = this.margins();
        void m; // recomputed below against real page size at process time; here we approximate with canvas aspect
        const canvas = this.previewCanvas;
        const pageWmm = (canvas.width / 60) * 25.4; // rendered at 60dpi → px per inch = 60
        const pageHmm = (canvas.height / 60) * 25.4;

        overlay.style.left = `${(m.left / pageWmm) * 100}%`;
        overlay.style.top = `${(m.top / pageHmm) * 100}%`;
        overlay.style.width = `${Math.max(0, (pageWmm - m.left - m.right) / pageWmm) * 100}%`;
        overlay.style.height = `${Math.max(0, (pageHmm - m.top - m.bottom) / pageHmm) * 100}%`;
    }

    private async process(): Promise<void> {
        const m = this.margins();
        const { PDFDocument } = await import('pdf-lib');
        const doc = await PDFDocument.load(this.pdfBytes!, { ignoreEncryption: true });
        const pages = doc.getPages();

        const left = mmToPt(m.left);
        const right = mmToPt(m.right);
        const top = mmToPt(m.top);
        const bottom = mmToPt(m.bottom);

        pages.forEach(page => {
            const { width, height } = page.getSize();
            const newW = width - left - right;
            const newH = height - top - bottom;
            if (newW > 20 && newH > 20) {
                page.setCropBox(left, bottom, newW, newH);
            }
        });

        const bytes = await doc.save();
        downloadPdf(bytes, outputName(this.fileName, '-cropped'));
        recordProcessed({ pdfs: 1, pages: pages.length });

        this.hide();
        this.showToast('PDF cropped successfully!', true);
    }
}
