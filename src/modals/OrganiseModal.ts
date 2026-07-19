import { ToolModal } from './ToolModal';
import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';
import { downloadPdf, outputName, renderPdfPages } from '../utils/pdf';
import { recordProcessed } from '../utils/stats';

/**
 * Organise PDF — visual page reordering and deletion with thumbnails.
 */
export class OrganiseModal extends ToolModal {
    private pageOrder: number[] = [];      // original page indices in current order
    private thumbnails: HTMLCanvasElement[] = [];
    private dragIndex = -1;

    constructor(modalManager: ModalManager, toastManager: ToastManager) {
        super('organise-modal', modalManager, toastManager);
    }

    show(): void {
        this.renderModal();
        this.modalManager.show(this.modalId);
        this.setupEventListeners();
    }

    private renderModal(): void {
        const container = document.getElementById('modal-container')!;

        const content = `
            <div id="org-upload-area">
                ${this.dropzoneHTML('org-dropzone', 'org-file-input', 'Upload your PDF', 'Reorder and delete pages visually')}
            </div>

            <div id="org-options-area" class="hidden mt-2">
                ${this.fileRowHTML('org-file-name', 'org-file-info', 'org-change-btn')}

                <div class="text-xs text-[#666] dark:text-[#a1a1aa] px-1 mb-3">
                    Drag pages to reorder them. Click <i class="fa-solid fa-times"></i> to delete a page.
                </div>

                <div id="org-status" class="text-xs text-[#666] dark:text-[#a1a1aa] px-1 mb-2">Rendering pages…</div>
                <div id="org-grid" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-[45vh] overflow-y-auto p-1"></div>

                <div id="org-summary" class="text-sm px-1 mt-3 font-medium"></div>
            </div>
        `;

        const footer = `
            <button id="org-process-btn" class="mono-btn px-7 py-2.5 text-sm font-semibold rounded-2xl flex items-center gap-x-2 disabled:opacity-40" disabled>
                <span>Save organised PDF</span>
            </button>
        `;

        container.innerHTML = this.createModalHTML('Organise PDF', 'sort', content, footer, 'max-w-3xl');
    }

    protected setupEventListeners(): void {
        this.wireUpload('org-dropzone', 'org-file-input', files => void this.handleFile(files[0]));
        this.wireChangeButton('org-change-btn', 'org-upload-area', 'org-options-area', 'org-process-btn');
        document.getElementById('org-process-btn')!.addEventListener('click', () =>
            this.run('org-process-btn', 'Building PDF…', () => this.process()));
    }

    private async handleFile(file: File): Promise<void> {
        if (!(await this.inspect(file))) return;

        this.showOptions('org-upload-area', 'org-options-area', 'org-process-btn', 'org-file-name', 'org-file-info');
        this.pageOrder = Array.from({ length: this.pageCount }, (_, i) => i);
        this.thumbnails = [];
        this.updateSummary();

        try {
            this.thumbnails = await renderPdfPages(this.pdfBytes!, 40, Infinity, p => {
                this.setStatus('org-status', `Rendering pages… ${p.current}/${p.total}`);
            });
            this.setStatus('org-status', '');
        } catch {
            this.setStatus('org-status', 'Thumbnails unavailable — you can still reorder by page number.');
        }

        this.renderGrid();
    }

    private updateSummary(): void {
        const el = document.getElementById('org-summary');
        if (el) {
            el.textContent = `${this.pageOrder.length} of ${this.pageCount} pages will be kept.`;
        }
    }

    private renderGrid(): void {
        const grid = document.getElementById('org-grid')!;
        grid.innerHTML = '';

        this.pageOrder.forEach((originalIndex, position) => {
            const cell = document.createElement('div');
            cell.className = 'relative group cursor-grab select-none rounded-xl border border-[#d1d5db] dark:border-[#404040] bg-white dark:bg-[#1f1f1f] p-1.5';
            cell.draggable = true;
            cell.dataset.position = String(position);

            const canvas = this.thumbnails[originalIndex];
            if (canvas) {
                canvas.style.width = '100%';
                canvas.style.height = 'auto';
                canvas.className = 'rounded-lg pointer-events-none';
                cell.appendChild(canvas);
            } else {
                const ph = document.createElement('div');
                ph.className = 'aspect-[3/4] flex items-center justify-center text-xs font-bold text-[#777]';
                ph.textContent = `Page ${originalIndex + 1}`;
                cell.appendChild(ph);
            }

            const label = document.createElement('div');
            label.className = 'text-center text-[10px] font-bold mt-1 text-[#666] dark:text-[#a1a1aa]';
            label.textContent = `${position + 1} · was p.${originalIndex + 1}`;
            cell.appendChild(label);

            const del = document.createElement('button');
            del.className = 'absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white text-xs hidden group-hover:flex items-center justify-center';
            del.innerHTML = '<i class="fa-solid fa-times"></i>';
            del.title = 'Delete page';
            del.addEventListener('click', (e) => {
                e.stopPropagation();
                this.pageOrder.splice(position, 1);
                this.renderGrid();
                this.updateSummary();
            });
            cell.appendChild(del);

            cell.addEventListener('dragstart', () => { this.dragIndex = position; });
            cell.addEventListener('dragover', (e) => e.preventDefault());
            cell.addEventListener('drop', (e) => {
                e.preventDefault();
                if (this.dragIndex < 0 || this.dragIndex === position) return;
                const [moved] = this.pageOrder.splice(this.dragIndex, 1);
                this.pageOrder.splice(position, 0, moved);
                this.dragIndex = -1;
                this.renderGrid();
            });

            grid.appendChild(cell);
        });
    }

    private async process(): Promise<void> {
        if (!this.pdfBytes || this.pageOrder.length === 0) {
            this.showToast('Keep at least one page.', false, true);
            return;
        }

        const { PDFDocument } = await import('pdf-lib');
        const src = await PDFDocument.load(this.pdfBytes, { ignoreEncryption: true });
        const out = await PDFDocument.create();
        const pages = await out.copyPages(src, this.pageOrder);
        pages.forEach(p => out.addPage(p));

        const bytes = await out.save();
        downloadPdf(bytes, outputName(this.fileName, '-organised'));
        recordProcessed({ pdfs: 1, pages: this.pageOrder.length });

        this.hide();
        this.showToast(`Organised PDF saved — ${this.pageOrder.length} pages.`, true);
    }
}
