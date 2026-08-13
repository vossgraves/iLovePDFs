import { ModalManager } from './utils/modal';
import { ToastManager } from './utils/toast';
import { renderStats } from './utils/stats';
import type { Tool, ToolCategory } from './types';

// Theme Manager
class ThemeManager {
    private currentTheme: 'light' | 'dark' = 'light';

    constructor() {
        this.initTheme();
    }

    private initTheme(): void {
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
        this.applyTheme(this.currentTheme === 'light' ? 'dark' : 'light');
    }
}

// Modals
import { NupModal } from './modals/NupModal';
import { MergeModal } from './modals/MergeModal';
import { SplitModal } from './modals/SplitModal';
import { CompressModal } from './modals/CompressModal';
import { RotateModal } from './modals/RotateModal';
import { WatermarkModal } from './modals/WatermarkModal';
import { ProtectModal } from './modals/ProtectModal';
import { OrganiseModal } from './modals/OrganiseModal';
import { ImagesToPdfModal } from './modals/ImagesToPdfModal';
import { PdfToJpgModal } from './modals/PdfToJpgModal';
import { RepairModal } from './modals/RepairModal';
import { UnlockModal } from './modals/UnlockModal';
import { PageNumbersModal } from './modals/PageNumbersModal';
import { CropModal } from './modals/CropModal';
import { SignModal } from './modals/SignModal';
import { RedactModal } from './modals/RedactModal';
import { CompareModal } from './modals/CompareModal';
import { FormsModal } from './modals/FormsModal';
import { EditPdfModal } from './modals/EditPdfModal';
import { PdfToMarkdownModal } from './modals/PdfToMarkdownModal';
import { HtmlToPdfModal } from './modals/HtmlToPdfModal';
import { OfficeConvertModal } from './modals/OfficeConvertModal';
import { OcrModal } from './modals/OcrModal';
import { SummariseModal } from './modals/SummariseModal';
import { TranslateModal } from './modals/TranslateModal';

// Global references
declare global {
    interface Window {
        modalManager: ModalManager;
    }
}

const CATEGORIES: { id: ToolCategory; label: string; blurb: string }[] = [
    { id: 'organise', label: 'Organise PDF', blurb: 'Merge, split, reorder and arrange your pages.' },
    { id: 'optimize', label: 'Optimize PDF', blurb: 'Shrink, repair and enhance your documents.' },
    { id: 'convert', label: 'Convert PDF', blurb: 'Office formats, images and HTML — in both directions.' },
    { id: 'edit', label: 'Edit PDF', blurb: 'Annotate, number, crop, sign and fill.' },
    { id: 'security', label: 'PDF Security', blurb: 'Encrypt, unlock, redact and compare.' },
    { id: 'intelligence', label: 'PDF Intelligence', blurb: 'Summaries, translation and markdown.' }
];

class ILovePDFApp {
    private modalManager: ModalManager;
    private toastManager: ToastManager;
    private themeManager: ThemeManager;
    private modals: Record<string, { show(): void }>;

    private tools: Tool[] = [
        // Organise
        { id: 'merge', name: 'Merge PDF', icon: 'link', description: 'Combine multiple PDFs into a single document', category: 'organise', badge: 'Popular' },
        { id: 'split', name: 'Split PDF', icon: 'cut', description: 'Split a PDF into multiple files by page range', category: 'organise' },
        { id: 'organise', name: 'Organise PDF', icon: 'sort', description: 'Reorder and delete pages visually with thumbnails', category: 'organise', badge: 'NEW' },
        { id: 'scan', name: 'Scan to PDF', icon: 'camera', description: 'Capture or pick photos and turn them into a PDF', category: 'organise' },
        { id: 'nup', name: 'N-up PDF', icon: 'th-large', description: 'Print multiple pages on a single sheet. Save paper.', category: 'organise', featured: true, badge: 'NEW' },
        // Optimize
        { id: 'compress', name: 'Compress PDF', icon: 'compress-arrows-alt', description: 'Shrink file size with quality presets', category: 'optimize' },
        { id: 'repair', name: 'Repair PDF', icon: 'wrench', description: 'Attempt to fix a damaged or corrupted PDF', category: 'optimize' },
        { id: 'ocr', name: 'OCR PDF', icon: 'font', description: 'Make scanned PDFs searchable and selectable', category: 'optimize' },
        // Convert
        { id: 'pdf-to-word', name: 'PDF to Word', icon: 'file-word', description: 'Editable DOCX from your PDF', category: 'convert' },
        { id: 'pdf-to-ppt', name: 'PDF to PowerPoint', icon: 'file-powerpoint', description: 'Turn PDF pages into PPTX slides', category: 'convert' },
        { id: 'pdf-to-excel', name: 'PDF to Excel', icon: 'file-excel', description: 'Extract tables into an XLSX spreadsheet', category: 'convert' },
        { id: 'word-to-pdf', name: 'Word to PDF', icon: 'file-import', description: 'DOC and DOCX to high-fidelity PDF', category: 'convert' },
        { id: 'ppt-to-pdf', name: 'PowerPoint to PDF', icon: 'file-import', description: 'PPT and PPTX slides to PDF', category: 'convert' },
        { id: 'excel-to-pdf', name: 'Excel to PDF', icon: 'file-import', description: 'XLS and XLSX spreadsheets to PDF', category: 'convert' },
        { id: 'pdf-to-jpg', name: 'PDF to JPG', icon: 'file-image', description: 'Export every page as a JPEG image', category: 'convert' },
        { id: 'jpg-to-pdf', name: 'JPG to PDF', icon: 'images', description: 'Combine images into a single PDF', category: 'convert' },
        { id: 'html-to-pdf', name: 'HTML to PDF', icon: 'code', description: 'Render HTML markup into a PDF document', category: 'convert' },
        // Edit
        { id: 'edit-pdf', name: 'Edit PDF', icon: 'pen-to-square', description: 'Add text and images anywhere on your pages', category: 'edit', badge: 'NEW' },
        { id: 'watermark', name: 'Add Watermark', icon: 'stamp', description: 'Stamp text diagonally across every page', category: 'edit' },
        { id: 'rotate', name: 'Rotate PDF', icon: 'redo', description: 'Rotate pages in your PDF document', category: 'edit' },
        { id: 'page-numbers', name: 'Page Numbers', icon: 'list-ol', description: 'Stamp page numbers with position and format options', category: 'edit' },
        { id: 'crop', name: 'Crop PDF', icon: 'crop-alt', description: 'Trim margins from every page', category: 'edit' },
        { id: 'forms', name: 'PDF Forms', icon: 'list-check', description: 'Fill in interactive PDF form fields', category: 'edit' },
        // Security
        { id: 'sign', name: 'Sign PDF', icon: 'signature', description: 'Draw your signature and place it on the document', category: 'security', badge: 'NEW' },
        { id: 'unlock', name: 'Unlock PDF', icon: 'lock-open', description: 'Remove restrictions from PDFs you own', category: 'security' },
        { id: 'protect', name: 'Protect PDF', icon: 'lock', description: 'Real AES-256 password encryption', category: 'security', badge: 'NEW' },
        { id: 'compare', name: 'Compare PDF', icon: 'code-compare', description: 'Spot differences between two versions', category: 'security' },
        { id: 'redact', name: 'Redact PDF', icon: 'eraser', description: 'Permanently black out sensitive areas', category: 'security' },
        // Intelligence
        { id: 'summarise', name: 'AI Summariser', icon: 'brain', description: 'Summarise any PDF — your key stays in your browser', category: 'intelligence', badge: 'NEW' },
        { id: 'translate', name: 'Translate PDF', icon: 'language', description: 'Translate PDF text into 20+ languages', category: 'intelligence' },
        { id: 'markdown', name: 'PDF to Markdown', icon: 'file-lines', description: 'Extract PDF text as clean Markdown', category: 'intelligence' }
    ];

    constructor() {
        this.modalManager = new ModalManager();
        this.toastManager = new ToastManager();
        this.themeManager = new ThemeManager();

        const mm = this.modalManager;
        const tm = this.toastManager;

        this.modals = {
            nup: new NupModal(mm, tm),
            merge: new MergeModal(mm, tm),
            split: new SplitModal(mm, tm),
            compress: new CompressModal(mm, tm),
            rotate: new RotateModal(mm, tm),
            watermark: new WatermarkModal(mm, tm),
            protect: new ProtectModal(mm, tm),
            organise: new OrganiseModal(mm, tm),
            scan: new ImagesToPdfModal(mm, tm, { id: 'scan-modal', title: 'Scan to PDF', capture: true }),
            'jpg-to-pdf': new ImagesToPdfModal(mm, tm, { id: 'jpg-to-pdf-modal', title: 'JPG to PDF', capture: false }),
            'pdf-to-jpg': new PdfToJpgModal(mm, tm),
            repair: new RepairModal(mm, tm),
            unlock: new UnlockModal(mm, tm),
            'page-numbers': new PageNumbersModal(mm, tm),
            crop: new CropModal(mm, tm),
            sign: new SignModal(mm, tm),
            redact: new RedactModal(mm, tm),
            compare: new CompareModal(mm, tm),
            forms: new FormsModal(mm, tm),
            'edit-pdf': new EditPdfModal(mm, tm),
            markdown: new PdfToMarkdownModal(mm, tm),
            'html-to-pdf': new HtmlToPdfModal(mm, tm),
            'pdf-to-word': new OfficeConvertModal(mm, tm, { id: 'pdf-to-word-modal', title: 'PDF to Word', icon: 'file-word', direction: 'from-pdf', outputFormat: 'docx', outputLabel: 'Word (.docx)' }),
            'pdf-to-ppt': new OfficeConvertModal(mm, tm, { id: 'pdf-to-ppt-modal', title: 'PDF to PowerPoint', icon: 'file-powerpoint', direction: 'from-pdf', outputFormat: 'pptx', outputLabel: 'PowerPoint (.pptx)' }),
            'pdf-to-excel': new OfficeConvertModal(mm, tm, { id: 'pdf-to-excel-modal', title: 'PDF to Excel', icon: 'file-excel', direction: 'from-pdf', outputFormat: 'xlsx', outputLabel: 'Excel (.xlsx)' }),
            'word-to-pdf': new OfficeConvertModal(mm, tm, { id: 'word-to-pdf-modal', title: 'Word to PDF', icon: 'file-word', direction: 'to-pdf', outputFormat: 'pdf', accept: '.doc,.docx,.odt,.rtf,.txt', acceptLabel: 'DOC, DOCX, ODT, RTF or TXT' }),
            'ppt-to-pdf': new OfficeConvertModal(mm, tm, { id: 'ppt-to-pdf-modal', title: 'PowerPoint to PDF', icon: 'file-powerpoint', direction: 'to-pdf', outputFormat: 'pdf', accept: '.ppt,.pptx,.odp', acceptLabel: 'PPT, PPTX or ODP' }),
            'excel-to-pdf': new OfficeConvertModal(mm, tm, { id: 'excel-to-pdf-modal', title: 'Excel to PDF', icon: 'file-excel', direction: 'to-pdf', outputFormat: 'pdf', accept: '.xls,.xlsx,.ods,.csv', acceptLabel: 'XLS, XLSX, ODS or CSV' }),
            ocr: new OcrModal(mm, tm),
            summarise: new SummariseModal(mm, tm),
            translate: new TranslateModal(mm, tm)
        };

        window.modalManager = this.modalManager;

        this.init();
    }

    private init(): void {
        this.renderTools();
        this.setupEventListeners();
        this.setupKeyboardShortcuts();
        renderStats();

        console.log('%c[PaperMosaic] TypeScript app initialized successfully.', 'color:#777');
    }

    private renderTools(): void {
        const container = document.getElementById('tools-sections')!;

        container.innerHTML = CATEGORIES.map(cat => {
            const cards = this.tools
                .filter(t => t.category === cat.id)
                .map(tool => this.toolCardHTML(tool))
                .join('');

            return `
                <div class="mb-10 tool-category" data-category="${cat.id}">
                    <h3 class="font-bold text-xl tracking-tight">${cat.label}</h3>
                    <p class="text-sm text-[#666] dark:text-[#a1a1aa] mt-0.5 mb-4">${cat.blurb}</p>
                    <div class="tool-grid">${cards}</div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('[data-tool-id]').forEach(card => {
            card.addEventListener('click', () => {
                const toolId = card.getAttribute('data-tool-id')!;
                this.openTool(toolId);
            });
        });
    }

    private toolCardHTML(tool: Tool): string {
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
            <div class="mono-card cursor-pointer p-5 rounded-3xl ${featuredBorder}" data-tool-id="${tool.id}" data-search="${(tool.name + ' ' + tool.description).toLowerCase()}">
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
    }

    private setupEventListeners(): void {
        const browseBtn = document.getElementById('browse-tools-btn');
        const tryNupBtn = document.getElementById('try-nup-btn');
        const loginBtn = document.getElementById('login-btn');
        const signupBtn = document.getElementById('signup-btn');
        const themeToggle = document.getElementById('theme-toggle');
        const navToolsLink = document.getElementById('nav-tools-link');
        const searchInput = document.getElementById('tool-search') as HTMLInputElement | null;
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');
        const mobileMenu = document.getElementById('mobile-menu');

        const scrollToTools = () => {
            document.getElementById('tools-section')?.scrollIntoView({ behavior: 'smooth' });
        };

        if (navToolsLink) {
            navToolsLink.addEventListener('click', (e) => {
                e.preventDefault();
                scrollToTools();
            });
        }

        if (browseBtn) browseBtn.addEventListener('click', scrollToTools);
        if (tryNupBtn) tryNupBtn.addEventListener('click', () => this.openTool('nup'));
        if (loginBtn) loginBtn.addEventListener('click', () => this.showLoginModal());
        if (signupBtn) signupBtn.addEventListener('click', () => this.showLoginModal());
        if (themeToggle) themeToggle.addEventListener('click', () => this.themeManager.toggle());

        // Tool search filter
        if (searchInput) {
            searchInput.addEventListener('input', () => this.filterTools(searchInput.value));
        }

        // Mobile menu
        if (mobileMenuBtn && mobileMenu) {
            mobileMenuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                mobileMenu.classList.toggle('hidden');
                mobileMenu.classList.toggle('flex');
            });

            document.addEventListener('click', (e) => {
                if (!mobileMenu.contains(e.target as Node) && e.target !== mobileMenuBtn) {
                    mobileMenu.classList.add('hidden');
                    mobileMenu.classList.remove('flex');
                }
            });

            document.getElementById('mobile-tools-link')?.addEventListener('click', (e) => {
                e.preventDefault();
                mobileMenu.classList.add('hidden');
                scrollToTools();
            });
            document.getElementById('mobile-login-btn')?.addEventListener('click', () => {
                mobileMenu.classList.add('hidden');
                this.showLoginModal();
            });
            document.getElementById('mobile-signup-btn')?.addEventListener('click', () => {
                mobileMenu.classList.add('hidden');
                this.showLoginModal();
            });
        }
    }

    private filterTools(query: string): void {
        const q = query.trim().toLowerCase();
        let anyVisible = false;

        document.querySelectorAll<HTMLElement>('[data-tool-id]').forEach(card => {
            const haystack = card.getAttribute('data-search') ?? '';
            const match = q === '' || haystack.includes(q);
            card.style.display = match ? '' : 'none';
            if (match) anyVisible = true;
        });

        document.querySelectorAll<HTMLElement>('.tool-category').forEach(section => {
            const visibleCards = section.querySelectorAll('[data-tool-id]:not([style*="display: none"])');
            section.style.display = q !== '' && visibleCards.length === 0 ? 'none' : '';
        });

        const empty = document.getElementById('tools-empty');
        if (empty) empty.classList.toggle('hidden', anyVisible);
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
                document.getElementById('tool-search')?.focus();
                scrollIntoViewIfNeeded(document.getElementById('tools-section'));
            }
        });

        const scrollIntoViewIfNeeded = (el: HTMLElement | null) => {
            el?.scrollIntoView({ behavior: 'smooth' });
        };
    }

    private openTool(toolId: string): void {
        const modal = this.modals[toolId];
        if (modal) {
            modal.show();
        } else {
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
                                <input type="email" value="demo@papermosaic.example" class="border px-4 py-[10px] w-full text-sm rounded-2xl border-[#d1d5db] dark:border-[#404040]">
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

        setTimeout(() => {
            const submitBtn = document.getElementById('login-submit-btn');
            if (submitBtn) {
                submitBtn.addEventListener('click', () => {
                    submitBtn.innerHTML = `<span class="flex items-center justify-center gap-x-2"><i class="fa-solid fa-spinner fa-spin"></i> Signing in...</span>`;

                    setTimeout(() => {
                        const modal = submitBtn.closest('.fixed');
                        if (modal) modal.remove();
                        this.toastManager.show({ message: 'Successfully signed in. Welcome back!' });
                    }, 1200);
                });
            }
        }, 100);
    }
}

// Initialize the app
new ILovePDFApp();
