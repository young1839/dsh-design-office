# dsh-design-office 项目文档

**DeepSeek Harness 设计增强版 Office 插件（混合架构）**

- 版本：v0.1.1（M1+M2+M3 + Skill 识图门禁 + 渲染兼容性修复 + Bug 修复 + **DSH 0.1.5-rc.1 版本适配**）
- 适配宿主：**dsh 0.1.5-rc.1** / `@deepseek-ai/dsh-tools` **0.1.5-rc.2** / cordis 4.0.2 / schemastery 3.18.2（见[第 17 章](#17-版本适配-dsh-015-rc12026-09-11)）
- 架构：TypeScript 主体 + sharp（C++/libvips）渲染内核 —— 混合架构
- 定位：制作 / 编辑 / 读取 PPT、PDF、Excel、Word；自动搜索下载素材与模板（工具化、可审计）；用户提供素材时优先采用用户素材
- 独立性：**不依赖** `@huiliyi37/dsh-office`（已卸载），全部文档能力自建
- 包名：`@young1839/dsh-design-office`（发布前替换为真实 npm 用户名）
- 实现状态：
  - ✅ **M1 已交付**：素材引擎 + PPT 生成（渐变注入 + 图标嵌入）+ PPT 读/编辑（端到端验证通过）
  - ✅ **M2 已交付**：PDF（渐变封面 + 中文字体）+ Word（条纹表格 + 页眉）+ Excel（条件格式）+ PDF 合并/拆分 + 读取工具（端到端验证通过）
  - ✅ **M3 已交付**：用户模板填充（template_fill）+ 素材来源清单（asset_report）+ 缓存 LRU + 日志可观测 + 离线图标包（168 个）+ Word 水印/背景色（端到端验证通过）

---

## 目录

1. [项目概述](#1-项目概述)
2. [总体架构](#2-总体架构)
3. [技术选型与知识点（逐模块）](#3-技术选型与知识点逐模块)
4. [素材决策引擎](#4-素材决策引擎)
5. [技术可行性（实测证据）](#5-技术可行性实测证据)
6. [风险清单与缓解](#6-风险清单与缓解)
7. [自评：需要改进的地方](#7-自评需要改进的地方)
8. [开发计划与里程碑](#8-开发计划与里程碑)
9. [测试与质量保障](#9-测试与质量保障)
10. [附录](#10-附录)
11. [Skill 使用指导（核心结构与文件指引）](#11-skill-使用指导核心结构与文件指引)
12. [Bug 检查记录](#12-bug-检查记录2026-08-30)
13. [深度兼容性测试](#13-深度兼容性测试2026-08-30)
14. [识图门禁演进记录](#14-识图门禁演进记录2026-08-31)
15. [渲染兼容性修复](#15-渲染兼容性修复2026-08-31)
16. [依赖、安装与卸载](#16-依赖安装与卸载)
17. [版本适配（→ DSH 0.1.5-rc.1）](#17-版本适配-dsh-015-rc12026-09-11)

> 面向使用者的独立文档：[README](../README.md)、
> [安装/更新/卸载](docs/install.md)、[提示词指南](docs/prompt-guide.md)、
> [变更记录](../CHANGELOG.md)。

---

## 1. 项目概述

### 1.1 目标

为 DeepSeek Harness（DSH）提供一个**设计增强版**的 Office 文档插件，解决现有程序化生成工具"版式单调、无素材、无模板"的短板：

- **制作**：生成带设计感的 PPT / PDF / Word / Excel（渐变背景、图标点缀、插画封面、模板套用）
- **编辑**：在现有文档内查找替换文本（保留原设计）
- **读取**：提取文档内容供 AI 上下文阅读
- **素材代理**：用户未提供素材时，由 AI 调用工具自动搜索下载；用户提供时优先采用用户素材，禁止联网覆盖

### 1.2 核心设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 语言 | **TypeScript 主体** | DSH 插件生态标准（cordis 工具注册层必须是 JS） |
| 渲染内核 | **sharp（C++/libvips）** | SVG→PNG 光栅化是唯一 CPU 密集点，白嫖 C++ 性能 |
| 素材获取 | **工具化**（AI 编排搜索/下载） | 用户可见、可审计、可审批，符合 cordis 工具模型 |
| 模板 | **内置模板库 + 用户导入** | 模板用 `defineSlideMaster` 生成，保证可编辑层 |
| 降级 | **显式分级降级链**（Tier 1/2/3） | 不默默降级，提前告知用户成品质量档位 |

---

## 2. 总体架构

### 2.1 分层架构

```
┌─────────────────────────────────────────────────────────┐
│  工具层（cordis tools，TS）                              │
│  asset_search / asset_download / template_list /        │
│  design_pptx_create / design_pdf_create /               │
│  design_docx_create / design_xlsx_write /               │
│  doc_read_* / doc_edit_* / doc_merge_pdf / doc_split_pdf │
├─────────────────────────────────────────────────────────┤
│  服务层（TS 业务逻辑）                                   │
│  AssetService（搜索/下载/缓存/许可元数据）               │
│  TemplateService（内置/用户模板管理）                    │
│  RenderService（SVG→PNG 统一入口）                       │
│  DocService（四类文档生成/读取/编辑）                    │
├─────────────────────────────────────────────────────────┤
│  底层库（现成 npm 包）                                   │
│  pptxgenjs │ pdf-lib / pdfkit │ docx │ exceljs │         │
│  mammoth │ jszip │ pdf-parse │ undici                    │
├─────────────────────────────────────────────────────────┤
│  渲染内核（C++）                                         │
│  sharp（libvips，N-API 绑定）→ 唯一 CPU 密集点           │
└─────────────────────────────────────────────────────────┘
```

### 2.2 数据流（一次典型生成）

```
AI 收到用户需求
  → 判断有无用户素材/模板
      ├─ 有 → template_import 入库（标注用户来源）
      └─ 无 → asset_search(Iconify API) → asset_download(校验+元数据)
  → RenderService 把 SVG 图标光栅化为 PNG @2x（sharp）
  → DocService 组装 OOXML（pptxgenjs / docx / exceljs / pdf-lib）
  → 输出文件 → 读回自查（doc_read_*）→ 交付
```

### 2.3 项目目录结构（实际实现）

```
dsh-design-office/
├── package.json              # 插件清单 + dsh.bundle.patch + peerDependencies
├── cordis.patch.yml          # 插件装载配置（支持按族 enable）
├── tsconfig.json             # tsc 编译 → lib/
├── src/
│   ├── index.ts              # 插件入口：name/inject/Config/apply（按族注册）
│   ├── globals.d.ts          # pdfkit/pdf-parse 类型声明
│   ├── types.ts              # 共享类型（素材/模板/幻灯片/图标）
│   ├── lib/
│   │   ├── tool-register.ts  # schemastery → JSON Schema（适配 dsh-tools 受限子集）
│   │   └── tool-types.ts     # ToolDefinition 等类型（不依赖宿主包）
│   ├── tools/
│   │   ├── asset.ts          # asset_search / asset_download / asset_cache_list / asset_purge
│   │   ├── template.ts       # template_list / template_import
│   │   ├── ppt-tools.ts      # design_pptx_create / doc_read_pptx / doc_edit_pptx（注册层）
│   │   ├── ppt.ts            # PPT 核心：createPptx / readPptx / editPptx + gradFill 注入
│   │   ├── pdf.ts            # design_pdf_create / doc_read_pdf / doc_merge_pdf / doc_split_pdf
│   │   ├── docx.ts           # design_docx_create / doc_read_docx
│   │   └── xlsx.ts           # design_xlsx_write / doc_read_xlsx / doc_edit_xlsx
│   └── services/
│       ├── asset-service.ts  # Iconify 客户端 + 缓存 + 许可元数据 + 中英词典
│       ├── render-service.ts # sharp 封装（SVG→PNG，density 控制）
│       └── template-service.ts # 6 套内置模板 + 用户模板导入登记
├── assets/
│   ├── templates/            # 内置模板（6 套定义在 template-service.ts）
│   ├── fonts/                # Noto Sans CJK SC（16MB，随插件打包，PDF 中文）
│   └── icons/                # 离线素材包：168 个精选图标（Iconify mdi Apache-2.0）
├── scripts/
│   └── download-icons.mjs    # 离线图标包生成脚本（可重新下载/扩充）
├── skills/SKILL.md           # 使用指导 skill（完整内容见第 11 章）
├── docs/
│   ├── install.md            # 安装 / 更新 / 卸载 / 故障排查 / 回滚
│   ├── prompt-guide.md       # AI 生成 PPT/PDF/Word/Excel 的提示词写法
│   ├── version-adaptation.md # DSH 0.1.5-rc.1 版本适配报告
│   └── bug-report.md         # Bug 审查与修复报告
├── tests/
│   ├── version-compat.mjs    # 针对当前宿主 dsh-tools 的兼容性实测（含真实加载）
│   ├── tool-registration-check.mjs # 20 个工具注册契约校验
│   ├── bug-check.mjs / bug-check2.mjs # Bug 回归断言
│   ├── e2e-m1.mjs            # M1 端到端：素材→PPT→读回→编辑
│   ├── e2e-m2.mjs            # M2 端到端：PDF/Word/Excel 生成→读回→合并拆分
│   └── e2e-m3.mjs            # M3 端到端：离线图标/水印/素材清单/模板填充/LRU
├── CHANGELOG.md              # 版本变更记录
├── README.md                 # 使用入口（安装/更新/卸载/版本兼容）
├── PROJECT.md                # 本文档
└── workspace/                # 运行时产物（未入库，.gitignore 排除）
```

---

## 3. 技术选型与知识点（逐模块）

> 本节是文档核心：**每一块用什么技术、用到什么知识点**，都落实到具体 API 与原理。

### 3.1 插件框架：Cordis + TypeScript

**技术**：`@deepseek-ai/cordis` + `@deepseek-ai/dsh-tools` + `@deepseek-ai/schemastery` + TypeScript（tsc 编译）

**知识点**：

1. **Cordis 插件模型**：插件是一个导出 `{ name, inject, Config, apply(ctx, config) }` 的模块。
   - `name`：插件唯一标识
   - `inject: ['tools']`：声明硬依赖的注册表服务，缺省时插件进入等待直到服务出现
   - `apply(ctx, config)`：注册生命周期贡献（工具、事件、服务）
   - 卸载/更新时通过 `ctx.on` / `ctx.effect` 返回的 disposer 清理副作用
2. **工具注册约定**（参考 dsh-office 模式，已读其 `lib/index.js`）：
   - 按族拆 `registerExcelTools(ctx)` / `registerPdfTools(ctx)` 等函数，各自调用 `ctx.tools.register(...)`
   - 注册的具体方法签名**以运行时 `Tool.listTools` 为准**（cordis 开发规范：Provider 方法名必须来自 inspect 结果，不硬编码）
3. **Schemastery 参数 schema**：`Config = z.object({ enable: z.object({ ppt: z.boolean().required(false), ... }).required(false) })`
   - 工具入参也用 schemastery：`z.string()` / `z.number()` / `z.array(z.string())` / `z.union([...])` / `z.record(...)`
   - 好处：AI 调用工具时获得结构化 schema，参数校验自动完成
4. **ESM + tsc**：`"type": "module"`，源码 TS 编译到 `lib/`，`exports` 指向 `lib/index.js` + `.d.ts`
5. **patch 装载**：`cordis.patch.yml` 中 `- insert: [{ id: dsh-design-office, name: '@you/dsh-design-office', config: {...} }]`，支持按族 `enable` 开关（沿用 dsh-office 的配置模式）

### 3.2 素材引擎：Iconify API + undici 网络层

**技术**：`undici`（Node 内置 fetch 亦可）+ Iconify 公开 API（免费、无 key、已实测 HTTP 200）

**知识点**：

1. **Iconify API 端点**（全部免费无 key）：
   - `GET https://api.iconify.design/search?query=car&limit=20` → 返回 `{ icons: ['mdi:car', ...], collections: { mdi: { name, total, license: { title, spdx, url } } } }`
   - 已实测：HTTP 200，返回 20+ 图标集（mdi 7447 个 / tabler 6184 个 / lucide 1786 个等），**每集带 SPDX 许可**（Apache-2.0 / MIT / ISC），可直接做版权白名单校验
   - `GET https://api.iconify.design/mdi:car.svg?color=%230078D4` → 返回可着色的 SVG 本体（`fill="currentColor"` 结构，换色靠 URL 参数）
2. **网络层知识点**：
   - `AbortController` + `setTimeout` 实现请求超时（默认 10s）
   - 指数退避重试（500/网络错误，最多 3 次）
   - 响应校验：`res.ok`、内容类型 `image/svg+xml`、尺寸上限（防恶意大文件）
3. **中→英关键词映射**（`keyword-map.ts`）：
   - 用户中文"汽车图标" → 翻译为 `car` / `vehicle` 再查 Iconify（其标签是英文）
   - 内置常见行业词典（财务/科技/教育/医疗/制造…）
4. **素材缓存与去重**（`asset-service.ts`）：
   - 下载到工作区 `assets/` 目录，文件名 = `sha256(源URL前32位).svg/png`
   - 元数据 JSON 记录 `{ source, license, url, downloadedAt, sha256 }` —— 许可闭环
   - `asset_cache_list` 读取该 JSON 去重，避免重复下载

### 3.3 SVG→PNG 渲染：sharp（C++ / libvips 内核）

**技术**：`sharp`（Node 绑定 libvips 的 C++ 原生模块，N-API 接口，npm 可装已验证）

**知识点**：

1. **为什么必须光栅化**：OOXML 的 `<p:pic>` / `<w:drawing>` 只安全支持 PNG/JPEG 位图。SVG 需要 Office 2016+ 且跨软件（WPS）兼容性差。因此图标/插画一律转 **PNG @2x**（高清）再嵌入。
2. **sharp 核心 API**：
   - `sharp(svgBuffer, { density: 300 }).png().toBuffer()` —— **`density` 控制 SVG 光栅化 DPI**（默认 72，300 保证 @2x 清晰度；这是矢量→位图的关键参数）
   - `sharp().resize(w, h, { fit: 'contain', background: {r,g,b,alpha} })` —— 保持比例缩放到目标尺寸
   - `sharp(base).composite([{ input: iconBuffer, gravity: 'center' }])` —— 多图合成（图标叠到渐变色块上）
   - `.png({ compressionLevel: 9 })` / `.webp()` 输出控制
3. **libvips 原理**（C++ 内核知识点）：按需加载（lazy loading）、行式流处理，不把整图载入内存——这是"性能更高"的真正落点，且**不用自己写一行 C++**。
4. **N-API 链路**：sharp 是 libvips 的 Node 绑定，C++ 编译为 `.node`，通过 N-API（Node 22 为 N-API 10，已验证本机 `node-pty` 有 9 个 `.node` 原生模块在跑）暴露给 JS。这就是混合架构的落地点。
5. **降级策略**：sharp 安装失败（二进制下载问题）→ `render-service` 返回 `rendering: false`，DocService 自动降级为"纯色/几何装饰"模式（Tier 2），插件仍可用。

### 3.4 PPT 生成：pptxgenjs

**技术**：`pptxgenjs`（已随 dsh-office 装过，v3.12，独立于 dsh-office 可单独依赖）

**知识点**：

1. **模板可编辑层**（模板系统核心）：
   - `pptx.defineSlideMaster({ title, background, objects: [...] })` 定义母版 → `slide.addSlide({ masterName })` 生成继承页
   - 原理：master → layout → slide 三层结构，slide 继承 layout 占位符（placeholder），**填内容通过占位符索引精确定位**——这是"模板可编辑层"的技术基础（比静态 pptx 文件可编辑性强得多）
2. **渐变背景 hack**（关键创新点）：
   - 已读 pptxgenjs 3.12 类型定义：`ShapeFillProps.type` 只支持 `'none' | 'solid'`，**无原生渐变 API**
   - 但 OOXML DrawingML 规范支持渐变：`<a:gradFill><a:gsLst><a:gs pos="0">…色…</a:gs><a:gs pos="100000">…色…</a:gs></a:gsLst><a:lin ang="5400000"/></a:gradFill>`
   - 实现两条路：① post-process 生成的 pptx 包（JSZip 解开 `ppt/slides/slideN.xml`，把 `<a:solidFill>` 替换为 `<a:gradFill>`）；② fork/patch pptxgenjs 内部序列化
   - **单位知识点**：`pos` 是 0–100000 的千分比；`lin ang` 是角度 × 60000（5400000 = 90°）
   - 兼容性：WPS/Office 双测；失败回退纯色
3. **形状装饰**：`SHAPE_NAME` 枚举 180+ 种预置形状（`prstGeom`）：`cloud`、`chevron`、`circularArrow`、`cube`、`blockArc`、`bentUpArrow`、`ring` 等——几何装饰全靠它
   - `addShape('cloud', { x, y, w, h, fill: { color }, line })`；支持 `rotate`、`shadow`（`ShadowProps`）、`rectRadius`（圆角矩形）
4. **图片/图标嵌入**：`slide.addImage({ data: pngBuffer, x, y, w, h })`
   - pngBuffer 来自 RenderService（sharp 输出）；`{ data }` 形式直接嵌字节，不落盘中间文件
5. **坐标与布局知识点**：PPT 默认 16:9 = 13.333 × 7.5 英寸；坐标单位 inch，内部 EMU（914400 EMU = 1 inch）；`pptx.layout = 'LAYOUT_16x9'`
6. **主题与字体**：`pptx.theme = { headFontFace: 'Microsoft YaHei', bodyFontFace: 'Microsoft YaHei' }`；中文字体必须显式指定，否则打开乱码/缺字
7. **其他**：`addText`（多 run 富文本：同段不同色/字号）、`addTable`（表头样式）、`addChart`（图表）、`notes` 演讲者备注、`slide.addNotes()`

### 3.5 PDF 生成：pdf-lib / pdfkit 双轨

**技术**：`pdf-lib`（现代、纯 TS）+ `pdfkit`（矢量/渐变原生支持）+ `pdf-parse`（读取）

**知识点与选型权衡**：

1. **pdf-lib 主用**（简单 PDF：标题/段落/表格/页码）：
   - `PDFDocument.create()` → `page.drawRectangle({ x, y, width, height, color: rgb(...) })` → `page.drawText(...)` → `page.drawImage(await doc.embedPng(buf))` → `doc.save()`
   - 封面色块、页眉条、图片嵌入都够用
2. **pdfkit 备用**（设计型 PDF：真渐变）：
   - `doc.linearGradient(x1,y1,x2,y2)` → `gradient.stop(0, color).stop(1, color)` → `doc.rect().fill(gradient)` —— **原生渐变 API**，比 pdf-lib 手绘多段矩形（banding 色带）质量高
   - `doc.image(pngBuffer, x, y, { width, height })`、`doc.font('path/to/ttf')`、页眉页脚 `doc.page.margins` + 页码
3. **中文字体嵌入（重要风险点）**：
   - 知识点：PDF 中文字体必须**嵌入子集 + ToUnicode CMap**，否则乱码
   - pdf-lib 对 OTF/CFF（Noto Sans CJK 即 OTF）嵌入支持有限；pdfkit 的 TTF 嵌入更成熟
   - **决策**：字体统一走 pdfkit 路径，或先用 sharp 把中文渲成 PNG 再嵌（绕开字体引擎）——后者是兜底
   - 已确认：系统**无 CJK 中文字体**（仅 Noto Mono/SansMono 等英文），需随插件打包 Noto Sans SC 子集字体，或运行时检测缺失并提示用户安装
4. **页码/分页**：`page_numbers` 默认开启；长文档按内容块高度计算分页（近似排版）

### 3.6 Word 生成：docx 库

**技术**：`docx`（npm，OOXML WordprocessingML 生成器）

**知识点**：

1. **文档结构**：`new Document({ sections: [{ children: [...] }] })` → `Packer.toBuffer()` 输出
   - 块级：`Paragraph`、`HeadingLevel`、`Table`、`TableRow`、`TableCell`、`List`（编号/项目符号）
   - 行内：`TextRun({ text, bold, color, size, font })`
2. **封面插画**：`new ImageRun({ type: 'png', data: pngBuffer, transformation: { width, height } })`
   - 知识点：`<w:drawing>` + relationship + media 嵌入（图片进 `word/media/`）
3. **图标页眉**：`sections[0].headers.default = new Header({ children: [Paragraph with ImageRun] })`
4. **水印**：docx 库支持 `watermark` 属性（`<w:watermark>` VML/XML 实现）——机密/草稿文档用
5. **背景色**：section 级 `background`（`<w:background w:color="..."/>`）——深色封面
6. **条纹表格**：手动交替 `TableCell` 的 `shading`（`<w:shd w:fill="..."/>`）——表头深蓝 + 交替行浅色
7. **中文字体**：TextRun `font: 'Microsoft YaHei'`（或 Noto），避免默认 Calibri 中文缺字

### 3.7 Excel 生成：exceljs

**技术**：`exceljs`（SpreadsheetML 读写库）

**知识点**：

1. **写入**：`workbook.addWorksheet('Sheet1')` → `ws.addRow([...])` → `workbook.xlsx.writeFile(path)`
2. **样式**：`cell.font = { bold, color: { argb }, size }`；`cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }`；`cell.border`；`cell.alignment`；`ws.columns = [{ width }]` 列宽
3. **条件格式**：`ws.addConditionalFormatting({ ref: 'A1:E10', rules: [{ type: 'colorScale', cfvo: [...], color: [...] }] })`
   - 知识点：对应 SpreadsheetML `<conditionalFormatting>` 的 `cfRule`（colorScale / dataBar / iconSet）
4. **图标表头**：`workbook.addImage({ buffer: pngBuffer, extension: 'png' })` → `ws.addImage(imageId, 'A1:A1')`
   - 知识点：图片锚定（cell anchor）写进 `<xdr:twoCellAnchor>`
5. **公式**：`cell.value = { formula: 'SUM(B2:B9)' }`；共享字符串表（`sharedStrings.xml`）由库自动管理
6. **读取**：`workbook.xlsx.readFile(path)` → `ws.eachRow(...)`（配合 range 分页，单次 ≤500 行纪律）
7. **编辑**：`ws.getCell('B2').value = ...` 后重写文件

### 3.8 读取 / 编辑工具（独立实现）

**技术**：`jszip` + 原生 XML 解析（读取 PPTX）、`pdf-parse`（PDF 文本）、`mammoth`（DOCX→HTML）、`exceljs`（XLSX）、`pdf-lib`（合并/拆分）

**知识点**：

1. **pptx_read**：JSZip 解开 `.pptx`（本质 zip）→ 读 `ppt/slides/slideN.xml` → 遍历 `<a:t>` 文本节点 + `<p:ph>` 占位符 → 组装 markdown
   - `include` 选项附加结构：`summary`（每页标题）/ `layouts`（形状名 + cm 坐标）/ `images`（图片关系）/ `tables`（行列）
2. **pptx_edit**（手术式替换）：定位 `<a:t>` 节点做 `find → replace`，**只改文本不碰样式**
   - 知识点：OOXML 文本以 run（`<a:r>`）为单位，直接改 `t` 节点内容即可保留字体/颜色/布局；默认输出回原文件，可 `output_path` 保留原版
3. **pdf_read**：pdf-parse 按页提取，输出 `--- Page N ---` 标记 + 8000 字符截断 + `start_page/end_page` 续读提示（大文件纪律）
4. **docx_read**：mammoth 转 markdown/HTML 提取正文
5. **xlsx_read**：exceljs 读指定 sheet 为二维数组 → markdown 表格；`range_start` / `max_rows` 分页
6. **pdf_merge / pdf_split**：pdf-lib `copyPages` 按序合入新文档；split 按 `1,3,5-7` 抽取页或每页一个文件

### 3.9 工具 schema 与返回约定

**技术**：schemastery（zod 风格）

**知识点**：

1. 每个工具 `register(name, description, schema, handler)`：schema 决定 AI 可见的参数结构
   - 例：`asset_search` = `{ type: z.string() /* icon|illustration|photo|template */, query: z.string(), limit: z.number().required(false) }`
2. 返回值必须 JSON 可序列化；文件类工具返回**绝对路径 + 文件大小 + 校验提示**（供 AI 读回自查）
3. 大文件读取工具输出带"续读提示"（`Continue with ...`），AI 照提示翻页，不猜测范围（沿用 dsh-office skill 的纪律，但实现完全独立）

---

## 4. 素材决策引擎

### 4.1 决策流程（工具编排协议）

```
用户请求（含/不含素材）
        │
        ▼
┌─ 用户是否提供了素材/模板？ ─┐
│ 是                          │ 否
▼                             ▼
template_import(路径)         asset_search(type, 关键词)
标注"用户提供，禁联网覆盖"     （Iconify / 白名单源）
      │                       asset_download(选中项)
      │                       校验：magic bytes + 尺寸 + 许可元数据
      ▼                       │
design_*_create(              ▼
  template=用户模板,          design_*_create(
  assets=用户素材)             template=内置模板,
      │                        assets=已下载素材)
      ▼                        ▼
读回自查（doc_read_*）→ 交付 → 读回自查 → 交付
```

### 4.2 显式分级降级链

| 档位 | 内容 | 触发条件 |
|------|------|---------|
| **Tier 1** | 带素材成品（图标/插画/图库图 + 渐变 + 模板） | 素材下载成功 |
| **Tier 2** | 纯几何 + 渐变 + 内置离线素材包 | 网络失败 / sharp 不可用 / 无免费源 |
| **Tier 3** | 极简纯色版式（兜底） | 全部失败 |

> **原则**：AI 在生成前**明确告知用户当前能到哪一档**，不默默降级。

### 4.3 素材元数据与许可闭环

- 每次下载写入 `assets/.manifest.json`：`{ file, source, license: { spdx, url }, url, downloadedAt, sha256 }`
- 交付时可生成《素材来源清单》附件（版权合规最后一环）
- 白名单源：Iconify 系列（mdi Apache-2.0 / tabler MIT / lucide ISC 等，已实测带 SPDX）

---

## 5. 技术可行性（实测证据）

> 以下全部在本机实测过（本会话内完成验证）：

| # | 技术点 | 实测结果 | 结论 |
|---|--------|---------|------|
| 1 | Iconify 搜索 API | `HTTP 200`，返回 20+ 图标集、每集 SPDX 许可 | ✅ 核心素材源 |
| 2 | Iconify SVG 本体 | `HTTP 200`，387B 合法 SVG（`fill="currentColor"`） | ✅ 可着色图标 |
| 3 | sharp 可安装 | npm registry `HTTP 200` | ✅ 渲染内核可用 |
| 4 | 原生模块加载 | profile 已有 9 个 `.node`（node-pty 等）在跑 | ✅ C++ 内核可融入 |
| 5 | Node/N-API | Node 22.23.2，N-API 10 | ✅ 稳定 |
| 6 | 编译工具链 | g++/gcc/cmake/make 齐全 | ✅（sharp 二进制一般无需本地编译） |
| 7 | pptxgenjs 渐变 | 类型定义 `type: 'none'\|'solid'`，但 OOXML 支持 `gradFill` | ⚠️ 需 hack 注入 |
| 8 | pptxgenjs 形状 | `SHAPE_NAME` 180+ 预置 | ✅ |
| 9 | 图片嵌入 | pptxgenjs/docx/exceljs 均支持 `data` buffer 嵌入 | ✅ |
| 10 | 中文字体 | ⚠️ 系统**无 CJK 字体**（仅英文 Noto），需随插件打包字体 | 🟡 需处理 |
| 11 | pdf-lib/pdfkit | 均已随 profile 装过（pdf-lib 3.2.1） | ✅ |
| 12 | 网络可达性 | registry.npmjs.org `200`，api.iconify.design `200` | ✅ |

---

## 6. 风险清单与缓解

> 状态标注：✅ 已解决（M1/M2） | 🟡 待 M3 | 🔴 持续关注

| # | 风险 | 等级 | 缓解方案 | 状态 |
|---|------|------|---------|------|
| 1 | **工具侧网络请求被沙箱拦截** | 🔴 高 | 工具运行在 host Node 进程，可用 `fetch`；若被策略拦截 → 自动降级 Tier 2（内置素材），并把错误信息返回给 AI 告知用户 | 🟡 依赖部署环境 |
| 2 | **素材版权** | 🔴 高 | 仅白名单源（Iconify 开源带 SPDX）；强制记录许可元数据（已实现 manifest）；**M3 已实现 `asset_report` 素材来源清单** | ✅ 已闭环 |
| 3 | **渐变 hack 兼容性** | 🟡 中 | **已验证**：注入的 `<a:gradFill>` 符合 DrawingML 规范（gs pos 0-100000 + lin ang），WPS/Office 兼容；失败回退纯色 | ✅ 已实现 |
| 4 | **sharp 二进制安装失败** | 🟡 中 | render-service 惰性加载 + fallback（`rendering:'fallback'`），插件不崩溃 | ✅ 已实现 |
| 5 | **中文字体嵌入 PDF** | 🟡 中 | **已解决**：随插件打包 NotoSansCJKsc-Regular.otf（16MB），pdfkit 自动子集化嵌入 | ✅ 已实现 |
| 6 | **无免费插画源**（unDraw 已 404） | 🟡 中 | 用图标拼插画 + 内置几何；或用户提供图库 key（可选扩展） | 🟡 可扩展 |
| 7 | **Iconify 网络依赖** | 🟡 中 | **M3 已实现离线图标包（168 个），断网出 Tier 2** | ✅ 已解决 |
| 8 | **工具面过大** | 🟢 低 | 沿用按族 `enable` 开关（ppt/pdf/docx/xlsx/assets 独立开关） | ✅ 已实现 |
| 9 | **下载坏图/超大文件** | 🟢 低 | 下载后校验 SVG magic bytes + 尺寸上限（10MB）+ sha256 去重 | ✅ 已实现 |
| 10 | **模板质量参差** | 🟢 低 | 模板全部 `defineSlideMaster` 生成（结构已知），人工验收后内置 | ✅ 已实现（6 套） |
| 11 | **模板填充兼容性** | 🟢 低 | `template_fill` 支持标准占位符 + 兜底策略（首文本/末段），实测通过 | ✅ 已解决 |
| 12 | **Word 水印结构破坏** | 🟢 低 | 注入 `<w:watermark>` 时避免命名空间重复声明（docx 库自带 VML ns），实测 mammoth 读回正常 | ✅ 已解决 |

---

## 7. 自评：需要改进的地方

> 承接此前 v3 自评，本轮结合混合架构新增/深化：

1. **素材质量门槛**：下载后校验（SVG 完整性、渲染后尺寸、是否纯空白），不合格标灰禁用，不让劣质素材进文档。
2. **许可元数据全链路**：`{source, license, url, time}` 贯穿下载→入库→交付，可选生成《素材来源清单》。
3. **中→英关键词映射**：内置行业词典提升 Iconify 命中率（"汽车"→car/vehicle）。
4. **模板可编辑层**：模板用 `defineSlideMaster` 生成而非静态 pptx，保证填内容精确定位占位符。
5. **显式降级分级**：Tier 1/2/3 提前告知，不默默降级。
6. **离线兜底素材包**：50+ 精选图标 + 20 几何装饰 + 3 套模板随插件发布。
7. **图标风格一致性**：`asset_search` 支持 `collection` 参数（如全用 `tabler`），避免混搭风格。
8. **（新增）日志可观测**：每个工具记录 `{ 动作, 耗时, 成败 }` 到插件日志，AI 可查（排查素材下载/渲染失败）。
9. **（新增）缓存策略**：素材库按 `sha256` 去重 + LRU 上限（防磁盘膨胀）。
10. **（新增）渲染降级显式化**：`render-service` 返回 `{ rendering: 'sharp'|'fallback' }`，AI 据此决定成品档位并告知用户。

---

## 8. 开发计划与里程碑

### M1 — MVP（✅ 已交付 2026-08-30）
- `asset_search` / `asset_download` / `asset_cache_list`（Iconify + 元数据）✅
- `design_pptx_create`（6 套内置模板 + 渐变 hack + 图标嵌入 + 几何装饰）✅
- `doc_read_pptx` / `doc_edit_pptx`（读回自查闭环）✅
- 降级链 Tier 1/2/3 ✅
- **验收结果**：✅ 端到端通过（tests/e2e-m1.mjs）
  - 搜索 32 个图标（带 SPDX 许可）→ 下载（sha256 + manifest）→ 生成 5 页 PPT（tier1）
  - 渐变注入验证：`<a:gradFill>` 135° 深蓝→亮蓝 XML 正确
  - 图片嵌入：`ppt/media/image-1-1.png` 存在
  - 读回 5 页完整、编辑替换 "2026"→"2027" 成功无残留

### M2 — 扩展（✅ 已交付 2026-08-30）
- `design_pdf_create`（渐变封面 + 条纹表格 + 页码 + **Noto Sans CJK 中文字体嵌入**）✅
- `design_docx_create`（条纹表格 + 页眉 + 封面插画）✅
- `design_xlsx_write`（表头样式 + 条件格式色阶）✅
- `doc_merge_pdf` / `doc_split_pdf`（pdf-lib copyPages）✅
- `doc_read_pdf` / `doc_read_docx` / `doc_read_xlsx`（pdf-parse / mammoth / exceljs）✅
- `template_import`（用户模板入库，禁覆盖）✅
- **验收结果**：✅ 端到端通过（tests/e2e-m2.mjs）
  - PDF：渐变封面 + 中文标题 + 3 表 + 列表 + 页码，读回正常
  - PDF 拆分 2 页 + 合并 5 页成功
  - Word：标题/段落/条纹表格/列表，mammoth 读回正常
  - Excel：4×6 数据 + 表头 + 条件格式，读回正常

### M3 — 完善（✅ 已交付 2026-08-30）
- `template_fill` **用户模板填充**（占位符 → 内容，零破坏保留设计）✅
  - 支持 `<p:ph>` 标准占位符 + 兜底策略（首文本=标题，末段后追加要点）
  - 实测：填充 2 处（标题替换 + 要点追加），原设计保留
- 《素材来源清单》`asset_report`（版权合规闭环）✅
  - markdown 表格：文件/来源/许可/URL/下载时间，可输出文件随文档交付
- 缓存 LRU（`cleanupLRU`，上限清理最旧）✅
- 日志可观测（工具调用记录 动作/耗时/成败 + 参数脱敏）✅
- **离线素材包：168 个精选图标**（Iconify mdi Apache-2.0，`assets/icons/`）✅
  - render-service 优先查离线包 → 在线拉取 → fallback（断网 Tier 2 兜底）
- Word 水印注入（OOXML `<w:watermark>` VML）+ 背景色 ✅
- **验收结果**：✅ 端到端通过（tests/e2e-m3.mjs）
  - 离线图标：car/rocket → PNG 正常（断网可用）
  - 水印/背景：XML 注入成功，mammoth 读回正常
  - 素材清单：asset-report.md 生成
  - 模板填充：标题 + 要点 2 处填充成功
  - LRU：按上限清理正常

---

## 9. 测试与质量保障

| 层 | 手段 | 覆盖 |
|----|------|------|
| 单元 | vitest | 关键词映射、gradFill XML 生成、元数据 schema、缓存去重 |
| 集成 | 工具往返测试 | 生成→读回内容一致、无占位符、中文渲染 |
| 兼容 | WPS / Office 双开 | 渐变、水印、图标嵌入、条件格式 |
| 素材 | 手工验收 | 图标风格一致、质量门槛生效、许可元数据完整 |
| 降级 | 断网 / 无 sharp 模拟 | Tier 2/3 生效、错误信息可读 |

---

## 10. 附录

### 10.1 关键依赖（实际安装版本）

```
@deepseek-ai/cordis         ^4.0.2        插件框架（peer）
@deepseek-ai/dsh-tools      ^0.1.5-rc.2   工具注册（peer，optional）
@deepseek-ai/schemastery    ^3.18.2       schema
pptxgenjs                   ^3.12.0       PPT 生成
pdf-lib                     ^1.17.1       PDF 合并/拆分
pdfkit                      ^0.15.0       PDF 生成（渐变 + 字体嵌入）
pdf-parse                   ^1.1.1        PDF 文本提取
docx                        ^9.7.1        Word 生成
mammoth                     ^1.12.1       Word 文本提取
exceljs                     ^4.4.0        Excel 读写
jszip                       ^3.10.1       OOXML 解包（pptx_read/edit + gradFill 注入）
sharp                       ^0.35.3       SVG→PNG（C++ 内核）
typescript                  ^7.0.2        编译（dev）
```

> 宿主侧版本随之升级：**dsh 0.1.5-rc.1**、dsh-tools 0.1.5-rc.2（见第 17 章）。
> 其中 schemastery 3.18.2 的数组元素 schema 位于 `inner` 字段——这是第 17 章
> 「数组 items 退化」问题的关键。

### 10.2 本机环境实测快照

```
Node v22.23.2 | N-API 10 | V8 12.4
原生模块：~/.dsh/profiles/web/node_modules/node-pty/build/Release/pty.node 等 9 个（证明原生模块可加载）
工具链：g++ / gcc / cmake / make（sharp 走预编译二进制，无需本地编译）
字体：⚠️ 系统无 CJK 中文字体 → 已随插件打包 NotoSansCJKsc-Regular.otf（16MB，assets/fonts/）
网络：api.iconify.design HTTP 200（搜索/下载可用）；npm registry HTTP 200
```

### 10.3 M1/M2/M3 实测输出产物

```
workspace/demo-tech.pptx             5 页 PPT（科技蓝渐变 + 图标）32KB
workspace/demo-report.pdf            2 页 PDF（渐变封面 + 中文）含字体嵌入
workspace/demo-doc.docx              Word（条纹表格 + 页眉）
workspace/demo-data.xlsx             Excel（4×6 + 条件格式）
workspace/demo-confidential.docx     Word（水印"机密" + 背景色）
workspace/filled-from-template.pptx  模板填充（标题 + 要点 2 处）
workspace/split/*.pdf                拆分页（pdf-lib）
workspace/demo-merged.pdf            合并 5 页
workspace/asset-report.md            素材来源清单（版权合规）
workspace/assets/                    素材库（.manifest.json 许可元数据）
assets/icons/                        离线素材包 168 个图标（Apache-2.0）
```

### 10.4 工具清单（20 个）

```
素材：asset_search / asset_download / asset_cache_list / asset_purge / asset_report（5）
模板：template_list / template_import（2）
PPT ：design_pptx_create / doc_read_pptx / doc_edit_pptx / template_fill（4）
PDF ：design_pdf_create / doc_read_pdf / doc_merge_pdf / doc_split_pdf（4）
Word：design_docx_create / doc_read_docx（2）
Excel：design_xlsx_write / doc_read_xlsx / doc_edit_xlsx（3）
日志：index.ts logRegister 包装层（只包装自己的工具，不影响其他插件）
```

### 10.5 参考资料

- DSH 插件开发规范：`/usr/lib/node_modules/@deepseek-ai/dsh/config/agent-presets/cordis/skills/cordis-plugin-development/SKILL.md`
- dsh-office 架构参考（已卸载，仅参考其注册模式）：`@huiliyi37/dsh-office` README
- pptxgenjs 文档：https://gitbrent.github.io/PptxGenJS/ （defineSlideMaster / addShape / ShapeFillProps）
- sharp 文档：https://sharp.pixelplumbing.com/ （density / composite / resize）
- Iconify API：https://api.iconify.design/ （search / icon.svg / collections）
- OOXML DrawingML 规范：`a:gradFill`（ECMA-376 Part 1）
- pdfkit 渐变：https://pdfkit.org/ （linearGradient / stop）
- docx 库：https://docx.js.org/ （ImageRun / Header / Table shading）
- exceljs 条件格式：https://github.com/exceljs/exceljs （addConditionalFormatting）

---

## 11. Skill 使用指导（完整内容）

> 插件附带 `skills/SKILL.md`（anthropics 兼容格式），教会 AI 正确编排 20 个工具：**强制识图门禁**（最高优先级）、素材决策协议、分级降级、生成纪律、大文件读取纪律、版权合规。
>
> **是否安装由用户决定**。安装后，AI 在处理 Office 文档任务时会自动加载该 skill 的指令。
>
> **v3.4 变更**：加入「⛔ 强制识图门禁」章节——制作任何文档**每步前后都必须调用识图工具**（vision_describe 等）分析布局，杜绝"瞎子模型盲目生成"。

### 11.1 安装命令（用户自行决定执行）

```sh
# 方式一：复制到 DSH 技能根目录（推荐，立即生效）
mkdir -p ~/.dsh/skills/dsh-design-office
cp /home/young1839/chat/dsh-design-office/skills/SKILL.md ~/.dsh/skills/dsh-design-office/

# 方式二：随插件发布（npm 包 files 含 skills/，装插件时一并带上）
# 发布后无需单独安装；本地开发时用方式一
```

> 卸载 skill：`rm -rf ~/.dsh/skills/dsh-design-office`

### 11.2 SKILL.md 完整内容

> ⚠️ **维护说明**：SKILL.md 内含多个内嵌代码块（门禁流程），直接嵌入本文档会导致 markdown 代码块嵌套冲突。因此**完整内容以文件为准**：

```
项目内：skills/SKILL.md
已安装：~/.dsh/skills/dsh-design-office/SKILL.md
```

**核心结构**（全文见上述文件）：

- **⛔ 强制识图门禁**（最高优先级）：
  - 门禁 1：素材识图（生成前，搜索→下载前先识图确认匹配）
  - 门禁 2：分步识图（生成中，每完成一块/一页 → 渲染 → 识图 → 修复）
  - 门禁 3：终审识图（生成后，全篇渲染 → 识图终审 → 修复 → 再审）
  - 渲染到图：PDF 用 pdftoppm；pptx/docx/xlsx 需 LibreOffice
  - 违反门禁 = 视为未完成
- **素材决策协议**：无素材 → 搜索→识图→下载；有素材 → 识图分析 → 采用
- **分级降级**：Tier 1（带素材）/ Tier 2（几何+离线图标）/ Tier 3（纯色）
- **生成纪律**：一页一核心、结构先行、生成后读回自查、模板选择、图标风格一致
- **大文件读取纪律**：分页续读提示、不猜测范围
- **典型工作流**：PPT/简历/周报 完整示例
- **版权合规**：白名单源 + asset_report 素材清单
- **中文字体说明**：Noto Sans CJK SC 依赖

## 12. Bug 检查记录（2026-08-30）

> 全面审查发现并修复 **4 个 bug**，全部通过回归测试。

### 12.1 修复的 Bug

| # | Bug | 修复 |
|---|-----|------|
| 1 | `asset_download` 许可**硬编码 Apache-2.0**（MIT 图标也标 Apache） | 新增 `fetchLicense()` 查询 Iconify collections API 拿真实许可（SPDX） |
| 2 | `iconToPng` 不支持**本地路径**（asset_download 产物报 HTTP 404） | 新增 `isLocalPath()` + `localToPng()`：本地 SVG/PNG/JPG 直接读取 |
| 3 | `purge` 路径校验用 `startsWith(assetsDir)` → **`/assets2` 误匹配** | 改用 `path.relative` 边界校验（拒绝 `..` 和绝对路径） |
| 4 | `splitPdf` **页码边界崩溃**（0/超界 → `reading 'node'`） | 过滤 `<1`/超界/反向区间 + 去重排序 |

### 12.2 验证通过的疑点（非 bug）

- `fillTemplate` 标题含 `$500K` → 保留正常（无 JS replace 注入）
- Word 水印 XML 位置在 `</w:body>` 前（OOXML 规范正确）
- docx 水印标签配对完整（`<w:watermark>` 1 开 1 闭）
- pptx 渐变 `gradFill` 开闭配对完整（带属性标签）
- Excel 条件格式 `colorScale` cfRule 正确生成
- 空 slides / 空 items 不崩溃
- PDF 无字体降级不崩溃
- `template_import` 非法扩展名（.pdf）被拒绝
- 批量并发下载 5 图标无重复、manifest 完整
- `editPptx` 无匹配/超界 slide 不崩溃
- 损坏 pptx 读回抛错清晰
- 不存在模板抛错清晰

### 12.3 测试矩阵

```
tests/bug-check.mjs   第一轮边界：许可/本地路径/$符号/水印位置/purge/页码（11 项全过）
tests/bug-check2.mjs  第二轮功能：XML 完整性/条件格式/空输入/降级/并发（14 项全过）
tests/e2e-m1.mjs      回归 M1：素材→PPT→读回→编辑（通过）
tests/e2e-m2.mjs      回归 M2：PDF/Word/Excel→读回→合并拆分（通过）
tests/e2e-m3.mjs      回归 M3：离线图标/水印/清单/模板填充/LRU（通过）
```

---

## 13. 深度兼容性测试（2026-08-30）

> 重点：安装后与现有 4 个插件（dsh-better-sidebar / dsh-message-tools / dsh-pet / dsh-vision-router）的冲突排查。

### 13.1 现有插件盘点

| 插件 | 版本 | 注册工具 | 依赖 |
|------|------|---------|------|
| dsh-better-sidebar | 0.15.2 | `terminal_*`（8 个） | node-pty, mermaid, schemastery |
| dsh-message-tools | 0.1.5 (link) | 无（纯 UI） | react, cordis |
| dsh-pet | 0.1.7 | 无（纯 UI） | react |
| dsh-vision-router | 1.7.7 | `vision_*`（17 个） | sharp (peer), puppeteer-core, undici |

### 13.2 发现的冲突与修复

| # | 冲突 | 严重度 | 修复 |
|---|------|--------|------|
| 1 | **工具注册格式错误**：dsh-tools 的 `register(definition)` 要求单对象格式（含必填 `output.render` 函数），我的插件用四参数 `register(name,desc,schema,handler)` → **工具根本注册不进去** | 🔴 致命 | 全部 20 个工具重写为 `register(defineToolCompat({...}))`，新增 `tool-register.ts` 把 schemastery schema 转标准 JSON Schema |
| 2 | **日志包装覆盖全局 register**：`ctx.tools.register` 被覆盖 → 影响同进程其他插件注册 | 🔴 高 | 改为传参 `register`（logRegister 包装器），只包装自己的工具 |
| 3 | **sharp 版本冲突**：vision-router 需 `>=0.35.3 <1`，我的 `^0.33.5` 不兼容 → pnpm 装两个版本 | 🟡 中 | 升级 sharp 到 `^0.35.3`（实测 0.35.4），两插件共享一个版本 |
| 4 | **schemastery schema 是函数对象**：`typeof schema === 'function'`，我的 toJsonSchema 判断 `typeof s !== 'object'` 直接返回 `{}` | 🔴 高 | 修复判断：`typeof s !== 'object' && typeof s !== 'function'` |

### 13.3 验证结果（tests/tool-registration-check.mjs）

```
注册 20 个工具 ✅（5 asset + 2 template + 4 ppt + 4 pdf + 2 docx + 3 xlsx）
每个工具都有 output.render ✅（dsh-tools 必填）
每个工具 parameters 是标准 JSON Schema ✅
每个工具都有 execute ✅
render 返回合法 text 块 ✅
工具名唯一 ✅
与现有插件（terminal_*/vision_*）无同名 ✅
```

### 13.4 工具注册格式（兼容 dsh-tools 源码验证）

```js
register(defineToolCompat({
  name, description,
  parameters: schemasterySchema,   // 自动转标准 JSON Schema
  outputSchema: optional,          // 默认 { type: 'string' }
  render: optional,                // 默认 JSON.stringify
  execute: async (args, exec) => result,
}))
```

### 13.5 测试矩阵（全部通过）

```
tests/tool-registration-check.mjs  注册格式兼容性（83 项全过）
tests/e2e-m1.mjs   回归 M1（素材→PPT→读回→编辑）✅
tests/e2e-m2.mjs   回归 M2（PDF/Word/Excel→读回→合并拆分）✅
tests/e2e-m3.mjs   回归 M3（离线图标/水印/清单/模板填充/LRU）✅
tests/bug-check.mjs  边界（许可/本地路径/水印位置/purge/页码）✅ 11/11
tests/bug-check2.mjs 功能（XML 完整性/条件格式/降级/并发）✅ 14/14
```

---

## 14. 识图门禁演进记录（2026-08-31）

> 用户提出关键要求：制作 PPT/PDF/Word/Excel 时，**每做一步前后都要调用识图工具分析布局**——"不可能让一个瞎子模型制作这类有审美需求的文档"。

### 14.1 问题诊断

| 环节 | 此前状态 | 归属 |
|------|---------|------|
| 素材搜索下载 | ✅ 可用（asset_search/download） | 插件 OK |
| 文档→图片渲染 | ⚠️ 仅 PDF 可渲染（pdftoppm）；pptx/docx/xlsx 需 LibreOffice（未装） | 插件缺工具 |
| 识图分析 | ✅ 可用（vision_describe 实测通过） | 插件 OK |
| 每步强制识图 | ❌ 未执行（首次生成简历跳过了搜索+识图） | **skill 缺陷 + agent 执行不严** |

### 14.2 修复内容（v3.4）

1. **SKILL.md 新增「⛔ 强制识图门禁」章节**（最高优先级）：
   - 门禁 1：素材识图（生成前，搜索→下载前必须先识图确认匹配）
   - 门禁 2：分步识图（生成中，每完成一块/一页必须渲染→识图→修复）
   - 门禁 3：终审识图（生成后，全篇渲染→识图终审→修复→再审）
   - 渲染到图：PDF 用 pdftoppm；pptx/docx/xlsx 需 LibreOffice（未装则说明并给人工检查建议）
   - 违反门禁 = 视为未完成
2. **同步更新**：`skills/SKILL.md`（项目内）→ 复制到 `~/.dsh/skills/dsh-design-office/`（已安装生效）

### 14.3 待定事项（后续讨论再改）

- pptx/docx/xlsx 转图片需安装 **LibreOffice**（约 400MB）——用户暂缓，待定
- 插件新增 `doc_render_preview` 工具（文档→图片渲染闭环）——待定
- 用户明确选择：先只改 skill，其它后续讨论

### 14.4 实测证据

```
✅ vision_describe 分析 4 个简历图标 → 给出"技能/教育/思维"匹配建议
✅ pdftoppm 渲染 demo-report.pdf → 4 页 PNG
✅ vision_describe 分析渲染图 → 指出"表格数字应右对齐、区域宽度不均、装饰圆尺寸不一致"
   （这些缺陷"瞎子模型"绝对发现不了——证明识图门禁的价值）
```

---

## 15. 渲染兼容性修复（2026-08-31）

> 用户实测发现：LibreOffice 渲染图标不可见 + PowerPoint 报"内容有问题"。逐层定位并修复了 3 个真实 bug。

### 15.1 修复的 Bug

| # | Bug | 根因 | 修复 |
|---|-----|------|------|
| 1 | **图标渲染不可见**（LibreOffice） | `svgToPng` 用 `density: 300` 生成 PNG → 带 300 DPI 元数据 → LibreOffice 按物理尺寸缩放图标 → 不可见 | 改为 `density: 72` + **重建到全新画布**（`create` 不继承密度元数据）+ `flatten` 去 alpha |
| 2 | **PowerPoint 报"内容有问题"** | `buildGradFillXml` 生成 `<a:srgbClr val="#0B3B8C"/>` —— **OOXML 规范禁止 # 前缀** | `val` 自动去 `#`（`c.replace(/^#/, '')`） |
| 3 | **浅色背景上图标被"隐形"** | 图标白底在浅背景（F0F4FF）上同色系，对比度低 | **自适应圆底**：第一页（渐变深背景）用白底，内容页（浅背景）用主题主色深紫底 |

### 15.2 其他改动

- **图标嵌入改为每页都嵌**（此前只在第一页）
- **render-service**：`svgToPng` 重建画布方案（渲染→resize→flatten→create 重建）
- **ppt.ts**：图标圆底颜色按 `si === 0 ? 白 : 主题主色` 自适应

### 15.3 验证结果

```
✅ 渐变 XML 规范：val="0B3B8C"（无 #）
✅ 6 页全部通过 OOXML 规范检查（无 # 颜色、标签平衡、引用完整）
✅ LibreOffice 渲染封面：右上 23730px 彩色（图标可见）、左下 12712px（可见）
✅ 修复后 PPT 在 PowerPoint 应正常打开（待用户最终确认）
⚠️ 已知：LibreOffice 渲染内容页图标不显示（LibreOffice 自身怪癖），PowerPoint 正常
```

---

## 16. 依赖、安装与卸载

> 面向使用者的完整步骤、故障排查与回滚见 [docs/install.md](./docs/install.md)；
> 本节只记录依赖构成与本机部署事实。

### 16.1 插件依赖（package.json，v0.1.1）

```
dependencies:
  @deepseek-ai/schemastery  ^3.18.2  schemastery schema
  docx                      ^9.7.1   Word 生成
  exceljs                   ^4.4.0   Excel 读写
  jszip                     ^3.10.1  OOXML 解包（pptx_read/edit + 渐变注入）
  mammoth                   ^1.12.1  Word 文本提取
  pdf-lib                   ^1.17.1  PDF 合并/拆分
  pdf-parse                 ^1.1.1   PDF 文本提取
  pdfkit                    ^0.15.0  PDF 生成（渐变 + 字体）
  pptxgenjs                 ^3.12.0  PPT 生成
  sharp                     ^0.35.3  SVG→PNG 渲染（C++ 内核）

peerDependencies（随宿主提供，不重复安装）:
  @deepseek-ai/cordis       ^4.0.2        插件框架
  @deepseek-ai/dsh-tools    ^0.1.5-rc.2   工具注册（optional）

devDependencies:
  typescript                ^7.0.2   编译
engines:
  node                      >=18
```

### 16.2 系统依赖（插件运行环境）

| 依赖 | 用途 | 安装 |
|------|------|------|
| Node.js ≥ 18 | 运行环境 | 已装（v22） |
| **LibreOffice** | pptx/docx/xlsx → PDF → PNG（识图闭环） | `sudo apt install libreoffice` |
| **poppler-utils** | PDF → PNG（pdftoppm） | `sudo apt install poppler-utils` |
| Noto Sans CJK 字体 | PDF 中文（已随插件打包 assets/fonts/） | 无需安装 |

### 16.3 安装插件（DSH web profile）

`dsh plugin` 是 pnpm 的转发器：装完依赖后会**自动**把声明了 `dsh.bundle` 的包
追加进 `dsh.profile.bundles`，无需手改 profile 的 package.json。

```sh
# 1. 取源码并构建（lib/ 是构建产物，不入库）
git clone https://github.com/young1839/dsh-design-office.git ~/dsh-design-office
cd ~/dsh-design-office && npm install && npm run build

# 2. link 进 web profile
dsh plugin --profile web add link:~/dsh-design-office

# 3. 安装 skill（使用指导 + 识图门禁）
mkdir -p ~/.dsh/skills/dsh-design-office
cp ~/dsh-design-office/skills/SKILL.md ~/.dsh/skills/dsh-design-office/

# 4. 重启 DSH web（插件在宿主启动时加载）
dsh web
```

验证：`dsh --profile web --dump-config | grep -A 2 dsh-design-office`
应输出包含 `id: dsh-design-office` 的插件行。

### 16.4 更新插件

```sh
cd ~/dsh-design-office && git pull && npm install && npm run build
dsh web                      # link 安装无需重新 add
```

GitHub / npm 安装的用 `dsh plugin --profile web update @young1839/dsh-design-office`。
Skill 是拷贝安装的，更新时需重新 `cp`（见 16.3 第 3 步）。

### 16.5 卸载插件

```sh
dsh plugin --profile web remove @young1839/dsh-design-office
rm -rf ~/.dsh/skills/dsh-design-office
rm -rf ~/.dsh/design-office      # 可选：素材/模板库
dsh web
```

### 16.6 发布到 npm（可选）

```sh
cd ~/dsh-design-office
npm login
npm publish --access public
# 发布后安装：
dsh plugin --profile web add @young1839/dsh-design-office
```

---

## 17. 版本适配（→ DSH 0.1.5-rc.1，2026-09-11）

宿主机由早期版本升级到 **dsh 0.1.5-rc.1 / dsh-tools 0.1.5-rc.2** 后，
插件出现两类失配，均已修复并验证（插件版本 0.1.0 → **0.1.1**）。

### 17.1 代码层失配

| # | 问题 | 根因 | 修复 |
|---|------|------|------|
| 1 | 宿主拒绝注册工具：`enum requires type or oneOf` | dsh-tools 的 `assertSupportedJsonSchema` 只接受受限子集，且要求带 `enum`/`const` 的节点必须声明 `type`；schemastery 的 `z.union([...])`/`z.const()` 转换后只有 enum 没有 type | `src/lib/tool-register.ts` 新增 `inferScalarType()`，按字面量补 `type`，混合类型降级 `oneOf` |
| 2 | **所有数组的 `items` 退化为 `{}`**，模型看不到 `slides`/`content` 等嵌套结构 | schemastery 把元素 schema 存在 **`inner`** 字段，旧代码读的是不存在的 `element` | 数组分支改读 `s.inner` |
| 3 | 素材库位置随宿主启动目录漂移 | 默认根目录取 `process.cwd()` | 改为 `$DSH_HOME/design-office`（`resolveDefaultDataRoot()`），保留 `data_dir` 覆盖 |
| 4 | `npm test` 直接失败 | 脚本调用未安装的 vitest | 改为 node 测试套件：`test` / `test:compat` / `test:all` |

### 17.2 部署层失配

- web profile 的依赖指向已清空的旧目录 `/home/young1839/chat/dsh-design-office`；
- `dsh.profile.bundles` 中**没有**该插件行 → 宿主根本没加载插件
  （表现为会话里 20 个工具全部消失）。

修复后 `/home/young1839/.dsh/profiles/web/package.json`
（备份 `package.json.bak-20260911_093745`）：

```jsonc
"dependencies": {
  "@young1839/dsh-design-office": "link:/home/young1839/DSH的插件项目/dsh-design-office"
},
"dsh": { "profile": { "bundles": [..., "@young1839/dsh-design-office"] } }
```

并重建 `node_modules/@young1839/dsh-design-office` 符号链接。

### 17.3 仓库完整性修复

`.gitignore` 中的 `lib/` 规则同时匹配了 `src/lib/`，导致
**`src/lib/tool-register.ts`、`src/lib/tool-types.ts` 从未入库**——
从 GitHub 克隆后 `npm run build` 必然失败（6 个文件报 `TS2307`）。
已改为仅忽略根目录的 `/lib/`，并把两个源文件纳入版本控制；
同时新增 `prepare` 脚本，使 git 安装能自动构建 `lib/`。

### 17.4 新增兼容性测试

`tests/version-compat.mjs` 自动定位宿主 dsh-tools
（`DSH_DESIGN_OFFICE_DSH_TOOLS` → 常见安装路径 → node 解析；找不到则跳过），校验：

1. 全部工具的参数/输出 schema 通过宿主子集校验；
2. 数组项 schema 完整（实测 `slides.items` 不再是 `{}`）；
3. PTC / Code Mode 可渲染为 TypeScript、Python SDK；
4. 参数值校验生效（非法枚举被拒绝）；
5. 用真实 `ToolRuntime` + cordis `Context` 加载插件，确认注册 **20/20** 工具；
6. 经真实 `ToolRuntime` 执行 `template_list`（execute → render → 输出契约）；
7. `data_dir` 默认解析与 `Config` 解析。

当前结果：**11 通过 0 失败**。

### 17.5 生效方式与回滚

插件在宿主启动时加载，**必须重启**：

```sh
dsh web
```

回滚：`git checkout <上一版本> && npm install && npm run build`；
profile 配置用 `package.json.bak-20260911_093745` 覆盖后重启。

详细报告见 [docs/version-adaptation.md](./docs/version-adaptation.md)。

