import { ToolModal } from './ToolModal';
import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';
import { imagesToPdf } from '../utils/images';
import { downloadPdf } from '../utils/pdf';
import { recordProcessed } from '../utils/stats';

interface ImagesToPdfConfig {
    id: string;
    title: string;
    capture: boolean;
}

interface ImageItem {
    id: string;
    file: File;
}

/**
 * Shared implementation for "JPG to PDF" and "Scan to PDF" (camera capture).
 */
export class ImagesToPdfModal extends ToolModal {
    private config: ImagesToPdfConfig;
    private images: ImageItem[] = [];

    constructor(modalManager: ModalManager, toastManager: ToastManager, config: ImagesToPdfConfig) {
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
        const captureAttr = this.config.capture ? 'capture="environment"' : '';
        const sub = this.config.capture
            ? 'On mobile, your camera opens directly. Multiple photos allowed.'
            : 'JPG, PNG, WebP… — multiple images allowed.';

        const content = `
            <div id="img-upload-area">
                <div id="img-dropzone" class="border border-dashed border-[#d1d5db] dark:border-[#404040] hover:border-[#888] transition-colors px-6 py-9 rounded-3xl flex flex-col items-center justify-center cursor-pointer">
                    <i class="fa-solid ${this.config.capture ? 'fa-camera' : 'fa-images'} text-4xl mb-3 text-[#777]"></i>
                    <div class="font-semibold text-center">${this.config.capture ? 'Capture or choose photos' : 'Choose images'}</div>
                    <div class="text-xs text-[#666] dark:text-[#a1a1aa] mt-1 text-center">${sub}</div>
                    <input type="file" id="img-file-input" accept="image/*" multiple ${captureAttr} class="hidden">
                </div>
            </div>

            <div id="img-options-area" class="hidden mt-2">
                <div class="text-xs font-semibold text-[#555] dark:text-[#a1a1aa] mb-2 px-1">IMAGES (<span id="img-count">0</span>)</div>
                <div id="img-items" class="max-h-[180px] overflow-auto space-y-2 mb-4"></div>

                <div class="grid grid-cols-2 gap-3 px-1">
                    <div>
                        <div class="font-semibold text-sm mb-1.5">Page size</div>
                        <select id="img-page-size" class="w-full border border-[#d1d5db] dark:border-[#404040] px-3 py-2 text-sm font-medium rounded-2xl">
                            <option value="a4">A4 (fit image)</option>
                            <option value="original">Original image size</option>
                        </select>
                    </div>
                    <div>
                        <div class="font-semibold text-sm mb-1.5">Margin (mm)</div>
                        <input type="number" id="img-margin" min="0" max="40" step="1" value="10" class="border border-[#d1d5db] dark:border-[#404040] px-3 py-2 text-sm font-medium rounded-2xl w-full">
                    </div>
                </div>
            </div>
        `;

        const footer = `
            <button id="img-process-btn" class="mono-btn px-7 py-2.5 text-sm font-semibold rounded-2xl flex items-center gap-x-2 disabled:opacity-40" disabled>
                <span>Create PDF</span>
            </button>
        `;

        container.innerHTML = this.createModalHTML(this.config.title, this.config.capture ? 'camera' : 'images', content, footer);
    }

    protected setupEventListeners(): void {
        this.wireUpload('img-dropzone', 'img-file-input', files => this.addImages(files));
        document.getElementById('img-process-btn')!.addEventListener('click', () =>
            this.run('img-process-btn', 'Creating PDF…', () => this.process()));
    }

    private addImages(files: File[]): void {
        const valid = files.filter(f => (f.type || '').startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name));
        if (valid.length === 0) {
            this.showToast('Please choose image files.', false, true);
            return;
        }

        valid.forEach(file => {
            this.images.push({ id: Date.now().toString(36) + Math.random().toString(36), file });
        });

        this.renderList();
        document.getElementById('img-options-area')!.classList.remove('hidden');
        (document.getElementById('img-process-btn') as HTMLButtonElement).disabled = this.images.length === 0;
    }

    private renderList(): void {
        const items = document.getElementById('img-items')!;
        items.innerHTML = '';
        document.getElementById('img-count')!.textContent = String(this.images.length);

        this.images.forEach(img => {
            const div = document.createElement('div');
            div.className = 'flex items-center justify-between bg-[#f8f8f8] dark:bg-[#1f1f1f] px-4 py-2.5 rounded-2xl text-sm';
            div.innerHTML = `
                <div class="flex items-center gap-x-3 min-w-0">
                    <i class="fa-solid fa-image text-[#777]"></i>
                    <div class="min-w-0">
                        <div class="font-medium truncate">${img.file.name}</div>
                        <div class="text-xs text-[#666] dark:text-[#a1a1aa]">${(img.file.size / 1024).toFixed(0)} KB</div>
                    </div>
                </div>
                <button class="px-2 text-xs text-red-500 hover:text-red-700"><i class="fa-solid fa-times"></i></button>
            `;
            div.querySelector('button')!.addEventListener('click', () => {
                this.images = this.images.filter(i => i.id !== img.id);
                this.renderList();
                (document.getElementById('img-process-btn') as HTMLButtonElement).disabled = this.images.length === 0;
            });
            items.appendChild(div);
        });
    }

    private async process(): Promise<void> {
        const pageSize = (document.getElementById('img-page-size') as HTMLSelectElement).value as 'a4' | 'original';
        const marginMm = parseInt((document.getElementById('img-margin') as HTMLInputElement).value, 10) || 0;

        const bytes = await imagesToPdf(this.images.map(i => i.file), { pageSize, marginMm });
        downloadPdf(bytes, this.config.capture ? 'scan.pdf' : 'images.pdf');
        recordProcessed({ pdfs: 1, pages: this.images.length });

        this.hide();
        this.showToast(`PDF created from ${this.images.length} image${this.images.length === 1 ? '' : 's'}!`, true);
        this.images = [];
    }
}
