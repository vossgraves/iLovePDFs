import { ToolModal } from './ToolModal';
import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';
import { downloadPdf, outputName, renderPdfPages } from '../utils/pdf';
import { recordProcessed } from '../utils/stats';

interface TextItem {
    page: number;
    xPt: number;
    yPt: number; // PDF coords (bottom-left origin)
    text: string;
    size: number;
}

interface ImageStamp {
    page: number;
    xPt: number;
    yPt: number;
    wPt: number;
    hPt: number;
    bytes: Uint8Array;
    isPng: boolean;
}

/**
 * Edit PDF — click on a page to place text or an image stamp.
 */
export class EditPdfModal extends ToolModal {
    private textItems: TextItem[] = [];
    private stamps: ImageStamp[] = [];
    private currentPage = 0;
    private baseCanvases: HTMLCanvasElement[] = [];
    private pageSizes: { width: number; height: number }[] = [];
    private lastClick: { xPt: number; yPt: number } | null = null;

    constructor(modalManager: ModalManager, toastManager: ToastManager) {
        super('edit-pdf-modal', modalManager, toastManager);
    }

    show(): void {
        this.renderModal();
        this.modalManager.show(this.modalId);
        this.setupEventListeners();
    }

    private renderModal(): void {
        const container = document.getElementById('modal-container')!;

        const content = `
            <div id="ed-upload-area">
                ${this.dropzoneHTML('ed-dropzone', 'ed-file-input', 'Upload your PDF', 'Click on the page to place text or an image')}
            </div>

            <div id="ed-options-area" class="hidden mt-2">
                ${this.fileRowHTML('ed-file-name', 'ed-file-info', 'ed-change-btn')}

                <div class="flex items-center justify-between mb-2 px-1">
                    <button id="ed-prev" class="px-3 py-1 text-xs font-semibold rounded-xl hover:bg-[#f4f4f5] dark:hover:bg-[#262626] disabled:opacity-30"><i class="fa-solid fa-chevron-left"></i> Prev</button>
                    <div id="ed-page-label" class="text-xs font-semibold"></div>
                    <button id="ed-next" class="px-3 py-1 text-xs font-semibold rounded-xl hover:bg-[#f4f4f5] dark:hover:bg-[#262626] disabled:opacity-30">Next <i class="fa-solid fa-chevron-right"></i></button>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="md:col-span-2 flex justify-center bg-[#111111] dark:bg-black p-3 rounded-2xl">
                        <div id="ed-stage" class="relative" style="max-width:100%;"></div>
                    </div>

                    <div class="space-y-4">
                        <div>
                            <div class="font-semibold text-sm mb-1.5 px-1">Add text</div>
                            <input type="text" id="ed-text" placeholder="Your text…" class="border border-[#d1d5db] dark:border-[#404040] px-3 py-2 text-sm w-full rounded-2xl mb-2">
                            <div class="flex gap-2">
                                <input type="number" id="ed-size" min="6" max="72" value="16" title="Font size" class="border border-[#d1d5db] dark:border-[#404040] px-3 py-2 text-sm rounded-2xl w-20">
                                <button id="ed-add-text" class="mono-btn-secondary flex-1 px-3 py-2 text-xs font-semibold rounded-2xl">Place at marker</button>
                            </div>
                            <div class="text-xs text-[#666] dark:text-[#a1a1aa] px-1 mt-1">Click the page to set the marker, then place.</div>
                        </div>

                        <div>
                            <div class="font-semibold text-sm mb-1.5 px-1">Add image</div>
                            <input type="file" id="ed-image-input" accept="image/*" class="hidden">
                            <button id="ed-pick-image" class="mono-btn-secondary w-full px-3 py-2 text-xs font-semibold rounded-2xl">
                                <i class="fa-solid fa-image mr-1"></i> Choose image, then click page
                            </button>
                        </div>

                        <div>
                            <div class="font-semibold text-sm mb-1.5 px-1">Placed items (<span id="ed-item-count">0</span>)</div>
                            <div id="ed-items" class="space-y-1 max-h-[140px] overflow-auto"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const footer = `
            <button id="ed-process-btn" class="mono-btn px-7 py-2.5 text-sm font-semibold rounded-2xl flex items-center gap-x-2 disabled:opacity-40" disabled>
                <span>Save edited PDF</span>
            </button>
        `;

        container.innerHTML = this.createModalHTML('Edit PDF', 'pen-to-square', content, footer, 'max-w-3xl');
    }

    protected setupEventListeners(): void {
        this.wireUpload('ed-dropzone', 'ed-file-input', files => void this.handleFile(files[0]));
        this.wireChangeButton('ed-change-btn', 'ed-upload-area', 'ed-options-area', 'ed-process-btn');

        document.getElementById('ed-prev')!.addEventListener('click', () => this.gotoPage(this.currentPage - 1));
        document.getElementById('ed-next')!.addEventListener('click', () => this.gotoPage(this.currentPage + 1));
        document.getElementById('ed-add-text')!.addEventListener('click', () => this.addTextItem());
        document.getElementById('ed-pick-image')!.addEventListener('click', () =>
            (document.getElementById('ed-image-input') as HTMLInputElement).click());
        (document.getElementById('ed-image-input') as HTMLInputElement).addEventListener('change', (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) void this.addImageStamp(file);
            (e.target as HTMLInputElement).value = '';
        });

        document.getElementById('ed-process-btn')!.addEventListener('click', () =>
            this.run('ed-process-btn', 'Saving…', () => this.process()));
    }

    private async handleFile(file: File): Promise<void> {
        if (!(await this.inspect(file))) return;
        this.showOptions('ed-upload-area', 'ed-options-area', 'ed-process-btn', 'ed-file-name', 'ed-file-info');

        this.textItems = [];
        this.stamps = [];
        this.currentPage = 0;
        this.lastClick = null;

        this.baseCanvases = await renderPdfPages(this.pdfBytes!, 110);

        // real page point sizes for coordinate mapping
        const { PDFDocument } = await import('pdf-lib');
        const doc = await PDFDocument.load(this.pdfBytes!, { ignoreEncryption: true });
        this.pageSizes = doc.getPages().map(p => p.getSize());

        this.renderStage();
    }

    private gotoPage(index: number): void {
        if (index < 0 || index >= this.pageCount) return;
        this.currentPage = index;
        this.lastClick = null;
        this.renderStage();
    }

    private pxToPt(canvas: HTMLCanvasElement, cssX: number, cssY: number): { xPt: number; yPt: number } {
        const page = this.pageSizes[this.currentPage];
        const scaleX = canvas.width / canvas.clientWidth;
        const scaleY = canvas.height / canvas.clientHeight;
        const pxX = cssX * scaleX;
        const pxY = cssY * scaleY;
        return {
            xPt: (pxX / canvas.width) * page.width,
            yPt: page.height - (pxY / canvas.height) * page.height // flip Y
        };
    }

    private renderStage(): void {
        const stage = document.getElementById('ed-stage')!;
        stage.innerHTML = '';

        const base = this.baseCanvases[this.currentPage];
        if (!base) return;

        const display = document.createElement('canvas');
        display.width = base.width;
        display.height = base.height;
        display.style.cssText = 'max-width:100%;height:auto;display:block;cursor:crosshair;';
        const ctx = display.getContext('2d')!;
        ctx.drawImage(base, 0, 0);
        stage.appendChild(display);

        const page = this.pageSizes[this.currentPage];
        const toPx = (xPt: number, yPt: number) => ({
            x: (xPt / page.width) * display.width,
            y: ((page.height - yPt) / page.height) * display.height
        });

        // paint already-placed items
        ctx.font = 'bold 12px Inter, sans-serif';
        this.textItems.filter(i => i.page === this.currentPage).forEach(item => {
            const p = toPx(item.xPt, item.yPt);
            const pxSize = (item.size / page.width) * display.width;
            ctx.fillStyle = '#000';
            ctx.font = `${pxSize}px Helvetica, sans-serif`;
            ctx.fillText(item.text, p.x, p.y);
        });
        this.stamps.filter(s => s.page === this.currentPage).forEach(s => {
            const p = toPx(s.xPt, s.yPt);
            const w = (s.wPt / page.width) * display.width;
            const h = (s.hPt / page.height) * display.height;
            ctx.strokeStyle = '#000';
            ctx.setLineDash([4, 3]);
            ctx.strokeRect(p.x, p.y - h, w, h);
            ctx.setLineDash([]);
        });

        display.addEventListener('click', (e) => {
            const rect = display.getBoundingClientRect();
            const pt = this.pxToPt(display, e.clientX - rect.left, e.clientY - rect.top);
            this.lastClick = pt;

            // draw/move the marker
            this.renderStage();
            const p = toPx(pt.xPt, pt.yPt);
            const mctx = (stage.querySelector('canvas') as HTMLCanvasElement).getContext('2d')!;
            mctx.fillStyle = '#e11d48';
            mctx.beginPath();
            mctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
            mctx.fill();
        });

        document.getElementById('ed-page-label')!.textContent = `Page ${this.currentPage + 1} of ${this.pageCount}`;
        (document.getElementById('ed-prev') as HTMLButtonElement).disabled = this.currentPage === 0;
        (document.getElementById('ed-next') as HTMLButtonElement).disabled = this.currentPage === this.pageCount - 1;
        this.renderItemList();
    }

    private addTextItem(): void {
        const text = (document.getElementById('ed-text') as HTMLInputElement).value.trim();
        const size = Math.min(72, Math.max(6, parseInt((document.getElementById('ed-size') as HTMLInputElement).value, 10) || 16));

        if (!text) {
            this.showToast('Type some text first.', false, true);
            return;
        }
        if (!this.lastClick) {
            this.showToast('Click on the page to place the marker first.', false, true);
            return;
        }

        this.textItems.push({ page: this.currentPage, xPt: this.lastClick.xPt, yPt: this.lastClick.yPt, text, size });
        (document.getElementById('ed-text') as HTMLInputElement).value = '';
        this.renderStage();
    }

    private async addImageStamp(file: File): Promise<void> {
        if (!this.lastClick) {
            this.showToast('Click on the page to place the marker first, then choose the image.', false, true);
            return;
        }

        const bytes = new Uint8Array(await file.arrayBuffer());
        const isPng = file.type.includes('png');

        // measure the image
        const bitmap = await createImageBitmap(new Blob([bytes]));
        const page = this.pageSizes[this.currentPage];
        const wPt = Math.min(page.width * 0.35, 150);
        const hPt = wPt * (bitmap.height / bitmap.width);

        this.stamps.push({ page: this.currentPage, xPt: this.lastClick.xPt, yPt: this.lastClick.yPt, wPt, hPt, bytes, isPng });
        this.renderStage();
    }

    private renderItemList(): void {
        const holder = document.getElementById('ed-items')!;
        holder.innerHTML = '';
        const total = this.textItems.length + this.stamps.length;
        document.getElementById('ed-item-count')!.textContent = String(total);

        const removeRow = (label: string, onRemove: () => void) => {
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between text-xs bg-[#f8f8f8] dark:bg-[#1f1f1f] px-3 py-1.5 rounded-xl';
            row.innerHTML = `<span class="truncate">${label}</span><button class="text-red-500 px-1"><i class="fa-solid fa-times"></i></button>`;
            row.querySelector('button')!.addEventListener('click', () => {
                onRemove();
                this.renderStage();
            });
            holder.appendChild(row);
        };

        this.textItems.forEach((item, i) =>
            removeRow(`"${item.text}" · p.${item.page + 1}`, () => this.textItems.splice(i, 1)));
        this.stamps.forEach((s, i) =>
            removeRow(`Image · p.${s.page + 1}`, () => this.stamps.splice(i, 1)));
    }

    private async process(): Promise<void> {
        if (this.textItems.length === 0 && this.stamps.length === 0) {
            this.showToast('Place at least one text or image item first.', false, true);
            return;
        }

        const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
        const doc = await PDFDocument.load(this.pdfBytes!, { ignoreEncryption: true });
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const pages = doc.getPages();

        this.textItems.forEach(item => {
            pages[item.page].drawText(item.text, {
                x: item.xPt,
                y: item.yPt - item.size, // baseline ≈ marker
                size: item.size,
                font,
                color: rgb(0, 0, 0)
            });
        });

        for (const stamp of this.stamps) {
            const image = stamp.isPng ? await doc.embedPng(stamp.bytes) : await doc.embedJpg(stamp.bytes);
            pages[stamp.page].drawImage(image, {
                x: stamp.xPt,
                y: stamp.yPt - stamp.hPt,
                width: stamp.wPt,
                height: stamp.hPt
            });
        }

        const bytes = await doc.save();
        downloadPdf(bytes, outputName(this.fileName, '-edited'));
        recordProcessed({ pdfs: 1, pages: this.pageCount });

        this.hide();
        this.showToast('Edited PDF saved!', true);
    }
}
