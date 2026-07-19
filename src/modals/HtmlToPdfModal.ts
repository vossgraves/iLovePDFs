import { ToolModal } from './ToolModal';
import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';
import { downloadPdf, canvasToBytes } from '../utils/pdf';
import { recordProcessed } from '../utils/stats';

/**
 * HTML to PDF — renders HTML markup in a hidden sandboxed div and
 * slices the rasterised result into A4 pages.
 */
export class HtmlToPdfModal extends ToolModal {
    constructor(modalManager: ModalManager, toastManager: ToastManager) {
        super('html-to-pdf-modal', modalManager, toastManager);
    }

    show(): void {
        this.renderModal();
        this.modalManager.show(this.modalId);
        this.setupEventListeners();
    }

    private renderModal(): void {
        const container = document.getElementById('modal-container')!;

        const content = `
            <div class="px-1">
                <div class="flex items-center justify-between mb-2">
                    <div class="font-semibold text-sm">HTML source</div>
                    <button id="h2p-file-btn" class="text-xs text-[#666] dark:text-[#a1a1aa] hover:text-black dark:hover:text-white font-medium px-2 py-1">
                        <i class="fa-solid fa-upload mr-1"></i> or upload .html
                    </button>
                    <input type="file" id="h2p-file-input" accept=".html,.htm" class="hidden">
                </div>
                <textarea id="h2p-source" rows="9" spellcheck="false"
                    class="w-full border border-[#d1d5db] dark:border-[#404040] rounded-2xl px-4 py-3 text-xs font-mono"
                    placeholder="<h1>Hello</h1>\n<p>Paste your HTML here…</p>"></textarea>

                <div class="grid grid-cols-2 gap-3 mt-3">
                    <div>
                        <div class="font-semibold text-sm mb-1.5">Page width style</div>
                        <select id="h2p-width" class="w-full border border-[#d1d5db] dark:border-[#404040] px-3 py-2 text-sm font-medium rounded-2xl">
                            <option value="794" selected>Document (A4 width)</option>
                            <option value="1024">Wide (1024px)</option>
                        </select>
                    </div>
                    <div>
                        <div class="font-semibold text-sm mb-1.5">Background</div>
                        <select id="h2p-bg" class="w-full border border-[#d1d5db] dark:border-[#404040] px-3 py-2 text-sm font-medium rounded-2xl">
                            <option value="#ffffff" selected>White</option>
                            <option value="transparent">Transparent</option>
                        </select>
                    </div>
                </div>

                <div class="text-xs text-[#666] dark:text-[#a1a1aa] mt-3">
                    <i class="fa-solid fa-circle-info mr-1"></i>
                    Rendered locally — scripts and external resources are not executed or fetched.
                </div>
            </div>
        `;

        const footer = `
            <button id="h2p-process-btn" class="mono-btn px-7 py-2.5 text-sm font-semibold rounded-2xl flex items-center gap-x-2">
                <span>Convert to PDF</span>
            </button>
        `;

        container.innerHTML = this.createModalHTML('HTML to PDF', 'code', content, footer);
    }

    protected setupEventListeners(): void {
        document.getElementById('h2p-file-btn')!.addEventListener('click', () =>
            (document.getElementById('h2p-file-input') as HTMLInputElement).click());

        (document.getElementById('h2p-file-input') as HTMLInputElement).addEventListener('change', async (e) => {
            const input = e.target as HTMLInputElement;
            const file = input.files?.[0];
            if (file) {
                (document.getElementById('h2p-source') as HTMLTextAreaElement).value = await file.text();
            }
            input.value = '';
        });

        document.getElementById('h2p-process-btn')!.addEventListener('click', () =>
            this.run('h2p-process-btn', 'Rendering…', () => this.process()));
    }

    private async process(): Promise<void> {
        const html = (document.getElementById('h2p-source') as HTMLTextAreaElement).value.trim();
        if (!html) {
            this.showToast('Paste some HTML first.', false, true);
            return;
        }

        const width = parseInt((document.getElementById('h2p-width') as HTMLSelectElement).value, 10);
        const bg = (document.getElementById('h2p-bg') as HTMLSelectElement).value;

        // sandboxed off-screen render target
        const host = document.createElement('div');
        host.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;background:${bg};padding:32px;font-family:Inter,Arial,sans-serif;color:#111;`;
        host.innerHTML = html;
        document.body.appendChild(host);

        try {
            const { default: html2canvas } = await import('html2canvas');
            const canvas = await html2canvas(host, {
                scale: 2,
                backgroundColor: bg === 'transparent' ? null : bg,
                logging: false,
                useCORS: false
            });

            const { PDFDocument } = await import('pdf-lib');
            const pdf = await PDFDocument.create();

            // A4 at 96dpi-equivalent: page height proportional to render width
            const pageHeightPx = Math.floor((canvas.width / 8.27) * 11.69);

            for (let y = 0; y < canvas.height; y += pageHeightPx) {
                const sliceHeight = Math.min(pageHeightPx, canvas.height - y);
                const slice = document.createElement('canvas');
                slice.width = canvas.width;
                slice.height = sliceHeight;
                const ctx = slice.getContext('2d')!;
                if (bg !== 'transparent') {
                    ctx.fillStyle = bg;
                    ctx.fillRect(0, 0, slice.width, slice.height);
                }
                ctx.drawImage(canvas, 0, y, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

                const pageW = 595.28;
                const pageH = (sliceHeight / canvas.width) * 595.28;
                const page = pdf.addPage([pageW, pageH]);

                if (bg === 'transparent') {
                    const png = await canvasToBytes(slice, 'image/png');
                    const img = await pdf.embedPng(png);
                    page.drawImage(img, { x: 0, y: 0, width: pageW, height: pageH });
                } else {
                    const jpg = await canvasToBytes(slice, 'image/jpeg', 0.92);
                    const img = await pdf.embedJpg(jpg);
                    page.drawImage(img, { x: 0, y: 0, width: pageW, height: pageH });
                }
            }

            const bytes = await pdf.save();
            downloadPdf(bytes, 'document.pdf');
            recordProcessed({ pdfs: 1, pages: pdf.getPageCount() });

            this.hide();
            this.showToast(`HTML rendered to ${pdf.getPageCount()}-page PDF!`, true);
        } finally {
            host.remove();
        }
    }
}
