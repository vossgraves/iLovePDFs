import { BaseModal } from './BaseModal';
import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';

export class ConvertModal extends BaseModal {
    private selectedFormat = 'word';

    constructor(modalManager: ModalManager, toastManager: ToastManager) {
        super('convert-modal', modalManager, toastManager);
    }

    show(): void {
        this.renderModal();
        this.modalManager.show(this.modalId);
        this.setupEventListeners();
    }

    private renderModal(): void {
        const container = document.getElementById('modal-container')!;
        
        const content = `
            <div id="convert-dropzone" class="border border-dashed border-[#d1d5db] dark:border-[#404040] px-6 py-9 rounded-3xl flex flex-col items-center justify-center cursor-pointer">
                <i class="fa-solid fa-file-pdf text-4xl mb-3 text-[#777]"></i>
                <div class="font-semibold">Upload PDF to convert</div>
                <input type="file" id="convert-file-input" accept=".pdf" class="hidden">
            </div>

            <div id="convert-options" class="hidden mt-4">
                <div class="px-1">
                    <div class="font-semibold text-sm mb-2">Convert to</div>

                    <div class="grid grid-cols-3 gap-2" id="convert-formats">
                        <div class="convert-option px-4 py-3 cursor-pointer border border-[#d1d5db] dark:border-[#404040] flex flex-col items-center justify-center rounded-2xl text-center active-option" data-format="word">
                            <i class="fa-solid fa-file-word text-2xl mb-1"></i>
                            <span class="font-semibold text-xs">Word</span>
                        </div>
                        <div class="convert-option px-4 py-3 cursor-pointer border border-[#d1d5db] dark:border-[#404040] flex flex-col items-center justify-center rounded-2xl text-center" data-format="jpg">
                            <i class="fa-solid fa-image text-2xl mb-1"></i>
                            <span class="font-semibold text-xs">JPG</span>
                        </div>
                        <div class="convert-option px-4 py-3 cursor-pointer border border-[#d1d5db] dark:border-[#404040] flex flex-col items-center justify-center rounded-2xl text-center" data-format="pptx">
                            <i class="fa-solid fa-file-powerpoint text-2xl mb-1"></i>
                            <span class="font-semibold text-xs">PowerPoint</span>
                        </div>
                    </div>

                    <div class="px-1 mt-5">
                        <div class="font-semibold text-sm mb-1">Quality</div>
                        <select id="convert-quality" class="border border-[#d1d5db] dark:border-[#404040] text-sm px-3 py-2 w-full rounded-2xl">
                            <option>High (recommended)</option>
                            <option>Medium</option>
                            <option>Low (smaller file)</option>
                        </select>
                    </div>
                </div>
            </div>
        `;

        const footer = `
            <button id="convert-btn" class="mono-btn px-7 py-2.5 text-sm font-semibold rounded-2xl flex items-center gap-x-2 disabled:opacity-50" disabled>
                <span>Convert</span>
            </button>
        `;

        container.innerHTML = this.createModalHTML('Convert PDF', 'exchange-alt', content, footer);
    }

    protected setupEventListeners(): void {
        const dropzone = document.getElementById('convert-dropzone')!;
        const fileInput = document.getElementById('convert-file-input') as HTMLInputElement;
        const convertBtn = document.getElementById('convert-btn')!;

        dropzone.addEventListener('click', () => fileInput.click());
        
        fileInput.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            if (target.files?.[0]) this.handleFile(target.files[0]);
        });

        // Format selection
        document.querySelectorAll('#convert-formats .convert-option').forEach(el => {
            el.addEventListener('click', () => {
                document.querySelectorAll('#convert-formats .convert-option').forEach(e => e.classList.remove('active-option'));
                el.classList.add('active-option');
                this.selectedFormat = (el as HTMLElement).dataset.format!;
            });
        });

        convertBtn.addEventListener('click', () => this.processConvert());
    }

    private handleFile(_file: File): void {
        const dropzone = document.getElementById('convert-dropzone')!;
        const options = document.getElementById('convert-options')!;
        const btn = document.getElementById('convert-btn')!;

        dropzone.style.display = 'none';
        options.classList.remove('hidden');
        (btn as HTMLButtonElement).disabled = false;
    }

    private processConvert(): void {
        const btn = document.getElementById('convert-btn')!;
        btn.innerHTML = `<span class="flex items-center gap-x-2"><i class="fa-solid fa-spinner fa-spin"></i> Converting...</span>`;
        (btn as HTMLButtonElement).disabled = true;

        setTimeout(() => {
            this.hide();
            
            let ext = '.docx';
            if (this.selectedFormat === 'jpg') ext = '.jpg';
            else if (this.selectedFormat === 'pptx') ext = '.pptx';
            
            this.showToast(`Converted to ${this.selectedFormat.toUpperCase()} successfully!`, true);
            this.createMockDownload(`document${ext}`, `Converted PDF to ${this.selectedFormat}`);
        }, 1700);
    }
}