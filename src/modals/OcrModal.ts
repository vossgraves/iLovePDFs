import { ToolModal } from './ToolModal';
import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';
import { downloadPdf, outputName, renderPdfPages, canvasToBytes } from '../utils/pdf';
import { enhanceForOcr } from '../utils/images';
import { recordProcessed } from '../utils/stats';

interface QualityPreset {
    id: string;
    label: string;
    sub: string;
    dpi: number;
}

const QUALITY_PRESETS: QualityPreset[] = [
    { id: 'fast', label: 'Fast', sub: '150 DPI · quickest', dpi: 150 },
    { id: 'balanced', label: 'Balanced', sub: '200 DPI · recommended', dpi: 200 },
    { id: 'best', label: 'Best', sub: '300 DPI · most accurate', dpi: 300 }
];

const LANGUAGES = [
    { id: 'eng', label: 'English' },
    { id: 'spa', label: 'Spanish' },
    { id: 'fra', label: 'French' },
    { id: 'deu', label: 'German' },
    { id: 'por', label: 'Portuguese' },
    { id: 'ita', label: 'Italian' },
    { id: 'nld', label: 'Dutch' },
    { id: 'chi_sim', label: 'Chinese (simplified)' },
    { id: 'jpn', label: 'Japanese' },
    { id: 'ara', label: 'Arabic' }
];

interface OcrWord {
    text: string;
    bbox: { x0: number; y0: number; x1: number; y1: number };
}

/**
 * OCR PDF — Tesseract.js recognises scanned pages and rebuilds a searchable
 * PDF (page image + invisible text layer).
 */
export class OcrModal extends ToolModal {
    private quality: QualityPreset = QUALITY_PRESETS[1];

    constructor(modalManager: ModalManager, toastManager: ToastManager) {
        super('ocr-modal', modalManager, toastManager);
    }

    show(): void {
        this.renderModal();
        this.modalManager.show(this.modalId);
        this.setupEventListeners();
    }

    private renderModal(): void {
        const container = document.getElementById('modal-container')!;

        const qualityChips = QUALITY_PRESETS.map(p => `
            <div class="option-chip cursor-pointer px-3 py-2.5 bg-[#f4f4f5] dark:bg-[#262626] hover:bg-[#e5e5e5] dark:hover:bg-[#333333] rounded-2xl text-center ${p.id === this.quality.id ? 'active-option' : ''}" data-quality="${p.id}">
                <div class="font-semibold text-sm">${p.label}</div>
                <div class="text-[10px] opacity-70 mt-0.5">${p.sub}</div>
            </div>
        `).join('');

        const content = `
            <div id="ocr-upload-area">
                ${this.dropzoneHTML('ocr-dropzone', 'ocr-file-input', 'Upload a scanned PDF', 'Pages are recognised and rebuilt as a searchable PDF')}
            </div>

            <div id="ocr-options-area" class="hidden mt-2">
                ${this.fileRowHTML('ocr-file-name', 'ocr-file-info', 'ocr-change-btn')}

                <div class="px-1">
                    <div class="font-semibold text-sm mb-1.5">Document language</div>
                    <select id="ocr-lang" class="w-full border border-[#d1d5db] dark:border-[#404040] px-3 py-2 text-sm font-medium rounded-2xl">
                        ${LANGUAGES.map(l => `<option value="${l.id}" ${l.id === 'eng' ? 'selected' : ''}>${l.label}</option>`).join('')}
                    </select>
                    <div class="text-[11px] text-[#666] dark:text-[#a1a1aa] mt-1">Pick the language the scan is mostly written in — matching it improves accuracy a lot.</div>

                    <div class="font-semibold text-sm mb-1.5 mt-4">Recognition quality</div>
                    <div class="grid grid-cols-3 gap-2" id="ocr-quality-options">${qualityChips}</div>
                    <div class="text-[11px] text-[#666] dark:text-[#a1a1aa] mt-1">Higher DPI reads smaller text more reliably but takes longer per page.</div>

                    <div class="flex items-center gap-x-2 mt-4">
                        <input type="checkbox" id="ocr-enhance" checked class="accent-black dark:accent-white">
                        <label for="ocr-enhance" class="text-sm">Enhance scan before reading text (recommended)</label>
                    </div>
                    <div class="text-[11px] text-[#666] dark:text-[#a1a1aa] mt-1 ml-6">Auto-corrects contrast on faint or unevenly lit scans — free, runs locally, doesn't change the page image you keep.</div>

                    <div class="text-xs text-[#666] dark:text-[#a1a1aa] mt-3">
                        <i class="fa-solid fa-circle-info mr-1"></i>
                        Runs fully in your browser with Tesseract OCR — no account, no upload to a server. First run downloads the recognition engine and language data (~15MB). Output keeps the page look with a selectable text layer on top.
                    </div>

                    <div id="ocr-progress-wrap" class="hidden mt-3">
                        <div class="flex justify-between text-xs font-medium mb-1">
                            <span id="ocr-progress-msg">Preparing…</span>
                            <span id="ocr-progress-pct">0%</span>
                        </div>
                        <div class="w-full h-2 bg-[#e5e5e5] dark:bg-[#2a2a2a] rounded-full overflow-hidden">
                            <div id="ocr-progress-bar" class="h-full bg-black dark:bg-white rounded-full transition-all duration-300" style="width: 0%"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const footer = `
            <button id="ocr-process-btn" class="mono-btn px-7 py-2.5 text-sm font-semibold rounded-2xl flex items-center gap-x-2 disabled:opacity-40" disabled>
                <span>Run OCR</span>
            </button>
        `;

        container.innerHTML = this.createModalHTML('OCR PDF', 'font', content, footer);
    }

    protected setupEventListeners(): void {
        this.wireUpload('ocr-dropzone', 'ocr-file-input', files => void this.handleFile(files[0]));
        this.wireChangeButton('ocr-change-btn', 'ocr-upload-area', 'ocr-options-area', 'ocr-process-btn');

        document.querySelectorAll('#ocr-quality-options .option-chip').forEach(el => {
            el.addEventListener('click', () => {
                document.querySelectorAll('#ocr-quality-options .option-chip').forEach(e => e.classList.remove('active-option'));
                el.classList.add('active-option');
                this.quality = QUALITY_PRESETS.find(p => p.id === (el as HTMLElement).dataset.quality) ?? this.quality;
            });
        });

        document.getElementById('ocr-process-btn')!.addEventListener('click', () =>
            this.run('ocr-process-btn', 'Running OCR…', () => this.process()));
    }

    private async handleFile(file: File): Promise<void> {
        if (!(await this.inspect(file))) return;
        this.showOptions('ocr-upload-area', 'ocr-options-area', 'ocr-process-btn', 'ocr-file-name', 'ocr-file-info');
    }

    private onProgress(percent: number, message: string): void {
        const wrap = document.getElementById('ocr-progress-wrap');
        if (!wrap) return;
        wrap.classList.remove('hidden');
        (document.getElementById('ocr-progress-bar') as HTMLElement).style.width = `${percent}%`;
        document.getElementById('ocr-progress-pct')!.textContent = `${percent}%`;
        document.getElementById('ocr-progress-msg')!.textContent = message;
    }

    private async process(): Promise<void> {
        const lang = (document.getElementById('ocr-lang') as HTMLSelectElement).value;
        const enhance = (document.getElementById('ocr-enhance') as HTMLInputElement).checked;
        const dpi = this.quality.dpi;

        const { createWorker } = await import('tesseract.js');
        const { PDFDocument, StandardFonts } = await import('pdf-lib');

        const canvases = await renderPdfPages(this.pdfBytes!, dpi);
        const out = await PDFDocument.create();
        const font = await out.embedFont(StandardFonts.Helvetica);

        this.onProgress(2, 'Loading OCR engine…');
        const worker = await createWorker(lang, 1, {
            logger: (m: { status: string; progress: number }) => {
                if (m.status === 'recognizing text') {
                    this.onProgress(Math.round(m.progress * 90) + 5, `Recognising text…`);
                }
            }
        });

        try {
            for (let i = 0; i < canvases.length; i++) {
                const canvas = canvases[i];
                this.onProgress(Math.round(((i + 1) / canvases.length) * 90) + 5, `Page ${i + 1} of ${canvases.length}…`);

                let ocrCanvas = canvas;
                if (enhance) {
                    ocrCanvas = document.createElement('canvas');
                    ocrCanvas.width = canvas.width;
                    ocrCanvas.height = canvas.height;
                    ocrCanvas.getContext('2d')!.drawImage(canvas, 0, 0);
                    enhanceForOcr(ocrCanvas);
                }

                const result = await worker.recognize(ocrCanvas);
                const words = (result.data.words ?? []) as OcrWord[];

                const pageW = (canvas.width * 72) / dpi;
                const pageH = (canvas.height * 72) / dpi;
                const page = out.addPage([pageW, pageH]);

                // visual layer: the original page image
                const jpeg = await canvasToBytes(canvas, 'image/jpeg', 0.85);
                const image = await out.embedJpg(jpeg);
                page.drawImage(image, { x: 0, y: 0, width: pageW, height: pageH });

                // invisible text layer
                const scale = pageW / canvas.width;
                words.forEach(w => {
                    const text = (w.text || '').trim();
                    if (!text) return;
                    const hPt = Math.max(4, (w.bbox.y1 - w.bbox.y0) * scale);
                    page.drawText(text, {
                        x: w.bbox.x0 * scale,
                        y: pageH - w.bbox.y1 * scale,
                        size: hPt,
                        font,
                        opacity: 0
                    });
                });
            }
        } finally {
            await worker.terminate();
        }

        this.onProgress(100, 'Done');

        const bytes = await out.save();
        downloadPdf(bytes, outputName(this.fileName, '-ocr'));
        recordProcessed({ pdfs: 1, pages: canvases.length });

        this.hide();
        this.showToast(`OCR complete — ${canvases.length} searchable page${canvases.length === 1 ? '' : 's'}!`, true);
    }
}
