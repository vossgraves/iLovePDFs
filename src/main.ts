import { ModalManager } from './utils/modal';
import { ToastManager } from './utils/toast';
import { renderStats } from './utils/stats';
import type { Tool } from './types';

// Theme Manager
class ThemeManager {
    private currentTheme: 'light' | 'dark' = 'light';

    constructor() {
        this.initTheme();
    }

    private initTheme(): void {
        // Check localStorage or system preference
        const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        this.currentTheme = savedTheme || (prefersDark ? 'dark' : 'light');
        this.applyTheme(this.currentTheme);
    }

    private applyTheme(theme: 'light' | 'dark'): void {
        const html = document.documentElement;
        
        if (theme === 'dark') {
            html.classList.add('dark');
        } else {
            html.classList.remove('dark');
        }
        
        localStorage.setItem('theme', theme);
        this.currentTheme = theme;
        
        // Update toggle icon if it exists
        this.updateToggleIcon();
    }

    private updateToggleIcon(): void {
        const toggleBtn = document.getElementById('theme-toggle');
        if (!toggleBtn) return;

        const icon = toggleBtn.querySelector('i');
        if (!icon) return;

        if (this.currentTheme === 'dark') {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        } else {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
        }
    }

    toggle(): void {
        const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.applyTheme(newTheme);
    }

    getCurrentTheme(): 'light' | 'dark' {
        return this.currentTheme;
    }
}

// Modals
import { NupModal } from './modals/NupModal';
import { MergeModal } from './modals/MergeModal';
import { SplitModal } from './modals/SplitModal';
import { CompressModal } from './modals/CompressModal';
import { ConvertModal } from './modals/ConvertModal';
import { RotateModal } from './modals/RotateModal';
import { WatermarkModal } from './modals/WatermarkModal';
import { ProtectModal } from './modals/ProtectModal';

// Global references
declare global {
    interface Window {
        modalManager: ModalManager;
    }
}

class ILovePDFApp {
    private modalManager: ModalManager;
    private toastManager: ToastManager;
    private themeManager: ThemeManager;
    
    // Modals
    private nupModal: NupModal;
    private mergeModal: MergeModal;
    private splitModal: SplitModal;
    private compressModal: CompressModal;
    private convertModal: ConvertModal;
    private rotateModal: RotateModal;
    private watermarkModal: WatermarkModal;
    private protectModal: ProtectModal;

    private tools: Tool[] = [
        { id: 'merge', name: 'Merge PDF', icon: 'link', description: 'Combine multiple PDFs into a single document', badge: 'Popular' },
        { id: 'split', name: 'Split PDF', icon: 'cut', description: 'Split a PDF into multiple files by page range' },
        { id: 'compress', name: 'Compress PDF', icon: 'compress-arrows-alt', description: 'Reduce file size while maintaining quality' },
        { id: 'convert', name: 'Convert PDF', icon: 'exchange-alt', description: 'Convert PDF to Word, JPG, PPT & more', badge: '6 formats' },
        { id: 'rotate', name: 'Rotate PDF', icon: 'redo', description: 'Rotate pages in your PDF document' },
        { id: 'nup', name: 'N-up PDF', icon: 'th-large', description: 'Print multiple pages on a single sheet. Save paper.', featured: true, badge: 'NEW' },
        { id: 'watermark', name: 'Add Watermark', icon: 'stamp', description: 'Add text or image watermark to your PDF' },
        { id: 'protect', name: 'Protect PDF', icon: 'lock', description: 'Encrypt and password protect your PDFs' }
    ];

    constructor() {
        this.modalManager = new ModalManager();
        this.toastManager = new ToastManager();
        this.themeManager = new ThemeManager();
        
        // Initialize modals
        this.nupModal = new NupModal(this.modalManager, this.toastManager);
        this.mergeModal = new MergeModal(this.modalManager, this.toastManager);
        this.splitModal = new SplitModal(this.modalManager, this.toastManager);
        this.compressModal = new CompressModal(this.modalManager, this.toastManager);
        this.convertModal = new ConvertModal(this.modalManager, this.toastManager);
        this.rotateModal = new RotateModal(this.modalManager, this.toastManager);
        this.watermarkModal = new WatermarkModal(this.modalManager, this.toastManager);
        this.protectModal = new ProtectModal(this.modalManager, this.toastManager);

        // Expose modalManager globally for inline handlers
        window.modalManager = this.modalManager;

        this.init();
    }

    private init(): void {
        this.renderTools();
        this.setupEventListeners();
        this.setupKeyboardShortcuts();
        renderStats();

        console.log('%c[iLovePDF Monochrome] TypeScript app initialized successfully.', 'color:#777');
    }

    private renderTools(): void {
        const grid = document.getElementById('tools-grid')!;
        
        grid.innerHTML = this.tools.map(tool => {
            const isFeatured = tool.featured;
            const badgeHTML = tool.badge ?
                `<div class="px-3 py-1 text-xs ${isFeatured ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-[#f4f4f5] dark:bg-[#262626] text-[#555] dark:text-[#a1a1aa]'} font-medium rounded-[14px]">${tool.badge}</div>` : '';

            const featuredBorder = isFeatured ? 'border border-[#111111] dark:border-[#f4f4f5]' : '';

            const extraBadges = isFeatured ?
                `<div class="mt-4 flex gap-x-1">
                    <div class="px-2.5 py-px bg-[#111111] dark:bg-white text-white dark:text-black text-xs font-bold flex items-center justify-center rounded">2-up</div>
                    <div class="px-2.5 py-px bg-[#f4f4f5] dark:bg-[#262626] text-[#666] dark:text-[#a1a1aa] text-xs font-bold flex items-center justify-center rounded">4-up</div>
                    <div class="px-2.5 py-px bg-[#f4f4f5] dark:bg-[#262626] text-[#666] dark:text-[#a1a1aa] text-xs font-bold flex items-center justify-center rounded">9-up</div>
                </div>` : '';

            return `
                <div class="mono-card cursor-pointer p-5 rounded-3xl ${featuredBorder}" data-tool-id="${tool.id}">
                    <div class="flex justify-between items-start mb-4">
                        <div class="tool-icon">
                            <i class="fa-solid fa-${tool.icon} text-xl"></i>
                        </div>
                        ${badgeHTML}
                    </div>
                    <div class="font-semibold text-xl">${tool.name}</div>
                    <div class="text-sm text-[#666] dark:text-[#a1a1aa] mt-1 leading-tight">${tool.description}</div>
                    ${extraBadges}
                </div>
            `;
        }).join('');

        // Add click handlers
        grid.querySelectorAll('[data-tool-id]').forEach(card => {
            card.addEventListener('click', () => {
                const toolId = card.getAttribute('data-tool-id')!;
                this.openTool(toolId);
            });
        });
    }

    private setupEventListeners(): void {
        // Hero buttons
        const browseBtn = document.getElementById('browse-tools-btn');
        const tryNupBtn = document.getElementById('try-nup-btn');
        const loginBtn = document.getElementById('login-btn');
        const signupBtn = document.getElementById('signup-btn');
        const themeToggle = document.getElementById('theme-toggle');
        const navToolsLink = document.getElementById('nav-tools-link');

        if (navToolsLink) {
            navToolsLink.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('tools-section')?.scrollIntoView({ behavior: 'smooth' });
            });
        }

        if (browseBtn) {
            browseBtn.addEventListener('click', () => {
                document.getElementById('tools-section')?.scrollIntoView({ behavior: 'smooth' });
            });
        }

        if (tryNupBtn) {
            tryNupBtn.addEventListener('click', () => this.openTool('nup'));
        }

        if (loginBtn) {
            loginBtn.addEventListener('click', () => this.showLoginModal());
        }

        if (signupBtn) {
            signupBtn.addEventListener('click', () => this.showLoginModal());
        }

        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                this.themeManager.toggle();
            });
        }
    }

    private setupKeyboardShortcuts(): void {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const activeModals = document.querySelectorAll('.fixed.inset-0[style*="flex"]');
                if (activeModals.length > 0) {
                    const lastModal = activeModals[activeModals.length - 1] as HTMLElement;
                    lastModal.style.display = 'none';
                    lastModal.classList.add('hidden');
                }
            }
            
            if (e.key === '/' && document.activeElement?.tagName === 'BODY') {
                e.preventDefault();
                document.getElementById('tools-section')?.scrollIntoView({ behavior: 'smooth' });
            }
            
            if (e.key === '?') {
                this.openTool('nup');
            }
        });
    }

    private openTool(toolId: string): void {
        switch (toolId) {
            case 'nup':
                this.nupModal.show();
                break;
            case 'merge':
                this.mergeModal.show();
                break;
            case 'split':
                this.splitModal.show();
                break;
            case 'compress':
                this.compressModal.show();
                break;
            case 'convert':
                this.convertModal.show();
                break;
            case 'rotate':
                this.rotateModal.show();
                break;
            case 'watermark':
                this.watermarkModal.show();
                break;
            case 'protect':
                this.protectModal.show();
                break;
            default:
                console.warn(`Unknown tool: ${toolId}`);
        }
    }

    private showLoginModal(): void {
        const container = document.getElementById('modal-container')!;
        
        container.innerHTML = `
            <div class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[200]" onclick="this.remove()">
                <div onclick="event.stopImmediatePropagation()" class="mono-card w-full max-w-sm mx-4 rounded-3xl overflow-hidden">
                    <div class="p-8">
                        <div class="flex justify-between items-center mb-6">
                            <div class="font-black text-3xl">Sign in</div>
                            <button onclick="event.target.closest('.fixed').remove()" class="text-3xl leading-none text-[#777] dark:text-[#a1a1aa]">&times;</button>
                        </div>

                        <div class="space-y-5">
                            <div>
                                <div class="text-xs font-semibold px-1 mb-1.5">Email address</div>
                                <input type="email" value="demo@ilovepdf.com" class="border px-4 py-[10px] w-full text-sm rounded-2xl border-[#d1d5db] dark:border-[#404040]">
                            </div>

                            <div>
                                <div class="text-xs font-semibold px-1 mb-1.5">Password</div>
                                <input type="password" value="demo123" class="border px-4 py-[10px] w-full text-sm rounded-2xl border-[#d1d5db] dark:border-[#404040]">
                            </div>

                            <div>
                                <button id="login-submit-btn" class="mono-btn w-full py-3.5 text-sm font-bold rounded-3xl">Sign in</button>
                            </div>

                            <div class="text-center text-xs pt-1 text-[#666] dark:text-[#a1a1aa]">Forgot password? <span class="underline cursor-pointer">Reset</span></div>

                            <div class="pt-3 flex items-center justify-center text-xs">
                                <div class="px-4 py-px border text-[#555] dark:text-[#a1a1aa] border-[#d1d5db] dark:border-[#404040] text-center text-xs rounded-3xl">Or continue with</div>
                            </div>

                            <div class="flex gap-x-2">
                                <button class="flex-1 py-[9px] text-xs border border-[#d1d5db] dark:border-[#404040] rounded-3xl flex items-center justify-center gap-x-2 font-medium"><i class="fa-brands fa-google"></i> <span>Google</span></button>
                                <button class="flex-1 py-[9px] text-xs border border-[#d1d5db] dark:border-[#404040] rounded-3xl flex items-center justify-center gap-x-2 font-medium"><i class="fa-brands fa-apple"></i> <span>Apple</span></button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add login handler
        setTimeout(() => {
            const submitBtn = document.getElementById('login-submit-btn');
            if (submitBtn) {
                submitBtn.addEventListener('click', () => {
                    submitBtn.innerHTML = `<span class="flex items-center justify-center gap-x-2"><i class="fa-solid fa-spinner fa-spin"></i> Signing in...</span>`;
                    
                    setTimeout(() => {
                        const modal = submitBtn.closest('.fixed');
                        if (modal) modal.remove();
                        this.toastManager.show({ message: "Successfully signed in. Welcome back!" });
                    }, 1200);
                });
            }
        }, 100);
    }
}

// Initialize the app
new ILovePDFApp();