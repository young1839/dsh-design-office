/**
 * Bug 检查：边界情况验证
 *
 * 疑点清单：
 * 1. asset_download 许可是否硬编码（应为 Iconify 返回的真实许可）
 * 2. 图标嵌入是否支持本地路径（asset_download 产物）
 * 3. fillTemplate 标题含 $ 符号时 JS replace 注入
 * 4. Word 水印 XML 位置（OOXML 规范：<w:background> 应在 </w:body> 前）
 * 5. purge 路径前缀校验漏洞（/assets 与 /assets2 误匹配）
 * 6. splitPdf 页码边界（0 / 超界 / 非法格式）
 */
import { AssetService } from '../lib/services/asset-service.js';
import { iconToPng } from '../lib/services/render-service.js';
import { fillTemplate, readPptx } from '../lib/tools/ppt.js';
import { createDocx } from '../lib/tools/docx.js';
import { splitPdf } from '../lib/tools/pdf.js';
import JSZip from 'jszip';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ws = path.join(__dirname, '..', 'workspace');
const assetSvc = new AssetService(ws);
let pass = 0;
let fail = 0;

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${name} ${detail}`); }
  else { fail++; console.log(`  ✗ ${name} ${detail}`); }
}

async function main() {
  console.log('=== 疑点 1：asset_download 许可元数据 ===');
  try {
    const meta = await assetSvc.download('mdi:star', 'FF0000');
    console.log('  下载 mdi:star 的许可:', JSON.stringify(meta.license));
    check('许可非硬编码 Apache-2.0', meta.license.spdx === 'Apache-2.0', `(spdx=${meta.license.spdx})`);
    // 再下载一个 MIT 集的图标
    const meta2 = await assetSvc.download('line-md:car-light');
    check('MIT 图标许可正确', meta2.license.spdx === 'MIT', `(spdx=${meta2.license.spdx})`);
  } catch (e) {
    check('asset_download 许可', false, String(e));
  }

  console.log('\n=== 疑点 2：本地路径图标嵌入 ===');
  try {
    // 模拟 asset_download 产物（本地 svg 路径）作为 icon 参数
    const localSvg = path.join(ws, 'assets', '97c1ab7ecc71e31d.svg');
    const result = await iconToPng(localSvg, 48);
    check('本地 SVG 路径 → PNG', result.rendering === 'sharp', `(${result.error || 'ok'})`);
  } catch (e) {
    check('本地 SVG 路径 → PNG', false, String(e));
  }

  console.log('\n=== 疑点 3：fillTemplate 标题含 $ 符号 ===');
  try {
    const template = path.join(ws, 'demo-tech.pptx');
    const out1 = path.join(ws, 'bug-test-dollar.pptx');
    await fillTemplate(template, out1, [{ slide: 1, title: '2027 预算 $500K & 增长' }]);
    const md1 = await readPptx(out1);
    check('标题 $500K 保留', md1.includes('$500K'), `(md=${md1.split('\n')[1]})`);
  } catch (e) {
    check('标题 $ 符号', false, String(e));
  }

  console.log('\n=== 疑点 4：Word 水印 XML 位置 ===');
  try {
    const docxOut = path.join(ws, 'bug-test-watermark.docx');
    await createDocx(docxOut, '水印测试', [{ type: 'paragraph', text: '正文内容' }], { watermark: '机密' });
    const zip = await JSZip.loadAsync(await readFile(docxOut));
    const docXml = await zip.file('word/document.xml').async('string');
    const bodyIdx = docXml.indexOf('<w:body>');
    // 水印采用页眉 VML 方案（Word 标准做法），不再注入 document.xml 的 <w:background>
    const docHasWm = docXml.includes('<w:watermark>');
    check('document.xml 不再注入 watermark', !docHasWm);
    // 背景色元素仍唯一且在 body 内
    const bgCount = (docXml.match(/<w:background/g) || []).length;
    check('背景元素唯一', bgCount <= 1, `(count=${bgCount})`);
    // 水印在 header1.xml 内（页眉方案）
    const headerPath = Object.keys(zip.files).find((f) => /word\/header\d+\.xml$/.test(f));
    check('存在页眉文件', !!headerPath, `(${headerPath || 'none'})`);
    if (headerPath) {
      const hx = await zip.file(headerPath).async('string');
      check('水印 shape 在页眉内', hx.includes('PowerPlusWaterMarkObject') && hx.includes('机密'), '');
    }
  } catch (e) {
    check('水印位置', false, String(e));
  }

  console.log('\n=== 疑点 5：purge 路径前缀校验 ===');
  try {
    // 构造一个相似路径的文件，确认不会被误删
    await mkdir(path.join(ws, 'assets2'), { recursive: true });
    const fakeFile = path.join(ws, 'assets2', 'keep.txt');
    await writeFile(fakeFile, 'keep me');
    try {
      await assetSvc.purge(path.join(ws, 'assets', '..', 'assets2', 'keep.txt'));
      // 上面这个路径 resolve 后是 assets2/keep.txt，若校验用 startsWith(assetsDir) 会误判
      const keep = await readFile(fakeFile, 'utf8').catch(() => null);
      check('非素材库文件未被误删', keep === 'keep me');
    } catch (e) {
      // 抛错也是可接受的（拒绝删除）
      const keep = await readFile(fakeFile, 'utf8').catch(() => null);
      check('非素材库文件未被误删（抛错）', keep === 'keep me', `(${String(e).slice(0, 40)})`);
    }
  } catch (e) {
    check('purge 校验', false, String(e));
  }

  console.log('\n=== 疑点 6：splitPdf 页码边界 ===');
  try {
    const pdfOut = path.join(ws, 'demo-report.pdf');
    const splitDir = path.join(ws, 'bug-split');
    // 非法页码 0
    const r0 = await splitPdf(pdfOut, splitDir, '0');
    check('页码 0 被忽略', r0.files.length === 0, `(files=${r0.files.length})`);
    // 超界页码 99
    const r99 = await splitPdf(pdfOut, splitDir, '99');
    check('超界 99 被忽略', r99.files.length === 0, `(files=${r99.files.length})`);
    // 非法格式 abc
    const rabc = await splitPdf(pdfOut, splitDir, 'abc');
    check('非法格式被忽略', rabc.files.length === 0, `(files=${rabc.files.length})`);
    // 混合 "1,3,99"
    const rmix = await splitPdf(pdfOut, splitDir, '1,3,99');
    check('混合格式 1,3,99 → 2 页', rmix.files.length === 2, `(files=${rmix.files.length})`);
  } catch (e) {
    check('splitPdf 边界', false, String(e));
  }

  console.log(`\n=== 结果: ${pass} 通过, ${fail} 失败 ===`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error('FAIL:', e); process.exit(1); });
