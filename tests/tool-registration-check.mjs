/**
 * 工具注册兼容性验证：
 * 模拟 dsh-tools 的 register(definition) 校验逻辑，确认所有 21 个工具定义合法
 *
 * 参考 dsh-tools 源码：
 * - register(definition) 必须含 output.render 函数，否则 throw TypeError
 * - parameters/output.schema 必须是标准 JSON Schema（assertSupportedJsonSchema）
 * - name 不能是保留名 run_code
 */
import { defineToolCompat } from '../lib/lib/tool-register.js';
import { registerAssetTools } from '../lib/tools/asset.js';
import { registerTemplateTools } from '../lib/tools/template.js';
import { registerPptTools } from '../lib/tools/ppt-tools.js';
import { registerPdfTools } from '../lib/tools/pdf.js';
import { registerDocxTools } from '../lib/tools/docx.js';
import { registerXlsxTools } from '../lib/tools/xlsx.js';

/** 模拟 dsh-tools 的 tools.register(definition) 校验 */
function createMockRegister() {
  const registered = [];
  return {
    register(definition) {
      // 复刻 dsh-tools register() 的校验
      const name = definition.name;
      const output = definition.output;
      if (output === undefined || typeof output !== 'object' || typeof output.render !== 'function') {
        throw new TypeError(`tool "${name}" must declare output { schema, render, presentationMeta? }`);
      }
      if (name === 'run_code') throw new Error(`tool name "run_code" is reserved`);
      // 校验 schema 是对象
      if (!definition.parameters || typeof definition.parameters !== 'object') {
        throw new TypeError(`tool "${name}" parameters must be an object`);
      }
      if (!output.schema || typeof output.schema !== 'object') {
        throw new TypeError(`tool "${name}" output.schema must be an object`);
      }
      registered.push(definition);
      return () => {};
    },
    registered,
  };
}

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${name} ${detail}`); }
  else { fail++; console.log(`  ✗ ${name} ${detail}`); }
}

const mock = createMockRegister();
const ctx = {};
try {
  registerAssetTools(ctx, mock.register);
  registerTemplateTools(ctx, mock.register);
  registerPptTools(ctx, mock.register);
  registerPdfTools(ctx, mock.register);
  registerDocxTools(ctx, mock.register);
  registerXlsxTools(ctx, mock.register);
} catch (e) {
  console.log('注册抛错:', String(e).slice(0, 200));
  fail++;
}

const tools = mock.registered;
console.log(`\n注册工具总数: ${tools.length}`);
check('注册 20 个工具', tools.length === 20, `(实际 ${tools.length})`);

// 逐项校验
for (const t of tools) {
  check(`"${t.name}" 有 output.render`, typeof t.output?.render === 'function');
  check(`"${t.name}" parameters 是对象`, !!t.parameters && typeof t.parameters === 'object');
  check(`"${t.name}" 有 execute`, typeof t.execute === 'function');
  // render 返回合法块
  const blocks = t.output.render({}, '测试值');
  check(`"${t.name}" render 返回 text 块`, Array.isArray(blocks) && blocks[0]?.type === 'text', `(${JSON.stringify(blocks[0]?.type)})`);
}

// 工具名唯一性
const names = tools.map((t) => t.name);
check('工具名唯一', new Set(names).size === names.length, `(${names.length} 唯一)`);

// 与现有插件无冲突（terminal_*/vision_* 前缀不同）
const conflicting = names.filter((n) => n.startsWith('terminal_') || n.startsWith('vision_'));
check('与现有插件工具无同名', conflicting.length === 0, conflicting.join(',') || '');

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
