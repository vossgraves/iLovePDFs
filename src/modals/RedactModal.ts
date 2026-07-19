import { ToolModal } from './ToolModal';
import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';
import { downloadPdf, outputName, renderPdfPages, canvasToBytes } from '../utils/pdf';
import { recordProcessed } from '../utils/stats';

interface RedactBox {
    x: number; // fractions of page size, 0..1
    y: number;
    w: number;
    h: number;
}

/**
 * Redact PDF — draw black boxes over sensitive areas. Pages are re-rendered
 * as images, so the redacted content is genuinely destroyed (not just hidden).
 */
export class RedactModal extends ToolModal {
    private boxes = new Map<number, RedactBox[]>(); // pageIndex -> boxes
    private currentPage = 0;
    private baseCanvases: HTMLCanvasElement[] = [];

    constructor(modalManager: ModalManager, toastManager: ToastManager) {
        super('redact-modal', modalManager, toastManager);
    }

    show(): void {
        this.renderModal();
        this.modalManager.show(this.modalId);
        this.setupEventListeners();
    }

    private renderModal(): void {
        const container = document.getElementById('modal-container')!;

        const content = `
            <div id="red-upload-area">
                ${this.dropzoneHTML('red-dropzone', 'red-file-input', 'Upload your PDF', 'Draw boxes over the content you want to permanently remove')}
            </div>

            <div id="red-options-area" class="hidden mt-2">
                ${this.fileRowHTML('red-file-name', 'red-file-info', 'red-change-btn')}

                <div class="flex items-center justify-between mb-2 px-1">
                    <button id="red-prev" class="px-3 py-1 text-xs font-semibold rounded-xl hover:bg-[#f4f4f5] dark:hover:bg-[#262626] disabled:opacity-30"><i class="fa-solid fa-chevron-left"></i> Prev</button>
                    <div id="red-page-label" class="text-xs font-semibold"></div>
                    <button id="red-next" class="px-3 py-1 text-xs font-semibold rounded-xl hover:bg-[#f4f4f5] dark:hover:bg-[#262626] disabled:opacity-30">Next <i class="fa-solid fa-chevron-right"></i></button>
                </div>

                <div class="flex justify-center bg-[#111111] dark:bg-black p-3 rounded-2xl">
                    <div id="red-stage" class="relative" style="max-width: 100%; touch-action: none;"></div>
                </div>

                <div class="flex items-center justify-between mt-2 px-1">
                    <div id="red-box-info" class="text-xs text-[#666] dark:text-[#a1a1aa]"></div>
                    <button id="red-clear-page" class="text-xs text-[#666] dark:text-[#a1a1aa] hover:text-black dark:hover:text-white font-medium px-2 py-1">
                        <i class="fa-solid fa-trash mr-1"></i> Clear this page
                    </button>
                </div>

                <div class="text-xs text-[#666] dark:text-[#a1a1aa] px-1 mt-2">
                    <i class="fa-solid fa-shield-halved mr-1"></i> Redacted pages are re-rendered as images — the hidden content cannot be recovered.
                </div>
            </div>
        `;

        const footer = `
            <button id="red-process-btn" class="mono-btn px-7 py-2.5 text-sm font-semibold rounded-2xl flex items-center gap-x-2 disabled:opacity-40" disabled>
                <span>Apply redaction</span>
            </button>
        `;

        container.innerHTML = this.createModalHTML('Redact PDF', 'eraser', content, footer, 'max-w-2xl');
    }

    protected setupEventListeners(): void {
        this.wireUpload('red-dropzone', 'red-file-input', files => void this.handleFile(files[0]));
        this.wireChangeButton('red-change-btn', 'red-upload-area', 'red-options-area', 'red-process-btn');

        document.getElementById('red-prev')!.addEventListener('click', () => this.gotoPage(this.currentPage - 1));
        document.getElementById('red-next')!.addEventListener('click', () => this.gotoPage(this.currentPage + 1));
        document.getElementById('red-clear-page')!.addEventListener('click', () => {
            this.boxes.delete(this.currentPage);
            this.renderStage();
        });
        document.getElementById('red-process-btn')!.addEventListener('click', () =>
            this.run('red-process-btn', 'Redacting…', () => this.process()));
    }

    private async handleFile(file: File): Promise<void> {
        if (!(await this.inspect(file))) return;
        this.showOptions('red-upload-area', 'red-options-area', 'red-process-btn', 'red-file-name', 'red-file-info');

        this.boxes.clear();
        this.currentPage = 0;
        this.baseCanvases = await renderPdfPages(this.pdfBytes!, 110);
        this.renderStage();
    }

    private gotoPage(index: number): void {
        if (index < 0 || index >= this.pageCount) return;
        this.currentPage = index;
        this.renderStage();
    }

    private renderStage(): void {
        const stage = document.getElementById('red-stage')!;
        stage.innerHTML = '';

        const base = this.baseCanvases[this.currentPage];
        if (!base) return;

        const display = document.createElement('canvas');
        display.width = base.width;
        display.height = base.height;
        display.style.cssText = 'max-width:100%;height:auto;display:block;';
        const ctx = display.getContext('2d')!;
        ctx.drawImage(base, 0, 0);

        // draw existing boxes
        ctx.fillStyle = '#000';
        (this.boxes.get(this.currentPage) ?? []).forEach(b => {
            ctx.fillRect(b.x * display.width, b.y * display.height, b.w * display.width, b.h * display.height);
        });

        stage.appendChild(display);

        // drag to create a box
        let start: { x: number; y: number } | null = null;
        let preview: HTMLDivElement | null = null;

        const frac = (e: PointerEvent) => {
            const rect = display.getBoundingClientRect();
            return {
                x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
                y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
            };
        };

        display.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            display.setPointerCapture(e.pointerId);
            start = frac(e);
            preview = document.createElement('div');
            preview.style.cssText = 'position:absolute;background:rgba(0,0,0,0.75);border:1px dashed #fff;pointer-events:none;';
            stage.appendChild(preview);
        });
        display.addEventListener('pointermove', (e) => {
            if (!start || !preview) return;
            const now = frac(e);
            const x = Math.min(start.x, now.x), y = Math.min(start.y, now.y);
            const w = Math.abs(now.x - start.x), h = Math.abs(now.y - start.y);
            preview.style.left = `${x * 100}%`;
            preview.style.top = `${y * 100}%`;
            preview.style.width = `${w * 100}%`;
            preview.style.height = `${h * 100}%`;
        });
        display.addEventListener('pointerup', (e) => {
            if (!start) return;
            const now = frac(e);
            const box: RedactBox = {
                x: Math.min(start.x, now.x),
                y: Math.min(start.y, now.y),
                w: Math.abs(now.x - start.x),
                h: Math.abs(now.y - start.y)
            };
            start = null;
            preview?.remove();
            preview = null;

            if (box.w > 0.01 && box.h > 0.01) {
                const list = this.boxes.get(this.currentPage) ?? [];
                list.push(box);
                this.boxes.set(this.currentPage, list);
            }
            this.renderStage();
        });

        // update labels
        document.getElementById('red-page-label')!.textContent = `Page ${this.currentPage + 1} of ${this.pageCount}`;
        (document.getElementById('red-prev') as HTMLButtonElement).disabled = this.currentPage === 0;
        (document.getElementById('red-next') as HTMLButtonElement).disabled = this.currentPage === this.pageCount - 1;

        const total = [...this.boxes.values()].reduce((n, l) => n + l.length, 0);
        const here = this.boxes.get(this.currentPage)?.length ?? 0;
        document.getElementById('red-box-info')!.textContent =
            total === 0 ? 'No redaction areas yet — drag on the page.' : `${here} area${here === 1 ? '' : 's'} on this page · ${total} total`;
    }

    private async process(): Promise<void> {
        const totalBoxes = [...this.boxes.values()].reduce((n, l) => n + l.length, 0);
        if (totalBoxes === 0) {
            this.showToast('Draw at least one redaction area first.', false, true);
            return;
        }

        const { PDFDocument } = await import('pdf-lib');
        const out = await PDFDocument.create();

        // Re-render at higher DPI for output quality and burn the boxes in.
        const hires = await renderPdfPages(this.pdfBytes!, 150);

        for (let i = 0; i < hires.length; i++) {
            const canvas = hires[i];
            const ctx = canvas.getContext('2d')!;
            const pageBoxes = this.boxes.get(i) ?? [];

            ctx.fillStyle = '#000';
            pageBoxes.forEach(b => {
                ctx.fillRect(b.x * canvas.width, b.y * canvas.height, b.w * canvas.width, b.h * canvas.height);
            });

            const jpeg = await canvasToBytes(canvas, 'image/jpeg', 0.88);
            const image = await out.embedJpg(jpeg);
            const page = out.addPage([canvas.width * 72 / 150, canvas.height * 72 / 150]);
            page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
        }

        const bytes = await out.save();
        downloadPdf(bytes, outputName(this.fileName, '-redacted'));
        recordProcessed({ pdfs: 1, pages: hires.length });

        this.hide();
        this.showToast(`Redacted ${totalBoxes} area${totalBoxes === 1 ? '' : 's'} permanently.`, true);
    }
}
