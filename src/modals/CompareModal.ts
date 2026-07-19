import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';
import { ToolModal } from './ToolModal';
import { renderPdfPages } from '../utils/pdf';

/**
 * Compare PDF — renders two documents side by side with an optional
 * pixel-difference overlay (changed pixels highlighted in red).
 */
export class CompareModal extends ToolModal {
    private pagesA: HTMLCanvasElement[] = [];
    private pagesB: HTMLCanvasElement[] = [];
    private currentPage = 0;
    private showDiff = true;

    constructor(modalManager: ModalManager, toastManager: ToastManager) {
        super('compare-modal', modalManager, toastManager);
    }

    show(): void {
        this.renderModal();
        this.modalManager.show(this.modalId);
        this.setupEventListeners();
    }

    private renderModal(): void {
        const container = document.getElementById('modal-container')!;

        const content = `
            <div id="cmp-upload-area">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div id="cmp-zone-a" class="border border-dashed border-[#d1d5db] dark:border-[#404040] hover:border-[#888] transition-colors px-4 py-7 rounded-3xl flex flex-col items-center justify-center cursor-pointer">
                        <i class="fa-solid fa-file-pdf text-3xl mb-2 text-[#777]"></i>
                        <div class="font-semibold text-sm">Original PDF</div>
                        <div id="cmp-name-a" class="text-xs text-[#666] dark:text-[#a1a1aa] mt-1 text-center truncate w-full px-2">Choose file A</div>
                        <input type="file" id="cmp-input-a" accept=".pdf" class="hidden">
                    </div>
                    <div id="cmp-zone-b" class="border border-dashed border-[#d1d5db] dark:border-[#404040] hover:border-[#888] transition-colors px-4 py-7 rounded-3xl flex flex-col items-center justify-center cursor-pointer">
                        <i class="fa-solid fa-file-pdf text-3xl mb-2 text-[#777]"></i>
                        <div class="font-semibold text-sm">Changed PDF</div>
                        <div id="cmp-name-b" class="text-xs text-[#666] dark:text-[#a1a1aa] mt-1 text-center truncate w-full px-2">Choose file B</div>
                        <input type="file" id="cmp-input-b" accept=".pdf" class="hidden">
                    </div>
                </div>
            </div>

            <div id="cmp-view-area" class="hidden mt-2">
                <div class="flex items-center justify-between mb-2 px-1">
                    <button id="cmp-prev" class="px-3 py-1 text-xs font-semibold rounded-xl hover:bg-[#f4f4f5] dark:hover:bg-[#262626] disabled:opacity-30"><i class="fa-solid fa-chevron-left"></i> Prev</button>
                    <div id="cmp-page-label" class="text-xs font-semibold"></div>
                    <button id="cmp-next" class="px-3 py-1 text-xs font-semibold rounded-xl hover:bg-[#f4f4f5] dark:hover:bg-[#262626] disabled:opacity-30">Next <i class="fa-solid fa-chevron-right"></i></button>
                </div>

                <div class="grid grid-cols-2 gap-2 bg-[#111111] dark:bg-black p-3 rounded-2xl">
                    <div class="text-center">
                        <div class="text-[10px] font-bold text-white/70 mb-1 truncate">${''}A</div>
                        <div id="cmp-canvas-a" class="flex justify-center"></div>
                    </div>
                    <div class="text-center">
                        <div class="text-[10px] font-bold text-white/70 mb-1 truncate">B</div>
                        <div id="cmp-canvas-b" class="flex justify-center"></div>
                    </div>
                </div>

                <div class="mt-2 px-1 flex items-center justify-between">
                    <label class="flex items-center gap-x-2 text-sm cursor-pointer">
                        <input type="checkbox" id="cmp-diff-toggle" checked class="accent-black dark:accent-white">
                        <span>Highlight differences</span>
                    </label>
                    <div id="cmp-diff-info" class="text-xs text-[#666] dark:text-[#a1a1aa]"></div>
                </div>
            </div>
        `;

        const footer = `
            <button onclick="window.modalManager.hide('${this.modalId}')" class="mono-btn px-7 py-2.5 text-sm font-semibold rounded-2xl">Done</button>
        `;

        container.innerHTML = this.createModalHTML('Compare PDF', 'code-compare', content, footer, 'max-w-3xl');
    }

    protected setupEventListeners(): void {
        this.wireUpload('cmp-zone-a', 'cmp-input-a', files => void this.loadFile(files[0], 'a'));
        this.wireUpload('cmp-zone-b', 'cmp-input-b', files => void this.loadFile(files[0], 'b'));

        document.getElementById('cmp-prev')!.addEventListener('click', () => this.gotoPage(this.currentPage - 1));
        document.getElementById('cmp-next')!.addEventListener('click', () => this.gotoPage(this.currentPage + 1));
        document.getElementById('cmp-diff-toggle')!.addEventListener('change', (e) => {
            this.showDiff = (e.target as HTMLInputElement).checked;
            this.renderComparison();
        });
    }

    private async loadFile(file: File, side: 'a' | 'b'): Promise<void> {
        if (!this.isPdf(file)) {
            this.showToast('Please upload a PDF file.', false, true);
            return;
        }

        document.getElementById(`cmp-name-${side}`)!.textContent = file.name;

        try {
            const bytes = await file.arrayBuffer();
            const pages = await renderPdfPages(bytes, 90);
            if (side === 'a') {
                this.pagesA = pages;
            } else {
                this.pagesB = pages;
            }
        } catch {
            this.showToast('Could not read this PDF.', false, true);
            return;
        }

        if (this.pagesA.length && this.pagesB.length) {
            document.getElementById('cmp-view-area')!.classList.remove('hidden');
            this.currentPage = 0;
            this.renderComparison();
        }
    }

    private gotoPage(index: number): void {
        const max = Math.max(this.pagesA.length, this.pagesB.length);
        if (index < 0 || index >= max) return;
        this.currentPage = index;
        this.renderComparison();
    }

    private renderComparison(): void {
        const holderA = document.getElementById('cmp-canvas-a')!;
        const holderB = document.getElementById('cmp-canvas-b')!;
        holderA.innerHTML = '';
        holderB.innerHTML = '';

        const canvasA = this.pagesA[this.currentPage];
        const canvasB = this.pagesB[this.currentPage];

        const show = (canvas: HTMLCanvasElement | undefined, holder: HTMLElement, label: string) => {
            if (canvas) {
                canvas.style.cssText = 'max-width:100%;height:auto;display:block;background:#fff;';
                holder.appendChild(canvas);
            } else {
                holder.innerHTML = `<div class="text-white/50 text-xs py-10">No page ${this.currentPage + 1} in ${label}</div>`;
            }
        };

        show(canvasA, holderA, 'A');
        show(canvasB, holderB, 'B');

        const max = Math.max(this.pagesA.length, this.pagesB.length);
        document.getElementById('cmp-page-label')!.textContent = `Page ${this.currentPage + 1} of ${max}`;
        (document.getElementById('cmp-prev') as HTMLButtonElement).disabled = this.currentPage === 0;
        (document.getElementById('cmp-next') as HTMLButtonElement).disabled = this.currentPage === max - 1;

        // diff overlay on B
        const info = document.getElementById('cmp-diff-info')!;
        if (this.showDiff && canvasA && canvasB) {
            const changed = this.overlayDiff(canvasA, canvasB);
            info.textContent = changed < 0.01 ? 'Pages look identical' : `~${changed.toFixed(1)}% of pixels differ`;
        } else {
            info.textContent = '';
        }
    }

    /** Paints differing pixels red onto canvasB; returns the % of changed pixels. */
    private overlayDiff(a: HTMLCanvasElement, b: HTMLCanvasElement): number {
        const w = Math.min(a.width, b.width);
        const h = Math.min(a.height, b.height);
        if (w === 0 || h === 0) return 0;

        const tmpA = document.createElement('canvas');
        const tmpB = document.createElement('canvas');
        tmpA.width = tmpB.width = w;
        tmpA.height = tmpB.height = h;
        const ctxA = tmpA.getContext('2d')!;
        const ctxB = tmpB.getContext('2d')!;
        ctxA.drawImage(a, 0, 0, w, h);
        ctxB.drawImage(b, 0, 0, w, h);

        const dataA = ctxA.getImageData(0, 0, w, h).data;
        const imgB = ctxB.getImageData(0, 0, w, h);
        const dataB = imgB.data;

        let changed = 0;
        const threshold = 28;

        for (let i = 0; i < dataA.length; i += 4) {
            const dr = Math.abs(dataA[i] - dataB[i]);
            const dg = Math.abs(dataA[i + 1] - dataB[i + 1]);
            const db = Math.abs(dataA[i + 2] - dataB[i + 2]);
            if (dr + dg + db > threshold * 3) {
                dataB[i] = 255;
                dataB[i + 1] = 0;
                dataB[i + 2] = 0;
                changed++;
            }
        }

        ctxB.putImageData(imgB, 0, 0);
        const out = b.getContext('2d')!;
        out.drawImage(tmpB, 0, 0, b.width, b.height);

        return (changed / (w * h)) * 100;
    }
}
