/**
 * dsh-design-office 插件入口
 *
 * 知识点：
 * - Cordis 插件：{ name, inject, Config, apply(ctx, config) }
 * - inject: ['tools'] 声明工具注册表依赖（硬依赖，缺省时等待）
 * - Config 用 schemastery 定义 enable 开关（按族）
 * - apply 中注册各工具族（ppt/pdf/docx/xlsx + assets/templates）
 * - 工具注册方法签名：ctx.tools.register(name, description, schema, handler)
 */
import z from '@deepseek-ai/schemastery';
import { registerAssetTools } from './tools/asset.js';
import { registerTemplateTools } from './tools/template.js';
import { registerPptTools } from './tools/ppt-tools.js';
import { registerPdfTools } from './tools/pdf.js';
import { registerDocxTools } from './tools/docx.js';
import { registerXlsxTools } from './tools/xlsx.js';

export const name = 'dsh-design-office';

/** 需要工具注册表服务 */
export const inject = ['tools'] as const;

/** 配置：按族 enable 开关（缺省全开） */
export const Config = z.object({
  enable: z
    .object({
      ppt: z.boolean().required(false),
      pdf: z.boolean().required(false),
      docx: z.boolean().required(false),
      xlsx: z.boolean().required(false),
      assets: z.boolean().required(false),
    })
    .required(false),
});

export interface Config {
  enable?: {
    ppt?: boolean;
    pdf?: boolean;
    docx?: boolean;
    xlsx?: boolean;
    assets?: boolean;
  };
}

/** 注册所有工具（日志只包装自己的工具，不覆盖全局 register） */
export function apply(ctx: any, config: Config = {}) {
  const enable = config.enable ?? {};

  // ⚠️ 兼容性关键：绝不覆盖 ctx.tools.register（那会影响同进程其他插件注册的工具）。
  // 只通过一个"包装过的注册器"注册自己的工具，日志只作用于自己的工具。
  const logRegister = (name: string, description: string, schema: any, handler: any) => {
    return ctx.tools.register(name, description, schema, async (args: any) => {
      const start = Date.now();
      const log = {
        tool: name,
        action: 'call',
        args: sanitizeArgs(args),
        startedAt: new Date().toISOString(),
      };
      try {
        const result = await handler(args);
        const elapsed = Date.now() - start;
        console.log(`[dsh-design-office] ${JSON.stringify({ ...log, status: 'ok', elapsedMs: elapsed })}`);
        return result;
      } catch (e) {
        const elapsed = Date.now() - start;
        console.error(`[dsh-design-office] ${JSON.stringify({ ...log, status: 'fail', elapsedMs: elapsed, error: String(e) })}`);
        throw e;
      }
    });
  };

  // 给各工具族传入包装注册器
  if (enable.assets !== false) registerAssetTools(ctx, logRegister);
  if (enable.assets !== false) registerTemplateTools(ctx, logRegister);
  if (enable.ppt !== false) registerPptTools(ctx, logRegister);
  if (enable.pdf !== false) registerPdfTools(ctx, logRegister);
  if (enable.docx !== false) registerDocxTools(ctx, logRegister);
  if (enable.xlsx !== false) registerXlsxTools(ctx, logRegister);
}

/** 日志参数脱敏：截断长字段，避免日志爆炸 */
function sanitizeArgs(args: any): any {
  if (!args || typeof args !== 'object') return args;
  const out: any = {};
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === 'string' && v.length > 100) out[k] = `${v.slice(0, 100)}...(${v.length} chars)`;
    else if (Array.isArray(v) && v.length > 10) out[k] = `[array ${v.length} items]`;
    else out[k] = v;
  }
  return out;
}
