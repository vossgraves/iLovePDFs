import { ToolModal } from './ToolModal';
import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';
import { downloadPdf, outputName } from '../utils/pdf';
import { recordProcessed } from '../utils/stats';
import type { PDFDropdown, PDFRadioGroup } from 'pdf-lib';

/**
 * PDF Forms — renders the document's interactive AcroForm fields as HTML
 * controls and writes the entered values back into the PDF.
 */
export class FormsModal extends ToolModal {
    constructor(modalManager: ModalManager, toastManager: ToastManager) {
        super('forms-modal', modalManager, toastManager);
    }

    show(): void {
        this.renderModal();
        this.modalManager.show(this.modalId);
        this.setupEventListeners();
    }

    private renderModal(): void {
        const container = document.getElementById('modal-container')!;

        const content = `
            <div id="form-upload-area">
                ${this.dropzoneHTML('form-dropzone', 'form-file-input', 'Upload a PDF with a form', 'Interactive fields will appear below for you to fill in')}
            </div>

            <div id="form-options-area" class="hidden mt-2">
                ${this.fileRowHTML('form-file-name', 'form-file-info', 'form-change-btn')}
                <div id="form-fields" class="space-y-4 max-h-[45vh] overflow-y-auto pr-1"></div>
            </div>
        `;

        const footer = `
            <button id="form-process-btn" class="mono-btn px-7 py-2.5 text-sm font-semibold rounded-2xl flex items-center gap-x-2 disabled:opacity-40" disabled>
                <span>Fill form & download</span>
            </button>
        `;

        container.innerHTML = this.createModalHTML('PDF Forms', 'list-check', content, footer);
    }

    protected setupEventListeners(): void {
        this.wireUpload('form-dropzone', 'form-file-input', files => void this.handleFile(files[0]));
        this.wireChangeButton('form-change-btn', 'form-upload-area', 'form-options-area', 'form-process-btn');
        document.getElementById('form-process-btn')!.addEventListener('click', () =>
            this.run('form-process-btn', 'Filling form…', () => this.process()));
    }

    private async handleFile(file: File): Promise<void> {
        if (!(await this.inspect(file))) return;

        const fields = await this.buildFieldControls();

        if (fields === 0) {
            this.showToast('This PDF has no interactive form fields.', false, true);
            return;
        }

        this.showOptions('form-upload-area', 'form-options-area', 'form-process-btn', 'form-file-name', 'form-file-info');
    }

    /** Renders HTML controls for every AcroForm field; returns the field count. */
    private async buildFieldControls(): Promise<number> {
        const { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup } = await import('pdf-lib');
        const doc = await PDFDocument.load(this.pdfBytes!, { ignoreEncryption: true });
        const form = doc.getForm();
        const fields = form.getFields();

        const holder = document.getElementById('form-fields')!;
        holder.innerHTML = '';

        const inputCls = 'border border-[#d1d5db] dark:border-[#404040] px-3 py-2 text-sm w-full rounded-2xl';
        const labelCls = 'text-xs font-semibold px-1 mb-1 block';

        fields.forEach((field, index) => {
            const name = field.getName();
            const wrap = document.createElement('div');

            if (field instanceof PDFTextField) {
                wrap.innerHTML = `
                    <label class="${labelCls}">${name}</label>
                    <input type="text" data-field-index="${index}" class="${inputCls}" value="">
                `;
            } else if (field instanceof PDFCheckBox) {
                wrap.innerHTML = `
                    <label class="flex items-center gap-x-2 text-sm cursor-pointer px-1">
                        <input type="checkbox" data-field-index="${index}" class="accent-black dark:accent-white">
                        <span class="font-medium">${name}</span>
                    </label>
                `;
            } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
                const options = (field as PDFDropdown).getOptions();
                wrap.innerHTML = `
                    <label class="${labelCls}">${name}</label>
                    <select data-field-index="${index}" class="${inputCls}">
                        <option value="">— choose —</option>
                        ${options.map(o => `<option value="${o}">${o}</option>`).join('')}
                    </select>
                `;
            } else if (field instanceof PDFRadioGroup) {
                const options = (field as PDFRadioGroup).getOptions();
                wrap.innerHTML = `
                    <div class="${labelCls}">${name}</div>
                    <div class="flex flex-wrap gap-x-4 gap-y-1 px-1">
                        ${options.map(o => `
                            <label class="flex items-center gap-x-1.5 text-sm cursor-pointer">
                                <input type="radio" name="radio-${index}" value="${o}" data-field-index="${index}" class="accent-black dark:accent-white">
                                <span>${o}</span>
                            </label>
                        `).join('')}
                    </div>
                `;
            } else {
                // Buttons etc. — nothing to fill
                return;
            }

            holder.appendChild(wrap);
        });

        return holder.childElementCount;
    }

    private async process(): Promise<void> {
        const { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup } = await import('pdf-lib');
        const doc = await PDFDocument.load(this.pdfBytes!, { ignoreEncryption: true });
        const form = doc.getForm();
        const fields = form.getFields();
        let filled = 0;

        document.querySelectorAll<HTMLElement>('[data-field-index]').forEach(control => {
            const index = parseInt(control.dataset.fieldIndex!, 10);
            const field = fields[index];
            if (!field) return;

            try {
                if (field instanceof PDFTextField && control instanceof HTMLInputElement) {
                    field.setText(control.value);
                    if (control.value) filled++;
                } else if (field instanceof PDFCheckBox && control instanceof HTMLInputElement) {
                    if (control.checked) { field.check(); filled++; } else field.uncheck();
                } else if ((field instanceof PDFDropdown || field instanceof PDFOptionList) && control instanceof HTMLSelectElement) {
                    if (control.value) {
                        (field as PDFDropdown).select(control.value);
                        filled++;
                    }
                } else if (field instanceof PDFRadioGroup && control instanceof HTMLInputElement) {
                    if (control.checked && control.value) {
                        (field as PDFRadioGroup).select(control.value);
                        filled++;
                    }
                }
            } catch {
                // a single bad value shouldn't abort the whole form
            }
        });

        const bytes = await doc.save();
        downloadPdf(bytes, outputName(this.fileName, '-filled'));
        recordProcessed({ pdfs: 1, pages: this.pageCount });

        this.hide();
        this.showToast(filled > 0 ? `Form filled (${filled} field${filled === 1 ? '' : 's'}) and downloaded!` : 'Form downloaded unchanged.', true);
    }
}
