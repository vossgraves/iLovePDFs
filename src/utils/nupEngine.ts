import type { NupArrangement, NupOrder, NupScaling, SheetOrientation } from '../types';

/**
 * Pure layout math for the N-up tool. No DOM access — everything is
 * computed in PDF points (1/72 inch), origin at bottom-left.
 */

export interface PaperSizeDef {
    id: string;
    label: string;
    widthPt: number;
    heightPt: number;
}

export interface GridSpec {
    rows: number;
    cols: number;
}

export interface SheetDims {
    width: number;
    height: number;
}

export interface CellRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface FitPlacement {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface FillPlacement extends FitPlacement {
    /** Crop region of the source page, passed to pdf-lib's embedPage bounding box. */
    cropBox: { left: number; bottom: number; right: number; top: number };
}

export const PAPER_SIZES: PaperSizeDef[] = [
    { id: 'a5',      label: 'A5',      widthPt: 419.53, heightPt: 595.28 },
    { id: 'a4',      label: 'A4',      widthPt: 595.28, heightPt: 841.89 },
    { id: 'a3',      label: 'A3',      widthPt: 841.89, heightPt: 1190.55 },
    { id: 'letter',  label: 'Letter',  widthPt: 612,    heightPt: 792 },
    { id: 'legal',   label: 'Legal',   widthPt: 612,    heightPt: 1008 },
    { id: 'tabloid', label: 'Tabloid', widthPt: 792,    heightPt: 1224 }
];

export const NUP_CHOICES = [1, 2, 4, 6, 8, 9, 12, 16];

export function mmToPt(mm: number): number {
    return (mm * 72) / 25.4;
}

export function getPaperSize(id: string): PaperSizeDef {
    return PAPER_SIZES.find(p => p.id === id) ?? PAPER_SIZES[1]; // default A4
}

/** Rows × cols for a given N-up count. 'horizontal' = more columns, 'vertical' = more rows. */
export function gridFor(pagesPerSheet: number, arrangement: NupArrangement): GridSpec {
    switch (pagesPerSheet) {
        case 1:  return { rows: 1, cols: 1 };
        case 2:  return arrangement === 'horizontal' ? { rows: 1, cols: 2 } : { rows: 2, cols: 1 };
        case 4:  return { rows: 2, cols: 2 };
        case 6:  return arrangement === 'horizontal' ? { rows: 2, cols: 3 } : { rows: 3, cols: 2 };
        case 8:  return arrangement === 'horizontal' ? { rows: 2, cols: 4 } : { rows: 4, cols: 2 };
        case 9:  return { rows: 3, cols: 3 };
        case 12: return arrangement === 'horizontal' ? { rows: 3, cols: 4 } : { rows: 4, cols: 3 };
        case 16: return { rows: 4, cols: 4 };
        default: return { rows: 2, cols: 2 };
    }
}

export function sheetDims(paper: PaperSizeDef, orientation: SheetOrientation): SheetDims {
    return orientation === 'portrait'
        ? { width: paper.widthPt, height: paper.heightPt }
        : { width: paper.heightPt, height: paper.widthPt };
}

/**
 * Computes the cell rectangles of a sheet, returned in row-major order
 * (top row first). Y is expressed in PDF coordinates (bottom-left origin).
 */
export function computeCells(sheet: SheetDims, grid: GridSpec, marginPt: number, gutterPt: number): CellRect[] {
    const cellW = (sheet.width - marginPt * 2 - gutterPt * (grid.cols - 1)) / grid.cols;
    const cellH = (sheet.height - marginPt * 2 - gutterPt * (grid.rows - 1)) / grid.rows;

    const cells: CellRect[] = [];
    for (let row = 0; row < grid.rows; row++) {
        for (let col = 0; col < grid.cols; col++) {
            cells.push({
                x: marginPt + col * (cellW + gutterPt),
                y: sheet.height - marginPt - (row + 1) * cellH - row * gutterPt,
                width: cellW,
                height: cellH
            });
        }
    }
    return cells;
}

/**
 * Maps the n-th placed page (slot, 0-based) to an index into the row-major
 * cells array. 'column-major' fills top-to-bottom first, then moves right.
 */
export function cellIndexForSlot(slot: number, grid: GridSpec, order: NupOrder): number {
    if (order === 'row-major') return slot;
    const col = Math.floor(slot / grid.rows);
    const row = slot % grid.rows;
    return row * grid.cols + col;
}

/** 'Fit page': scale down preserving aspect ratio, centered inside the cell. */
export function fitPlacement(srcW: number, srcH: number, cell: CellRect): FitPlacement {
    const scale = Math.min(cell.width / srcW, cell.height / srcH);
    const width = srcW * scale;
    const height = srcH * scale;
    return {
        x: cell.x + (cell.width - width) / 2,
        y: cell.y + (cell.height - height) / 2,
        width,
        height
    };
}

/**
 * 'Fill page': scale up preserving aspect ratio until the cell is fully
 * covered; the overflowing part of the source page is cropped (center crop)
 * via the embedPage bounding box.
 */
export function fillPlacement(srcW: number, srcH: number, cell: CellRect): FillPlacement {
    const scale = Math.max(cell.width / srcW, cell.height / srcH);
    const visibleW = Math.min(srcW, cell.width / scale);
    const visibleH = Math.min(srcH, cell.height / scale);
    const left = Math.max(0, (srcW - visibleW) / 2);
    const bottom = Math.max(0, (srcH - visibleH) / 2);

    return {
        x: cell.x,
        y: cell.y,
        width: cell.width,
        height: cell.height,
        cropBox: { left, bottom, right: left + visibleW, top: bottom + visibleH }
    };
}

export function totalSheets(pageCount: number, pagesPerSheet: number): number {
    return Math.max(1, Math.ceil(pageCount / pagesPerSheet));
}

/** Human readable summary used under the preview, e.g. "A4 portrait · 2×2 grid · Fit". */
export function layoutSummary(
    paper: PaperSizeDef,
    orientation: SheetOrientation,
    grid: GridSpec,
    scaling: NupScaling
): string {
    const orientLabel = orientation === 'portrait' ? 'portrait' : 'landscape';
    const scalingLabel = scaling === 'fit' ? 'Fit page' : 'Fill page';
    return `${paper.label} ${orientLabel} · ${grid.cols}×${grid.rows} grid · ${scalingLabel}`;
}
