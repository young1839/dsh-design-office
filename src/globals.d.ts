/** 类型声明：pdfkit / pdf-parse（无官方类型） */
declare module 'pdfkit' {
  const PDFDocument: any;
  export default PDFDocument;
}

declare module 'pdf-parse' {
  interface PdfParseResult {
    text: string;
    numpages: number;
    info: any;
  }
  function pdfParse(buffer: Buffer, options?: any): Promise<PdfParseResult>;
  export default pdfParse;
}
