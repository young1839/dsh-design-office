/**
 * 素材工具注册：asset_search / asset_download / asset_cache_list / asset_purge / asset_report
 *
 * 兼容性知识（dsh-tools 源码验证）：
 * - register(definition) 单对象格式，必须含 output.render 函数
 * - 用 defineToolCompat 把 schemastery schema 转标准 JSON Schema
 */
import z from '@deepseek-ai/schemastery';
import { AssetService } from '../services/asset-service.js';
import { defineToolCompat } from '../lib/tool-register.js';

export function registerAssetTools(ctx: any, register: any) {
  const getService = () => new AssetService(process.cwd());

  register(defineToolCompat({
    name: 'asset_search',
    description: '搜索设计素材（图标/插画/图片/模板）。用户未提供素材时调用，返回候选列表（含许可与预览）。',
    parameters: z.object({
      type: z.union(['icon', 'illustration', 'photo', 'template']).description('素材类型'),
      query: z.string().description('搜索关键词（支持中文，自动翻译）'),
      limit: z.number().required(false).description('返回数量，默认 20'),
      collection: z.string().required(false).description('限定图标集（如 tabler/lucide/mdi），保证风格一致'),
    }),
    async execute(args: { type: 'icon' | 'illustration' | 'photo' | 'template'; query: string; limit?: number; collection?: string }) {
      const svc = getService();
      const results = await svc.search(args.type, args.query, args.limit);
      if (args.collection) {
        return { count: results.filter((r) => r.collection === args.collection).length, results: results.filter((r) => r.collection === args.collection) };
      }
      return { count: results.length, results };
    },
  }));

  register(defineToolCompat({
    name: 'asset_download',
    description: '下载选中的素材到素材库（校验合法性 + 记录真实许可元数据）。返回本地绝对路径供文档工具引用。',
    parameters: z.object({
      id: z.string().description('素材 ID（asset_search 返回的 id，如 mdi:car）'),
      color: z.string().required(false).description('SVG 着色（hex，如 0078D4）'),
    }),
    async execute(args: { id: string; color?: string }) {
      const svc = getService();
      const meta = await svc.download(args.id, args.color);
      return { file: meta.file, sha256: meta.sha256, license: meta.license, source: meta.source };
    },
  }));

  register(defineToolCompat({
    name: 'asset_cache_list',
    description: '查看素材库缓存（已下载素材清单，避免重复下载）。',
    parameters: z.object({}),
    async execute() {
      const svc = getService();
      const manifest = await svc.listCache();
      const size = await svc.size();
      return { count: Object.keys(manifest).length, sizeBytes: size, manifest };
    },
  }));

  register(defineToolCompat({
    name: 'asset_purge',
    description: '清理素材库缓存（全部或指定文件）。',
    parameters: z.object({
      file: z.string().required(false).description('指定要删除的文件路径（绝对路径）；不填则清空全部'),
    }),
    async execute(args: { file?: string }) {
      const svc = getService();
      return svc.purge(args.file);
    },
  }));

  register(defineToolCompat({
    name: 'asset_report',
    description: '生成《素材来源清单》（版权合规）：列出素材库所有素材的来源/许可/URL/下载时间，可输出为 markdown 文件随文档交付。',
    parameters: z.object({
      report_path: z.string().required(false).description('输出清单文件路径（可选，不填返回文本）'),
    }),
    async execute(args: { report_path?: string }) {
      const svc = getService();
      return svc.generateReport(args.report_path);
    },
  }));
}
