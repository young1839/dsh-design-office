---
name: dsh-design-office
description: 生成、编辑、读取设计增强版 Office 文档（PPT 演示文稿 / PDF / Word / Excel）——渐变背景、图标素材、插画封面、模板系统，适合需要"设计感"的交付场景（汇报、简历、报告、论文答辩、方案书）
triggers: [ppt, pptx, 演示, 幻灯片, slide, presentation, pdf, 报告, 合同, word, docx, 文档, excel, xlsx, 表格, 电子表格, 简历, 论文, 设计感, 模板, 图标, 渐变, 插画]
---

# dsh-design-office（设计增强 Office 文档工具）

@young1839/dsh-design-office 为 DeepSeek Harness 提供 20 个设计增强 Office 文档工具：生成带渐变/图标/插画的 PPT、PDF、Word、Excel，自动搜索下载素材（工具化、可审计），用户提供素材时优先采用用户素材。

## 工具总览

| 类别 | 工具 | 用途 |
|------|------|------|
| 素材 | `asset_search` | 搜索设计素材（图标/插画/图片/模板），返回候选含许可 |
| 素材 | `asset_download` | 下载选中素材到素材库（校验 + 许可元数据 + sha256） |
| 素材 | `asset_cache_list` | 查看素材库缓存（避免重复下载） |
| 素材 | `asset_purge` | 清理素材库缓存（全部或指定） |
| 素材 | `asset_report` | 生成《素材来源清单》（版权合规，随文档交付） |
| 模板 | `template_list` | 列出 6 套内置模板 + 用户导入模板 |
| 模板 | `template_import` | 导入用户提供的模板（标注"用户提供，禁覆盖"） |
| 模板 | `template_fill` | 把用户模板按占位符填充内容（零破坏保留设计） |
| PPT | `design_pptx_create` | 生成设计增强 PPT（7 版式 + 渐变 + 图标 + 模板） |
| PPT | `doc_read_pptx` | 读取 PPT 文本为 markdown（可附结构） |
| PPT | `doc_edit_pptx` | 查找替换文本（保留全部样式） |
| PDF | `design_pdf_create` | 生成设计增强 PDF（渐变封面 + 中文嵌入 + 页码） |
| PDF | `doc_read_pdf` | 按页读取 PDF 文本 |
| PDF | `doc_merge_pdf` | 合并多个 PDF |
| PDF | `doc_split_pdf` | 拆分/抽取 PDF 页 |
| Word | `design_docx_create` | 生成 Word（条纹表格 + 页眉 + 水印 + 背景色） |
| Word | `doc_read_docx` | 读取 Word 文本 |
| Excel | `design_xlsx_write` | 生成 Excel（表头 + 条件格式 + 图标表头） |
| Excel | `doc_read_xlsx` | 读取 Excel 为 markdown（分页） |
| Excel | `doc_edit_xlsx` | 更新单元格 |

## ⛔ 强制识图门禁（最高优先级，不可跳过）

> **核心原则：有审美的文档必须"看得见"才能做。绝不允许像瞎子一样盲目生成！**

制作 PPT / PDF / Word / Excel 时，**每一步前后都必须调用识图工具**（`vision_bootstrap` / `vision_describe` / `vision_detect` 等）分析布局。这是硬性门禁，不是可选项：

### 门禁 1：素材识图（生成前，必做）
```
用户未提供素材：
  ① asset_search(type, 关键词) —— 搜索候选
  ② 必须把候选素材渲染/转成 PNG（sharp 或直接读图）
  ③ 必须调用 vision_describe 分析：图标/插画内容是否与文档主题匹配？
     - 匹配 → 才允许 asset_download
     - 不匹配 → 换关键词重新搜索
用户提供了素材：
  ① 同样必须 vision_describe 分析用户素材（内容/风格/可用性）
  ② 若素材不足，asset_search 补充下载
```

### 门禁 2：分步识图（生成中，每步必做）
```
每完成一个内容块/一页/一次编辑：
  ① 把当前文档渲染成图片（见下方"渲染到图"）
  ② 必须调用 vision_describe 分析布局：
     - 标题/正文位置是否合理？
     - 有无重叠、溢出、乱码、错位？
     - 留白/对齐/配色是否协调？
  ③ 有问题 → 立即修复 → 重新渲染 → 重新识图，直到通过
```

### 门禁 3：终审识图（生成后，必做）
```
整份文档完成后：
  ① 全部页渲染成图片
  ② 必须调用 vision_describe 逐页终审（布局/风格/一致性/美观度）
  ③ 有缺陷 → 修复 → 再渲染 → 再终审
  ④ 通过后，调用 asset_report 生成《素材来源清单》随文档交付
```

### 渲染到图（识图的前提）
```
PDF：pdftoppm -png -r 100 <file.pdf> <out>   → 生成 PNG 供识图
PPT/Word/Excel：需要 LibreOffice 渲染（若环境未装，向用户说明"该格式暂无法自动识图"，并给出人工检查建议）
```

### 违反门禁的后果
- 未先识图就生成 → **视为未完成**，必须补做
- 生成后未识图终审 → **视为未完成**，必须补做
- 用户要求快/随便 → **仍须至少一次终审识图**（可在用户明确豁免时跳过，但必须告知用户"未识图"风险）

## 素材决策协议（在识图门禁约束下执行）

```
用户是否提供了素材/模板？
├─ 提供 → template_import 入库（标记用户来源）→ 识图分析 → design_*_create 采用
│         ⚠️ 禁止用联网素材覆盖用户素材
└─ 未提供 → asset_search(type, 关键词) → 识图确认匹配 → asset_download → design_*_create
```

### 分级降级（必须显式告知用户）

| 档位 | 内容 | 触发 |
|------|------|------|
| **Tier 1** | 带素材成品（图标/插画 + 渐变 + 模板） | 素材可用 |
| **Tier 2** | 纯几何 + 渐变 + 离线图标包（168 个内置） | 网络失败/无免费源 |
| **Tier 3** | 极简纯色版式 | 全部失败 |

> 生成前告诉用户"当前能到 Tier N"，不默默降级。降级后**仍须识图**检查效果。

## 何时使用

- 用户要**可交付文件**（.pptx/.pdf/.docx/.xlsx），且需要**设计感**（渐变/图标/插画/模板）
- 纯文本/Markdown 能交付时不用——更轻、可 diff
- 用户明确要"精美/设计感/像模板那样"的文档时，**优先用本插件**而非普通 office 工具

## 生成纪律

1. **一页一核心信息**（PPT）：讲不透就拆页；"少字是叙事选择，空白是设计失误"
2. **结构先行**：数据用表格/图表呈现，不写流水句
3. **生成后自查**：用 `doc_read_pptx` / `doc_read_pdf` / `doc_read_docx` / `doc_read_xlsx` 读回产出，确认内容完整、无占位符（lorem/xxx/TODO）、中文渲染正常
4. **模板选择**：先 `template_list` 看模板风格（科技蓝渐变/扁平卡片/极简商务/简历/办公报告/论文报告），按用户场景选
5. **图标风格一致**：`asset_search` 用 `collection` 参数限定同一图标集（如全用 `tabler`），避免混搭

## 大文件读取纪律

- `doc_read_xlsx` 单次默认 200 行（可 `max_rows` 到 500），超长有 `Continue with range_start: "A{n}"` 提示——**照提示续读，不猜测**
- `doc_read_pdf` 8000 字符截断，超长按 `start_page`/`end_page` 分页续读
- 不要为"读完整个文件"重复调用——按需读，读完相关部分就停

## 典型工作流示例

**用户："做一份 2026 新能源市场分析的 PPT，要科技感"**
1. `template_list` → 选「tech-blue-gradient」
2. `asset_search(icon, "汽车")` → **vision_describe 识图确认匹配** → `asset_download`
3. `design_pptx_create(template=tech-blue-gradient, icons=[...], slides=[...])`
4. **渲染成图 → vision_describe 分步/终审识图** → 修复直到通过
5. `doc_read_pptx` 读回自查 → `asset_report` 出清单 → 交付

**用户："用我的模板做简历"**（用户提供 .pptx）
1. `template_import(用户.pptx)` → 入库
2. **vision_describe 识图分析用户模板**（了解版式/配色/占位符）
3. `doc_read_pptx(用户模板, include=[layouts])` 了解占位符结构
4. `template_fill(template_path, fills=[{slide, title, items}])` → 零破坏填充
5. **渲染 → 识图检查** → 修复 → 交付

**周报：**
1. `design_xlsx_write` 数据表 → `doc_read_xlsx` 自查
2. `design_pdf_create` 排版成 PDF 报告 → **pdftoppm 渲染 → vision_describe 识图** → `doc_read_pdf` 抽查关键页

## 版权合规（交付前必读）

- 所有在线素材来自 Iconify 白名单（Apache-2.0/MIT/ISC），`asset_download` 自动记录许可
- 正式交付（商业/对外）前调用 `asset_report` 生成《素材来源清单》随文档附上
- 用户提供素材时：`template_import` 标记来源，素材清单同样包含

## 中文字体说明

- PDF 中文依赖随插件打包的 Noto Sans CJK SC（assets/fonts/）
- 若字体缺失（提示"无中文字体"）：告知用户，建议重装插件或改用英文
- PPT/Word/Excel 中文用字体名 `Microsoft YaHei` / `Noto Sans SC`（打开端本地有即可）

## 组合示例

- 汇报 PPT：`template_list` 选模板 → `asset_search` 图标 → 识图确认 → `design_pptx_create` → 渲染识图 → `doc_read_pptx` 自查
- 合同 PDF：`design_pdf_create` → pdftoppm 渲染 → 识图检查 → `doc_read_pdf` 抽查
- 机密 Word：`design_docx_create(watermark="机密")` → 渲染识图 → `doc_read_docx` 验证
- 简历：用户模板 → 识图分析模板 → `template_fill` → 渲染识图 → 交付
- 论文答辩：`template_list` 选「academic-paper」→ `design_pptx_create` → 渲染识图终审
