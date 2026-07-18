import { BaseModal } from './BaseModal';
import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';

export class ProtectModal extends BaseModal {
    constructor(modalManager: ModalManager, toastManager: ToastManager) {
        super('protect-modal', modalManager, toastManager);
    }

    show(): void {
        this.renderModal();
        this.modalManager.show(this.modalId);
        this.setupEventListeners();
    }

    private renderModal(): void {
        const container = document.getElementById('modal-container')!;
        
        const content = `
            <div id="protect-dropzone" class="border border-dashed border-[#d1d5db] dark:border-[#404040] px-6 py-9 rounded-3xl flex flex-col items-center justify-center cursor-pointer">
                <i class="fa-solid fa-file-pdf text-4xl mb-3 text-[#777]"></i>
                <div class="font-semibold">Upload PDF</div>
                <input type="file" id="protect-file-input" accept=".pdf" class="hidden">
            </div>

            <div id="protect-options" class="hidden mt-5">
                <div class="px-1">
                    <div class="font-semibold text-sm mb-3">Set password</div>

                    <div>
                        <input type="password" id="protect-password" placeholder="Enter password" value="ilovepdf2026" class="border px-4 py-2.5 text-sm border-[#d1d5db] dark:border-[#404040] w-full rounded-2xl">
                    </div>

                    <div class="mt-4">
                        <div class="font-semibold text-sm mb-1">Permissions</div>
                        <div class="flex flex-col gap-y-[1px]">
                            <div class="flex items-center px-3 py-[5px]">
                                <input type="checkbox" checked id="perm-print" class="accent-black dark:accent-white">
                                <label for="perm-print" class="ml-2 text-sm">Allow printing</label>
                            </div>
                            <div class="flex items-center px-3 py-[5px]">
                                <input type="checkbox" checked id="perm-edit" class="accent-black dark:accent-white">
                                <label for="perm-edit" class="ml-2 text-sm">Allow editing</label>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const footer = `
            <button id="protect-btn" class="mono-btn px-7 py-2.5 text-sm font-semibold rounded-2xl flex items-center gap-x-2 disabled:opacity-50" disabled>
                <span>Protect PDF</span>
            </button>
        `;

        container.innerHTML = this.createModalHTML('Protect PDF', 'lock', content, footer);
    }

    protected setupEventListeners(): void {
        const dropzone = document.getElementById('protect-dropzone')!;
        const fileInput = document.getElementById('protect-file-input') as HTMLInputElement;
        const protectBtn = document.getElementById('protect-btn')!;

        dropzone.addEventListener('click', () => fileInput.click());
        
        fileInput.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            if (target.files?.[0]) this.handleFile(target.files[0]);
        });

        protectBtn.addEventListener('click', () => this.processProtect());
    }

    private handleFile(_file: File): void {
        const dropzone = document.getElementById('protect-dropzone')!;
        const options = document.getElementById('protect-options')!;
        const btn = document.getElementById('protect-btn')!;

        dropzone.style.display = 'none';
        options.classList.remove('hidden');
        (btn as HTMLButtonElement).disabled = false;
    }

    private processProtect(): void {
        const btn = document.getElementById('protect-btn')!;
        const passwordInput = document.getElementById('protect-password') as HTMLInputElement;
        const password = passwordInput.value || 'protected';

        btn.innerHTML = `<span class="flex items-center gap-x-2"><i class="fa-solid fa-spinner fa-spin"></i> Protecting...</span>`;
        (btn as HTMLButtonElement).disabled = true;

        setTimeout(() => {
            this.hide();
            this.showToast(`PDF protected successfully with password!`, true);
            this.createMockDownload('protected-document.pdf', `Protected PDF (Password: ${password})`);
        }, 1800);
    }
}