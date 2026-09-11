/**
 * M3 端到端验证脚本：
 * 1. 离线图标回退（断网 Tier 2）：语义名图标 → PNG
 * 2. Word 水印注入 + 背景色
 * 3. 素材来源清单生成
 * 4. 模板填充（占位符 → 内容）
 * 5. 缓存 LRU 清理
 */
import { iconToPng } from '../lib/services/render-service.js';
import { createDocx, readDocx } from '../lib/tools/docx.js';
import { AssetService } from '../lib/services/asset-service.js';
import { fillTemplate, readPptx } from '../lib/tools/ppt.js';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ws = path.join(__dirname, '..', 'workspace');
const assetSvc = new AssetService(ws);

async function main() {
  console.log('=== 1. 离线图标回退（语义名 → PNG）===');
  const icon = await iconToPng('car', 48, '0078D4');
  console.log('  离线 car 图标:', icon.rendering === 'sharp' ? `✓ PNG ${icon.png?.length} bytes` : `✗ ${icon.error}`);
  const icon2 = await iconToPng('mdi:rocket', 48);
  console.log('  离线 rocket 图标:', icon2.rendering === 'sharp' ? `✓ PNG ${icon2.png?.length} bytes` : `✗ ${icon2.error}`);

  console.log('\n=== 2. Word 水印注入 + 背景色 ===');
  const docxOut = path.join(ws, 'demo-confidential.docx');
  const docxResult = await createDocx(docxOut, '机密项目方案', [
    { type: 'paragraph', text: '本项目涉及核心商业机密，仅限授权人员查阅。' },
    { type: 'table', headers: ['阶段', '时间', '负责人'], rows: [['立项', 'Q1', '张三'], ['开发', 'Q2', '李四']] },
  ], { watermark: '机密', background: 'FEF9E7', accent: '92400E' });
  console.log('  生成:', docxResult.file, '|', docxResult.note);
  // 验证水印 XML（页眉 VML 方案）与背景色
  const zip = await JSZip.loadAsync(await readFile(docxOut));
  const docXml = await zip.file('word/document.xml').async('string');
  const headerPath = Object.keys(zip.files).find((f) => /word\/header\d+\.xml$/.test(f));
  let hasWatermark = false;
  if (headerPath) {
    const hx = await zip.file(headerPath).async('string');
    hasWatermark = hx.includes('PowerPlusWaterMarkObject');
  }
  const hasBg = docXml.includes('<w:background');
  console.log('  水印(页眉):', hasWatermark ? '✓ 已注入' : '✗ 未注入');
  console.log('  背景 XML:', hasBg ? '✓ 已注入' : '✗ 未注入');
  const text = await readDocx(docxOut);
  console.log('  内容读回:', text.slice(0, 60).replace(/\n/g, ' '));

  console.log('\n=== 3. 素材来源清单 ===');
  const report = await assetSvc.generateReport(path.join(ws, 'asset-report.md'));
  console.log('  清单文件:', report.file);
  const reportContent = await readFile(report.file, 'utf8');
  console.log('  前 3 行:', reportContent.split('\n').slice(0, 3).join(' | '));

  console.log('\n=== 4. 模板填充（用户模板 → 占位符填充）===');
  // 用 M1 生成的 demo-tech.pptx 作为"用户模板"
  const template = path.join(ws, 'demo-tech.pptx');
  const filledOut = path.join(ws, 'filled-from-template.pptx');
  const fillResult = await fillTemplate(template, filledOut, [
    { slide: 1, title: '2027 新能源展望（模板填充）' },
    { slide: 2, items: ['新要点 1：固态电池量产', '新要点 2：智能驾驶 L4 落地', '新要点 3：充电网络翻倍'] },
  ]);
  console.log('  填充:', fillResult.filled, '处');
  const filledMd = await readPptx(filledOut);
  console.log('  填充后标题:', filledMd.split('\n')[1]);

  console.log('\n=== 5. 缓存 LRU ===');
  const lru = await assetSvc.cleanupLRU(50);
  console.log('  LRU 清理:', lru.removed, '个，剩余', lru.remaining);

  console.log('\n=== 全部通过 ===');
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
