import { ToastOptions } from '../types';

export class ToastManager {
    private container: HTMLElement;

    constructor() {
        this.container = document.getElementById('toast-container')!;
    }

    show(options: ToastOptions): void {
        const toast = document.createElement('div');
        toast.className = `flex items-center gap-x-3 bg-black text-white px-5 py-4 rounded-3xl shadow-xl mono-shadow transition-all duration-200`;
        
        const iconClass = options.isError
            ? 'fa-circle-exclamation text-red-400'
            : 'fa-check-circle text-emerald-400';

        toast.innerHTML = `
            <div class="flex items-center gap-x-3">
                <i class="fa-solid ${iconClass}"></i>
                <div>
                    <span class="font-semibold">${options.message}</span>
                </div>
            </div>
            <button class="px-3 text-xs font-medium text-[#ccc] hover:text-white">Close</button>
        `;

        const closeBtn = toast.querySelector('button')!;
        closeBtn.addEventListener('click', () => this.hide(toast));

        this.container.appendChild(toast);

        // Auto hide
        const duration = options.duration || (options.showDownload ? 4200 : 2800);
        
        setTimeout(() => {
            if (toast.parentNode) {
                this.hide(toast);
            }
        }, duration);
    }

    private hide(toast: HTMLElement): void {
        toast.style.transitionDuration = '150ms';
        toast.style.opacity = '0';
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 150);
    }
}