/**
 * Excel 模块：design_xlsx_write / doc_read_xlsx / doc_edit_xlsx
 *
 * 知识点（exceljs → SpreadsheetML）：
 * - workbook.addWorksheet → addRow → xlsx.writeFile
 * - 样式：font（bold/color/size）/ fill（pattern solid）/ border / alignment
 * - 条件格式：addConditionalFormatting（cfRule: colorScale/dataBar/iconSet）
 * - 图标表头：workbook.addImage + ws.addImage（cell anchor → <xdr:twoCellAnchor>）
 * - 公式：cell.value = { formula: 'SUM(B2:B9)' }
 * - 读取：eachRow + range 分页（单次 ≤500 行纪律）
 */
import z from '@deepseek-ai/schemastery';
import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { defineToolCompat } from '../lib/tool-register.js';

type CellValue = string | number | boolean | null;

/** 生成设计增强 Excel */
export async function writeXlsx(
  destinationPath: string,
  data: CellValue[][],
  opts: { headerBold?: boolean; sheetName?: string; colWidths?: number[]; colorScale?: boolean; accent?: string; headerIcon?: Buffer } = {},
): Promise<{ file: string; note: string }> {
  const ExcelJS = (await import('exceljs')).default;
  const out = path.resolve(destinationPath);
  const accent = opts.accent ?? '1E3A8A';
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(opts.sheetName ?? 'Sheet1');

  // 写入数据
  for (const row of data) {
    ws.addRow(row);
  }

  // 表头样式
  if (opts.headerBold !== false && data.length > 0) {
    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accent } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'D1D5DB' } } };
    });
    headerRow.height = 22;
  }

  // 列宽
  if (opts.colWidths) {
    opts.colWidths.forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });
  }

  // 条件格式（色阶：对数值列）
  if (opts.colorScale && data.length > 1) {
    const colCount = data[0].length;
    for (let c = 1; c <= colCount; c++) {
      const hasNumbers = data.slice(1).some((r) => typeof r[c - 1] === 'number');
      if (hasNumbers) {
        const ref = `${String.fromCharCode(64 + c)}2:${String.fromCharCode(64 + c)}${data.length}`;
        ws.addConditionalFormatting({
          ref,
          rules: [
            {
              type: 'colorScale',
              priority: 1,
              cfvo: [
                { type: 'min', value: 0 },
                { type: 'max', value: 0 },
              ],
              color: [{ argb: 'FFFDE7' }, { argb: 'FFCDD2' }],
            },
          ],
        });
      }
    }
  }

  // 图标表头（图片锚定 A1）
  if (opts.headerIcon) {
    // exceljs 的 Image.buffer 类型与 Node Buffer 冲突，运行时传入任意字节数组
    const wbAny = wb as any;
    const imageId = wbAny.addImage({ buffer: opts.headerIcon, extension: 'png' });
    ws.addImage(imageId, 'A1:A1');
  }

  await wb.xlsx.writeFile(out);
  return { file: out, note: `Excel 已生成（${data.length} 行 × ${data[0]?.length ?? 0} 列）` };
}

/** 读取 Excel（exceljs + 分页） */
export async function readXlsx(filePath: string, sheet?: string, rangeStart?: string, maxRows = 200): Promise<string> {
  const ExcelJS = (await import('exceljs')).default;
  const abs = path.resolve(filePath);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(abs);
  if (!sheet) {
    // 列出所有工作表
    return `工作表: ${wb.worksheets.map((w) => w.name).join(', ')}`;
  }
  const ws = wb.getWorksheet(sheet);
  if (!ws) throw new Error(`工作表不存在: ${sheet}`);
  // 解析 rangeStart（如 A2）
  let startRow = 1;
  if (rangeStart) {
    const m = rangeStart.match(/^[A-Z]+(\d+)$/i);
    if (m) startRow = parseInt(m[1], 10);
  }
  const rows: string[][] = [];
  const endRow = Math.min(startRow + maxRows, ws.rowCount + 1);
  for (let r = startRow; r < endRow; r++) {
    const row = ws.getRow(r);
    const vals = row.values as unknown[];
    rows.push(vals.slice(1).map((v) => (v === null || v === undefined ? '' : String(v))));
  }
  const md = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  const more = endRow <= ws.rowCount ? `\n\nContinue with range_start: "A${endRow}"` : '';
  return md + more;
}

/** 编辑 Excel（更新单元格） */
export async function editXlsx(filePath: string, cell: string, value: CellValue): Promise<{ modified: boolean }> {
  const ExcelJS = (await import('exceljs')).default;
  const abs = path.resolve(filePath);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(abs);
  const ws = wb.worksheets[0];
  ws.getCell(cell).value = value;
  await wb.xlsx.writeFile(abs);
  return { modified: true };
}

export function registerXlsxTools(ctx: any, family: { register: (d: any) => any }) {
  const register = family.register;
  register(defineToolCompat({
    name: 'design_xlsx_write',
    description: '生成设计增强 Excel：二维数组数据、表头加粗+深色填充、列宽、条件格式色阶、可选图标表头。',
    parameters: z.object({
      destination_path: z.string(),
      data: z.array(z.array(z.union([z.string(), z.number(), z.boolean()]))).description('二维数组（第一行为表头）'),
      header_bold: z.boolean().required(false).description('默认 true'),
      sheet_name: z.string().required(false),
      col_widths: z.array(z.number()).required(false),
      color_scale: z.boolean().required(false).description('数值列加色阶条件格式，默认 true'),
      accent: z.string().required(false).description('表头强调色 hex'),
      header_icon: z.string().required(false).description('表头图标 PNG 路径'),
    }),
    async execute(args: any) {
      let headerIcon: Buffer | undefined;
      if (args.header_icon) headerIcon = await readFile(path.resolve(args.header_icon));
      return writeXlsx(args.destination_path, args.data, {
        headerBold: args.header_bold ?? true,
        sheetName: args.sheet_name,
        colWidths: args.col_widths,
        colorScale: args.color_scale ?? true,
        accent: args.accent,
        headerIcon,
      });
    },
  }));

  register(defineToolCompat({
    name: 'doc_read_xlsx',
    description: '读取 Excel 工作表为 markdown 表格。大文件 range 分页（续读提示）。',
    parameters: z.object({
      file_path: z.string(),
      sheet: z.string().required(false).description('工作表名；不填列出所有'),
      range_start: z.string().required(false).description('如 A2，续读时用'),
      max_rows: z.number().required(false).description('单次最大行数，默认 200'),
    }),
    async execute(args: any) {
      return readXlsx(args.file_path, args.sheet, args.range_start, args.max_rows ?? 200);
    },
  }));

  register(defineToolCompat({
    name: 'doc_edit_xlsx',
    description: '编辑已有 Excel：更新单元格（值或公式）。',
    parameters: z.object({
      file_path: z.string(),
      cell: z.string().description('如 B2'),
      value: z.union([z.string(), z.number(), z.boolean()]),
    }),
    async execute(args: { file_path: string; cell: string; value: CellValue }) {
      return editXlsx(args.file_path, args.cell, args.value);
    },
  }));
}
