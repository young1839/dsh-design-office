/**
 * PPT 工具注册：design_pptx_create / doc_read_pptx / doc_edit_pptx / template_fill
 * 兼容 dsh-tools register(definition) 格式
 */
import z from '@deepseek-ai/schemastery';
import { createPptx, readPptx, editPptx, fillTemplate } from './ppt.js';
import { TemplateService } from '../services/template-service.js';
import { defineToolCompat } from '../lib/tool-register.js';
import type { ToolFamilyContext } from '../index.js';

const slideDefSchema = z
  .object({
    type: z.union(['title', 'section', 'content', 'two-column', 'image', 'table', 'chart']),
    title: z.string().description('幻灯片标题'),
    subtitle: z.string().required(false),
    items: z.array(z.string()).required(false).description('要点列表（content/two-column）'),
    left: z.array(z.string()).required(false),
    right: z.array(z.string()).required(false),
    image: z.string().required(false).description('图片路径（image 类型）'),
    caption: z.string().required(false),
    headers: z.array(z.string()).required(false).description('表头（table 类型）'),
    rows: z.array(z.array(z.string())).required(false).description('行数据（table 类型）'),
    chartType: z.string().required(false).description('图表类型：bar/line/pie（chart 类型）'),
    data: z.array(z.array(z.number())).required(false).description('图表数据（chart 类型）'),
    labels: z.array(z.string()).required(false),
    notes: z.string().required(false).description('演讲者备注'),
  })
  .required();

const iconPlacementSchema = z
  .object({
    icon: z.string().description('Iconify 图标 id（如 mdi:car）或本地素材路径'),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    color: z.string().required(false).description('图标颜色 hex'),
    opacity: z.number().required(false),
  })
  .required();

export function registerPptTools(ctx: any, family: ToolFamilyContext) {
  const register = family.register;
  const getTemplate = () => new TemplateService(family.dataRoot);

  register(defineToolCompat({
    name: 'design_pptx_create',
    description: '生成设计增强 PPT（.pptx）。支持 7 种版式、6 套内置模板、渐变背景、图标嵌入。用户提供模板时用用户模板。',
    parameters: z.object({
      destination_path: z.string().description('输出 .pptx 绝对路径'),
      slides: z.array(slideDefSchema).description('幻灯片定义列表（每页一个主题）'),
      template: z.string().required(false).description('模板 ID（template_list 返回）或用户模板文件路径'),
      icons: z.array(iconPlacementSchema).required(false).description('图标嵌入（已下载素材或 Iconify id）'),
      theme: z
        .object({
          primary: z.string().required(false),
          secondary: z.string().required(false),
          background: z.string().required(false),
        })
        .required(false),
    }),
    async execute(args: any) {
      const templateSvc = getTemplate();
      const template = args.template ? await templateSvc.resolve(args.template) : (await templateSvc.list())[0];
      const result = await createPptx(args, template);
      return {
        file: result.file,
        rendering: result.rendering,
        note: result.rendering === 'tier1' ? 'Tier 1：带图标素材' : 'Tier 2：几何装饰（图标渲染不可用）',
        tips: '已生成，可用 doc_read_pptx 读回自查。',
      };
    },
  }));

  register(defineToolCompat({
    name: 'doc_read_pptx',
    description: '读取 PPT 文本为 markdown（每页一个标题）。可附加结构信息（layouts）。',
    parameters: z.object({
      file_path: z.string(),
      include: z.array(z.union(['summary', 'layouts', 'images', 'tables'])).required(false),
    }),
    async execute(args: { file_path: string; include?: string[] }) {
      const md = await readPptx(args.file_path, args.include);
      return { markdown: md };
    },
  }));

  register(defineToolCompat({
    name: 'doc_edit_pptx',
    description: '在现有 PPT 内查找替换文本（只改文字，保留全部样式/版式/配色）。适合改错字、更新数字。',
    parameters: z.object({
      file_path: z.string().description('要编辑的 pptx 路径'),
      find: z.string(),
      replace: z.string(),
      slide: z.number().required(false).description('1-based 页码，只改这一页'),
      output_path: z.string().required(false).description('输出路径；默认覆盖原文件'),
    }),
    async execute(args: { file_path: string; find: string; replace: string; slide?: number; output_path?: string }) {
      const result = await editPptx(args.file_path, args.find, args.replace, args.slide, args.output_path);
      return { ...result, output: args.output_path ?? args.file_path };
    },
  }));

  register(defineToolCompat({
    name: 'template_fill',
    description: '把用户提供的模板（.pptx）按占位符填充内容（标题/要点），零破坏保留模板的设计（插画/渐变/图标）。用于"用户提供模板"场景。',
    parameters: z.object({
      template_path: z.string().description('用户模板 .pptx 路径'),
      output_path: z.string().description('输出 .pptx 路径'),
      fills: z.array(
        z.object({
          slide: z.number().description('1-based 页码'),
          title: z.string().required(false).description('标题占位符填充'),
          items: z.array(z.string()).required(false).description('body 要点填充'),
        }),
      ),
    }),
    async execute(args: { template_path: string; output_path: string; fills: Array<{ slide: number; title?: string; items?: string[] }> }) {
      const result = await fillTemplate(args.template_path, args.output_path, args.fills);
      return {
        ...result,
        note: '已按占位符填充内容，原模板设计（插画/渐变/图标）零破坏保留。',
      };
    },
  }));
}
