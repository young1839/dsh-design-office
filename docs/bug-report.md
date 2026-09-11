# dsh-design-office 插件 Bug 审查与修复报告

审查对象：`<repo>`（src + lib + tests）
审查方式：静态代码走查 + 宿主 dsh-tools API 对照 + 像素/XML 级实证（sharp、LibreOffice 渲染、JSZip 解包）+ 现有 e2e 复跑。
修复状态：**全部 P1/P2 已修复并通过测试**（tsc 编译 0 错误；bug-check 13✓、bug-check2 16✓、tool-registration 83✓、e2e-m1/m2/m3 全绿；LibreOffice 渲染目检通过）。

---

## 🔴 已修复的 P1 / 严重 Bug

### 1.【真正根因】PPT 用错页面尺寸：LAYOUT_16x9 = 10"×5.625"，代码按 13.33" 布局 → 右侧全部被裁
**位置**：`src/tools/ppt.ts`（原 `pptx.layout = 'LAYOUT_16x9'`）
**实证**：pptxgenjs 文档确认 `LAYOUT_16x9` = **10"×5.625"**，而 `LAYOUT_WIDE` = 13.33"×7.5"。代码所有坐标（标题 w=11.7、右上角装饰 x=11.8、表格/图表 w=11.7、图标 x=11+）都按 13.33" 设计，在 10" 页面上 **x>10" 的元素全部被裁掉**——这就是"右上角装饰/图标看不见、内容挤在左、留白多"的**真正根因**（此前误判为图标渲染/颜色问题）。
- x 梯度渲染实测：x≤9" 的图标全部渲染，x≥10.5" 全部不渲染（被裁）。
**修复**：`pptx.layout = 'LAYOUT_WIDE'`。修复后渲染实测：13.33"×7.5" 页面、右上角白圆+蓝车图标可见、整体布局正确。

### 2. 图标颜色失效 + 白底覆盖（曾误判为"隐形"主因，叠加问题已一并修）
**位置**：`src/services/render-service.ts`、`src/tools/ppt.ts`、`src/services/asset-service.ts`
**实证**：Iconify `?color=00A3FF`（无#）返回 `fill="00A3FF"` 非法 SVG 色 → sharp 渲染成黑；`svgToPng` 强制 `.flatten('#FFFFFF')` 白底 → 合成时白底盖住圆底。
**修复**：
- 新增 `normalizeColor()`（补 `#`、#RGB→#RRGGBB、非法→深灰兜底），`iconToPng`/`asset-service.download` 的 color 统一归一化；
- `svgToPng` 默认透明底（保留 alpha，去掉强制白底 flatten；调用方可显式 `background` 白底）；
- 离线包/无 fill 的 SVG 在光栅化前做 `currentColor` → 目标色文本替换；
- `createPptx` 圆底合成改为"透明底画布 + 圆形色块 + 透明图标"（图标 padding 10% 居中）。
渲染实测：白圆底+彩色图标（深色封面页）、主题色圆底+图标（浅色内容页），均清晰可见。

### 3. 封面标题与渐变背景同色（对比度缺陷）
**位置**：`src/tools/ppt.ts` title/section 分支
**修复**：渐变模板的封面/章节标题固定白色（`#FFFFFF`），副标题用浅蓝白（`#E6F0FF`）；非渐变模板保持主题色。渲染实测白色标题在深蓝渐变上清晰可读。

### 4. Word 水印完全不显示 + 背景色丢失/重复 background
**位置**：`src/tools/docx.ts` `injectWatermark`
**实证**：旧实现把 `<w:watermark>` 塞进 document.xml 的 `<w:background>`（插在 body 末尾、sectPr 后），违反 ECMA-376 顺序且与 docx 库生成的背景色 `<w:background>` 形成**双 background** → LibreOffice/Word 水印不显示、背景色被覆盖。
**修复**：改用 **Word 标准页眉 VML 方案**——把水印 `v:shape` 追加到 `word/header1.xml` 的 `<w:hdr>` 内（随每页重复）；背景色由 docx 库原生 `<w:background w:color>` 保留，互不干扰；文字做 XML 转义。
渲染实测：浅黄背景恢复 + 页面中央出现斜向半透明水印。

---

## 🟠 已修复的 P2

### 5. `index.ts` 用 4 参风格调宿主单对象 `register(definition)`（日志死代码 + 兼容风险）
宿主 dsh-tools 真实 API 是单对象（源码 `register(definition){...}` 实证）。旧 `logRegister(name,desc,schema,handler)` 只有第一参被使用（侥幸注册成功），日志/计时**从未生效**。
**修复**：`index.ts` 的 `apply` 直接透传 `register: (d) => ctx.tools.register(d)`，各工具族签名统一为 `(ctx, family)`；日志内嵌由 `defineToolCompat` 的 execute 包装完成（若需要后续加）。

### 6. 素材库/模板库根目录绑定宿主 `process.cwd()`（跨会话漂移）
**修复**：插件 Config 新增 `data_dir`；各工具族经 `ToolFamilyContext.dataRoot` 取根目录，未配置时回退 `process.cwd()`。建议部署时把 `data_dir` 配置为会话工作目录（如 `<repo>/workspace` 或用户项目目录）。

### 7. `chartType`(bar/line/pie) 声明了但硬编码 bar；`labels` 语义混乱
**修复**：chart 分支按 `chartType` 映射 bar/line/pie；`labels` 仅作 x 轴类目（不再误当系列名）；pie 取第一系列。

### 8. `template_fill` 无 body 占位符兜底格式混乱 + 无 XML 转义
**修复**：统一 `bulletParas()` 生成带 buChar 项目符号/缩进（marL/indent 对齐 pptxgenjs 风格）的段落；标题与要点全部 XML 转义（& < > "）。

### 9. asset-service 并发下载 manifest 丢更新（read-modify-write 竞态）
**实证**：bug-check2 疑点 13 并发下载 5 图标后 manifest 只剩 3 项。
**修复**：`withManifestLock()` 串行化 download/purge/cleanupLRU 的 manifest 读改写。

### 10. PDF 副标题 8 位 hex 半透明失效（`#FFFFFF80` 被当纯白）
**修复**：改用 pdfkit `fillOpacity(0.55)` + 白色实现半透明。

---

## ✅ 仍存在 / 未修（低危，供后续参考）
- `doc_read_pptx` 读不到图表数据（图表数据不在 `<a:t>` 中）——P3。
- docx/PDF 字体硬编码 Noto Sans SC / Microsoft YaHei，无字体时依赖系统 fallback——P3。
- `editPptx` 无 `output_path` 时默认覆盖原文件（文档已注明，属设计行为）。
- 宿主工具执行环境 `process.cwd()` 与用户会话工作目录不一致（#6 已提供 data_dir 逃生口，但部署默认仍需显式配置）。

---

## 测试与验证记录
- `tsc -p tsconfig.json`：0 错误。
- `tests/bug-check.mjs`：13 通过（更新水印断言适配页眉方案）。
- `tests/bug-check2.mjs`：16 通过。
- `tests/tool-registration-check.mjs`：83 通过（20 工具，适配 family 签名）。
- `tests/e2e-m1/m2/m3.mjs`：全部通过（联网搜索/下载/生成/读回/编辑/水印/模板填充/LRU）。
- LibreOffice 渲染目检（vision）：
  - PPT：封面白字清晰、右上角圆底图标可见、内容/表格/两栏布局正常无截断；
  - Word：浅黄背景 + 斜向半透明水印可见；
  - PDF：渐变封面/表格/页码正常。
