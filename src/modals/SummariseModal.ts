import { ToolModal } from './ToolModal';
import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';
import { downloadPdf, outputName, extractPlainText } from '../utils/pdf';
import { getAiSettings, saveAiSettings, summarizeText, SummaryStyle } from '../utils/ai';
import { recordProcessed } from '../utils/stats';

/**
 * AI Summariser — BYOK: the user's OpenAI-compatible endpoint and key live
 * only in their browser (localStorage). No env vars, no server.
 */
export class SummariseModal extends ToolModal {
    private summary = '';

    constructor(modalManager: ModalManager, toastManager: ToastManager) {
        super('summarise-modal', modalManager, toastManager);
    }

    show(): void {
        this.renderModal();
        this.modalManager.show(this.modalId);
        this.setupEventListeners();
    }

    private renderModal(): void {
        const container = document.getElementById('modal-container')!;
        const settings = getAiSettings();

        const content = `
            <div id="sum-upload-area">
                ${this.dropzoneHTML('sum-dropzone', 'sum-file-input', 'Upload your PDF', 'Text is extracted and summarised by your own AI account')}

                <div class="mt-4 border border-[#e5e5e5] dark:border-[#2a2a2a] rounded-2xl p-4">
                    <div class="font-semibold text-sm mb-2"><i class="fa-solid fa-key mr-1.5 text-[#777]"></i>Your AI settings <span class="font-normal text-xs text-[#666] dark:text-[#a1a1aa]">(stored only in this browser)</span></div>
                    <div class="space-y-2">
                        <input type="text" id="ai-base-url" value="${settings.baseUrl}" placeholder="https://api.openai.com/v1" class="border border-[#d1d5db] dark:border-[#404040] px-3 py-2 text-xs w-full rounded-xl font-mono">
                        <input type="password" id="ai-api-key" value="${settings.apiKey}" placeholder="API key (sk-…)" class="border border-[#d1d5db] dark:border-[#404040] px-3 py-2 text-xs w-full rounded-xl font-mono">
                        <input type="text" id="ai-model" value="${settings.model}" placeholder="gpt-4o-mini" class="border border-[#d1d5db] dark:border-[#404040] px-3 py-2 text-xs w-full rounded-xl font-mono">
                    </div>
                    <div class="text-[10px] text-[#666] dark:text-[#a1a1aa] mt-2">
                        Works with any OpenAI-compatible endpoint (OpenAI, OpenRouter, Groq, LM Studio…). The key never leaves your browser.
                    </div>
                </div>
            </div>

            <div id="sum-options-area" class="hidden mt-2">
                ${this.fileRowHTML('sum-file-name', 'sum-file-info', 'sum-change-btn')}

                <div class="px-1 mb-3">
                    <div class="font-semibold text-sm mb-1.5">Summary style</div>
                    <select id="sum-style" class="w-full border border-[#d1d5db] dark:border-[#404040] px-3 py-2 text-sm font-medium rounded-2xl">
                        <option value="bullet points" selected>Bullet points</option>
                        <option value="concise paragraph">Concise paragraph</option>
                        <option value="detailed report">Detailed report</option>
                    </select>
                </div>

                <div id="sum-status" class="text-xs text-[#666] dark:text-[#a1a1aa] px-1 mb-2"></div>

                <div id="sum-result-wrap" class="hidden">
                    <div class="flex items-center justify-between mb-1.5 px-1">
                        <div class="font-semibold text-sm">Summary</div>
                        <div class="flex gap-x-2">
                            <button id="sum-copy-btn" class="text-xs text-[#666] dark:text-[#a1a1aa] hover:text-black dark:hover:text-white font-medium px-2 py-1"><i class="fa-solid fa-copy mr-1"></i>Copy</button>
                            <button id="sum-download-btn" class="text-xs text-[#666] dark:text-[#a1a1aa] hover:text-black dark:hover:text-white font-medium px-2 py-1"><i class="fa-solid fa-download mr-1"></i>.md</button>
                        </div>
                    </div>
                    <div id="sum-result" class="text-sm bg-[#f8f8f8] dark:bg-[#161616] border border-[#e5e5e5] dark:border-[#2a2a2a] rounded-2xl p-4 max-h-[280px] overflow-y-auto whitespace-pre-wrap"></div>
                </div>
            </div>
        `;

        const footer = `
            <button id="sum-process-btn" class="mono-btn px-7 py-2.5 text-sm font-semibold rounded-2xl flex items-center gap-x-2 disabled:opacity-40" disabled>
                <span>Summarise</span>
            </button>
        `;

        container.innerHTML = this.createModalHTML('AI Summariser', 'brain', content, footer, 'max-w-2xl');
    }

    protected setupEventListeners(): void {
        this.wireUpload('sum-dropzone', 'sum-file-input', files => void this.handleFile(files[0]));
        this.wireChangeButton('sum-change-btn', 'sum-upload-area', 'sum-options-area', 'sum-process-btn');

        ['ai-base-url', 'ai-api-key', 'ai-model'].forEach(id => {
            document.getElementById(id)!.addEventListener('change', () => this.persistSettings());
        });

        document.getElementById('sum-process-btn')!.addEventListener('click', () =>
            this.run('sum-process-btn', 'Summarising…', () => this.process()));

        document.getElementById('sum-copy-btn')!.addEventListener('click', async () => {
            await navigator.clipboard.writeText(this.summary);
            this.showToast('Summary copied to clipboard!');
        });
        document.getElementById('sum-download-btn')!.addEventListener('click', () => {
            downloadPdf(new TextEncoder().encode(this.summary), outputName(this.fileName, '').replace(/\.pdf$/i, '') + '-summary.md');
        });
    }

    private persistSettings(): void {
        saveAiSettings({
            baseUrl: (document.getElementById('ai-base-url') as HTMLInputElement).value.trim(),
            apiKey: (document.getElementById('ai-api-key') as HTMLInputElement).value.trim(),
            model: (document.getElementById('ai-model') as HTMLInputElement).value.trim()
        });
    }

    private async handleFile(file: File): Promise<void> {
        if (!(await this.inspect(file))) return;
        this.persistSettings();
        this.showOptions('sum-upload-area', 'sum-options-area', 'sum-process-btn', 'sum-file-name', 'sum-file-info');
    }

    private async process(): Promise<void> {
        const style = (document.getElementById('sum-style') as HTMLSelectElement).value as SummaryStyle;
        const settings = getAiSettings();

        this.setStatus('sum-status', 'Extracting text…');
        const text = await extractPlainText(this.pdfBytes!);

        this.summary = await summarizeText(text, style, settings, msg => this.setStatus('sum-status', msg));
        this.setStatus('sum-status', '');

        document.getElementById('sum-result-wrap')!.classList.remove('hidden');
        document.getElementById('sum-result')!.textContent = this.summary;

        recordProcessed({ pdfs: 0, pages: this.pageCount });
        this.showToast('Summary ready!');
    }
}
