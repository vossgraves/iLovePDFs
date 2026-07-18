export class ModalManager {
    private activeModal: string | null = null;

    constructor() {
        // container is referenced via DOM
    }

    show(modalId: string): void {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.remove('hidden');
            this.activeModal = modalId;
        }
    }

    hide(modalId: string): void {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
            modal.classList.add('hidden');
            
            // Cleanup specific modals
            if (modalId === 'nup-modal') {
                this.resetNupModal();
            }
            
            this.activeModal = null;
        }
    }

    hideAll(): void {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            (modal as HTMLElement).style.display = 'none';
            modal.classList.add('hidden');
        });
        this.activeModal = null;
    }

    private resetNupModal(): void {
        // Will be handled by NupModal class
    }

    isActive(modalId: string): boolean {
        return this.activeModal === modalId;
    }
}