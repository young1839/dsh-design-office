/**
 * dsh-design-office 插件入口
 *
 * 知识点：
 * - Cordis 插件：{ name, inject, Config, apply(ctx, config) }
 * - inject: ['tools'] 声明工具注册表依赖（硬依赖，缺省时等待）
 * - Config 用 schemastery 定义 enable 开关（按族）与 data_dir（素材/模板库根目录）
 * - apply 中注册各工具族（ppt/pdf/docx/xlsx + assets/templates）
 *
 * ⚠️ 注册 API（修正 2026-09）：
 * 宿主 dsh-tools 的 ctx.tools.register 是「单对象」API：
 *   register(definition: ToolDefinition): () => void
 * 旧实现按 4 参 (name, desc, schema, handler) 包装，宿主只取第一参导致日志
 * 包装全部失效（死代码），且换宿主即注册失败。现在直接透传 defineToolCompat
 * 产出的单对象，日志内嵌在 tool-register 的 execute 包装里。
 */
import os from 'node:os';
import path from 'node:path';
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

/** 配置：按族 enable 开关 + 素材/模板库根目录（缺省全开；data_dir 缺省用 process.cwd()） */
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
  /** 素材库/模板库根目录（绝对路径）。缺省为 $DSH_HOME/design-office，可用此项覆盖 */
  data_dir: z.string().required(false),
});

export interface Config {
  enable?: {
    ppt?: boolean;
    pdf?: boolean;
    docx?: boolean;
    xlsx?: boolean;
    assets?: boolean;
  };
  data_dir?: string;
}

/** 供各工具族共享的工具注册上下文 */
export interface ToolFamilyContext {
  /** 素材/模板库根目录 */
  dataRoot: string;
  /** 透传宿主 register（单对象 definition） */
  register: (definition: any) => any;
}

/**
 * 默认素材/模板库根目录：`$DSH_HOME/design-office`（DSH_HOME 未设置时回退 `~/.dsh/design-office`）。
 *
 * 为什么不用 process.cwd()：插件运行在宿主进程里，cwd 是宿主启动目录
 * （常见为 $HOME），会随启动方式漂移，且与用户项目目录不一致。
 * 固定到 DSH home 下可跨会话稳定复用同一素材库；需要自定义时用 `data_dir` 覆盖。
 */
export function resolveDefaultDataRoot(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.DSH_HOME && env.DSH_HOME.trim() ? env.DSH_HOME.trim() : path.join(os.homedir(), '.dsh');
  return path.join(home, 'design-office');
}

/** 注册所有工具 */
export function apply(ctx: any, config: Config = {}) {
  const enable = config.enable ?? {};
  const dataRoot = config.data_dir ? path.resolve(config.data_dir) : resolveDefaultDataRoot();

  const familyCtx: ToolFamilyContext = {
    dataRoot,
    register: (definition: any) => ctx.tools.register(definition),
  };

  if (enable.assets !== false) registerAssetTools(ctx, familyCtx);
  if (enable.assets !== false) registerTemplateTools(ctx, familyCtx);
  if (enable.ppt !== false) registerPptTools(ctx, familyCtx);
  if (enable.pdf !== false) registerPdfTools(ctx, familyCtx);
  if (enable.docx !== false) registerDocxTools(ctx, familyCtx);
  if (enable.xlsx !== false) registerXlsxTools(ctx, familyCtx);
}
