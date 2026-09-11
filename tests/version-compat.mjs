/**
 * 版本兼容性验证：针对**当前安装的 DSH/dsh-tools 版本**校验插件。
 *
 * 验证内容：
 *  1. 20 个工具生成的 JSON Schema 是否通过宿主 `assertSupportedJsonSchema`
 *     （dsh-tools 只支持受限子集：type/oneOf/properties/required/additionalProperties/items/enum/const）
 *  2. PTC（Code Mode）模式的 TS/Python SDK 渲染是否可用（jsonSchemaToTs / jsonSchemaToPy）
 *  3. 用真实 `ToolRuntime` + cordis 实际加载插件，确认 20 个工具注册成功
 *
 * 宿主包查找顺序：
 *   $DSH_DESIGN_OFFICE_DSH_TOOLS（指向 dsh-tools/lib/index.js）
 *   → $DSH_HOME/../ 常见安装路径
 *   → node 解析 @deepseek-ai/dsh-tools
 * 找不到时**跳过**（退出码 0），便于在无 DSH 的环境跑其余测试。
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { registerAssetTools } from '../lib/tools/asset.js';
import { registerTemplateTools } from '../lib/tools/template.js';
import { registerPptTools } from '../lib/tools/ppt-tools.js';
import { registerPdfTools } from '../lib/tools/pdf.js';
import { registerDocxTools } from '../lib/tools/docx.js';
import { registerXlsxTools } from '../lib/tools/xlsx.js';

const require = createRequire(import.meta.url);

/** 定位宿主 dsh-tools（返回 lib/index.js 绝对路径与同实例 cordis） */
function resolveHost() {
  const candidates = [
    process.env.DSH_DESIGN_OFFICE_DSH_TOOLS,
    '/usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js',
    '/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js',
  ].filter(Boolean);
  try {
    candidates.push(require.resolve('@deepseek-ai/dsh-tools/lib/index.js'));
  } catch { /* 未安装，忽略 */ }
  const toolsEntry = candidates.find((p) => p && existsSync(p));
  if (!toolsEntry) return null;
  // 与宿主 dsh-tools 同实例的 cordis（保证 Service 基类一致）
  const cordisEntry = path.join(path.dirname(path.dirname(toolsEntry)), 'cordis', 'lib', 'index.js');
  return { toolsEntry, cordisEntry: existsSync(cordisEntry) ? cordisEntry : undefined };
}

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ✓ ${name} ${detail}`); }
  else { fail++; console.log(`  ✗ ${name} ${detail}`); }
};

const host = resolveHost();
if (!host) {
  console.log('⚠️  未找到宿主 dsh-tools，跳过版本兼容性测试（设置 DSH_DESIGN_OFFICE_DSH_TOOLS 可指定路径）');
  process.exit(0);
}

const dshTools = await import(host.toolsEntry);
const { assertSupportedJsonSchema, validateJsonSchemaValue, jsonSchemaToTs, jsonSchemaToPy } = dshTools;

// 收集全部工具定义（不实际注册）
const defs = [];
const family = { dataRoot: process.cwd(), register: (d) => { defs.push(d); return () => {}; } };
registerAssetTools({}, family);
registerTemplateTools({}, family);
registerPptTools({}, family);
registerPdfTools({}, family);
registerDocxTools({}, family);
registerXlsxTools({}, family);

console.log(`宿主 dsh-tools: ${host.toolsEntry}`);
console.log(`采集工具定义: ${defs.length} 个\n`);

console.log('=== 1. JSON Schema 子集校验 ===');
let schemaBad = 0;
for (const d of defs) {
  for (const [label, schema] of [['parameters', d.parameters], ['output.schema', d.output.schema]]) {
    try {
      assertSupportedJsonSchema(schema);
    } catch (e) {
      schemaBad++;
      check(`${d.name} ${label}`, false, String(e.message || e).slice(0, 200));
    }
  }
}
check('全部参数/输出 schema 通过宿主子集校验', schemaBad === 0, schemaBad ? `(${schemaBad} 处不合规)` : '');

console.log('\n=== 2. 数组项约束完整（schemastery inner）===');
const ppt = defs.find((d) => d.name === 'design_pptx_create');
check('design_pptx_create slides.items 携带完整 schema',
  !!ppt?.parameters?.properties?.slides?.items?.properties,
  ppt?.parameters?.properties?.slides?.items?.type ? `(items.type=${ppt.parameters.properties.slides.items.type})` : '(items 缺失)');
const assetSearch = defs.find((d) => d.name === 'asset_search');
check('asset_search.type 枚举带 type',
  assetSearch?.parameters?.properties?.type?.type === 'string' && Array.isArray(assetSearch.parameters.properties.type.enum),
  JSON.stringify(assetSearch?.parameters?.properties?.type));

console.log('\n=== 3. PTC 模式 SDK 渲染 ===');
let sdkBad = 0;
for (const d of defs) {
  try { jsonSchemaToTs(d.parameters, 1); } catch (e) { sdkBad++; check(`${d.name} jsonSchemaToTs`, false, String(e.message).slice(0, 160)); }
  try { jsonSchemaToPy(d.parameters, 1); } catch (e) { sdkBad++; check(`${d.name} jsonSchemaToPy`, false, String(e.message).slice(0, 160)); }
}
check('全部工具可渲染为 TS/Python SDK', sdkBad === 0);

console.log('\n=== 4. 参数值校验 ===');
const okV = validateJsonSchemaValue(assetSearch.parameters, { type: 'icon', query: '汽车' }, '');
const badV = validateJsonSchemaValue(assetSearch.parameters, { type: 'bogus', query: '汽车' }, '');
check('合法参数通过', okV.length === 0, okV.join('; '));
check('非法枚举被拒绝', badV.length > 0, badV[0] || '');

console.log('\n=== 5. 真实加载（ToolRuntime + cordis）===');
try {
  const cordis = await import(host.cordisEntry ?? '@deepseek-ai/cordis');
  const { Context } = cordis;
  const ToolRuntime = dshTools.default;
  const root = new Context();
  root.provide('systemPrompt', {
    tools() { return () => {}; },
    section() { return () => {}; },
    context() { return () => {}; },
    variable() { return () => {}; },
    suppressRuntimeContext() { return () => {}; },
    async assemble() { return {}; },
  });
  await root.plugin(ToolRuntime);
  const plugin = await import('../lib/index.js');
  await root.plugin(plugin);
  const names = root.tools.schemas().map((s) => s.name);
  const expected = [
    'asset_search', 'asset_download', 'asset_cache_list', 'asset_purge', 'asset_report',
    'template_list', 'template_import', 'template_fill',
    'design_pptx_create', 'doc_read_pptx', 'doc_edit_pptx',
    'design_pdf_create', 'doc_read_pdf', 'doc_merge_pdf', 'doc_split_pdf',
    'design_docx_create', 'doc_read_docx',
    'design_xlsx_write', 'doc_read_xlsx', 'doc_edit_xlsx',
  ];
  const missing = expected.filter((n) => !names.includes(n));
  check('插件在真实 ToolRuntime 上加载并注册 20 工具', names.length === 20 && missing.length === 0,
    missing.length ? `缺失: ${missing.join(', ')}` : `(共 ${names.length} 个)`);

  // 端到端执行：经真实 ToolRuntime 调用一个离线工具，验证 execute → render → 输出契约
  const execRes = await root.tools.execute({
    callId: 'compat-exec-1',
    name: 'template_list',
    arguments: {},
    signal: new AbortController().signal,
  });
  const blocks = execRes?.content;
  const okExec = execRes && execRes.isError === false && Array.isArray(blocks)
    && blocks[0]?.type === 'text' && String(blocks[0].text).includes('tech-blue-gradient');
  check('真实执行 template_list 返回 text 内容', !!okExec,
    Array.isArray(blocks) ? `(${blocks.length} block, ${String(blocks[0]?.text || '').length} chars)` : '(no content)');
} catch (e) {
  check('真实加载', false, String(e.stack || e).slice(0, 400));
}

console.log('\n=== 6. 配置与素材库默认位置 ===');
const pluginModule = await import('../lib/index.js');
try {
  const withEnv = pluginModule.resolveDefaultDataRoot({ DSH_HOME: '/custom/dsh' });
  check('data_dir 默认 = $DSH_HOME/design-office', withEnv === path.join('/custom/dsh', 'design-office'), withEnv);
  const withoutEnv = pluginModule.resolveDefaultDataRoot({});
  check('DSH_HOME 未设置时回退 ~/.dsh/design-office', withoutEnv.endsWith(path.join('.dsh', 'design-office')), withoutEnv);
} catch (e) {
  check('resolveDefaultDataRoot', false, String(e.message));
}
try {
  const parsed = pluginModule.Config({ enable: { ppt: false }, data_dir: '/tmp/x' });
  check('Config 可解析 enable/data_dir', parsed?.enable?.ppt === false && parsed?.data_dir === '/tmp/x', JSON.stringify(parsed));
} catch (e) {
  check('Config 解析', false, String(e.message));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
