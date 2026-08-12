import { ToolModal } from './ToolModal';
import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';
import { downloadFile, downloadPdf, outputName, extractTextByPage } from '../utils/pdf';
import { recordProcessed } from '../utils/stats';

const LANGS = [
    { id: 'en', label: 'English', latin: true },
    { id: 'es', label: 'Spanish', latin: true },
    { id: 'fr', label: 'French', latin: true },
    { id: 'de', label: 'German', latin: true },
    { id: 'it', label: 'Italian', latin: true },
    { id: 'pt', label: 'Portuguese', latin: true },
    { id: 'nl', label: 'Dutch', latin: true },
    { id: 'sv', label: 'Swedish', latin: true },
    { id: 'pl', label: 'Polish', latin: false },
    { id: 'ru', label: 'Russian', latin: false },
    { id: 'tr', label: 'Turkish', latin: false },
    { id: 'ar', label: 'Arabic', latin: false },
    { id: 'hi', label: 'Hindi', latin: false },
    { id: 'ja', label: 'Japanese', latin: false },
    { id: 'zh-CN', label: 'Chinese (simplified)', latin: false },
    { id: 'ko', label: 'Korean', latin: false }
];

/**
 * Translate PDF — translates extracted text via the free MyMemory API.
 * Latin-script targets also get a rebuilt PDF; others download as .txt.
 */
export class TranslateModal extends ToolModal {
    private translatedPages: string[] = [];

    constructor(modalManager: ModalManager, toastManager: ToastManager) {
        super('translate-modal', modalManager, toastManager);
    }

    show(): void {
        this.renderModal();
        this.modalManager.show(this.modalId);
        this.setupEventListeners();
    }

    private renderModal(): void {
        const container = document.getElementById('modal-container')!;

        const content = `
            <div id="tr-upload-area">
                ${this.dropzoneHTML('tr-dropzone', 'tr-file-input', 'Upload your PDF', 'Text is extracted, translated, and rebuilt into a new document')}
            </div>

            <div id="tr-options-area" class="hidden mt-2">
                ${this.fileRowHTML('tr-file-name', 'tr-file-info', 'tr-change-btn')}

                <div class="grid grid-cols-2 gap-3 px-1">
                    <div>
                        <div class="font-semibold text-sm mb-1.5">From</div>
                        <select id="tr-from" class="w-full border border-[#d1d5db] dark:border-[#404040] px-3 py-2 text-sm font-medium rounded-2xl">
                            ${LANGS.map(l => `<option value="${l.id}" ${l.id === 'en' ? 'selected' : ''}>${l.label}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <div class="font-semibold text-sm mb-1.5">To</div>
                        <select id="tr-to" class="w-full border border-[#d1d5db] dark:border-[#404040] px-3 py-2 text-sm font-medium rounded-2xl">
                            ${LANGS.map(l => `<option value="${l.id}" ${l.id === 'es' ? 'selected' : ''}>${l.label}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <div id="tr-status" class="text-xs text-[#666] dark:text-[#a1a1aa] px-1 mt-3"></div>

                <div class="text-xs text-[#666] dark:text-[#a1a1aa] px-1 mt-2">
                    <i class="fa-solid fa-circle-info mr-1"></i>
                    Free translation via MyMemory (daily quota applies). Layout is simplified to flowing translated text.
                </div>
            </div>
        `;

        const footer = `
            <button id="tr-process-btn" class="mono-btn px-7 py-2.5 text-sm font-semibold rounded-2xl flex items-center gap-x-2 disabled:opacity-40" disabled>
                <span>Translate</span>
            </button>
        `;

        container.innerHTML = this.createModalHTML('Translate PDF', 'language', content, footer);
    }

    protected setupEventListeners(): void {
        this.wireUpload('tr-dropzone', 'tr-file-input', files => void this.handleFile(files[0]));
        this.wireChangeButton('tr-change-btn', 'tr-upload-area', 'tr-options-area', 'tr-process-btn');
        document.getElementById('tr-process-btn')!.addEventListener('click', () =>
            this.run('tr-process-btn', 'Translating…', () => this.process()));
    }

    private async handleFile(file: File): Promise<void> {
        if (!(await this.inspect(file))) return;
        this.showOptions('tr-upload-area', 'tr-options-area', 'tr-process-btn', 'tr-file-name', 'tr-file-info');
    }

    private async translateChunk(text: string, from: string, to: string): Promise<string> {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(from)}|${encodeURIComponent(to)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Translation service error (HTTP ${res.status}).`);

        const json = await res.json();
        const translated = json?.responseData?.translatedText;
        if (!translated || json?.responseStatus === 403 || json?.responseStatus === 429) {
            throw new Error('Daily free translation quota reached — try again tomorrow.');
        }
        if (typeof translated !== 'string') throw new Error('Translation failed.');
        return translated;
    }

    private async translateText(text: string, from: string, to: string): Promise<string> {
        const chunks: string[] = [];
        let rest = text;
        while (rest.length > 0) {
            let end = Math.min(450, rest.length);
            if (end < rest.length) {
                const dot = rest.lastIndexOf('. ', end);
                if (dot > 200) end = dot + 1;
            }
            chunks.push(rest.slice(0, end));
            rest = rest.slice(end);
        }

        const out: string[] = [];
        for (const chunk of chunks) {
            out.push(await this.translateChunk(chunk, from, to));
        }
        return out.join(' ');
    }

    private async process(): Promise<void> {
        const from = (document.getElementById('tr-from') as HTMLSelectElement).value;
        const to = (document.getElementById('tr-to') as HTMLSelectElement).value;
        const target = LANGS.find(l => l.id === to)!;

        if (from === to) {
            this.showToast('Source and target languages are the same.', false, true);
            return;
        }

        this.setStatus('tr-status', 'Extracting text…');
        const pages = await extractTextByPage(this.pdfBytes!);
        const pageTexts = pages.map(items => items.map(i => i.text).join(' ').trim());

        if (pageTexts.every(t => !t)) {
            throw new Error('No extractable text found — this may be a scanned PDF. Try OCR first.');
        }

        this.translatedPages = [];
        for (let i = 0; i < pageTexts.length; i++) {
            if (!pageTexts[i]) {
                this.translatedPages.push('');
                continue;
            }
            this.setStatus('tr-status', `Translating page ${i + 1} of ${pageTexts.length}…`);
            this.translatedPages.push(await this.translateText(pageTexts[i], from, to));
        }
        this.setStatus('tr-status', '');

        const base = outputName(this.fileName, `-${to}`);

        if (target.latin) {
            await this.buildPdf(base, target.label);
        } else {
            const text = this.translatedPages.map((t, i) => `--- Page ${i + 1} ---\n${t}`).join('\n\n');
            downloadFile(
                new TextEncoder().encode(text),
                base.replace(/\.pdf$/i, '.txt'),
                'text/plain;charset=utf-8'
            );
        }

        recordProcessed({ pdfs: 1, pages: this.pageCount });
        this.hide();
        this.showToast(`Translated to ${target.label}!`, true);
    }

    /** Rebuilds a simple flowing-text PDF for Latin-script targets. */
    private async buildPdf(filename: string, targetLabel: string): Promise<void> {
        const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
        const doc = await PDFDocument.create();
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const bold = await doc.embedFont(StandardFonts.HelveticaBold);

        const pageW = 595.28, pageH = 841.89;
        const margin = 56;
        const size = 11;
        const lineHeight = size * 1.45;
        const maxWidth = pageW - margin * 2;

        let page = doc.addPage([pageW, pageH]);
        let y = pageH - margin;

        const drawLine = (text: string, f = font, s = size) => {
            if (y < margin + lineHeight) {
                page = doc.addPage([pageW, pageH]);
                y = pageH - margin;
            }
            page.drawText(text, { x: margin, y, size: s, font: f, color: rgb(0.07, 0.07, 0.07) });
            y -= lineHeight;
        };

        page.drawText(`Translated from ${this.fileName} → ${targetLabel}`, { x: margin, y, size: 13, font: bold, color: rgb(0.07, 0.07, 0.07) });
        y -= lineHeight * 2;

        const sanitize = (t: string) => t.replace(/[^\x20-\x7E\xA0-\xFF]/g, '');

        this.translatedPages.forEach(pageText => {
            if (!pageText) return;
            const words = sanitize(pageText).split(/\s+/);
            let line = '';

            words.forEach(word => {
                const test = line ? `${line} ${word}` : word;
                if (font.widthOfTextAtSize(test, size) > maxWidth) {
                    drawLine(line);
                    line = word;
                } else {
                    line = test;
                }
            });
            if (line) drawLine(line);
            y -= lineHeight; // blank line between source pages
        });

        const bytes = await doc.save();
        downloadPdf(bytes, filename);
    }
}
