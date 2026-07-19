import { ToolModal } from './ToolModal';
import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';
import { downloadPdf, outputName, extractTextByPage } from '../utils/pdf';
import { recordProcessed } from '../utils/stats';

/**
 * PDF to Markdown — extracts text and infers basic structure
 * (headings from font size, bullets from list markers).
 */
export class PdfToMarkdownModal extends ToolModal {
    constructor(modalManager: ModalManager, toastManager: ToastManager) {
        super('markdown-modal', modalManager, toastManager);
    }

    show(): void {
        this.renderModal();
        this.modalManager.show(this.modalId);
        this.setupEventListeners();
    }

    private renderModal(): void {
        const container = document.getElementById('modal-container')!;

        const content = `
            <div id="md-upload-area">
                ${this.dropzoneHTML('md-dropzone', 'md-file-input', 'Upload your PDF', 'Text is extracted and converted to a Markdown document')}
            </div>

            <div id="md-options-area" class="hidden mt-2">
                ${this.fileRowHTML('md-file-name', 'md-file-info', 'md-change-btn')}
                <div class="font-semibold text-sm mb-2 px-1">Preview</div>
                <pre id="md-preview" class="text-xs bg-[#f8f8f8] dark:bg-[#161616] border border-[#e5e5e5] dark:border-[#2a2a2a] rounded-2xl p-4 max-h-[280px] overflow-auto whitespace-pre-wrap font-mono"></pre>
            </div>
        `;

        const footer = `
            <button id="md-process-btn" class="mono-btn px-7 py-2.5 text-sm font-semibold rounded-2xl flex items-center gap-x-2 disabled:opacity-40" disabled>
                <span>Download Markdown</span>
            </button>
        `;

        container.innerHTML = this.createModalHTML('PDF to Markdown', 'file-lines', content, footer, 'max-w-2xl');
    }

    protected setupEventListeners(): void {
        this.wireUpload('md-dropzone', 'md-file-input', files => void this.handleFile(files[0]));
        this.wireChangeButton('md-change-btn', 'md-upload-area', 'md-options-area', 'md-process-btn');
        document.getElementById('md-process-btn')!.addEventListener('click', () =>
            this.run('md-process-btn', 'Converting…', () => this.process()));
    }

    private markdown = '';

    private async handleFile(file: File): Promise<void> {
        if (!(await this.inspect(file))) return;

        try {
            const pages = await extractTextByPage(this.pdfBytes!);
            this.markdown = this.buildMarkdown(pages);

            if (!this.markdown.trim()) {
                this.showToast('No extractable text found — this may be a scanned PDF. Try OCR first.', false, true);
                return;
            }

            this.showOptions('md-upload-area', 'md-options-area', 'md-process-btn', 'md-file-name', 'md-file-info');
            document.getElementById('md-preview')!.textContent =
                this.markdown.slice(0, 4000) + (this.markdown.length > 4000 ? '\n\n…' : '');
        } catch (err) {
            this.showToast(err instanceof Error ? err.message : 'Could not extract text.', false, true);
        }
    }

    private buildMarkdown(pages: { text: string; fontSize: number }[][]): string {
        // body font size = most common rounded size across the document
        const sizeCounts = new Map<number, number>();
        pages.flat().forEach(i => {
            const key = Math.round(i.fontSize);
            if (key > 0) sizeCounts.set(key, (sizeCounts.get(key) ?? 0) + i.text.length);
        });
        let bodySize = 10;
        let best = 0;
        sizeCounts.forEach((count, size) => {
            if (count > best) { best = count; bodySize = size; }
        });

        const parts: string[] = [];
        pages.forEach((items, pageIndex) => {
            const lines: string[] = [];
            let para: string[] = [];

            const flush = () => {
                if (para.length) {
                    lines.push(para.join(' '));
                    para = [];
                }
            };

            items.forEach(item => {
                const text = item.text.trim();
                if (!text) return;

                const isHeading = bodySize > 0 && item.fontSize >= bodySize * 1.4 && text.length < 120;
                const isSubHeading = !isHeading && bodySize > 0 && item.fontSize >= bodySize * 1.2 && text.length < 120;
                const bulletMatch = text.match(/^[•\-\u2022\u25CF\u25AA\*]\s+/);

                if (isHeading) {
                    flush();
                    lines.push(`## ${text}`);
                } else if (isSubHeading) {
                    flush();
                    lines.push(`### ${text}`);
                } else if (bulletMatch) {
                    flush();
                    lines.push(`- ${text.replace(bulletMatch[0], '')}`);
                } else {
                    para.push(text);
                }
            });
            flush();

            if (lines.length) {
                if (pages.length > 1) parts.push(`<!-- Page ${pageIndex + 1} -->`);
                parts.push(lines.join('\n\n'));
            }
        });

        return parts.join('\n\n');
    }

    private async process(): Promise<void> {
        if (!this.markdown.trim()) {
            this.showToast('Nothing to download.', false, true);
            return;
        }

        downloadPdf(new TextEncoder().encode(this.markdown), outputName(this.fileName, '').replace(/\.pdf$/i, '') + '.md');
        recordProcessed({ pdfs: 1, pages: this.pageCount });

        this.hide();
        this.showToast('Markdown downloaded!', true);
    }
}
