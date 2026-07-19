import { ToolModal } from './ToolModal';
import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';
import { downloadPdf, outputName } from '../utils/pdf';
import { encryptPdf } from '../utils/qpdf';
import { recordProcessed } from '../utils/stats';

/**
 * Protect PDF — real AES-256 encryption via the qpdf engine (WASM, lazy-loaded).
 */
export class ProtectModal extends ToolModal {
    constructor(modalManager: ModalManager, toastManager: ToastManager) {
        super('protect-modal', modalManager, toastManager);
    }

    show(): void {
        this.renderModal();
        this.modalManager.show(this.modalId);
        this.setupEventListeners();
    }

    private renderModal(): void {
        const container = document.getElementById('modal-container')!;

        const content = `
            <div id="protect-upload-area">
                ${this.dropzoneHTML('protect-dropzone', 'protect-file-input', 'Upload your PDF', 'Real AES-256 encryption (qpdf engine)')}
            </div>

            <div id="protect-options" class="hidden mt-5">
                ${this.fileRowHTML('prot-file-name', 'prot-file-info', 'prot-change-btn')}

                <div class="px-1">
                    <div class="font-semibold text-sm mb-1.5">Open password <span class="text-red-500">*</span></div>
                    <input type="password" id="protect-user-pw" placeholder="Required to open the PDF" class="border px-4 py-2.5 text-sm border-[#d1d5db] dark:border-[#404040] w-full rounded-2xl">

                    <div class="font-semibold text-sm mb-1.5 mt-4">Owner password <span class="font-normal text-xs text-[#666] dark:text-[#a1a1aa]">(optional — controls editing permissions)</span></div>
                    <input type="password" id="protect-owner-pw" placeholder="Defaults to the open password" class="border px-4 py-2.5 text-sm border-[#d1d5db] dark:border-[#404040] w-full rounded-2xl">

                    <div class="text-xs text-[#666] dark:text-[#a1a1aa] mt-3">
                        <i class="fa-solid fa-shield-halved mr-1"></i>
                        Encrypted with 256-bit AES entirely in your browser. There is no way to recover a lost password.
                    </div>
                </div>
            </div>
        `;

        const footer = `
            <button id="protect-btn" class="mono-btn px-7 py-2.5 text-sm font-semibold rounded-2xl flex items-center gap-x-2 disabled:opacity-50" disabled>
                <span>Protect PDF</span>
            </button>
        `;

        container.innerHTML = this.createModalHTML('Protect PDF', 'lock', content, footer);
    }

    protected setupEventListeners(): void {
        this.wireUpload('protect-dropzone', 'protect-file-input', files => void this.handleFile(files[0]));
        this.wireChangeButton('prot-change-btn', 'protect-upload-area', 'protect-options', 'protect-btn');
        document.getElementById('protect-btn')!.addEventListener('click', () =>
            this.run('protect-btn', 'Encrypting…', () => this.process()));
    }

    private async handleFile(file: File): Promise<void> {
        if (!(await this.inspect(file))) return;
        this.showOptions('protect-upload-area', 'protect-options', 'protect-btn', 'prot-file-name', 'prot-file-info');
    }

    private async process(): Promise<void> {
        const userPw = (document.getElementById('protect-user-pw') as HTMLInputElement).value;
        const ownerPw = (document.getElementById('protect-owner-pw') as HTMLInputElement).value;

        if (!userPw) {
            this.showToast('Set an open password first.', false, true);
            return;
        }

        const bytes = await encryptPdf(this.pdfBytes!, userPw, ownerPw || userPw);
        downloadPdf(bytes, outputName(this.fileName, '-protected'));
        recordProcessed({ pdfs: 1, pages: this.pageCount });

        this.hide();
        this.showToast('PDF encrypted with AES-256!', true);
    }
}
