import { BaseModal } from './BaseModal';
import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';
import { inspectPdf, downloadPdf, outputName, parsePageRanges } from '../utils/pdf';
import { recordProcessed } from '../utils/stats';

export class SplitModal extends BaseModal {
    private pdfBytes: ArrayBuffer | null = null;
    private fileName = '';
    private pageCount = 0;

    constructor(modalManager: ModalManager, toastManager: ToastManager) {
        super('split-modal', modalManager, toastManager);
    }

    show(): void {
        this.renderModal();
        this.modalManager.show(this.modalId);
        this.setupEventListeners();
    }

    private renderModal(): void {
        const container = document.getElementById('modal-container')!;

        const content = `
            <div id="split-dropzone" class="border border-dashed border-[#d1d5db] dark:border-[#404040] px-6 py-9 rounded-3xl flex flex-col items-center justify-center cursor-pointer">
                <i class="fa-solid fa-file-pdf text-4xl mb-3 text-[#777]"></i>
                <div class="font-semibold">Upload PDF to split</div>
                <input type="file" id="split-file-input" accept=".pdf" class="hidden">
            </div>

            <div id="split-options" class="hidden mt-6">
                <div class="px-1">
                    <div class="flex justify-between items-center mb-4">
                        <div id="split-file-info" class="min-w-0"></div>
                    </div>

                    <div>
                        <div class="font-semibold text-sm mb-2">Split by pages <span class="font-normal text-xs text-[#666] dark:text-[#a1a1aa]">(e.g. 1-4, 6, 9-12)</span></div>
                        <input type="text" id="split-range" placeholder="1-4, 6, 9-12" class="border px-3 py-2 text-sm w-full rounded-2xl border-[#d1d5db] dark:border-[#404040]">

                        <div class="mt-4 text-sm px-1">
                            <div class="font-medium">Output files: <span id="split-output-count" class="font-bold">0</span></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const footer = `
            <button id="split-btn" class="mono-btn px-7 py-2.5 text-sm font-semibold rounded-2xl flex items-center gap-x-2 disabled:opacity-50" disabled>
                <span>Split PDF</span>
            </button>
        `;

        container.innerHTML = this.createModalHTML('Split PDF', 'cut', content, footer);
    }

    protected setupEventListeners(): void {
        const dropzone = document.getElementById('split-dropzone')!;
        const fileInput = document.getElementById('split-file-input') as HTMLInputElement;
        const splitBtn = document.getElementById('split-btn')!;

        dropzone.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', () => {
            if (fileInput.files?.[0]) void this.handleFile(fileInput.files[0]);
            fileInput.value = '';
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            const file = e.dataTransfer?.files[0];
            if (file) void this.handleFile(file);
        });
        dropzone.addEventListener('dragover', (e) => e.preventDefault());

        const rangeInput = document.getElementById('split-range') as HTMLInputElement;
        rangeInput.addEventListener('input', () => this.updateOutputCount());

        splitBtn.addEventListener('click', () => void this.processSplit());
    }

    private async handleFile(file: File): Promise<void> {
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            this.showToast('Please upload a PDF file.', false, true);
            return;
        }

        try {
            const info = await inspectPdf(file);
            this.pdfBytes = info.bytes;
            this.fileName = info.name;
            this.pageCount = info.pageCount;

            document.getElementById('split-dropzone')!.style.display = 'none';
            document.getElementById('split-options')!.classList.remove('hidden');
            (document.getElementById('split-btn') as HTMLButtonElement).disabled = false;

            document.getElementById('split-file-info')!.innerHTML = `
                <div>
                    <div class="font-semibold truncate">${info.name}</div>
                    <div class="text-xs text-[#666] dark:text-[#a1a1aa]">${(info.size / 1024 / 1024).toFixed(1)} MB · ${info.pageCount} page${info.pageCount === 1 ? '' : 's'}</div>
                </div>
            `;

            const rangeInput = document.getElementById('split-range') as HTMLInputElement;
            rangeInput.value = `1-${info.pageCount}`;
            rangeInput.max = String(info.pageCount);
            this.updateOutputCount();
        } catch (err) {
            this.showToast(err instanceof Error ? err.message : 'Could not read this PDF.', false, true);
        }
    }

    private updateOutputCount(): void {
        const rangeInput = document.getElementById('split-range') as HTMLInputElement;
        const countEl = document.getElementById('split-output-count')!;
        try {
            countEl.textContent = String(parsePageRanges(rangeInput.value, this.pageCount).length);
        } catch {
            countEl.textContent = '0';
        }
    }

    private async processSplit(): Promise<void> {
        if (!this.pdfBytes) return;

        const btn = document.getElementById('split-btn') as HTMLButtonElement;
        const rangeInput = document.getElementById('split-range') as HTMLInputElement;

        let groups: number[][];
        try {
            groups = parsePageRanges(rangeInput.value, this.pageCount);
        } catch (err) {
            this.showToast(err instanceof Error ? err.message : 'Invalid page range.', false, true);
            return;
        }

        const originalHTML = btn.innerHTML;
        btn.innerHTML = `<span class="flex items-center gap-x-2"><i class="fa-solid fa-spinner fa-spin"></i> Splitting...</span>`;
        btn.disabled = true;

        try {
            const { PDFDocument } = await import('pdf-lib');
            const src = await PDFDocument.load(this.pdfBytes, { ignoreEncryption: true });

            for (let i = 0; i < groups.length; i++) {
                const part = await PDFDocument.create();
                const pages = await part.copyPages(src, groups[i]);
                pages.forEach(p => part.addPage(p));
                const bytes = await part.save();
                downloadPdf(bytes, outputName(this.fileName, `-part-${i + 1}`));

                // Stagger downloads so the browser doesn't block them
                if (i < groups.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 400));
                }
            }

            recordProcessed({ pdfs: groups.length, pages: this.pageCount });

            this.hide();
            this.showToast(`PDF split into ${groups.length} file${groups.length === 1 ? '' : 's'}!`, true);
        } catch (err) {
            this.showToast('Could not split this PDF' + (err instanceof Error ? `: ${err.message}` : '.'), false, true);
        } finally {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }
    }
}
