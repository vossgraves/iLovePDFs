import { ToolModal } from './ToolModal';
import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';
import { downloadPdf, outputName } from '../utils/pdf';
import { recordProcessed } from '../utils/stats';

/**
 * Add Watermark — stamps rotated, translucent text across every page.
 */
export class WatermarkModal extends ToolModal {
    constructor(modalManager: ModalManager, toastManager: ToastManager) {
        super('watermark-modal', modalManager, toastManager);
    }

    show(): void {
        this.renderModal();
        this.modalManager.show(this.modalId);
        this.setupEventListeners();
    }

    private renderModal(): void {
        const container = document.getElementById('modal-container')!;

        const content = `
            <div id="watermark-upload-area">
                ${this.dropzoneHTML('watermark-dropzone', 'watermark-file-input', 'Upload your PDF', 'A text watermark will be stamped on every page')}
            </div>

            <div id="watermark-options" class="hidden mt-5">
                ${this.fileRowHTML('wm-file-name', 'wm-file-info', 'wm-change-btn')}

                <div class="px-1">
                    <div class="font-semibold text-sm mb-2">Watermark text</div>
                    <input type="text" id="watermark-text" value="CONFIDENTIAL" class="border border-[#d1d5db] dark:border-[#404040] px-4 py-2.5 w-full rounded-2xl text-sm">

                    <div class="mt-4 grid grid-cols-2 gap-4">
                        <div>
                            <div class="font-semibold text-sm mb-1">Opacity</div>
                            <input type="range" id="watermark-opacity" min="10" max="100" value="35" class="w-full accent-black dark:accent-white">
                        </div>
                        <div>
                            <div class="font-semibold text-sm mb-1">Rotation</div>
                            <select id="watermark-rotation" class="border border-[#d1d5db] dark:border-[#404040] px-3 py-2 text-sm w-full rounded-2xl">
                                <option value="0">Horizontal</option>
                                <option value="45" selected>Diagonal</option>
                                <option value="-45">Diagonal (reverse)</option>
                            </select>
                        </div>
                    </div>
                    <div class="text-[11px] text-[#666] dark:text-[#a1a1aa] mt-2">Opacity controls how faint the text looks; rotation angles it across the page so it's less intrusive to read through.</div>
                </div>
            </div>
        `;

        const footer = `
            <button id="watermark-btn" class="mono-btn px-7 py-2.5 text-sm font-semibold rounded-2xl flex items-center gap-x-2 disabled:opacity-50" disabled>
                <span>Add Watermark</span>
            </button>
        `;

        container.innerHTML = this.createModalHTML('Add Watermark', 'stamp', content, footer);
    }

    protected setupEventListeners(): void {
        this.wireUpload('watermark-dropzone', 'watermark-file-input', files => void this.handleFile(files[0]));
        this.wireChangeButton('wm-change-btn', 'watermark-upload-area', 'watermark-options', 'watermark-btn');
        document.getElementById('watermark-btn')!.addEventListener('click', () =>
            this.run('watermark-btn', 'Adding watermark…', () => this.process()));
    }

    private async handleFile(file: File): Promise<void> {
        if (!(await this.inspect(file))) return;
        this.showOptions('watermark-upload-area', 'watermark-options', 'watermark-btn', 'wm-file-name', 'wm-file-info');
    }

    private async process(): Promise<void> {
        const text = ((document.getElementById('watermark-text') as HTMLInputElement).value || 'CONFIDENTIAL').trim();
        if (!text) {
            this.showToast('Enter watermark text first.', false, true);
            return;
        }

        const opacity = parseInt((document.getElementById('watermark-opacity') as HTMLInputElement).value, 10) / 100;
        const rotation = parseInt((document.getElementById('watermark-rotation') as HTMLSelectElement).value, 10);

        const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib');
        const doc = await PDFDocument.load(this.pdfBytes!, { ignoreEncryption: true });
        const font = await doc.embedFont(StandardFonts.HelveticaBold);
        const pages = doc.getPages();

        pages.forEach(page => {
            const { width, height } = page.getSize();
            // size the text to span most of the page width
            const targetWidth = Math.min(width, height) * 0.8;
            const size = Math.max(12, targetWidth / (text.length * 0.62));
            const textWidth = font.widthOfTextAtSize(text, size);

            page.drawText(text, {
                x: (width - textWidth) / 2,
                y: height / 2 - size / 2,
                size,
                font,
                color: rgb(0.45, 0.45, 0.45),
                opacity,
                rotate: degrees(rotation)
            });
        });

        const bytes = await doc.save();
        downloadPdf(bytes, outputName(this.fileName, '-watermarked'));
        recordProcessed({ pdfs: 1, pages: pages.length });

        this.hide();
        this.showToast(`Watermark "${text}" added to ${pages.length} pages.`, true);
    }
}
