/**
 * 模板服务：6 套内置模板定义 + 用户模板导入登记
 *
 * 6 套模板：科技蓝渐变 / 扁平卡片 / 极简商务 / 简历 / 办公报告 / 论文报告
 * 知识点：
 * - 模板用 defineSlideMaster 生成（结构已知，可精确定位占位符填内容）
 * - colors 定义主题色；gradient 定义渐变（from/to/angle）
 * - 用户模板通过 template_import 登记到 .manifest 标记 "user-provided"，禁止联网覆盖
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { TemplateDef } from '../types.js';

export const BUILTIN_TEMPLATES: TemplateDef[] = [
  {
    id: 'tech-blue-gradient',
    name: '科技蓝渐变',
    style: 'modern-gradient',
    description: '深蓝→亮蓝对角线渐变封面，科技感，适合科技/互联网/产品发布',
    scenes: ['科技', '互联网', '产品发布', 'AI', '数字化转型'],
    colors: { primary: '#0B3B8C', secondary: '#00A3FF', background: '#F5F8FF', text: '#1A1A2E' },
    gradient: { from: '#0B3B8C', to: '#00A3FF', angle: 135 },
  },
  {
    id: 'flat-cards',
    name: '扁平卡片',
    style: 'flat-cards',
    description: '纯色卡片式布局，圆角色块 + 图标点缀，适合方案/汇报/培训',
    scenes: ['方案', '汇报', '培训', '产品介绍'],
    colors: { primary: '#4F46E5', secondary: '#22C55E', background: '#FAFAFA', text: '#111827' },
  },
  {
    id: 'minimal-business',
    name: '极简商务',
    style: 'minimal',
    description: '大面积留白 + 细线装饰，黑白灰主调，适合高端商务/咨询',
    scenes: ['商务', '咨询', '战略', '投资'],
    colors: { primary: '#111827', secondary: '#6B7280', background: '#FFFFFF', text: '#111827' },
  },
  {
    id: 'resume',
    name: '简历',
    style: 'resume',
    description: '单栏简历版式，左侧色条 + 右侧内容，适合个人简历/求职',
    scenes: ['简历', '求职', '个人简介'],
    colors: { primary: '#2563EB', secondary: '#3B82F6', background: '#FFFFFF', text: '#1F2937' },
  },
  {
    id: 'office-report',
    name: '办公报告',
    style: 'office-report',
    description: '企业标准报告风格，深蓝页眉 + 条纹表格，适合周报/月报/年度报告',
    scenes: ['周报', '月报', '年度报告', '经营分析'],
    colors: { primary: '#1E3A8A', secondary: '#3B82F6', background: '#FFFFFF', text: '#111827' },
  },
  {
    id: 'academic-paper',
    name: '论文报告',
    style: 'academic',
    description: '学术论文风格，衬线标题 + 严谨排版，适合论文答辩/学术汇报/研究总结',
    scenes: ['论文', '答辩', '学术', '研究'],
    colors: { primary: '#1F2937', secondary: '#4B5563', background: '#FFFFFF', text: '#111827' },
  },
];

/** 用户模板登记 */
export interface UserTemplateEntry {
  id: string;
  file: string;
  name: string;
  source: 'user';
  importedAt: string;
}

export class TemplateService {
  constructor(private workspaceRoot: string) {}

  private get templatesDir() {
    return path.join(this.workspaceRoot, 'assets', 'templates');
  }

  private get userManifestPath() {
    return path.join(this.templatesDir, '.user-manifest.json');
  }

  /** 列出全部模板（内置 + 用户） */
  async list(): Promise<Array<TemplateDef & { source: 'builtin' | 'user' }>> {
    const builtins = BUILTIN_TEMPLATES.map((t) => ({ ...t, source: 'builtin' as const }));
    const users = await this.listUserTemplates();
    return [...builtins, ...users];
  }

  /** 列出用户导入的模板 */
  async listUserTemplates(): Promise<Array<TemplateDef & { source: 'user' }>> {
    try {
      const manifest = JSON.parse(await readFile(this.userManifestPath, 'utf8')) as Record<string, UserTemplateEntry>;
      return Object.values(manifest).map((e) => ({
        id: e.id,
        name: e.name,
        style: 'user',
        description: `用户提供模板：${e.file}`,
        scenes: ['用户模板'],
        colors: { primary: '#111827', secondary: '#6B7280', background: '#FFFFFF', text: '#111827' },
        source: 'user' as const,
      }));
    } catch {
      return [];
    }
  }

  /** 导入用户模板（登记 + 复制到素材库） */
  async importUserTemplate(filePath: string, name?: string): Promise<UserTemplateEntry> {
    await mkdir(this.templatesDir, { recursive: true });
    const abs = path.resolve(filePath);
    const buf = await readFile(abs);
    // 校验扩展名
    const ext = path.extname(abs).toLowerCase();
    if (!['.pptx', '.potx'].includes(ext)) {
      throw new Error('仅支持 .pptx / .potx 模板文件');
    }
    const id = `user-${Date.now()}`;
    const destName = name ? `${name}${ext}` : path.basename(abs);
    const dest = path.join(this.templatesDir, destName);
    await writeFile(dest, buf);
    const entry: UserTemplateEntry = {
      id,
      file: dest,
      name: name ?? path.basename(abs, ext),
      source: 'user',
      importedAt: new Date().toISOString(),
    };
    const manifest = JSON.parse(await readFile(this.userManifestPath, 'utf8').catch(() => '{}')) as Record<string, UserTemplateEntry>;
    manifest[id] = entry;
    await writeFile(this.userManifestPath, JSON.stringify(manifest, null, 2));
    return entry;
  }

  /** 解析模板引用：模板 ID → TemplateDef；文件路径 → user 占位 */
  async resolve(templateRef: string): Promise<TemplateDef & { source: 'builtin' | 'user'; file?: string }> {
    const builtin = BUILTIN_TEMPLATES.find((t) => t.id === templateRef);
    if (builtin) return { ...builtin, source: 'builtin' };
    const users = await this.listUserTemplates();
    const user = users.find((t) => t.id === templateRef);
    if (user) return user;
    // 当作文件路径
    if (templateRef.endsWith('.pptx') || templateRef.endsWith('.potx')) {
      return {
        id: 'user-file',
        name: path.basename(templateRef),
        style: 'user',
        description: `用户提供的模板文件：${templateRef}`,
        scenes: ['用户模板'],
        colors: { primary: '#111827', secondary: '#6B7280', background: '#FFFFFF', text: '#111827' },
        source: 'user',
        file: templateRef,
      };
    }
    throw new Error(`模板不存在：${templateRef}`);
  }
}
