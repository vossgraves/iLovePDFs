import { BaseModal } from './BaseModal';
import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';
import { MergeFile } from '../types';
import { downloadPdf } from '../utils/pdf';
import { recordProcessed } from '../utils/stats';

export class MergeModal extends BaseModal {
    private mergeFiles: MergeFile[] = [];

    constructor(modalManager: ModalManager, toastManager: ToastManager) {
        super('merge-modal', modalManager, toastManager);
    }

    show(): void {
        this.renderModal();
        this.modalManager.show(this.modalId);
        this.setupEventListeners();
    }

    private renderModal(): void {
        const container = document.getElementById('modal-container')!;
        
        const content = `
            <div id="merge-dropzone" class="border border-dashed border-[#d1d5db] dark:border-[#404040] hover:border-[#888] transition-colors px-8 py-8 rounded-3xl flex flex-col items-center justify-center cursor-pointer">
                <i class="fa-solid fa-cloud-upload-alt text-4xl mb-3 text-[#777]"></i>
                <div class="font-semibold">Drop PDFs here or <span class="underline">browse</span></div>
                <div class="text-xs text-[#666] dark:text-[#a1a1aa] mt-1">Up to 20 files • Max 100MB each</div>
                <input type="file" id="merge-file-input" multiple accept=".pdf" class="hidden">
            </div>

            <div id="merge-files-list" class="mt-4 hidden">
                <div class="text-xs font-semibold text-[#555] dark:text-[#a1a1aa] mb-2 px-1">FILES TO MERGE</div>
                <div id="merge-file-items" class="max-h-[180px] overflow-auto space-y-2"></div>
            </div>
        `;

        const footer = `
            <button id="merge-btn" class="mono-btn px-7 py-2.5 text-sm font-semibold rounded-2xl flex items-center gap-x-2 disabled:opacity-50" disabled>
                <span>Merge PDFs</span>
            </button>
        `;

        container.innerHTML = this.createModalHTML('Merge PDF', 'link', content, footer);
    }

    protected setupEventListeners(): void {
        const dropzone = document.getElementById('merge-dropzone')!;
        const fileInput = document.getElementById('merge-file-input') as HTMLInputElement;
        const mergeBtn = document.getElementById('merge-btn')!;

        dropzone.addEventListener('click', () => fileInput.click());
        
        fileInput.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            if (target.files) this.addMergeFiles(Array.from(target.files));
            target.value = '';
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            if (e.dataTransfer?.files) this.addMergeFiles(Array.from(e.dataTransfer.files));
        });

        dropzone.addEventListener('dragover', (e) => e.preventDefault());

        mergeBtn.addEventListener('click', () => void this.processMerge());
    }

    private addMergeFiles(files: File[]): void {
        const listContainer = document.getElementById('merge-files-list')!;
        const itemsContainer = document.getElementById('merge-file-items')!;
        const btn = document.getElementById('merge-btn')!;

        files.forEach(file => {
            if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
                const mergeFile: MergeFile = {
                    id: Date.now().toString(36) + Math.random().toString(36),
                    file,
                    name: file.name,
                    size: file.size
                };
                
                this.mergeFiles.push(mergeFile);

                const div = document.createElement('div');
                div.className = `flex items-center justify-between bg-[#f8f8f8] dark:bg-[#1f1f1f] px-4 py-3 rounded-2xl text-sm`;
                div.innerHTML = `
                    <div class="flex items-center gap-x-3 min-w-0">
                        <i class="fa-solid fa-file-pdf text-[#777]"></i>
                        <div class="min-w-0">
                            <div class="font-medium truncate">${file.name}</div>
                            <div class="text-xs text-[#666] dark:text-[#a1a1aa]">${(file.size / 1024 / 1024).toFixed(1)} MB</div>
                        </div>
                    </div>
                    <button class="px-3 py-1 text-xs text-red-500 hover:text-red-700">
                        <i class="fa-solid fa-times"></i>
                    </button>
                `;

                const removeBtn = div.querySelector('button')!;
                removeBtn.addEventListener('click', () => {
                    this.removeMergeFile(mergeFile.id, div);
                });

                itemsContainer.appendChild(div);
            }
        });

        if (this.mergeFiles.length > 0) {
            listContainer.classList.remove('hidden');
            (btn as HTMLButtonElement).disabled = false;
        }
    }

    private removeMergeFile(id: string, element: HTMLElement): void {
        this.mergeFiles = this.mergeFiles.filter(f => f.id !== id);
        element.remove();

        const btn = document.getElementById('merge-btn')!;
        const listContainer = document.getElementById('merge-files-list')!;

        if (this.mergeFiles.length === 0) {
            listContainer.classList.add('hidden');
            (btn as HTMLButtonElement).disabled = true;
        }
    }

    private async processMerge(): Promise<void> {
        if (this.mergeFiles.length === 0) return;

        const btn = document.getElementById('merge-btn') as HTMLButtonElement;
        const originalHTML = btn.innerHTML;
        btn.innerHTML = `<span class="flex items-center gap-x-2"><i class="fa-solid fa-spinner fa-spin"></i> Merging...</span>`;
        btn.disabled = true;

        try {
            const { PDFDocument } = await import('pdf-lib');
            const out = await PDFDocument.create();
            const fileCount = this.mergeFiles.length;
            let skipped = 0;

            for (const mergeFile of this.mergeFiles) {
                try {
                    const bytes = await mergeFile.file.arrayBuffer();
                    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
                    const pages = await out.copyPages(src, src.getPageIndices());
                    pages.forEach(p => out.addPage(p));
                } catch {
                    skipped++;
                }
            }

            if (out.getPageCount() === 0) {
                throw new Error('No readable pages found in the selected files.');
            }

            const totalPages = out.getPageCount();
            const bytes = await out.save();
            downloadPdf(bytes, 'merged.pdf');
            recordProcessed({ pdfs: 1, pages: totalPages });

            this.hide();
            const skippedNote = skipped > 0 ? ` (${skipped} unreadable file${skipped === 1 ? '' : 's'} skipped)` : '';
            this.showToast(`Merged ${fileCount - skipped} PDF${fileCount - skipped === 1 ? '' : 's'} — ${totalPages} pages${skippedNote}.`, true);
            this.mergeFiles = [];
        } catch (err) {
            this.showToast(err instanceof Error ? err.message : 'Could not merge these PDFs.', false, true);
        } finally {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }
    }
}