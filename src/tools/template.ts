/**
 * 模板工具注册：template_list / template_import
 * 兼容 dsh-tools register(definition) 格式
 */
import z from '@deepseek-ai/schemastery';
import { TemplateService } from '../services/template-service.js';
import { defineToolCompat } from '../lib/tool-register.js';
import type { ToolFamilyContext } from '../index.js';

export function registerTemplateTools(ctx: any, family: ToolFamilyContext) {
  const register = family.register;
  const getService = () => new TemplateService(family.dataRoot);

  register(defineToolCompat({
    name: 'template_list',
    description: '列出可用模板（6 套内置 + 用户导入）。生成文档前调用以选择合适的模板。',
    parameters: z.object({}),
    async execute() {
      const svc = getService();
      const templates = await svc.list();
      return {
        count: templates.length,
        templates: templates.map((t) => ({
          id: t.id,
          name: t.name,
          style: t.style,
          description: t.description,
          scenes: t.scenes,
          colors: t.colors,
          gradient: t.gradient,
          source: t.source,
        })),
      };
    },
  }));

  register(defineToolCompat({
    name: 'template_import',
    description: '导入用户提供的模板/素材（.pptx/.potx）。标记为"用户提供"，后续生成优先使用且禁止联网覆盖。',
    parameters: z.object({
      file_path: z.string().description('模板文件绝对路径'),
      name: z.string().required(false).description('模板显示名（可选）'),
    }),
    async execute(args: { file_path: string; name?: string }) {
      const svc = getService();
      const entry = await svc.importUserTemplate(args.file_path, args.name);
      return {
        id: entry.id,
        file: entry.file,
        name: entry.name,
        source: 'user',
        note: '用户提供的模板已入库，后续生成将优先采用，禁止联网覆盖。',
      };
    },
  }));
}
