import { ToolModal } from './ToolModal';
import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';
import { downloadFile } from '../utils/pdf';
import { engineConvert } from '../utils/loEngine';
import { recordProcessed } from '../utils/stats';

interface OfficeConvertConfig {
    id: string;
    title: string;
    icon: string;
    direction: 'to-pdf' | 'from-pdf';
    outputFormat: 'pdf' | 'docx' | 'pptx' | 'xlsx';
    /** from-pdf: e.g. "Word (.docx)". to-pdf: not used. */
    outputLabel?: string;
    /** to-pdf: file accept list + human label. */
    accept?: string;
    acceptLabel?: string;
}

/**
 * High-fidelity Office conversions powered by the LibreOffice WASM engine
 * (lazy-loaded from CDN on first use, ~236MB, cached afterwards).
 */
export class OfficeConvertModal extends ToolModal {
    private config: OfficeConvertConfig;
    private officeBytes: ArrayBuffer | null = null;
    private officeName = '';

    constructor(modalManager: ModalManager, toastManager: ToastManager, config: OfficeConvertConfig) {
        super(config.id, modalManager, toastManager);
        this.config = config;
    }

    show(): void {
        this.renderModal();
        this.modalManager.show(this.modalId);
        this.setupEventListeners();
    }

    private renderModal(): void {
        const container = document.getElementById('modal-container')!;
        const c = this.config;

        const dropTitle = c.direction === 'from-pdf' ? 'Upload your PDF' : `Upload your document`;
        const dropSub = c.direction === 'from-pdf'
            ? `Will be converted to ${c.outputLabel}`
            : `${c.acceptLabel} — will be converted to PDF`;

        const content = `
            <div id="oc-upload-area">
                ${this.dropzoneHTML('oc-dropzone', 'oc-file-input', dropTitle, dropSub, c.direction === 'from-pdf' ? '.pdf' : (c.accept ?? ''))}
            </div>

            <div id="oc-options-area" class="hidden mt-2">
                ${this.fileRowHTML('oc-file-name', 'oc-file-info', 'oc-change-btn')}

                <div id="oc-engine-note" class="text-xs text-[#666] dark:text-[#a1a1aa] px-1 mb-3">
                    <i class="fa-solid fa-circle-info mr-1"></i>
                    First conversion downloads the LibreOffice engine (~236MB, one-time, then cached).
                </div>

                <div id="oc-progress-wrap" class="hidden">
                    <div class="flex justify-between text-xs font-medium px-1 mb-1">
                        <span id="oc-progress-msg">Preparing…</span>
                        <span id="oc-progress-pct">0%</span>
                    </div>
                    <div class="w-full h-2 bg-[#e5e5e5] dark:bg-[#2a2a2a] rounded-full overflow-hidden">
                        <div id="oc-progress-bar" class="h-full bg-black dark:bg-white rounded-full transition-all duration-300" style="width: 0%"></div>
                    </div>
                </div>
            </div>
        `;

        const footer = `
            <button id="oc-process-btn" class="mono-btn px-7 py-2.5 text-sm font-semibold rounded-2xl flex items-center gap-x-2 disabled:opacity-40" disabled>
                <span>Convert</span>
            </button>
        `;

        container.innerHTML = this.createModalHTML(c.title, c.icon, content, footer);
    }

    protected setupEventListeners(): void {
        this.wireUpload('oc-dropzone', 'oc-file-input', files => void this.handleFile(files[0]));
        this.wireChangeButton('oc-change-btn', 'oc-upload-area', 'oc-options-area', 'oc-process-btn');
        document.getElementById('oc-process-btn')!.addEventListener('click', () =>
            this.run('oc-process-btn', 'Converting…', () => this.process()));
    }

    private async handleFile(file: File): Promise<void> {
        if (this.config.direction === 'from-pdf') {
            if (!(await this.inspect(file))) return;
        } else {
            this.officeBytes = await file.arrayBuffer();
            this.officeName = file.name;
            this.fileName = file.name;
        }

        document.getElementById('oc-upload-area')!.style.display = 'none';
        document.getElementById('oc-options-area')!.classList.remove('hidden');
        (document.getElementById('oc-process-btn') as HTMLButtonElement).disabled = false;

        const mb = ((this.config.direction === 'from-pdf' ? this.pdfBytes!.byteLength : this.officeBytes!.byteLength) / 1024 / 1024).toFixed(1);
        document.getElementById('oc-file-name')!.innerHTML = `<i class="fa-solid fa-file mr-1.5 text-[#777]"></i> ${file.name}`;
        document.getElementById('oc-file-info')!.textContent = `${mb} MB`;
    }

    private onProgress(percent: number, message: string): void {
        const wrap = document.getElementById('oc-progress-wrap');
        if (!wrap) return;
        wrap.classList.remove('hidden');
        (document.getElementById('oc-progress-bar') as HTMLElement).style.width = `${percent}%`;
        document.getElementById('oc-progress-pct')!.textContent = `${percent}%`;
        document.getElementById('oc-progress-msg')!.textContent = message;
    }

    private async process(): Promise<void> {
        const c = this.config;
        const input = c.direction === 'from-pdf' ? this.pdfBytes! : this.officeBytes!;
        const inputName = c.direction === 'from-pdf' ? this.fileName : this.officeName;

        const result = await engineConvert(input, inputName, c.outputFormat, (p, m) => this.onProgress(p, m));

        const base = inputName.replace(/\.[^.]+$/, '');
        const outputFilename = result.filename || `${base}.${c.outputFormat}`;
        const mimeTypes: Record<OfficeConvertConfig['outputFormat'], string> = {
            pdf: 'application/pdf',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        };
        downloadFile(result.data, outputFilename, mimeTypes[c.outputFormat]);
        recordProcessed({ pdfs: 1, pages: this.pageCount || 1 });

        this.hide();
        this.showToast(`${c.title} — conversion complete!`, true);
    }
}
