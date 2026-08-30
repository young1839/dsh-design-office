/**
 * Word 模块：design_docx_create / doc_read_docx
 *
 * 知识点（docx 库 → OOXML WordprocessingML）：
 * - Document + sections + children 结构
 * - Paragraph / TextRun（bold/color/size/font）富文本
 * - Table / TableRow / TableCell + shading（<w:shd>）条纹表
 * - ImageRun（<w:drawing> + media 嵌入）封面插画
 * - Header 页眉（图标/标题条）
 * - watermark 水印（VML/XML）
 * - section background 背景色（深色封面）
 * - 中文字体：TextRun font 指定 Noto Sans SC / 微软雅黑
 */
import z from '@deepseek-ai/schemastery';
import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { defineToolCompat } from '../lib/tool-register.js';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';

type DocxBlock =
  | { type: 'heading'; text?: string; level?: number }
  | { type: 'paragraph'; text?: string }
  | { type: 'list'; items?: string[] }
  | { type: 'table'; headers?: string[]; rows?: string[][] };

/** 生成设计增强 Word 文档 */
export async function createDocx(
  destinationPath: string,
  title: string,
  blocks: DocxBlock[],
  opts: { watermark?: string; background?: string; accent?: string; coverImage?: Buffer } = {},
): Promise<{ file: string; note: string }> {
  const out = path.resolve(destinationPath);
  const accent = opts.accent ?? '1E3A8A';

  // 标题段落（标题1）
  const titleParagraph = new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 300 },
    children: [new TextRun({ text: title, bold: true, size: 32, color: accent, font: 'Noto Sans SC' })],
  });

  // 正文块
  const bodyChildren: (Paragraph | Table)[] = [titleParagraph];
  for (const b of blocks) {
    if (b.type === 'heading') {
      const level = b.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
      bodyChildren.push(
        new Paragraph({
          heading: level,
          spacing: { before: 200, after: 100 },
          children: [new TextRun({ text: b.text ?? '', bold: true, size: b.level === 2 ? 24 : 20, color: accent, font: 'Noto Sans SC' })],
        }),
      );
    } else if (b.type === 'paragraph') {
      bodyChildren.push(
        new Paragraph({
          spacing: { after: 120 },
          children: [new TextRun({ text: b.text ?? '', size: 21, font: 'Noto Sans SC' })],
        }),
      );
    } else if (b.type === 'list') {
      for (const item of b.items ?? []) {
        bodyChildren.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 80 },
            children: [new TextRun({ text: item, size: 21, font: 'Noto Sans SC' })],
          }),
        );
      }
    } else if (b.type === 'table' && b.headers) {
      // 条纹表格：表头深色 + 交替行浅色
      const headerCells = b.headers.map(
        (h) =>
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: accent, color: 'auto' },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 20, font: 'Noto Sans SC' })] })],
          }),
      );
      const bodyRows = (b.rows ?? []).map((row, ri) => {
        const cells = row.map(
          (cell) =>
            new TableCell({
              shading: { type: ShadingType.CLEAR, fill: ri % 2 === 1 ? 'F3F4F6' : 'FFFFFF', color: 'auto' },
              children: [new Paragraph({ children: [new TextRun({ text: cell, size: 19, font: 'Noto Sans SC' })] })],
            }),
        );
        return new TableRow({ children: cells });
      });
      bodyChildren.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [new TableRow({ children: headerCells }), ...bodyRows],
        }),
      );
      bodyChildren.push(new Paragraph({ spacing: { after: 120 } }));
    }
  }

  // 封面段落（如果提供封面图）
  const coverChildren: Paragraph[] = [];
  if (opts.coverImage) {
    coverChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 600, after: 300 },
        children: [
          new ImageRun({
            type: 'png',
            data: opts.coverImage,
            transformation: { width: 240, height: 160 },
          }),
        ],
      }),
    );
    coverChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 600 },
        children: [new TextRun({ text: title, bold: true, size: 48, color: accent, font: 'Noto Sans SC' })],
      }),
    );
  }

  // 页眉（标题条）
  const header = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: title, size: 16, color: '9CA3AF', font: 'Noto Sans SC' })],
      }),
    ],
  });

  // 文档（支持背景色）
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Noto Sans SC', size: 21 },
        },
      },
    },
    background: opts.background ? { color: opts.background } : undefined,
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1000, bottom: 1000, left: 1200, right: 1200 },
          },
        },
        headers: { default: header },
        children: [...coverChildren, ...bodyChildren],
      },
    ],
  });

  // 打包输出
  let buf = await Packer.toBuffer(doc);

  // 水印注入（post-process：docx 库不支持 watermark，需解包改 XML）
  if (opts.watermark) {
    buf = await injectWatermark(buf, opts.watermark);
  }

  await writeFile(out, buf);
  return { file: out, note: `Word 已生成（${blocks.length} 个内容块，封面${opts.coverImage ? '含插画' : '无'}${opts.watermark ? '，水印：' + opts.watermark : ''}${opts.background ? '，背景色' : ''}）` };
}

/**
 * 注入 Word 水印（OOXML <w:watermark>）
 *
 * 知识点：
 * - 水印是 <w:document> 下 <w:background><w:watermark>，包含 VML 形状 <v:shape> 文字
 * - VML 命名空间：xmlns:v="urn:schemas-microsoft-com:vml" + xmlns:o="urn:schemas-microsoft-com:office:office"
 * - 旋转 -30°、半透明灰、宋体
 */
async function injectWatermark(docxBuffer: Buffer, text: string): Promise<Buffer> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(docxBuffer);
  const docPath = Object.keys(zip.files).find((f) => f === 'word/document.xml');
  if (!docPath) return docxBuffer;
  let xml = await zip.file(docPath)!.async('string');

  // docx 库生成的 document.xml 已自带 xmlns:v / xmlns:o（VML 命名空间），无需重复声明
  // 但保险起见，若缺失则补上
  if (!xml.includes('xmlns:v=')) {
    xml = xml.replace('<w:document ', '<w:document xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" ');
  }

  const watermarkXml = `<w:background w:color="FFFFFF"><w:watermark><v:shape id="PowerPlusWaterMarkObject" o:spid="_x0000_s1025" type="#_x0000_t136" style="position:absolute;margin-left:0;margin-top:0;width:500pt;height:250pt;z-index:-251658752;mso-wrap-edited:f;mso-position-horizontal:center;mso-position-horizontal-relative:margin;mso-position-vertical:center;mso-position-vertical-relative:margin" o:allowincell="f" filled="f" stroked="f"><v:fill opacity="0.15"/><v:textpath style="font-family:&quot;宋体&quot;;font-size:1pt" string="${text}"/></v:shape></w:watermark></w:background>`;

  // 插到 <w:body> 之前
  xml = xml.replace('</w:body>', `${watermarkXml}</w:body>`);
  zip.file(docPath, xml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** 读取 Word 文本（mammoth） */
export async function readDocx(filePath: string): Promise<string> {
  const abs = path.resolve(filePath);
  const buf = await readFile(abs);
  try {
    const mammoth = (await import('mammoth')).default;
    const result = await mammoth.extractRawText({ buffer: buf });
    return result.value;
  } catch (e) {
    return `[mammoth 读取失败] ${abs}: ${String(e)}`;
  }
}

export function registerDocxTools(ctx: any, register: any) {
  register(defineToolCompat({
    name: 'design_docx_create',
    description: '生成设计增强 Word 文档：标题/段落/表格（条纹）/列表；可选封面插画、页眉、水印。',
    parameters: z.object({
      destination_path: z.string(),
      title: z.string(),
      blocks: z.array(
        z.object({
          type: z.union(['heading', 'paragraph', 'table', 'list']),
          text: z.string().required(false),
          level: z.number().required(false),
          headers: z.array(z.string()).required(false),
          rows: z.array(z.array(z.string())).required(false),
          items: z.array(z.string()).required(false),
        }),
      ),
      watermark: z.string().required(false).description('水印文字（如"机密"）'),
      background: z.string().required(false).description('页面背景色 hex'),
      accent: z.string().required(false).description('强调色（标题/表头）'),
      cover_image: z.string().required(false).description('封面图片路径（PNG）'),
    }),
    async execute(args: any) {
      let coverImage: Buffer | undefined;
      if (args.cover_image) {
        coverImage = await readFile(path.resolve(args.cover_image));
      }
      return createDocx(args.destination_path, args.title, args.blocks, {
        watermark: args.watermark,
        background: args.background,
        accent: args.accent,
        coverImage,
      });
    },
  }));

  register(defineToolCompat({
    name: 'doc_read_docx',
    description: '读取 Word 文档文本。',
    parameters: z.object({ file_path: z.string() }),
    async execute(args: { file_path: string }) {
      return readDocx(args.file_path);
    },
  }));
}
