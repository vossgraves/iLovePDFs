import { ToolModal } from './ToolModal';
import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';
import { downloadPdf, outputName } from '../utils/pdf';
import { recordProcessed } from '../utils/stats';
import { mmToPt } from '../utils/nupEngine';

type Position = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

/**
 * Page Numbers — stamps numbers on every page with position/format options.
 */
export class PageNumbersModal extends ToolModal {
    constructor(modalManager: ModalManager, toastManager: ToastManager) {
        super('page-numbers-modal', modalManager, toastManager);
    }

    show(): void {
        this.renderModal();
        this.modalManager.show(this.modalId);
        this.setupEventListeners();
    }

    private renderModal(): void {
        const container = document.getElementById('modal-container')!;

        const content = `
            <div id="pn-upload-area">
                ${this.dropzoneHTML('pn-dropzone', 'pn-file-input', 'Upload your PDF', 'Page numbers will be stamped on every page')}
            </div>

            <div id="pn-options-area" class="hidden mt-2">
                ${this.fileRowHTML('pn-file-name', 'pn-file-info', 'pn-change-btn')}

                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <div class="font-semibold text-sm mb-1.5 px-1">Position</div>
                        <select id="pn-position" class="w-full border border-[#d1d5db] dark:border-[#404040] px-3 py-2 text-sm font-medium rounded-2xl">
                            <option value="bottom-center" selected>Bottom center</option>
                            <option value="bottom-left">Bottom left</option>
                            <option value="bottom-right">Bottom right</option>
                            <option value="top-center">Top center</option>
                            <option value="top-left">Top left</option>
                            <option value="top-right">Top right</option>
                        </select>
                    </div>
                    <div>
                        <div class="font-semibold text-sm mb-1.5 px-1">Format</div>
                        <select id="pn-format" class="w-full border border-[#d1d5db] dark:border-[#404040] px-3 py-2 text-sm font-medium rounded-2xl">
                            <option value="n" selected>1, 2, 3…</option>
                            <option value="page-n">Page 1, Page 2…</option>
                            <option value="n-of-total">1 / 12, 2 / 12…</option>
                        </select>
                    </div>
                    <div>
                        <div class="font-semibold text-sm mb-1.5 px-1">Start at</div>
                        <input type="number" id="pn-start" min="0" step="1" value="1" class="border border-[#d1d5db] dark:border-[#404040] px-3 py-2 text-sm font-medium rounded-2xl w-full">
                    </div>
                    <div>
                        <div class="font-semibold text-sm mb-1.5 px-1">Font size</div>
                        <input type="number" id="pn-size" min="6" max="36" step="1" value="11" class="border border-[#d1d5db] dark:border-[#404040] px-3 py-2 text-sm font-medium rounded-2xl w-full">
                    </div>
                </div>
            </div>
        `;

        const footer = `
            <button id="pn-process-btn" class="mono-btn px-7 py-2.5 text-sm font-semibold rounded-2xl flex items-center gap-x-2 disabled:opacity-40" disabled>
                <span>Add page numbers</span>
            </button>
        `;

        container.innerHTML = this.createModalHTML('Page Numbers', 'list-ol', content, footer);
    }

    protected setupEventListeners(): void {
        this.wireUpload('pn-dropzone', 'pn-file-input', files => void this.handleFile(files[0]));
        this.wireChangeButton('pn-change-btn', 'pn-upload-area', 'pn-options-area', 'pn-process-btn');
        document.getElementById('pn-process-btn')!.addEventListener('click', () =>
            this.run('pn-process-btn', 'Stamping…', () => this.process()));
    }

    private async handleFile(file: File): Promise<void> {
        if (!(await this.inspect(file))) return;
        this.showOptions('pn-upload-area', 'pn-options-area', 'pn-process-btn', 'pn-file-name', 'pn-file-info');
    }

    private async process(): Promise<void> {
        const position = (document.getElementById('pn-position') as HTMLSelectElement).value as Position;
        const format = (document.getElementById('pn-format') as HTMLSelectElement).value;
        const start = parseInt((document.getElementById('pn-start') as HTMLInputElement).value, 10) || 1;
        const fontSize = Math.min(36, Math.max(6, parseInt((document.getElementById('pn-size') as HTMLInputElement).value, 10) || 11));

        const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
        const doc = await PDFDocument.load(this.pdfBytes!, { ignoreEncryption: true });
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const pages = doc.getPages();
        const margin = mmToPt(8);
        const color = rgb(0.07, 0.07, 0.07);

        pages.forEach((page, i) => {
            const number = start + i;
            let text = String(number);
            if (format === 'page-n') text = `Page ${number}`;
            else if (format === 'n-of-total') text = `${number} / ${start + pages.length - 1}`;

            const { width, height } = page.getSize();
            const textWidth = font.widthOfTextAtSize(text, fontSize);

            let x = margin;
            if (position.endsWith('center')) x = (width - textWidth) / 2;
            else if (position.endsWith('right')) x = width - margin - textWidth;

            const y = position.startsWith('top') ? height - margin - fontSize : margin;

            page.drawText(text, { x, y, size: fontSize, font, color });
        });

        const bytes = await doc.save();
        downloadPdf(bytes, outputName(this.fileName, '-numbered'));
        recordProcessed({ pdfs: 1, pages: pages.length });

        this.hide();
        this.showToast(`Page numbers added to ${pages.length} pages.`, true);
    }
}
