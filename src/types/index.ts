export interface Tool {
    id: string;
    name: string;
    icon: string;
    description: string;
    badge?: string;
    featured?: boolean;
}

export type NupArrangement = 'horizontal' | 'vertical';
export type NupScaling = 'fit' | 'fill';
export type NupOrder = 'row-major' | 'column-major';
export type SheetOrientation = 'portrait' | 'landscape';

export interface NupOptions {
    pagesPerSheet: number;
    arrangement: NupArrangement;
    paperSizeId: string;
    orientation: SheetOrientation;
    scaling: NupScaling;
    order: NupOrder;
    marginMm: number;
    gutterMm: number;
    drawBorder: boolean;
}

export interface MergeFile {
    id: string;
    file: File;
    name: string;
    size: number;
}

export type ModalType =
    | 'merge'
    | 'nup'
    | 'split'
    | 'compress'
    | 'convert'
    | 'rotate'
    | 'watermark'
    | 'protect'
    | 'login';

export interface ToastOptions {
    message: string;
    duration?: number;
    showDownload?: boolean;
    isError?: boolean;
}
