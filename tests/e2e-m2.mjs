/**
 * M2 端到端验证脚本：
 * 1. PDF：渐变封面 + 段落/表格/列表 + 页码 + 中文字体 → 读回
 * 2. PDF 合并/拆分
 * 3. Word：标题/段落/表格/列表 → 读回
 * 4. Excel：数据 + 表头 + 条件格式 → 读回
 */
import { createPdf, readPdf, mergePdf, splitPdf } from '../lib/tools/pdf.js';
import { createDocx, readDocx } from '../lib/tools/docx.js';
import { writeXlsx, readXlsx } from '../lib/tools/xlsx.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ws = path.join(__dirname, '..', 'workspace');

async function main() {
  console.log('=== 1. PDF 生成（渐变封面 + 中文字体）===');
  const pdfOut = path.join(ws, 'demo-report.pdf');
  const pdfResult = await createPdf(pdfOut, '2026 年度经营分析报告', [
    { type: 'heading', text: '一、市场综述', level: 2 },
    { type: 'paragraph', text: '2026 年全球经济复苏，新能源产业保持高速增长。中国市场份额持续扩大，技术创新成为核心驱动力。' },
    { type: 'heading', text: '二、关键数据', level: 2 },
    { type: 'table', headers: ['指标', '2025', '2026', '增长率'], rows: [['营收', '120亿', '168亿', '+40%'], ['利润', '15亿', '23亿', '+53%'], ['市占率', '18%', '24%', '+6pp']] },
    { type: 'heading', text: '三、重点工作', level: 2 },
    { type: 'list', items: ['研发投入占比提升至 15%', '海外市场拓展至 20 国', '智能产线全面升级'] },
  ], { gradient: { from: '#0B3B8C', to: '#00A3FF' }, accent: '#0B3B8C' });
  console.log('  生成:', pdfResult.file, '|', pdfResult.note);

  console.log('\n=== 2. PDF 读回 ===');
  const pdfText = await readPdf(pdfOut);
  console.log('  前 300 字:', pdfText.slice(0, 300).replace(/\n/g, ' | '));

  console.log('\n=== 3. PDF 拆分/合并 ===');
  const splitDir = path.join(ws, 'split');
  const splitResult = await splitPdf(pdfOut, splitDir, '1,2');
  console.log('  拆分:', splitResult.files.join(', '));
  const mergeResult = await mergePdf([pdfOut, splitResult.files[0]], path.join(ws, 'demo-merged.pdf'));
  console.log('  合并:', mergeResult.file, '| 总页数:', mergeResult.count);

  console.log('\n=== 4. Word 生成 ===');
  const docxOut = path.join(ws, 'demo-doc.docx');
  const docxResult = await createDocx(docxOut, '项目立项申请书', [
    { type: 'heading', text: '项目背景', level: 2 },
    { type: 'paragraph', text: '本项目旨在建设企业级智能文档平台，实现办公文档的自动化生成与设计增强。' },
    { type: 'heading', text: '预算明细', level: 2 },
    { type: 'table', headers: ['科目', '金额(万)', '备注'], rows: [['人力', '80', '3人×12月'], ['设备', '20', '服务器采购'], ['软件', '15', '授权费用']] },
    { type: 'heading', text: '预期成果', level: 2 },
    { type: 'list', items: ['文档生成效率提升 10 倍', '设计质量对标专业设计', '全流程自动化'] },
  ], { accent: '1E3A8A' });
  console.log('  生成:', docxResult.file, '|', docxResult.note);

  console.log('\n=== 5. Word 读回 ===');
  const docxText = await readDocx(docxOut);
  console.log('  内容片段:', docxText.slice(0, 200).replace(/\n/g, ' | '));

  console.log('\n=== 6. Excel 生成 ===');
  const xlsxOut = path.join(ws, 'demo-data.xlsx');
  const xlsxResult = await writeXlsx(xlsxOut, [
    ['产品', 'Q1', 'Q2', 'Q3', 'Q4', '合计'],
    ['产品A', 120, 150, 180, 210, 660],
    ['产品B', 80, 95, 110, 130, 415],
    ['产品C', 45, 60, 75, 90, 270],
  ], { sheetName: '销售数据', accent: '1E3A8A', colorScale: true, colWidths: [12, 8, 8, 8, 8, 10] });
  console.log('  生成:', xlsxResult.file, '|', xlsxResult.note);

  console.log('\n=== 7. Excel 读回 ===');
  const xlsxText = await readXlsx(xlsxOut, '销售数据');
  console.log('  前 3 行:', xlsxText.split('\n').slice(0, 3).join('\n'));

  console.log('\n=== 全部通过 ===');
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
