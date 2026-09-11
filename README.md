# 🐋 dsh-design-office

**DeepSeek Harness 设计增强版 Office 插件** — 生成带渐变背景、图标素材、插画封面的 PPT / PDF / Word / Excel，自动搜索下载素材（工具化、可审计），用户提供素材时优先采用用户素材。

![version](https://img.shields.io/badge/version-0.1.1-blue) ![license](https://img.shields.io/badge/license-Apache--2.0-green) ![dsh](https://img.shields.io/badge/dsh-0.1.5--rc.1+-purple)

- 安装 / 更新 / 卸载 → [快速开始](#-安装)
- 环境与版本要求 → [环境要求](#-环境要求) · [版本兼容](#-版本兼容)
- 常见问题排查 → [docs/install.md](./docs/install.md)
- 提示词怎么写 → [docs/prompt-guide.md](./docs/prompt-guide.md)

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

## 💻 环境要求

| 项 | 要求 | 说明 |
|----|------|------|
| DeepSeek Harness | **≥ 0.1.5-rc.1** | 低于此版本的宿主工具注册 API 不兼容（见[版本兼容](#-版本兼容)） |
| Node.js | **≥ 18** | 宿主与插件运行时 |
| pnpm | 任意近期版本 | 仅 `dsh plugin` 安装插件时需要（dsh 内部转发 pnpm） |
| LibreOffice（可选） | `sudo apt install libreoffice` | 把 pptx/docx/xlsx 渲染成图片，用于「生成→识图→修复」闭环 |
| poppler-utils（可选） | `sudo apt install poppler-utils` | `pdftoppm`：PDF → PNG，同上 |

> 两个「可选」依赖只影响**视觉自检**（渲染成图后用识图工具检查排版）。
> 不装也能正常生成文档，只是模型无法「看到」自己的成品。

## 📦 安装

插件通过 **profile 的 bundle 机制**挂载：把它作为依赖装进某个 profile，`dsh plugin` 会自动把声明了 `dsh.bundle` 的包追加进 `dsh.profile.bundles`，宿主下次启动即注册全部 20 个工具。

### 方式一：本地源码（开发/自用，推荐）

```sh
# 1) 获取源码并构建（lib/ 是构建产物，仓库不含，必须构建一次）
git clone https://github.com/young1839/dsh-design-office.git ~/dsh-design-office
cd ~/dsh-design-office
npm install
npm run build

# 2) 以 link 方式装进 web profile
dsh plugin --profile web add link:~/dsh-design-office
#    （相对路径也可以：dsh plugin --profile web add link:../dsh-design-office）

# 3) 安装 Skill（使用指导 + 识图门禁流程）
mkdir -p ~/.dsh/skills/dsh-design-office
cp ~/dsh-design-office/skills/SKILL.md ~/.dsh/skills/dsh-design-office/

# 4) 重启宿主，插件在启动时加载
dsh web
```

### 方式二：直接从 GitHub 安装

```sh
dsh plugin --profile web add github:young1839/dsh-design-office
```

> 包内 `prepare` 脚本会自行构建 `lib/`。若安装后profile 内该包缺少 `lib/index.js`
> （例如 pnpm 跳过了构建脚本），改用**方式一**最稳妥。

### 方式三：npm 安装（发布后）

```sh
dsh plugin --profile web add @young1839/dsh-design-office
```

### 验证安装

```sh
# 组合树里应出现该插件行
dsh --profile web --dump-config | grep -A 2 dsh-design-office

# profile 依赖与 bundle 列表
cat ~/.dsh/profiles/web/package.json
```

重启后新会话的工具列表里应出现 20 个工具（`design_pptx_create` 等），
也可直接让模型调用 `template_list` 确认。

## ⬆️ 更新

插件是宿主启动时加载的，**任何更新都要重启宿主**。

```sh
cd ~/dsh-design-office          # 源码方式安装的目录
git pull                        # 1) 取新代码
npm install                     # 2) 依赖有变化时
npm run build                   # 3) 重新构建 lib/
# 4) link 安装无需重新 add：软链始终指向该目录
dsh web                         # 5) 重启宿主
```

其他安装方式：

```sh
# GitHub / npm 安装的
dsh plugin --profile web update @young1839/dsh-design-office

# 只想换版本
dsh plugin --profile web add @young1839/dsh-design-office@0.1.1
```

更新 Skill（方式一安装时 `SKILL.md` 是拷贝进去的，需要手动同步）：

```sh
cp ~/dsh-design-office/skills/SKILL.md ~/.dsh/skills/dsh-design-office/
```

升级后自检：

```sh
cd ~/dsh-design-office
npm test          # 离线：工具注册 + 针对当前宿主 dsh-tools 的版本兼容
npm run test:all  # 含联网/渲染的完整套件
```

## 🗑️ 卸载

```sh
# 1) 从 profile 移除依赖（bundle 列表会同步清理）
dsh plugin --profile web remove @young1839/dsh-design-office

# 2) 移除 Skill
rm -rf ~/.dsh/skills/dsh-design-office

# 3) （可选）素材/模板库与源码目录
rm -rf ~/.dsh/design-office       # 素材库；想保留素材请先备份
rm -rf ~/dsh-design-office        # 源码（方式一安装时才有）

dsh web                           # 4) 重启宿主生效
```

## 🧩 版本兼容

| 依赖 | 适配版本 | 说明 |
|------|----------|------|
| DeepSeek Harness (`dsh`) | **0.1.5-rc.1**（最低 0.1.5-rc.1） | 宿主组合 / profile bundle 机制 |
| `@deepseek-ai/dsh-tools` | **0.1.5-rc.2** | 单对象 `register(definition)` API + 受限 JSON Schema 子集 |
| `@deepseek-ai/cordis` | **4.0.2** | `{ name, inject, apply }` 插件形态 |
| `@deepseek-ai/schemastery` | **3.18.2** | 参数/配置 schema（数组元素 schema 位于 `inner`） |
| Node.js | ≥ 18 | ES2022 |

兼容性要点（0.1.1 起）：

- 工具参数/输出 schema 已通过 dsh-tools 的**受限 JSON Schema 子集**校验
  （`enum`/`const` 必须带 `type`；数组项 schema 完整下发，不再是空 `{}`）；
- PTC / Code Mode 下可渲染为 TypeScript、Python SDK；
- 素材库默认位于 `$DSH_HOME/design-office`，不随宿主启动目录漂移。

版本兼容性由独立测试守护（针对**当前已安装**的宿主 dsh-tools 实测）：

```sh
npm run test:compat   # schema 子集 + 数组项 + PTC 渲染 + 真实加载插件 + 真实执行工具
```

未找到宿主 dsh-tools 时该测试自动跳过；也可用 `DSH_DESIGN_OFFICE_DSH_TOOLS`
指定其 `lib/index.js` 路径。

详见 [docs/version-adaptation.md](./docs/version-adaptation.md)。

### 素材库位置（`data_dir`）

默认 **`$DSH_HOME/design-office`**（`DSH_HOME` 未设置时为 `~/.dsh/design-office`），
可用插件配置覆盖（写进 profile 的 `cordis.patch.yml`，见 [cordis.patch.yml](./cordis.patch.yml) 注释）：

```yaml
- id: dsh-design-office
  config:
    data_dir: /your/path
    enable:            # 按需关掉某个族，默认全开
      ppt: true
      pdf: true
      docx: true
      xlsx: true
      assets: true
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

| 文档 | 内容 |
|------|------|
| [docs/install.md](./docs/install.md) | 安装/更新/卸载详解与故障排查 |
| [docs/prompt-guide.md](./docs/prompt-guide.md) | AI 生成 PPT/PDF/Word/Excel 的提示词写法 |
| [docs/version-adaptation.md](./docs/version-adaptation.md) | 0.1.1 版本适配报告（改了什么、怎么验的、怎么回滚） |
| [docs/bug-report.md](./docs/bug-report.md) | Bug 审查与修复报告（根因 + 实证） |
| [PROJECT.md](./PROJECT.md) | 完整项目文档（技术选型、架构、风险、里程碑、兼容性测试） |
| [CHANGELOG.md](./CHANGELOG.md) | 版本变更记录 |

## 🔧 开发

```sh
npm install
npm run build        # tsc → lib/
npm test             # 离线：工具注册 + 版本兼容（针对当前 dsh-tools）
npm run test:all     # 含联网/渲染的完整套件
```

## 📄 许可

Apache License 2.0

- 图标素材来自 Iconify（各集 Apache-2.0 / MIT / ISC）
- Noto Sans CJK 字体（Apache-2.0）
- 上游参考：天枢 office 插件（Apache-2.0）
