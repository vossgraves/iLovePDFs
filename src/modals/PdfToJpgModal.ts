import { ToolModal } from './ToolModal';
import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';
import { downloadPdf, renderPdfPages, canvasToBytes } from '../utils/pdf';
import { recordProcessed } from '../utils/stats';

/**
 * PDF to JPG — renders every page to a JPEG; multi-page PDFs download as a zip.
 */
export class PdfToJpgModal extends ToolModal {
    constructor(modalManager: ModalManager, toastManager: ToastManager) {
        super('pdf-to-jpg-modal', modalManager, toastManager);
    }

    show(): void {
        this.renderModal();
        this.modalManager.show(this.modalId);
        this.setupEventListeners();
    }

    private renderModal(): void {
        const container = document.getElementById('modal-container')!;

        const content = `
            <div id="p2j-upload-area">
                ${this.dropzoneHTML('p2j-dropzone', 'p2j-file-input', 'Upload your PDF', 'Every page becomes a JPEG image')}
            </div>

            <div id="p2j-options-area" class="hidden mt-2">
                ${this.fileRowHTML('p2j-file-name', 'p2j-file-info', 'p2j-change-btn')}

                <div class="grid grid-cols-2 gap-3 px-1">
                    <div>
                        <div class="font-semibold text-sm mb-1.5">Resolution</div>
                        <select id="p2j-dpi" class="w-full border border-[#d1d5db] dark:border-[#404040] px-3 py-2 text-sm font-medium rounded-2xl">
                            <option value="72">72 DPI (screen)</option>
                            <option value="150" selected>150 DPI (recommended)</option>
                            <option value="300">300 DPI (print)</option>
                        </select>
                    </div>
                    <div>
                        <div class="font-semibold text-sm mb-1.5">JPEG quality</div>
                        <select id="p2j-quality" class="w-full border border-[#d1d5db] dark:border-[#404040] px-3 py-2 text-sm font-medium rounded-2xl">
                            <option value="0.6">Small (60%)</option>
                            <option value="0.8" selected>Good (80%)</option>
                            <option value="0.92">Best (92%)</option>
                        </select>
                    </div>
                </div>

                <div id="p2j-status" class="text-xs text-[#666] dark:text-[#a1a1aa] px-1 mt-3"></div>
            </div>
        `;

        const footer = `
            <button id="p2j-process-btn" class="mono-btn px-7 py-2.5 text-sm font-semibold rounded-2xl flex items-center gap-x-2 disabled:opacity-40" disabled>
                <span>Convert to JPG</span>
            </button>
        `;

        container.innerHTML = this.createModalHTML('PDF to JPG', 'file-image', content, footer);
    }

    protected setupEventListeners(): void {
        this.wireUpload('p2j-dropzone', 'p2j-file-input', files => void this.handleFile(files[0]));
        this.wireChangeButton('p2j-change-btn', 'p2j-upload-area', 'p2j-options-area', 'p2j-process-btn');
        document.getElementById('p2j-process-btn')!.addEventListener('click', () =>
            this.run('p2j-process-btn', 'Rendering…', () => this.process()));
    }

    private async handleFile(file: File): Promise<void> {
        if (!(await this.inspect(file))) return;
        this.showOptions('p2j-upload-area', 'p2j-options-area', 'p2j-process-btn', 'p2j-file-name', 'p2j-file-info');
    }

    private async process(): Promise<void> {
        const dpi = parseInt((document.getElementById('p2j-dpi') as HTMLSelectElement).value, 10);
        const quality = parseFloat((document.getElementById('p2j-quality') as HTMLSelectElement).value);

        const canvases = await renderPdfPages(this.pdfBytes!, dpi, Infinity, p =>
            this.setStatus('p2j-status', `Rendering page ${p.current} of ${p.total}…`));
        this.setStatus('p2j-status', '');

        const base = this.fileName.replace(/\.pdf$/i, '');

        if (canvases.length === 1) {
            const jpeg = await canvasToBytes(canvases[0], 'image/jpeg', quality);
            downloadPdf(jpeg, `${base}.jpg`);
        } else {
            const { default: JSZip } = await import('jszip');
            const zip = new JSZip();

            for (let i = 0; i < canvases.length; i++) {
                const jpeg = await canvasToBytes(canvases[i], 'image/jpeg', quality);
                zip.file(`${base}-page-${i + 1}.jpg`, jpeg);
            }

            const blob = await zip.generateAsync({ type: 'uint8array' });
            downloadPdf(blob, `${base}-jpg.zip`);
        }

        recordProcessed({ pdfs: 1, pages: canvases.length });
        this.hide();
        this.showToast(`Exported ${canvases.length} page${canvases.length === 1 ? '' : 's'} as JPEG.`, true);
    }
}
