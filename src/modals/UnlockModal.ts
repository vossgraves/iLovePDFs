import { ToolModal } from './ToolModal';
import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';
import { downloadPdf, outputName } from '../utils/pdf';
import { decryptPdf } from '../utils/qpdf';
import { recordProcessed } from '../utils/stats';

/**
 * Unlock PDF — removes owner-password restrictions instantly, and can remove
 * open-password protection when the user supplies the correct password.
 */
export class UnlockModal extends ToolModal {
    constructor(modalManager: ModalManager, toastManager: ToastManager) {
        super('unlock-modal', modalManager, toastManager);
    }

    show(): void {
        this.renderModal();
        this.modalManager.show(this.modalId);
        this.setupEventListeners();
    }

    private renderModal(): void {
        const container = document.getElementById('modal-container')!;

        const content = `
            <div id="unl-upload-area">
                ${this.dropzoneHTML('unl-dropzone', 'unl-file-input', 'Upload a protected PDF', 'Remove printing/copying restrictions — or an open password you know')}
            </div>

            <div id="unl-options-area" class="hidden mt-2">
                ${this.fileRowHTML('unl-file-name', 'unl-file-info', 'unl-change-btn')}

                <div class="px-1">
                    <div class="font-semibold text-sm mb-1.5">Open password <span class="font-normal text-xs text-[#666] dark:text-[#a1a1aa]">(only if the PDF asks for one)</span></div>
                    <input type="password" id="unl-password" placeholder="Leave empty for restriction-only removal" class="border border-[#d1d5db] dark:border-[#404040] px-4 py-2.5 w-full rounded-2xl text-sm">

                    <div class="text-xs text-[#666] dark:text-[#a1a1aa] mt-3">
                        <i class="fa-solid fa-circle-info mr-1"></i>
                        Only unlock PDFs you own or are authorised to open. Unknown passwords cannot be cracked.
                    </div>
                </div>
            </div>
        `;

        const footer = `
            <button id="unl-process-btn" class="mono-btn px-7 py-2.5 text-sm font-semibold rounded-2xl flex items-center gap-x-2 disabled:opacity-40" disabled>
                <span>Unlock PDF</span>
            </button>
        `;

        container.innerHTML = this.createModalHTML('Unlock PDF', 'lock-open', content, footer);
    }

    protected setupEventListeners(): void {
        this.wireUpload('unl-dropzone', 'unl-file-input', files => void this.handleFile(files[0]));
        this.wireChangeButton('unl-change-btn', 'unl-upload-area', 'unl-options-area', 'unl-process-btn');
        document.getElementById('unl-process-btn')!.addEventListener('click', () =>
            this.run('unl-process-btn', 'Unlocking…', () => this.process()));
    }

    private async handleFile(file: File): Promise<void> {
        if (!this.isPdf(file)) {
            this.showToast('Please upload a PDF file.', false, true);
            return;
        }

        this.fileName = file.name;
        this.pdfBytes = await file.arrayBuffer();
        this.pageCount = 0;

        this.showOptions('unl-upload-area', 'unl-options-area', 'unl-process-btn', 'unl-file-name', 'unl-file-info');
    }

    private async process(): Promise<void> {
        const password = (document.getElementById('unl-password') as HTMLInputElement).value;

        if (password) {
            // open-password path: qpdf --decrypt with the supplied password
            const bytes = await decryptPdf(this.pdfBytes!, password);
            downloadPdf(bytes, outputName(this.fileName, '-unlocked'));
            recordProcessed({ pdfs: 1, pages: 1 });
            this.hide();
            this.showToast('Password removed — PDF unlocked!', true);
            return;
        }

        // restriction-only path: tolerant re-save drops owner-password flags
        try {
            const { PDFDocument } = await import('pdf-lib');
            const src = await PDFDocument.load(this.pdfBytes!, { ignoreEncryption: true });
            const out = await PDFDocument.create();
            const pages = await out.copyPages(src, src.getPageIndices());
            pages.forEach(p => out.addPage(p));

            const bytes = await out.save();
            downloadPdf(bytes, outputName(this.fileName, '-unlocked'));
            recordProcessed({ pdfs: 1, pages: out.getPageCount() });

            this.hide();
            this.showToast('Restrictions removed — PDF unlocked!', true);
        } catch {
            this.showToast('This PDF has an open password. Enter it above to unlock.', false, true);
        }
    }
}
