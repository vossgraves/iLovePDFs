/**
 * Real per-device usage counters stored in localStorage.
 * The app is 100% client-side, so these device-local numbers are the
 * only honest statistics we can display.
 */

export interface UsageStats {
    pdfsProcessed: number;
    nupCreated: number;
    pagesProcessed: number;
}

const STORAGE_KEY = 'ilovepdf-usage-stats';

export function getStats(): UsageStats {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { pdfsProcessed: 0, nupCreated: 0, pagesProcessed: 0 };

        const parsed = JSON.parse(raw) as Partial<UsageStats>;
        return {
            pdfsProcessed: parsed.pdfsProcessed ?? 0,
            nupCreated: parsed.nupCreated ?? 0,
            pagesProcessed: parsed.pagesProcessed ?? 0
        };
    } catch {
        return { pdfsProcessed: 0, nupCreated: 0, pagesProcessed: 0 };
    }
}

/** Records processed work and refreshes the on-page counters. */
export function recordProcessed(entry: { pdfs?: number; nup?: number; pages?: number }): void {
    const stats = getStats();
    stats.pdfsProcessed += entry.pdfs ?? 0;
    stats.nupCreated += entry.nup ?? 0;
    stats.pagesProcessed += entry.pages ?? 0;

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
    } catch {
        // Storage unavailable (private mode etc.) — counters simply won't persist.
    }

    renderStats();
}

/** Writes the current counters into the stats row, if it is present. */
export function renderStats(): void {
    const stats = getStats();
    setText('stat-pdfs-processed', stats.pdfsProcessed);
    setText('stat-nup-created', stats.nupCreated);
    setText('stat-pages-processed', stats.pagesProcessed);
}

function setText(id: string, value: number): void {
    const el = document.getElementById(id);
    if (el) el.textContent = value.toLocaleString('en-US');
}
