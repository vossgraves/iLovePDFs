import { BaseModal } from './BaseModal';
import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';

export class WatermarkModal extends BaseModal {
    constructor(modalManager: ModalManager, toastManager: ToastManager) {
        super('watermark-modal', modalManager, toastManager);
    }

    show(): void {
        this.renderModal();
        this.modalManager.show(this.modalId);
        this.setupEventListeners();
    }

    private renderModal(): void {
        const container = document.getElementById('modal-container')!;
        
        const content = `
            <div id="watermark-dropzone" class="border border-dashed border-[#d1d5db] dark:border-[#404040] px-6 py-9 rounded-3xl flex flex-col items-center justify-center cursor-pointer">
                <i class="fa-solid fa-file-pdf text-4xl mb-3 text-[#777]"></i>
                <div class="font-semibold">Upload PDF</div>
                <input type="file" id="watermark-file-input" accept=".pdf" class="hidden">
            </div>

            <div id="watermark-options" class="hidden mt-5">
                <div class="px-1">
                    <div class="font-semibold text-sm mb-2">Watermark text</div>
                    <input type="text" id="watermark-text" value="CONFIDENTIAL" class="border border-[#d1d5db] dark:border-[#404040] px-4 py-2.5 w-full rounded-2xl text-sm">

                    <div class="mt-4 grid grid-cols-2 gap-4">
                        <div>
                            <div class="font-semibold text-sm mb-1">Opacity</div>
                            <input type="range" id="watermark-opacity" min="10" max="100" value="35" class="w-full accent-black dark:accent-white">
                        </div>
                        <div>
                            <div class="font-semibold text-sm mb-1">Rotation</div>
                            <select id="watermark-rotation" class="border border-[#d1d5db] dark:border-[#404040] px-3 py-2 text-sm w-full rounded-2xl">
                                <option value="0">Horizontal</option>
                                <option value="45">Diagonal</option>
                                <option value="-45">Diagonal (reverse)</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const footer = `
            <button id="watermark-btn" class="mono-btn px-7 py-2.5 text-sm font-semibold rounded-2xl flex items-center gap-x-2 disabled:opacity-50" disabled>
                <span>Add Watermark</span>
            </button>
        `;

        container.innerHTML = this.createModalHTML('Add Watermark', 'stamp', content, footer);
    }

    protected setupEventListeners(): void {
        const dropzone = document.getElementById('watermark-dropzone')!;
        const fileInput = document.getElementById('watermark-file-input') as HTMLInputElement;
        const watermarkBtn = document.getElementById('watermark-btn')!;

        dropzone.addEventListener('click', () => fileInput.click());
        
        fileInput.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            if (target.files?.[0]) this.handleFile(target.files[0]);
        });

        watermarkBtn.addEventListener('click', () => this.processWatermark());
    }

    private handleFile(_file: File): void {
        const dropzone = document.getElementById('watermark-dropzone')!;
        const options = document.getElementById('watermark-options')!;
        const btn = document.getElementById('watermark-btn')!;

        dropzone.style.display = 'none';
        options.classList.remove('hidden');
        (btn as HTMLButtonElement).disabled = false;
    }

    private processWatermark(): void {
        const btn = document.getElementById('watermark-btn')!;
        const textInput = document.getElementById('watermark-text') as HTMLInputElement;
        const text = textInput.value || 'CONFIDENTIAL';

        btn.innerHTML = `<span class="flex items-center gap-x-2"><i class="fa-solid fa-spinner fa-spin"></i> Adding watermark...</span>`;
        (btn as HTMLButtonElement).disabled = true;

        setTimeout(() => {
            this.hide();
            this.showToast(`Watermark "${text}" added successfully!`, true);
            this.createMockDownload('watermarked-document.pdf', `Watermarked PDF with text: ${text}`);
        }, 1800);
    }
}