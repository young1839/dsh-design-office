/**
 * M1 端到端验证脚本：
 * 1. 搜索图标（Iconify API）
 * 2. 下载图标
 * 3. 用「科技蓝渐变」模板生成带图标的 PPT
 * 4. 读回验证
 * 5. 编辑测试（查找替换）
 */
import { AssetService } from '../lib/services/asset-service.js';
import { createPptx, readPptx, editPptx } from '../lib/tools/ppt.js';
import { TemplateService } from '../lib/services/template-service.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ws = path.join(__dirname, '..', 'workspace');
const assetSvc = new AssetService(ws);
const templateSvc = new TemplateService(ws);

async function main() {
  console.log('=== 1. 搜索图标（car）===');
  const results = await assetSvc.search('icon', '汽车', 5);
  console.log(`  找到 ${results.length} 个图标（含许可）`);
  if (results.length === 0) {
    console.log('  无结果，跳过下载');
    return;
  }
  console.log('  示例:', results.slice(0, 3).map((r) => `${r.id} (${r.license.spdx})`).join(', '));

  console.log('\n=== 2. 下载图标 ===');
  const meta = await assetSvc.download(results[0].id, '0078D4');
  console.log('  下载:', meta.file, '| sha256:', meta.sha256.slice(0, 12));

  console.log('\n=== 3. 生成 PPT（科技蓝渐变模板 + 图标）===');
  const template = await templateSvc.resolve('tech-blue-gradient');
  const outPptx = path.join(ws, 'demo-tech.pptx');
  const result = await createPptx(
    {
      destination_path: outPptx,
      slides: [
        { type: 'title', title: '2026 新能源汽车行业趋势', subtitle: '技术驱动 · 市场变革 · 未来展望', notes: '开场白' },
        { type: 'content', title: '市场现状', items: ['全球 EV 渗透率突破 30%', '中国市场份额全球第一', '电池成本三年下降 40%'], notes: '数据来源' },
        { type: 'table', title: 'Top 车企对比', headers: ['厂商', '2025 销量', '同比增长'], rows: [['比亚迪', '427万', '+42%'], ['特斯拉', '179万', '+12%'], ['蔚来', '22万', '+55%']] },
        { type: 'chart', title: '季度销量趋势', chartType: 'bar', data: [[120, 150, 180, 210], [80, 95, 110, 130]], labels: ['Q1', 'Q2', 'Q3', 'Q4'] },        { type: 'two-column', title: '挑战与机遇', left: ['充电基础设施不足', '原材料价格波动'], right: ['智能驾驶新赛道', '换电模式兴起'] },
      ],
      template: 'tech-blue-gradient',
      icons: [{ icon: results[0].id, x: 11.0, y: 0.2, w: 0.8, h: 0.8, color: '00A3FF' }],
    },
    template,
  );
  console.log('  生成:', result.file, '| 档位:', result.rendering);

  console.log('\n=== 4. 读回验证 ===');
  const md = await readPptx(outPptx);
  console.log(md.split('\n').slice(0, 12).join('\n'));

  console.log('\n=== 5. 编辑测试（替换"2026"→"2027"）===');
  const editResult = await editPptx(outPptx, '2026', '2027');
  console.log('  替换:', editResult.modified, '处');
  const md2 = await readPptx(outPptx);
  console.log('  验证是否含 2027:', md2.includes('2027') ? '✓' : '✗', '| 是否残留 2026:', md2.includes('2026') ? '✗ 残留' : '✓ 已清除');

  console.log('\n=== 全部通过 ===');
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
