# 变更记录

本文件记录所有值得注意的变更。版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.1.1] — 2026-09-11

适配 DeepSeek Harness **0.1.5-rc.1** / `@deepseek-ai/dsh-tools` **0.1.5-rc.2**，
并修复一轮实测发现的 Bug。

### 兼容性（升级宿主后必须更新）

- **工具 schema 适配 dsh-tools 受限子集**：带 `enum`/`const` 的节点现在会补上
  `type`（混合类型降级为 `oneOf`）。修复前宿主校验直接报
  `enum requires type or oneOf`（`asset_search` 实测触发）。
- **修复数组元素 schema 全部退化**：schemastery 把内层 schema 存在 `inner` 字段，
  旧代码读取不存在的 `element` 字段，导致 `slides`、`content` 等**所有数组的
  `items` 都是空 `{}`**——模型完全看不到嵌套字段约束。修复后
  `design_pptx_create.slides.items` 携带完整结构。
- **`peerDependencies` 对齐**：`cordis ^4.0.2`、`dsh-tools ^0.1.5-rc.2`；
  新增 `engines.node >= 18`。
- **新增 `tests/version-compat.mjs`**：针对**当前安装**的宿主 dsh-tools 实测
  schema 子集 / 数组项 / PTC 渲染 / 参数校验 / 真实加载插件 / 真实执行工具。

### 新增

- `docs/install.md`：安装、更新、卸载、配置、故障排查、回滚。
- `docs/prompt-guide.md`：AI 生成 PPT / PDF / Word / Excel 的提示词写法。
- `docs/version-adaptation.md`、`docs/bug-report.md`：适配与 Bug 修复报告。
- `CHANGELOG.md`：本文件。
- `prepare` 脚本：从 git 安装时自动构建 `lib/`。

### 修复

- **PPT 页面尺寸错误（内容被裁）**：`LAYOUT_16x9` 实际是 10″×5.625″，而所有坐标按
  13.33″ 设计，导致 x > 10″ 的元素（右上装饰、图标、右侧内容）全部被裁。
  改用 `LAYOUT_WIDE`（13.33″×7.5″）。
- **图标颜色失效 / 白底覆盖**：Iconify 在不带 `#` 时返回非法颜色值
  `fill="00A3FF"`，被渲染成黑色；`svgToPng` 强制白底又盖住了圆底。
  新增 `normalizeColor()`、改为透明底输出、支持 `currentColor` 替换。
- **封面标题与渐变背景对比度不足**：渐变模板的封面 / 章节标题固定为白色。
- **Word 水印不显示、背景色丢失**：旧实现把水印塞进 `<w:background>`，违反
  OOXML 顺序且与 docx 库生成的背景色冲突。改用**页眉 VML 水印**方案。
- **并发下载丢失素材记录**：`asset_download` 并发写清单时互相覆盖，
  新增 `withManifestLock()` 串行化清单写入。
- **素材库位置随 cwd 漂移**：默认目录改为 `$DSH_HOME/design-office`。
- **`.gitignore` 误忽略 `src/lib/`**：`lib/` 规则同时匹配了 `src/lib/`，导致
  `src/lib/tool-register.ts`、`src/lib/tool-types.ts` **从未入库**，全新克隆无法构建。
  改为只忽略根目录 `/lib/`。
- **`npm test` 无法运行**：原先调用未安装的 `vitest`，改为可直接运行的 node 测试套件。

### 文档

- README 重写：环境要求、三种安装方式、更新、卸载、版本兼容矩阵、配置、故障排查入口。

## [0.1.0] — 2026-08-30

首个版本。

- 20 个工具：素材（5）、模板（3）、PPT（3）、PDF（4）、Word（2）、Excel（3）。
- 6 套内置模板；168 个离线图标；随包 Noto Sans CJK SC 字体。
- PPT 渐变背景（OOXML `gradFill`）、图标嵌入、图表、表格。
- PDF 渐变封面、页码、中文字体嵌入；合并 / 拆分。
- Word 条纹表格、页眉、水印；Excel 条件格式色阶、图标表头。
- `dsh-design-office` Skill：素材决策流程 + 强制识图门禁。
