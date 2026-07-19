import { ToolModal } from './ToolModal';
import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';
import { downloadPdf, outputName } from '../utils/pdf';
import { recordProcessed } from '../utils/stats';

/**
 * Repair PDF — tolerant load + clean re-save. Recovers what can be recovered.
 */
export class RepairModal extends ToolModal {
    constructor(modalManager: ModalManager, toastManager: ToastManager) {
        super('repair-modal', modalManager, toastManager);
    }

    show(): void {
        this.renderModal();
        this.modalManager.show(this.modalId);
        this.setupEventListeners();
    }

    private renderModal(): void {
        const container = document.getElementById('modal-container')!;

        const content = `
            <div id="rep-upload-area">
                ${this.dropzoneHTML('rep-dropzone', 'rep-file-input', 'Upload a damaged PDF', 'We will attempt to recover its pages and rebuild the file')}
            </div>

            <div id="rep-options-area" class="hidden mt-2">
                ${this.fileRowHTML('rep-file-name', 'rep-file-info', 'rep-change-btn')}
                <div id="rep-diagnosis" class="text-sm px-1"></div>
            </div>
        `;

        const footer = `
            <button id="rep-process-btn" class="mono-btn px-7 py-2.5 text-sm font-semibold rounded-2xl flex items-center gap-x-2 disabled:opacity-40" disabled>
                <span>Repair PDF</span>
            </button>
        `;

        container.innerHTML = this.createModalHTML('Repair PDF', 'wrench', content, footer);
    }

    protected setupEventListeners(): void {
        this.wireUpload('rep-dropzone', 'rep-file-input', files => void this.handleFile(files[0]));
        this.wireChangeButton('rep-change-btn', 'rep-upload-area', 'rep-options-area', 'rep-process-btn');
        document.getElementById('rep-process-btn')!.addEventListener('click', () =>
            this.run('rep-process-btn', 'Repairing…', () => this.process()));
    }

    private async handleFile(file: File): Promise<void> {
        if (!this.isPdf(file)) {
            this.showToast('Please upload a PDF file.', false, true);
            return;
        }

        this.fileName = file.name;
        this.pdfBytes = await file.arrayBuffer();

        // probe how damaged it is
        const { PDFDocument } = await import('pdf-lib');
        let diagnosis: string;
        try {
            const doc = await PDFDocument.load(this.pdfBytes, {
                ignoreEncryption: true,
                throwOnInvalidObject: false,
                updateMetadata: false
            });
            this.pageCount = doc.getPageCount();
            diagnosis = `<i class="fa-solid fa-circle-check text-emerald-500 mr-1.5"></i>Structure readable — ${this.pageCount} page${this.pageCount === 1 ? '' : 's'} can be recovered. A clean rebuild usually fixes broken xref tables and streams.`;
            (document.getElementById('rep-process-btn') as HTMLButtonElement).disabled = false;
        } catch {
            this.pageCount = 0;
            diagnosis = `<i class="fa-solid fa-circle-xmark text-red-500 mr-1.5"></i>The file is severely damaged. A rebuild will likely fail, but you can try.`;
            (document.getElementById('rep-process-btn') as HTMLButtonElement).disabled = false;
        }

        document.getElementById('rep-upload-area')!.style.display = 'none';
        document.getElementById('rep-options-area')!.classList.remove('hidden');
        document.getElementById('rep-file-name')!.innerHTML = `<i class="fa-solid fa-file-pdf mr-1.5 text-[#777]"></i> ${file.name}`;
        document.getElementById('rep-file-info')!.textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB`;
        document.getElementById('rep-diagnosis')!.innerHTML = diagnosis;
    }

    private async process(): Promise<void> {
        const { PDFDocument } = await import('pdf-lib');

        // tolerant load, then rebuild page-by-page into a fresh document
        const src = await PDFDocument.load(this.pdfBytes!, {
            ignoreEncryption: true,
            throwOnInvalidObject: false,
            updateMetadata: false
        });

        const out = await PDFDocument.create();
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach(p => out.addPage(p));

        if (out.getPageCount() === 0) {
            throw new Error('No recoverable pages found in this file.');
        }

        const bytes = await out.save({ updateFieldAppearances: false });
        downloadPdf(bytes, outputName(this.fileName, '-repaired'));
        recordProcessed({ pdfs: 1, pages: out.getPageCount() });

        this.hide();
        this.showToast(`Repaired — ${out.getPageCount()} page${out.getPageCount() === 1 ? '' : 's'} recovered.`, true);
    }
}
