import { BaseModal } from './BaseModal';
import { inspectPdf } from '../utils/pdf';

/**
 * Shared skeleton for single-PDF tool modals: dropzone markup, upload
 * wiring, file inspection, and busy-button handling.
 */
export abstract class ToolModal extends BaseModal {
    protected pdfBytes: ArrayBuffer | null = null;
    protected fileName = '';
    protected pageCount = 0;

    protected dropzoneHTML(
        zoneId: string,
        inputId: string,
        title: string,
        sub: string,
        accept = '.pdf',
        multiple = false,
        icon = 'fa-file-pdf'
    ): string {
        return `
            <div id="${zoneId}" class="border border-dashed border-[#d1d5db] dark:border-[#404040] hover:border-[#888] transition-colors px-6 py-9 rounded-3xl flex flex-col items-center justify-center cursor-pointer">
                <i class="fa-solid ${icon} text-4xl mb-3 text-[#777]"></i>
                <div class="font-semibold text-center">${title}</div>
                <div class="text-xs text-[#666] dark:text-[#a1a1aa] mt-1 text-center">${sub}</div>
                <input type="file" id="${inputId}" accept="${accept}" ${multiple ? 'multiple' : ''} class="hidden">
            </div>
        `;
    }

    protected fileRowHTML(nameId: string, infoId: string, changeId: string): string {
        return `
            <div class="flex items-center justify-between mb-4">
                <div class="min-w-0">
                    <div id="${nameId}" class="font-semibold truncate"></div>
                    <div id="${infoId}" class="text-xs text-[#666] dark:text-[#a1a1aa]"></div>
                </div>
                <button id="${changeId}" class="px-3 py-1 text-xs text-[#666] dark:text-[#a1a1aa] flex items-center gap-x-1 hover:text-black dark:hover:text-white shrink-0">
                    <i class="fa-solid fa-times"></i> <span class="font-medium">Change</span>
                </button>
            </div>
        `;
    }

    protected wireUpload(zoneId: string, inputId: string, onFiles: (files: File[]) => void): void {
        const zone = document.getElementById(zoneId)!;
        const input = document.getElementById(inputId) as HTMLInputElement;

        zone.addEventListener('click', () => input.click());
        input.addEventListener('change', () => {
            if (input.files?.length) onFiles(Array.from(input.files));
            input.value = '';
        });
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            const files = Array.from(e.dataTransfer?.files ?? []);
            if (files.length) onFiles(files);
        });
        zone.addEventListener('dragover', (e) => e.preventDefault());
    }

    protected wireChangeButton(changeId: string, uploadAreaId: string, optionsAreaId: string, processBtnId: string): void {
        document.getElementById(changeId)?.addEventListener('click', () => {
            this.pdfBytes = null;
            this.fileName = '';
            this.pageCount = 0;
            document.getElementById(uploadAreaId)!.style.display = 'block';
            document.getElementById(optionsAreaId)!.classList.add('hidden');
            (document.getElementById(processBtnId) as HTMLButtonElement).disabled = true;
        });
    }

    /** Validates + inspects a PDF, storing bytes/name/pageCount. Toasts and returns false on failure. */
    protected async inspect(file: File): Promise<boolean> {
        if (!this.isPdf(file)) {
            this.showToast('Please upload a PDF file.', false, true);
            return false;
        }

        try {
            const info = await inspectPdf(file);
            this.pdfBytes = info.bytes;
            this.fileName = info.name;
            this.pageCount = info.pageCount;
            return true;
        } catch (err) {
            this.showToast(err instanceof Error ? err.message : 'Could not read this PDF.', false, true);
            return false;
        }
    }

    protected isPdf(file: File): boolean {
        return file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    }

    protected showOptions(uploadAreaId: string, optionsAreaId: string, processBtnId: string, nameId?: string, infoId?: string): void {
        document.getElementById(uploadAreaId)!.style.display = 'none';
        document.getElementById(optionsAreaId)!.classList.remove('hidden');
        (document.getElementById(processBtnId) as HTMLButtonElement).disabled = false;

        if (nameId) {
            document.getElementById(nameId)!.innerHTML =
                `<i class="fa-solid fa-file-pdf mr-1.5 text-[#777]"></i> ${this.fileName}`;
        }
        if (infoId) {
            const mb = (this.pdfBytes!.byteLength / 1024 / 1024).toFixed(1);
            document.getElementById(infoId)!.textContent =
                `${mb} MB · ${this.pageCount} page${this.pageCount === 1 ? '' : 's'}`;
        }
    }

    protected setBusy(btnId: string, busy: boolean, busyLabel = 'Processing...'): void {
        const btn = document.getElementById(btnId) as HTMLButtonElement | null;
        if (!btn) return;

        if (busy) {
            btn.dataset.originalHtml = btn.innerHTML;
            btn.innerHTML = `<span class="flex items-center justify-center gap-x-2"><i class="fa-solid fa-spinner fa-spin"></i> ${busyLabel}</span>`;
            btn.disabled = true;
        } else {
            if (btn.dataset.originalHtml) btn.innerHTML = btn.dataset.originalHtml;
            btn.disabled = false;
        }
    }

    /** Runs an async action with a busy button + error toast. */
    protected async run(btnId: string, busyLabel: string, fn: () => Promise<void>): Promise<void> {
        this.setBusy(btnId, true, busyLabel);
        try {
            await fn();
        } catch (err) {
            this.showToast(err instanceof Error ? err.message : 'Something went wrong.', false, true);
        } finally {
            this.setBusy(btnId, false);
        }
    }

    protected setStatus(id: string, message: string): void {
        const el = document.getElementById(id);
        if (el) el.textContent = message;
    }
}
