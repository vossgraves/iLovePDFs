import { BaseModal } from './BaseModal';
import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';
import { inspectPdf, downloadPdf, outputName } from '../utils/pdf';
import { recordProcessed } from '../utils/stats';

export class RotateModal extends BaseModal {
    private selectedAngle = 90;
    private pdfBytes: ArrayBuffer | null = null;
    private fileName = '';

    constructor(modalManager: ModalManager, toastManager: ToastManager) {
        super('rotate-modal', modalManager, toastManager);
    }

    show(): void {
        this.renderModal();
        this.modalManager.show(this.modalId);
        this.setupEventListeners();
    }

    private renderModal(): void {
        const container = document.getElementById('modal-container')!;

        const content = `
            <div id="rotate-dropzone" class="border border-dashed border-[#d1d5db] dark:border-[#404040] px-6 py-9 rounded-3xl flex flex-col items-center justify-center cursor-pointer">
                <i class="fa-solid fa-file-pdf text-4xl mb-3 text-[#777]"></i>
                <div class="font-semibold">Upload PDF</div>
                <input type="file" id="rotate-file-input" accept=".pdf" class="hidden">
            </div>

            <div id="rotate-options" class="hidden mt-5">
                <div class="px-1">
                    <div id="rotate-file-info" class="mb-4"></div>

                    <div class="font-semibold text-sm mb-3">Rotation angle</div>

                    <div class="grid grid-cols-4 gap-2" id="rotate-angles">
                        <div class="rotate-option px-4 py-3 text-center cursor-pointer border border-[#d1d5db] dark:border-[#404040] transition-colors rounded-2xl active-option" data-angle="90">
                            <div class="font-bold">90°</div>
                            <div class="text-xs">Clockwise</div>
                        </div>
                        <div class="rotate-option px-4 py-3 text-center cursor-pointer border border-[#d1d5db] dark:border-[#404040] transition-colors rounded-2xl" data-angle="180">
                            <div class="font-bold">180°</div>
                            <div class="text-xs">Upside down</div>
                        </div>
                        <div class="rotate-option px-4 py-3 text-center cursor-pointer border border-[#d1d5db] dark:border-[#404040] transition-colors rounded-2xl" data-angle="270">
                            <div class="font-bold">270°</div>
                            <div class="text-xs">Counter-clockwise</div>
                        </div>
                        <div class="rotate-option px-4 py-3 text-center cursor-pointer border border-[#d1d5db] dark:border-[#404040] transition-colors rounded-2xl" data-angle="0">
                            <div class="font-bold">0°</div>
                            <div class="text-xs">No change</div>
                        </div>
                    </div>

                    <div class="mt-4 px-1 flex items-center gap-x-2">
                        <input type="checkbox" id="rotate-all" checked class="accent-black dark:accent-white">
                        <label for="rotate-all" class="text-sm">Rotate all pages <span class="text-xs text-[#666] dark:text-[#a1a1aa]">(unchecked = first page only)</span></label>
                    </div>
                </div>
            </div>
        `;

        const footer = `
            <button id="rotate-btn" class="mono-btn px-7 py-2.5 text-sm font-semibold rounded-2xl flex items-center gap-x-2 disabled:opacity-50" disabled>
                <span>Rotate PDF</span>
            </button>
        `;

        container.innerHTML = this.createModalHTML('Rotate PDF', 'redo', content, footer);
    }

    protected setupEventListeners(): void {
        const dropzone = document.getElementById('rotate-dropzone')!;
        const fileInput = document.getElementById('rotate-file-input') as HTMLInputElement;
        const rotateBtn = document.getElementById('rotate-btn')!;

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

        document.querySelectorAll('#rotate-angles .rotate-option').forEach(el => {
            el.addEventListener('click', () => {
                document.querySelectorAll('#rotate-angles .rotate-option').forEach(e => e.classList.remove('active-option'));
                el.classList.add('active-option');
                this.selectedAngle = parseInt((el as HTMLElement).dataset.angle!, 10);
            });
        });

        rotateBtn.addEventListener('click', () => void this.processRotate());
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

            document.getElementById('rotate-dropzone')!.style.display = 'none';
            document.getElementById('rotate-options')!.classList.remove('hidden');
            (document.getElementById('rotate-btn') as HTMLButtonElement).disabled = false;

            document.getElementById('rotate-file-info')!.innerHTML = `
                <div class="font-semibold truncate">${info.name}</div>
                <div class="text-xs text-[#666] dark:text-[#a1a1aa]">${(info.size / 1024 / 1024).toFixed(1)} MB · ${info.pageCount} page${info.pageCount === 1 ? '' : 's'}</div>
            `;
        } catch (err) {
            this.showToast(err instanceof Error ? err.message : 'Could not read this PDF.', false, true);
        }
    }

    private async processRotate(): Promise<void> {
        if (!this.pdfBytes) return;

        const btn = document.getElementById('rotate-btn') as HTMLButtonElement;
        const rotateAll = (document.getElementById('rotate-all') as HTMLInputElement).checked;

        const originalHTML = btn.innerHTML;
        btn.innerHTML = `<span class="flex items-center gap-x-2"><i class="fa-solid fa-spinner fa-spin"></i> Rotating...</span>`;
        btn.disabled = true;

        try {
            const { PDFDocument, degrees } = await import('pdf-lib');
            const doc = await PDFDocument.load(this.pdfBytes, { ignoreEncryption: true });
            const pages = doc.getPages();
            const targets = rotateAll ? pages : pages.slice(0, 1);

            targets.forEach(page => {
                const current = page.getRotation().angle;
                page.setRotation(degrees((current + this.selectedAngle) % 360));
            });

            const bytes = await doc.save();
            downloadPdf(bytes, outputName(this.fileName, '-rotated'));
            recordProcessed({ pdfs: 1, pages: targets.length });

            this.hide();
            this.showToast(`Rotated ${targets.length} page${targets.length === 1 ? '' : 's'} by ${this.selectedAngle}°!`, true);
        } catch (err) {
            this.showToast('Could not rotate this PDF' + (err instanceof Error ? `: ${err.message}` : '.'), false, true);
        } finally {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }
    }
}
