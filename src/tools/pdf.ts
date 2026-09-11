/**
 * PDF 模块：design_pdf_create / doc_read_pdf / doc_merge_pdf / doc_split_pdf
 *
 * 知识点：
 * - pdfkit 原生支持：
 *   - linearGradient(x1,y1,x2,y2) + gradient.stop(0,color).stop(1,color) 渐变封面
 *   - doc.font(path) 字体嵌入（Noto Sans CJK OTF）
 *   - doc.rect()/doc.circle()/doc.polygon() 矢量形状
 *   - doc.image(buf, x, y, {width,height}) 图片嵌入
 *   - doc.page 多页 + 页码（bufferedPageRange + switchToPage）
 * - 中文字体：PDF 必须嵌入子集（pdfkit 自动做子集化），否则乱码
 * - pdf-lib：copyPages 合并/拆分
 * - pdf-parse：按页提取文本
 */
import z from '@deepseek-ai/schemastery';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineToolCompat } from '../lib/tool-register.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** 随插件打包的 Noto Sans SC 中文字体 */
export const FONT_PATH = path.join(__dirname, '..', '..', 'assets', 'fonts', 'NotoSansCJKsc-Regular.otf');

type ContentBlock =
  | { type: 'heading'; text?: string; level?: number }
  | { type: 'paragraph'; text?: string }
  | { type: 'list'; items?: string[] }
  | { type: 'table'; headers?: string[]; rows?: string[][] };

/** 生成设计增强 PDF */
export async function createPdf(
  destinationPath: string,
  title: string,
  content: ContentBlock[],
  opts: { pageNumbers?: boolean; gradient?: { from: string; to: string }; accent?: string } = {},
): Promise<{ file: string; note: string }> {
  // 动态导入 pdfkit（ESM 兼容）
  const PDFDocument = (await import('pdfkit')).default;
  const out = path.resolve(destinationPath);
  await mkdir(path.dirname(out), { recursive: true });

  // 检查字体
  let fontOk = false;
  try {
    await readFile(FONT_PATH);
    fontOk = true;
  } catch {
    // 无字体则降级英文
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 60, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => {
      writeFile(out, Buffer.concat(chunks)).then(() => resolve({ file: out, note: fontOk ? 'PDF 已生成（中文字体嵌入）' : 'PDF 已生成（无中文字体，中文可能乱码）' })).catch(reject);
    });
    doc.on('error', reject);

    const from = opts.gradient?.from ?? '#0B3B8C';
    const to = opts.gradient?.to ?? '#00A3FF';
    const accent = opts.accent ?? to;

    // ═══ 封面页：渐变背景 + 大标题 ═══
    const coverH = 841.89; // A4 高 (pt)
    const grad = doc.linearGradient(0, 0, 595.28, coverH); // 对角线
    grad.stop(0, from).stop(1, to);
    doc.rect(0, 0, 595.28, coverH).fill(grad);
    // 装饰圆
    doc.save().circle(500, 100, 80).fillOpacity(0.15).fill('#FFFFFF').restore();
    doc.save().circle(80, 700, 50).fillOpacity(0.1).fill('#FFFFFF').restore();
    // 标题
    if (fontOk) doc.font(FONT_PATH);
    doc.fontSize(36).fillColor('#FFFFFF').text(title, 60, 300, { width: 475, align: 'left' });
    // 副标题：pdfkit 不支持 8 位 hex（#FFFFFF80 会被当 #FFFFFF），用 fillOpacity 实现半透明
    doc.save();
    doc.fillOpacity(0.55);
    doc.fontSize(14).fillColor('#FFFFFF').text('DeepSeek Harness · dsh-design-office', 60, 360, { width: 475 });
    doc.restore();
    doc.moveDown(2);

    // ═══ 内容页 ═══
    doc.addPage();
    // 页眉条
    doc.rect(0, 0, 595.28, 8).fill(accent);
    doc.fillColor('#111827');

    for (const block of content) {
      if (block.type === 'heading') {
        const size = block.level === 2 ? 18 : 24;
        doc.fillColor(accent).fontSize(size).text(block.text ?? '', { lineGap: 6 });
        doc.fillColor('#111827');
      } else if (block.type === 'paragraph') {
        doc.fontSize(12).text(block.text ?? '', { lineGap: 4 });
      } else if (block.type === 'list') {
        for (const item of block.items ?? []) {
          doc.fontSize(12).text(`• ${item}`, { lineGap: 4, indent: 12 });
        }
      } else if (block.type === 'table' && block.headers) {
        // 表头
        const colW = (595.28 - 120) / (block.headers.length || 1);
        let y = doc.y;
        doc.fontSize(11);
        doc.fillColor(accent);
        block.headers.forEach((h, i) => {
          doc.rect(60 + i * colW, y, colW, 24).fill();
          doc.fillColor('#FFFFFF').text(h, 60 + i * colW + 5, y + 6, { width: colW - 10 });
          doc.fillColor(accent);
        });
        y += 24;
        // 行（条纹）
        (block.rows ?? []).forEach((row, ri) => {
          if (ri % 2 === 1) {
            doc.fillColor('#F3F4F6');
            doc.rect(60, y, 595.28 - 120, 22).fill();
          }
          doc.fillColor('#111827');
          row.forEach((cell, ci) => {
            doc.text(cell, 60 + ci * colW + 5, y + 5, { width: colW - 10 });
          });
          y += 22;
        });
        doc.y = y + 10;
      }
      doc.moveDown(0.5);
    }

    // ═══ 页码（全页遍历）═══
    if (opts.pageNumbers !== false) {
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        const pageH = doc.page.height;
        doc.fontSize(9).fillColor('#9CA3AF').text(`- ${i + 1} -`, 0, pageH - 40, { align: 'center', width: 595.28 });
      }
    }

    doc.end();
  });
}

/** 读取 PDF 文本（pdf-parse 按页） */
export async function readPdf(filePath: string, startPage?: number, endPage?: number): Promise<string> {
  const abs = path.resolve(filePath);
  const buf = await readFile(abs);
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buf);
    const pages = data.text.split('\f').filter((p: string) => p.trim());
    const start = startPage ?? 1;
    const end = endPage ?? pages.length;
    const selected = pages.slice(start - 1, end);
    const out = selected.map((p: string, i: number) => `--- Page ${start + i} ---\n${p.trim()}`).join('\n');
    return out;
  } catch (e) {
    return `[pdf-parse 读取失败] ${abs}: ${String(e)}`;
  }
}

/** 合并 PDF（pdf-lib copyPages） */
export async function mergePdf(filePaths: string[], outputPath: string): Promise<{ file: string; count: number }> {
  const { PDFDocument } = await import('pdf-lib');
  const out = path.resolve(outputPath);
  const merged = await PDFDocument.create();
  let count = 0;
  for (const fp of filePaths) {
    const src = await PDFDocument.load(await readFile(path.resolve(fp)));
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
    count += pages.length;
  }
  await writeFile(out, await merged.save());
  return { file: out, count };
}

/** 拆分 PDF（pdf-lib） */
export async function splitPdf(filePath: string, outputDir: string, pages?: string): Promise<{ files: string[] }> {
  const { PDFDocument } = await import('pdf-lib');
  const abs = path.resolve(filePath);
  await mkdir(outputDir, { recursive: true });
  const src = await PDFDocument.load(await readFile(abs));
  const total = src.getPageCount();
  // 解析 "1,3,5-7"
  const wanted: number[] = [];
  if (pages) {
    for (const part of pages.split(',')) {
      const m = part.match(/^(\d+)(?:-(\d+))?$/);
      if (!m) continue;
      const a = parseInt(m[1], 10);
      const b = m[2] ? parseInt(m[2], 10) : a;
      // 边界：忽略 0/负数/超界/反向区间
      if (a < 1 || b < a) continue;
      for (let i = a; i <= Math.min(b, total); i++) wanted.push(i);
    }
  } else {
    for (let i = 1; i <= total; i++) wanted.push(i);
  }
  // 去重 + 排序
  const unique = [...new Set(wanted)].sort((x, y) => x - y);
  const files: string[] = [];
  const base = path.basename(abs, '.pdf');
  for (const pageNum of unique) {
    const doc = await PDFDocument.create();
    const [page] = await doc.copyPages(src, [pageNum - 1]);
    doc.addPage(page);
    const outFile = path.join(outputDir, `${base}-p${pageNum}.pdf`);
    await writeFile(outFile, await doc.save());
    files.push(outFile);
  }
  return { files };
}

export function registerPdfTools(ctx: any, family: { register: (d: any) => any }) {
  const register = family.register;
  register(defineToolCompat({
    name: 'design_pdf_create',
    description: '生成设计增强 PDF：渐变封面 + 标题/段落/表格（条纹）/列表 + 页码 + 中文字体嵌入。',
    parameters: z.object({
      destination_path: z.string().description('输出 .pdf 绝对路径'),
      title: z.string(),
      content: z.array(
        z.object({
          type: z.union(['heading', 'paragraph', 'table', 'list']),
          text: z.string().required(false),
          level: z.number().required(false),
          headers: z.array(z.string()).required(false),
          rows: z.array(z.array(z.string())).required(false),
          items: z.array(z.string()).required(false),
        }),
      ),
      page_numbers: z.boolean().required(false).description('默认 true'),
      gradient: z.object({ from: z.string(), to: z.string() }).required(false).description('封面渐变'),
      accent: z.string().required(false).description('强调色（页眉/表头/标题）'),
    }),
    async execute(args: any) {
      return createPdf(args.destination_path, args.title, args.content, {
        pageNumbers: args.page_numbers ?? true,
        gradient: args.gradient,
        accent: args.accent,
      });
    },
  }));

  register(defineToolCompat({
    name: 'doc_read_pdf',
    description: '读取 PDF 文本（按页，带 --- Page N --- 标记）。大文件用 start_page/end_page 分页续读。',
    parameters: z.object({
      file_path: z.string(),
      start_page: z.number().required(false),
      end_page: z.number().required(false),
    }),
    async execute(args: { file_path: string; start_page?: number; end_page?: number }) {
      return readPdf(args.file_path, args.start_page, args.end_page);
    },
  }));

  register(defineToolCompat({
    name: 'doc_merge_pdf',
    description: '按顺序合并多个 PDF 为一个。',
    parameters: z.object({
      file_paths: z.array(z.string()),
      output_path: z.string(),
    }),
    async execute(args: { file_paths: string[]; output_path: string }) {
      return mergePdf(args.file_paths, args.output_path);
    },
  }));

  register(defineToolCompat({
    name: 'doc_split_pdf',
    description: '拆分 PDF：默认每页一个文件，或按 "1,3,5-7" 抽取指定页。',
    parameters: z.object({
      file_path: z.string(),
      output_dir: z.string(),
      pages: z.string().required(false).description('如 "1,3,5-7"；不填则每页一个'),
    }),
    async execute(args: { file_path: string; output_dir: string; pages?: string }) {
      return splitPdf(args.file_path, args.output_dir, args.pages);
    },
  }));
}
