# 🐋 dsh-design-office

**DeepSeek Harness 设计增强版 Office 插件** — 生成带渐变背景、图标素材、插画封面的 PPT / PDF / Word / Excel，自动搜索下载素材（工具化、可审计），用户提供素材时优先采用用户素材。

![version](https://img.shields.io/badge/version-0.1.0-blue) ![license](https://img.shields.io/badge/license-Apache--2.0-green)

## ✨ 功能

| 类别 | 工具 | 说明 |
|------|------|------|
| 素材 | `asset_search` / `asset_download` / `asset_cache_list` / `asset_purge` / `asset_report` | 搜索下载设计素材（Iconify 免费源），记录许可元数据 |
| 模板 | `template_list` / `template_import` / `template_fill` | 6 套内置模板 + 用户模板填充（零破坏） |
| PPT | `design_pptx_create` / `doc_read_pptx` / `doc_edit_pptx` | 生成/读取/编辑 PPT（渐变 + 图标 + 模板） |
| PDF | `design_pdf_create` / `doc_read_pdf` / `doc_merge_pdf` / `doc_split_pdf` | 生成/读取/合并/拆分 PDF（中文嵌入） |
| Word | `design_docx_create` / `doc_read_docx` | 生成/读取 Word（条纹表格 + 水印 + 页眉） |
| Excel | `design_xlsx_write` / `doc_read_xlsx` / `doc_edit_xlsx` | 生成/读取/编辑 Excel（条件格式 + 图标表头） |

共 **20 个工具**。

## 🎨 设计能力

- **渐变背景**：OOXML `gradFill` 注入（规范 XML，PowerPoint/LibreOffice 兼容）
- **图标素材**：Iconify 免费图标（Apache/MIT 许可），自动下载 + 白底/深底自适应
- **模板系统**：6 套内置模板（科技蓝渐变/扁平卡片/极简商务/简历/办公报告/论文报告）
- **中文字体**：随插件打包 Noto Sans CJK SC（PDF 中文渲染）
- **离线素材包**：168 个精选图标（断网可用）
- **强制识图门禁**（skill）：生成前后调用视觉工具检查布局审美

## 📦 安装

### 环境要求
- Node.js ≥ 18
- LibreOffice（pptx/docx/xlsx → 图片渲染）：`sudo apt install libreoffice`
- poppler-utils（PDF → PNG）：`sudo apt install poppler-utils`

### 安装到 DSH

```sh
# 1. 安装依赖
cd ~/.dsh/profiles/web
pnpm add /home/young1839/chat/dsh-design-office

# 2. 在 package.json 的 dsh.profile.bundles 加入：
#    "@young1839/dsh-design-office",

# 3. 安装 skill
mkdir -p ~/.dsh/skills/dsh-design-office
cp skills/SKILL.md ~/.dsh/skills/dsh-design-office/

# 4. 重启 DSH
dsh web
```

### 从 npm 安装（发布后）

```sh
cd ~/.dsh/profiles/web
pnpm add @young1839/dsh-design-office
```

## 🗑️ 卸载

```sh
cd ~/.dsh/profiles/web
pnpm remove @young1839/dsh-design-office
rm -rf ~/.dsh/skills/dsh-design-office
```

## 🚀 使用示例

```
用户："做一份 2026 新能源市场分析的 PPT，要科技感"

1. template_list → 选「tech-blue-gradient」
2. asset_search(icon, "汽车") → 识图确认 → asset_download
3. design_pptx_create(template=tech-blue-gradient, icons=[...], slides=[...])
4. 渲染成图 → vision_describe 识图检查 → 修复
5. doc_read_pptx 读回自查 → asset_report 出素材清单
```

## 📚 文档

完整项目文档见 [PROJECT.md](./PROJECT.md)（含技术选型、风险、Bug 记录、兼容性测试）。

## 🔧 开发

```sh
npm install
npm run build    # tsc → lib/
npm test         # vitest（端到端测试）
```

## 📄 许可

Apache License 2.0

- 图标素材来自 Iconify（各集 Apache-2.0 / MIT / ISC）
- Noto Sans CJK 字体（Apache-2.0）
- 上游参考：天枢 office 插件（Apache-2.0）
