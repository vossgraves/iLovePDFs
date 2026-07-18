import { BaseModal } from './BaseModal';
import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';

export class CompressModal extends BaseModal {
    constructor(modalManager: ModalManager, toastManager: ToastManager) {
        super('compress-modal', modalManager, toastManager);
    }

    show(): void {
        this.renderModal();
        this.modalManager.show(this.modalId);
        this.setupEventListeners();
    }

    private renderModal(): void {
        const container = document.getElementById('modal-container')!;
        
        const content = `
            <div id="compress-dropzone" class="border border-dashed border-[#d1d5db] dark:border-[#404040] px-6 py-9 rounded-3xl flex flex-col items-center justify-center cursor-pointer">
                <i class="fa-solid fa-file-pdf text-4xl mb-3 text-[#777]"></i>
                <div class="font-semibold">Upload PDF</div>
                <input type="file" id="compress-file-input" accept=".pdf" class="hidden">
            </div>
            
            <div id="compress-options" class="hidden mt-5">
                <div class="px-1">
                    <div class="flex justify-between items-baseline mb-1">
                        <div class="font-semibold text-sm">Compression level</div>
                        <div id="compress-value" class="font-black text-xl">80%</div>
                    </div>
                    
                    <input type="range" id="compress-slider" min="30" max="95" step="5" value="80" class="w-full accent-black dark:accent-white">

                    <div class="flex justify-between text-xs px-1 mt-1 text-[#666] dark:text-[#a1a1aa]">
                        <div>High quality</div>
                        <div>Max compression</div>
                    </div>
                    
                    <div id="compress-file-info" class="mt-4 text-xs flex justify-between px-1"></div>
                </div>
            </div>
        `;

        const footer = `
            <button id="compress-btn" class="mono-btn px-7 py-2.5 text-sm font-semibold rounded-2xl flex items-center gap-x-2 disabled:opacity-50" disabled>
                <span>Compress</span>
            </button>
        `;

        container.innerHTML = this.createModalHTML('Compress PDF', 'compress-arrows-alt', content, footer);
    }

    protected setupEventListeners(): void {
        const dropzone = document.getElementById('compress-dropzone')!;
        const fileInput = document.getElementById('compress-file-input') as HTMLInputElement;
        const compressBtn = document.getElementById('compress-btn')!;
        const slider = document.getElementById('compress-slider') as HTMLInputElement;

        dropzone.addEventListener('click', () => fileInput.click());
        
        fileInput.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            if (target.files?.[0]) this.handleFile(target.files[0]);
        });

        if (slider) {
            slider.oninput = () => this.updateValue();
        }

        compressBtn.addEventListener('click', () => this.processCompress());
    }

    private handleFile(file: File): void {
        const dropzone = document.getElementById('compress-dropzone')!;
        const options = document.getElementById('compress-options')!;
        const btn = document.getElementById('compress-btn')!;

        dropzone.style.display = 'none';
        options.classList.remove('hidden');
        (btn as HTMLButtonElement).disabled = false;

        document.getElementById('compress-file-info')!.innerHTML = `
            <div class="flex justify-between items-center text-xs">
                <div>${file.name}</div>
                <div class="font-semibold">${(file.size / 1024 / 1024).toFixed(1)} MB</div>
            </div>
        `;

        this.updateValue();
    }

    private updateValue(): void {
        const slider = document.getElementById('compress-slider') as HTMLInputElement;
        const valueEl = document.getElementById('compress-value')!;
        if (slider && valueEl) {
            valueEl.innerHTML = slider.value + '%';
        }
    }

    private processCompress(): void {
        const btn = document.getElementById('compress-btn')!;
        const slider = document.getElementById('compress-slider') as HTMLInputElement;
        const level = slider.value;

        btn.innerHTML = `<span class="flex items-center gap-x-2"><i class="fa-solid fa-spinner fa-spin"></i> Compressing...</span>`;
        (btn as HTMLButtonElement).disabled = true;

        setTimeout(() => {
            this.hide();
            this.showToast(`PDF compressed by ${level}%!`, true);
            this.createMockDownload('compressed-document.pdf', `Compressed PDF (${level}% smaller)`);
        }, 1900);
    }
}