import { BaseModal } from './BaseModal';
import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';
import type { NupOptions } from '../types';
import { inspectPdf, downloadPdf, outputName, getPdfJs } from '../utils/pdf';
import { recordProcessed } from '../utils/stats';
import {
    PAPER_SIZES,
    NUP_CHOICES,
    mmToPt,
    getPaperSize,
    gridFor,
    sheetDims,
    computeCells,
    effectiveSpacing,
    cellIndexForSlot,
    fitPlacement,
    fillPlacement,
    totalSheets,
    layoutSummary
} from '../utils/nupEngine';

const CHIP_BASE =
    'option-chip cursor-pointer px-4 py-1.5 bg-[#f4f4f5] dark:bg-[#262626] hover:bg-[#e5e5e5] dark:hover:bg-[#333333] text-sm font-semibold text-center rounded-2xl';

export class NupModal extends BaseModal {
    private pdfBytes: ArrayBuffer | null = null;
    private fileName = '';
    private pageCount = 0;
    private thumbnails: HTMLCanvasElement[] = [];
    private previewToken = 0;
    private previewTimer = 0;

    private options: NupOptions = {
        pagesPerSheet: 4,
        arrangement: 'horizontal',
        paperSizeId: 'a4',
        orientation: 'portrait',
        scaling: 'fit',
        order: 'row-major',
        marginMm: 8,
        gutterMm: 4,
        drawBorder: false
    };

    constructor(modalManager: ModalManager, toastManager: ToastManager) {
        super('nup-modal', modalManager, toastManager);
    }

    show(): void {
        this.renderModal();
        this.modalManager.show(this.modalId);
        this.setupEventListeners();
    }

    // ------------------------------------------------------------------ UI

    private renderModal(): void {
        const container = document.getElementById('modal-container')!;

        const nupChips = NUP_CHOICES.map(n =>
            `<div class="${CHIP_BASE} flex-1 ${n === this.options.pagesPerSheet ? 'active-option' : ''}" data-value="${n}">${n}-up</div>`
        ).join('');

        const paperOptions = PAPER_SIZES.map(p =>
            `<option value="${p.id}" ${p.id === this.options.paperSizeId ? 'selected' : ''}>${p.label}</option>`
        ).join('');

        const content = `
            <div id="nup-upload-area">
                <div id="nup-dropzone" class="border border-dashed border-[#d1d5db] dark:border-[#404040] hover:border-[#888] px-8 py-9 transition-colors rounded-3xl flex flex-col items-center justify-center cursor-pointer">
                    <div class="w-12 h-12 bg-[#111111] dark:bg-white text-white dark:text-black flex items-center justify-center rounded-2xl mb-4">
                        <i class="fa-solid fa-file-pdf fa-2x"></i>
                    </div>
                    <div class="font-bold">Upload your PDF</div>
                    <div class="text-xs text-center text-[#666] dark:text-[#a1a1aa] mt-1">Supports multi-page PDFs up to 50MB</div>

                    <button id="nup-choose-btn" class="mt-4 mono-btn-secondary px-6 py-2 text-xs font-semibold rounded-3xl flex items-center gap-x-2">
                        <i class="fa-solid fa-upload mr-1.5"></i>
                        <span>Choose file</span>
                    </button>
                    <input type="file" id="nup-file-input" accept=".pdf" class="hidden">
                </div>
            </div>

            <div id="nup-options-area" class="hidden mt-2">
                <div class="flex items-center justify-between mb-4">
                    <div class="min-w-0">
                        <div id="nup-file-name" class="font-semibold truncate"></div>
                        <div id="nup-file-info" class="text-xs text-[#666] dark:text-[#a1a1aa]"></div>
                    </div>
                    <button id="nup-change-btn" class="px-3 py-1 text-xs text-[#666] dark:text-[#a1a1aa] flex items-center gap-x-1 hover:text-black dark:hover:text-white shrink-0">
                        <i class="fa-solid fa-times"></i> <span class="font-medium">Change</span>
                    </button>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
                    <!-- Pages per sheet -->
                    <div class="md:col-span-2">
                        <div class="font-semibold text-sm mb-2 px-1">Pages per sheet</div>
                        <div class="flex flex-wrap gap-2" id="nup-count-options">${nupChips}</div>
                    </div>

                    <!-- Arrangement -->
                    <div>
                        <div class="font-semibold text-sm mb-2 px-1">Arrangement</div>
                        <div class="grid grid-cols-2 gap-2" id="nup-arrangement-options">
                            <div class="${CHIP_BASE} ${this.options.arrangement === 'horizontal' ? 'active-option' : ''}" data-value="horizontal">Horizontal</div>
                            <div class="${CHIP_BASE} ${this.options.arrangement === 'vertical' ? 'active-option' : ''}" data-value="vertical">Vertical</div>
                        </div>
                    </div>

                    <!-- Scaling -->
                    <div>
                        <div class="font-semibold text-sm mb-2 px-1">Page scaling</div>
                        <div class="grid grid-cols-2 gap-2" id="nup-scaling-options">
                            <div class="${CHIP_BASE} ${this.options.scaling === 'fit' ? 'active-option' : ''}" data-value="fit" title="Scale to fit inside the cell, keeping proportions (may leave margins)">
                                <i class="fa-solid fa-down-left-and-up-right-to-center mr-1 text-xs"></i>Fit page
                            </div>
                            <div class="${CHIP_BASE} ${this.options.scaling === 'fill' ? 'active-option' : ''}" data-value="fill" title="Stretch to fill the entire cell - no white space">
                                <i class="fa-solid fa-up-right-and-down-left-from-center mr-1 text-xs"></i>Fill page
                            </div>
                        </div>
                        <div id="nup-spacing-note" class="text-[10px] text-[#666] dark:text-[#a1a1aa] mt-1.5 px-1">
                            Fit keeps proportions (may leave margins). Fill uses the full sheet with 0mm margins and gutters.
                        </div>
                    </div>

                    <!-- Paper size -->
                    <div>
                        <div class="font-semibold text-sm mb-2 px-1">Paper size</div>
                        <select id="nup-paper" class="w-full border border-[#d1d5db] dark:border-[#404040] px-3 py-2 text-sm font-medium rounded-2xl">${paperOptions}</select>
                    </div>

                    <!-- Orientation -->
                    <div>
                        <div class="font-semibold text-sm mb-2 px-1">Orientation</div>
                        <div class="grid grid-cols-2 gap-2" id="nup-orientation-options">
                            <div class="${CHIP_BASE} ${this.options.orientation === 'portrait' ? 'active-option' : ''}" data-value="portrait">Portrait</div>
                            <div class="${CHIP_BASE} ${this.options.orientation === 'landscape' ? 'active-option' : ''}" data-value="landscape">Landscape</div>
                        </div>
                    </div>

                    <!-- Page order -->
                    <div>
                        <div class="font-semibold text-sm mb-2 px-1">Page order</div>
                        <select id="nup-order" class="w-full border border-[#d1d5db] dark:border-[#404040] px-3 py-2 text-sm font-medium rounded-2xl">
                            <option value="row-major" ${this.options.order === 'row-major' ? 'selected' : ''}>Left to right, top to bottom</option>
                            <option value="column-major" ${this.options.order === 'column-major' ? 'selected' : ''}>Top to bottom, left to right</option>
                        </select>
                    </div>

                    <!-- Margins & gutter -->
                    <div>
                        <div class="font-semibold text-sm mb-2 px-1">Margins & spacing (mm)</div>
                        <div class="grid grid-cols-2 gap-2">
                            <input type="number" id="nup-margin" min="0" max="40" step="1" value="${this.options.marginMm}" title="Sheet margin" class="border border-[#d1d5db] dark:border-[#404040] px-3 py-2 text-sm font-medium rounded-2xl w-full disabled:opacity-50 disabled:cursor-not-allowed">
                            <input type="number" id="nup-gutter" min="0" max="40" step="1" value="${this.options.gutterMm}" title="Spacing between pages" class="border border-[#d1d5db] dark:border-[#404040] px-3 py-2 text-sm font-medium rounded-2xl w-full disabled:opacity-50 disabled:cursor-not-allowed">
                        </div>
                    </div>

                    <!-- Border toggle -->
                    <div class="md:col-span-2 flex items-center gap-x-2 px-1">
                        <input type="checkbox" id="nup-border" ${this.options.drawBorder ? 'checked' : ''} class="accent-black dark:accent-white">
                        <label for="nup-border" class="text-sm">Draw a border around each page</label>
                    </div>
                </div>

                <!-- Preview -->
                <div class="mt-6">
                    <div class="flex justify-between items-center mb-2 px-1">
                        <div class="font-semibold text-sm">Preview</div>
                        <div id="nup-layout-summary" class="text-xs text-[#666] dark:text-[#a1a1aa]"></div>
                    </div>
                    <div class="bg-[#111111] dark:bg-black p-4 rounded-2xl flex justify-center">
                        <div id="nup-preview" class="nup-sheet"></div>
                    </div>
                    <div class="px-1 mt-2 text-xs text-[#666] dark:text-[#a1a1aa]">Preview shows the first output sheet.</div>
                </div>
            </div>
        `;

        const footer = `
            <button id="nup-process-btn" class="mono-btn px-7 py-2.5 text-sm font-semibold rounded-2xl flex items-center gap-x-2 disabled:opacity-40" disabled>
                <span>Create N-up PDF</span>
            </button>
        `;

        container.innerHTML = this.createModalHTML('N-up PDF', 'th-large', content, footer, 'max-w-2xl');
    }

    // ------------------------------------------------------------ listeners

    protected setupEventListeners(): void {
        const dropzone = document.getElementById('nup-dropzone')!;
        const fileInput = document.getElementById('nup-file-input') as HTMLInputElement;
        const chooseBtn = document.getElementById('nup-choose-btn')!;

        dropzone.addEventListener('click', () => fileInput.click());
        chooseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.click();
        });

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

        // Chip groups
        this.bindChipGroup('nup-count-options', value => {
            this.options.pagesPerSheet = parseInt(value, 10);
            this.schedulePreview();
        });
        this.bindChipGroup('nup-arrangement-options', value => {
            this.options.arrangement = value as NupOptions['arrangement'];
            this.schedulePreview();
        });
        this.bindChipGroup('nup-scaling-options', value => {
            this.options.scaling = value as NupOptions['scaling'];
            if (this.options.scaling === 'fill') {
                this.options.marginMm = 0;
                this.options.gutterMm = 0;
            }
            this.updateSpacingControls();
            this.schedulePreview();
        });
        this.bindChipGroup('nup-orientation-options', value => {
            this.options.orientation = value as NupOptions['orientation'];
            this.schedulePreview();
        });

        // Selects
        const paperSelect = document.getElementById('nup-paper') as HTMLSelectElement;
        paperSelect.addEventListener('change', () => {
            this.options.paperSizeId = paperSelect.value;
            this.schedulePreview();
        });

        const orderSelect = document.getElementById('nup-order') as HTMLSelectElement;
        orderSelect.addEventListener('change', () => {
            this.options.order = orderSelect.value as NupOptions['order'];
            this.schedulePreview();
        });

        // Number inputs
        const marginInput = document.getElementById('nup-margin') as HTMLInputElement;
        marginInput.addEventListener('input', () => {
            this.options.marginMm = this.clampMm(marginInput.value, this.options.marginMm);
            this.schedulePreview();
        });

        const gutterInput = document.getElementById('nup-gutter') as HTMLInputElement;
        gutterInput.addEventListener('input', () => {
            this.options.gutterMm = this.clampMm(gutterInput.value, this.options.gutterMm);
            this.schedulePreview();
        });

        // Border toggle
        const borderInput = document.getElementById('nup-border') as HTMLInputElement;
        borderInput.addEventListener('change', () => {
            this.options.drawBorder = borderInput.checked;
            this.schedulePreview();
        });

        this.updateSpacingControls();

        // Actions
        document.getElementById('nup-process-btn')!.addEventListener('click', () => void this.processNup());
        document.getElementById('nup-change-btn')!.addEventListener('click', () => this.resetUpload());
    }

    private bindChipGroup(containerId: string, onPick: (value: string) => void): void {
        const container = document.getElementById(containerId)!;
        container.querySelectorAll('.option-chip').forEach(el => {
            el.addEventListener('click', () => {
                container.querySelectorAll('.option-chip').forEach(e => e.classList.remove('active-option'));
                el.classList.add('active-option');
                onPick((el as HTMLElement).dataset.value!);
            });
        });
    }

    private clampMm(raw: string, fallback: number): number {
        const value = parseInt(raw, 10);
        if (isNaN(value)) return fallback;
        return Math.min(40, Math.max(0, value));
    }

    private updateSpacingControls(): void {
        const marginInput = document.getElementById('nup-margin') as HTMLInputElement | null;
        const gutterInput = document.getElementById('nup-gutter') as HTMLInputElement | null;
        const note = document.getElementById('nup-spacing-note');
        if (!marginInput || !gutterInput) return;

        const edgeToEdge = this.options.scaling === 'fill';
        if (edgeToEdge) {
            this.options.marginMm = 0;
            this.options.gutterMm = 0;
            marginInput.value = '0';
            gutterInput.value = '0';
        }
        marginInput.disabled = edgeToEdge;
        gutterInput.disabled = edgeToEdge;
        marginInput.title = edgeToEdge ? 'Fill page uses 0mm margins' : 'Sheet margin';
        gutterInput.title = edgeToEdge ? 'Fill page uses 0mm gutters' : 'Spacing between pages';
        if (note) {
            note.textContent = edgeToEdge
                ? 'Fill uses every point of the sheet — no outer margins or inter-page white space.'
                : 'Fit keeps proportions (may leave margins). Fill uses the full sheet with 0mm margins and gutters.';
        }
    }

    // ---------------------------------------------------------------- file

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
            this.thumbnails = [];

            document.getElementById('nup-upload-area')!.style.display = 'none';
            document.getElementById('nup-options-area')!.classList.remove('hidden');
            (document.getElementById('nup-process-btn') as HTMLButtonElement).disabled = false;

            document.getElementById('nup-file-name')!.innerHTML =
                `<i class="fa-solid fa-file-pdf mr-1.5 text-[#777]"></i> ${info.name}`;
            document.getElementById('nup-file-info')!.textContent =
                `${(info.size / 1024 / 1024).toFixed(1)} MB · ${info.pageCount} page${info.pageCount === 1 ? '' : 's'}`;

            void this.updatePreview();
        } catch (err) {
            this.showToast(err instanceof Error ? err.message : 'Could not read this PDF.', false, true);
        }
    }

    private resetUpload(): void {
        this.pdfBytes = null;
        this.fileName = '';
        this.pageCount = 0;
        this.thumbnails = [];
        this.previewToken++;

        document.getElementById('nup-upload-area')!.style.display = 'block';
        document.getElementById('nup-options-area')!.classList.add('hidden');
        (document.getElementById('nup-process-btn') as HTMLButtonElement).disabled = true;
        document.getElementById('nup-preview')!.innerHTML = '';
    }

    // -------------------------------------------------------------- preview

    private schedulePreview(): void {
        window.clearTimeout(this.previewTimer);
        this.previewTimer = window.setTimeout(() => void this.updatePreview(), 150);
    }

    private async ensureThumbnails(limit: number, token: number): Promise<void> {
        if (!this.pdfBytes) return;

        const pdfjs = await getPdfJs();
        // pdfjs detaches (transfers) the buffer it receives — hand it a copy.
        const doc = await pdfjs.getDocument({ data: this.pdfBytes.slice(0) }).promise;

        try {
            const count = Math.min(limit, doc.numPages);
            for (let i = 0; i < count; i++) {
                if (token !== this.previewToken) return; // a newer preview superseded us
                if (this.thumbnails[i]) continue;

                const page = await doc.getPage(i + 1);
                const base = page.getViewport({ scale: 1 });
                const viewport = page.getViewport({ scale: 220 / base.width });
                const canvas = document.createElement('canvas');
                canvas.width = Math.ceil(viewport.width);
                canvas.height = Math.ceil(viewport.height);
                await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
                this.thumbnails[i] = canvas;
            }
        } finally {
            void doc.destroy();
        }
    }

    private async updatePreview(): Promise<void> {
        const preview = document.getElementById('nup-preview');
        if (!preview || !this.pdfBytes) return;

        const token = ++this.previewToken;

        const paper = getPaperSize(this.options.paperSizeId);
        const sheet = sheetDims(paper, this.options.orientation);
        const grid = gridFor(this.options.pagesPerSheet, this.options.arrangement);
        const perSheet = grid.rows * grid.cols;
        const spacing = effectiveSpacing(this.options.scaling, mmToPt(this.options.marginMm), mmToPt(this.options.gutterMm));
        const cells = computeCells(sheet, grid, spacing.marginPt, spacing.gutterPt);

        preview.style.aspectRatio = `${sheet.width} / ${sheet.height}`;
        preview.style.width = sheet.width >= sheet.height ? '420px' : '300px';
        preview.style.maxWidth = '100%';
        preview.innerHTML = '';

        const summary = document.getElementById('nup-layout-summary');
        if (summary) {
            summary.textContent = `${layoutSummary(paper, this.options.orientation, grid, this.options.scaling)} · ${totalSheets(this.pageCount, perSheet)} sheet${totalSheets(this.pageCount, perSheet) === 1 ? '' : 's'}`;
        }

        try {
            await this.ensureThumbnails(Math.min(perSheet, this.pageCount), token);
        } catch {
            return; // thumbnail rendering is best-effort
        }
        if (token !== this.previewToken) return;

        for (let slot = 0; slot < perSheet; slot++) {
            const cell = cells[cellIndexForSlot(slot, grid, this.options.order)];
            const cellEl = document.createElement('div');
            cellEl.className = `nup-cell ${this.options.scaling}${this.options.drawBorder ? ' bordered' : ''}`;
            cellEl.style.left = `${(cell.x / sheet.width) * 100}%`;
            cellEl.style.top = `${((sheet.height - cell.y - cell.height) / sheet.height) * 100}%`;
            cellEl.style.width = `${(cell.width / sheet.width) * 100}%`;
            cellEl.style.height = `${(cell.height / sheet.height) * 100}%`;

            const canvas = this.thumbnails[slot];
            if (canvas) {
                cellEl.appendChild(canvas);

                const badge = document.createElement('div');
                badge.className = 'page-badge';
                badge.textContent = String(slot + 1);
                cellEl.appendChild(badge);
            } else {
                cellEl.classList.add('empty');
            }

            preview.appendChild(cellEl);
        }
    }

    // ------------------------------------------------------------- process

    private async processNup(): Promise<void> {
        if (!this.pdfBytes) return;

        const btn = document.getElementById('nup-process-btn') as HTMLButtonElement;
        const originalHTML = btn.innerHTML;
        btn.innerHTML = `<span class="flex items-center justify-center gap-x-2"><i class="fa-solid fa-spinner fa-spin"></i> Processing...</span>`;
        btn.disabled = true;

        try {
            const { PDFDocument, rgb } = await import('pdf-lib');
            const src = await PDFDocument.load(this.pdfBytes, { ignoreEncryption: true });
            const out = await PDFDocument.create();

            const paper = getPaperSize(this.options.paperSizeId);
            const sheet = sheetDims(paper, this.options.orientation);
            const grid = gridFor(this.options.pagesPerSheet, this.options.arrangement);
            const perSheet = grid.rows * grid.cols;
            const spacing = effectiveSpacing(this.options.scaling, mmToPt(this.options.marginMm), mmToPt(this.options.gutterMm));
            const cells = computeCells(sheet, grid, spacing.marginPt, spacing.gutterPt);
            const total = src.getPageCount();
            const borderColor = rgb(0.07, 0.07, 0.07);

            for (let s = 0; s < totalSheets(total, perSheet); s++) {
                const outPage = out.addPage([sheet.width, sheet.height]);

                for (let slot = 0; slot < perSheet; slot++) {
                    const pageIndex = s * perSheet + slot;
                    if (pageIndex >= total) break;

                    const cell = cells[cellIndexForSlot(slot, grid, this.options.order)];
                    const srcPage = src.getPage(pageIndex);
                    const { width: srcW, height: srcH } = srcPage.getSize();

                    if (this.options.scaling === 'fit') {
                        const embedded = await out.embedPage(srcPage);
                        const p = fitPlacement(srcW, srcH, cell);
                        outPage.drawPage(embedded, { x: p.x, y: p.y, width: p.width, height: p.height });

                        if (this.options.drawBorder) {
                            outPage.drawRectangle({
                                x: p.x, y: p.y, width: p.width, height: p.height,
                                borderColor, borderWidth: 0.5
                            });
                        }
                    } else {
                        const f = fillPlacement(srcW, srcH, cell);
                        const embedded = await out.embedPage(srcPage);
                        outPage.drawPage(embedded, { x: f.x, y: f.y, width: f.width, height: f.height });

                        if (this.options.drawBorder) {
                            outPage.drawRectangle({
                                x: cell.x, y: cell.y, width: cell.width, height: cell.height,
                                borderColor, borderWidth: 0.5
                            });
                        }
                    }
                }
            }

            const bytes = await out.save();
            downloadPdf(bytes, outputName(this.fileName, `-${this.options.pagesPerSheet}up`));
            recordProcessed({ pdfs: 1, nup: 1, pages: total });

            this.hide();
            this.showToast(
                `N-up PDF created (${this.options.pagesPerSheet}-up on ${paper.label}, ${this.options.scaling === 'fit' ? 'fit' : 'fill'} page)`,
                true
            );
            this.resetUpload();
        } catch (err) {
            this.showToast(
                'Could not create the N-up PDF' + (err instanceof Error ? `: ${err.message}` : '.'),
                false,
                true
            );
        } finally {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }
    }
}
