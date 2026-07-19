import { ToolModal } from './ToolModal';
import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';
import { downloadPdf, outputName } from '../utils/pdf';
import { recordProcessed } from '../utils/stats';
import { mmToPt } from '../utils/nupEngine';

/**
 * Sign PDF — draw a signature on a pad and stamp it onto the document.
 */
export class SignModal extends ToolModal {
    private hasSignature = false;

    constructor(modalManager: ModalManager, toastManager: ToastManager) {
        super('sign-modal', modalManager, toastManager);
    }

    show(): void {
        this.renderModal();
        this.modalManager.show(this.modalId);
        this.setupEventListeners();
    }

    private renderModal(): void {
        const container = document.getElementById('modal-container')!;

        const content = `
            <div id="sign-upload-area">
                ${this.dropzoneHTML('sign-dropzone', 'sign-file-input', 'Upload your PDF', 'Then draw your signature below')}
            </div>

            <div id="sign-options-area" class="hidden mt-2">
                ${this.fileRowHTML('sign-file-name', 'sign-file-info', 'sign-change-btn')}

                <div class="font-semibold text-sm mb-2 px-1">Draw your signature</div>
                <div class="border border-[#d1d5db] dark:border-[#404040] rounded-2xl overflow-hidden bg-white">
                    <canvas id="sign-pad" class="w-full touch-none" height="150"></canvas>
                </div>
                <div class="flex justify-end mt-1.5">
                    <button id="sign-clear-btn" class="text-xs text-[#666] dark:text-[#a1a1aa] hover:text-black dark:hover:text-white font-medium px-2 py-1">
                        <i class="fa-solid fa-eraser mr-1"></i> Clear
                    </button>
                </div>

                <div class="grid grid-cols-2 gap-3 mt-3 px-1">
                    <div>
                        <div class="font-semibold text-sm mb-1.5">Position</div>
                        <select id="sign-position" class="w-full border border-[#d1d5db] dark:border-[#404040] px-3 py-2 text-sm font-medium rounded-2xl">
                            <option value="bottom-right" selected>Bottom right</option>
                            <option value="bottom-left">Bottom left</option>
                            <option value="bottom-center">Bottom center</option>
                            <option value="top-right">Top right</option>
                            <option value="top-left">Top left</option>
                        </select>
                    </div>
                    <div>
                        <div class="font-semibold text-sm mb-1.5">Width (mm)</div>
                        <input type="number" id="sign-width" min="15" max="120" step="5" value="45" class="border border-[#d1d5db] dark:border-[#404040] px-3 py-2 text-sm font-medium rounded-2xl w-full">
                    </div>
                </div>

                <div class="mt-3 px-1 flex items-center gap-x-2">
                    <input type="checkbox" id="sign-all" class="accent-black dark:accent-white">
                    <label for="sign-all" class="text-sm">Sign every page <span class="text-xs text-[#666] dark:text-[#a1a1aa]">(unchecked = last page only)</span></label>
                </div>
            </div>
        `;

        const footer = `
            <button id="sign-process-btn" class="mono-btn px-7 py-2.5 text-sm font-semibold rounded-2xl flex items-center gap-x-2 disabled:opacity-40" disabled>
                <span>Sign PDF</span>
            </button>
        `;

        container.innerHTML = this.createModalHTML('Sign PDF', 'signature', content, footer);
    }

    protected setupEventListeners(): void {
        this.wireUpload('sign-dropzone', 'sign-file-input', files => void this.handleFile(files[0]));
        this.wireChangeButton('sign-change-btn', 'sign-upload-area', 'sign-options-area', 'sign-process-btn');
        this.setupPad();

        document.getElementById('sign-clear-btn')!.addEventListener('click', () => {
            const pad = document.getElementById('sign-pad') as HTMLCanvasElement;
            pad.getContext('2d')!.clearRect(0, 0, pad.width, pad.height);
            this.hasSignature = false;
        });

        document.getElementById('sign-process-btn')!.addEventListener('click', () =>
            this.run('sign-process-btn', 'Signing…', () => this.process()));
    }

    private setupPad(): void {
        const pad = document.getElementById('sign-pad') as HTMLCanvasElement;
        pad.width = pad.offsetWidth || 600;
        const ctx = pad.getContext('2d')!;
        ctx.strokeStyle = '#111111';
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        let drawing = false;

        const pos = (e: PointerEvent) => {
            const rect = pad.getBoundingClientRect();
            return {
                x: (e.clientX - rect.left) * (pad.width / rect.width),
                y: (e.clientY - rect.top) * (pad.height / rect.height)
            };
        };

        pad.addEventListener('pointerdown', (e) => {
            drawing = true;
            pad.setPointerCapture(e.pointerId);
            const p = pos(e);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
        });
        pad.addEventListener('pointermove', (e) => {
            if (!drawing) return;
            const p = pos(e);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            this.hasSignature = true;
        });
        pad.addEventListener('pointerup', () => { drawing = false; });
    }

    private async handleFile(file: File): Promise<void> {
        if (!(await this.inspect(file))) return;
        this.showOptions('sign-upload-area', 'sign-options-area', 'sign-process-btn', 'sign-file-name', 'sign-file-info');
    }

    private async process(): Promise<void> {
        if (!this.hasSignature) {
            this.showToast('Draw your signature first.', false, true);
            return;
        }

        const pad = document.getElementById('sign-pad') as HTMLCanvasElement;
        const pngBlob = await new Promise<Blob | null>(resolve => pad.toBlob(resolve, 'image/png'));
        if (!pngBlob) throw new Error('Could not read the signature.');

        const position = (document.getElementById('sign-position') as HTMLSelectElement).value;
        const widthMm = Math.min(120, Math.max(15, parseInt((document.getElementById('sign-width') as HTMLInputElement).value, 10) || 45));
        const signAll = (document.getElementById('sign-all') as HTMLInputElement).checked;

        const { PDFDocument } = await import('pdf-lib');
        const doc = await PDFDocument.load(this.pdfBytes!, { ignoreEncryption: true });
        const signature = await doc.embedPng(new Uint8Array(await pngBlob.arrayBuffer()));

        const sigW = mmToPt(widthMm);
        const sigH = sigW * (signature.height / signature.width);
        const margin = mmToPt(12);

        const pages = doc.getPages();
        const targets = signAll ? pages : [pages[pages.length - 1]];

        targets.forEach(page => {
            const { width, height } = page.getSize();
            let x = margin;
            if (position.endsWith('right')) x = width - margin - sigW;
            else if (position.endsWith('center')) x = (width - sigW) / 2;
            const y = position.startsWith('top') ? height - margin - sigH : margin;

            page.drawImage(signature, { x, y, width: sigW, height: sigH });
        });

        const bytes = await doc.save();
        downloadPdf(bytes, outputName(this.fileName, '-signed'));
        recordProcessed({ pdfs: 1, pages: targets.length });

        this.hide();
        this.showToast('PDF signed successfully!', true);
    }
}
