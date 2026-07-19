/// <reference types="vite/client" />

declare module '*.css' {
  const content: string;
  export default content;
}

declare module '@jspawn/qpdf-wasm' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const init: (options?: { locateFile?: (file: string) => string }) => Promise<any>;
  export default init;
}

declare module '@jspawn/qpdf-wasm/qpdf.wasm?url' {
  const url: string;
  export default url;
}
