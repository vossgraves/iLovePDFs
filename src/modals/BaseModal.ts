import { ModalManager } from '../utils/modal';
import { ToastManager } from '../utils/toast';

export abstract class BaseModal {
    protected modalId: string;
    protected modalManager: ModalManager;
    protected toastManager: ToastManager;

    constructor(modalId: string, modalManager: ModalManager, toastManager: ToastManager) {
        this.modalId = modalId;
        this.modalManager = modalManager;
        this.toastManager = toastManager;
    }

    protected show(): void {
        this.modalManager.show(this.modalId);
        this.setupEventListeners();
    }

    protected hide(): void {
        this.modalManager.hide(this.modalId);
    }

    protected abstract setupEventListeners(): void;

    protected createModalHTML(title: string, icon: string, content: string, footer: string, maxWidth = 'max-w-xl'): string {
        return `
            <div id="${this.modalId}" onclick="if (event.target.id === '${this.modalId}') window.modalManager.hide('${this.modalId}')" 
                 class="hidden fixed inset-0 bg-black bg-opacity-60 z-[100] flex items-center justify-center overflow-y-auto py-6">
                <div onclick="event.stopImmediatePropagation()" class="mono-card w-full ${maxWidth} mx-4 rounded-3xl overflow-hidden my-auto">
                    <div class="px-7 pt-7 pb-4 border-b border-[#e5e5e5] dark:border-[#2a2a2a] flex items-center justify-between">
                        <div class="flex items-center gap-x-3">
                            <div class="tool-icon"><i class="fa-solid fa-${icon}"></i></div>
                            <span class="font-bold text-2xl">${title}</span>
                        </div>
                        <button onclick="window.modalManager.hide('${this.modalId}')" class="w-9 h-9 flex items-center justify-center text-xl text-[#777] dark:text-[#a1a1aa] hover:bg-[#f4f4f5] dark:hover:bg-[#262626] rounded-2xl">&times;</button>
                    </div>
                    
                    <div class="p-7 max-h-[70vh] overflow-y-auto">
                        ${content}
                    </div>
                    
                    <div class="px-7 py-5 bg-[#f8f8f8] dark:bg-[#161616] flex items-center justify-between">
                        <button onclick="window.modalManager.hide('${this.modalId}')" class="px-6 py-2.5 text-sm font-semibold">Cancel</button>
                        ${footer}
                    </div>
                </div>
            </div>
        `;
    }

    protected showToast(message: string, showDownload = false, isError = false): void {
        this.toastManager.show({ message, showDownload, isError });
    }

    protected createMockDownload(filename: string, description: string): void {
        const link = document.createElement('a');
        const content = `iLovePDF Monochrome\n\nFile: ${filename}\n${description}\n\nGenerated on: ${new Date().toLocaleDateString()}\n\nThis is a demo file created by the iLovePDF monochrome demo.`;

        const blob = new Blob([content], { type: 'text/plain' });
        link.href = URL.createObjectURL(blob);
        link.download = filename;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}
