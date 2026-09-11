# 安装 / 更新 / 卸载

本插件以 **DSH profile bundle** 的形式挂载：把它装进某个 profile 的依赖，
`dsh plugin` 会自动把「声明了 `dsh.bundle` 的依赖」写进该 profile 的
`dsh.profile.bundles` 层列表，宿主下次启动时加载它并注册 **20 个工具**。

> 宿主只在**启动时**加载插件。安装、更新、改配置之后都必须**重启**（`dsh web`）。

---

## 1. 环境要求

| 项 | 要求 | 检查命令 |
|----|------|----------|
| DeepSeek Harness | **≥ 0.1.5-rc.1** | `dsh --version` |
| `@deepseek-ai/dsh-tools` | **0.1.5-rc.2** | 随宿主安装 |
| Node.js | ≥ 18 | `node -v` |
| pnpm | 近期版本 | `pnpm -v`（`dsh plugin` 内部转发 pnpm） |
| git | 任意 | `git --version` |

**可选**（只影响「渲染成图 → 识图自检」闭环，不影响文档生成）：

| 项 | 用途 | 安装 |
|----|------|------|
| LibreOffice | pptx / docx / xlsx → PDF → PNG | `sudo apt install libreoffice` |
| poppler-utils | PDF → PNG（`pdftoppm`） | `sudo apt install poppler-utils` |

中文字体（Noto Sans CJK SC）已随包提供，无需额外安装。

### 版本兼容矩阵

| 依赖 | 适配版本 | 备注 |
|------|----------|------|
| `dsh` | 0.1.5-rc.1 | 更低版本的工具注册 API 不同，会注册失败 |
| `@deepseek-ai/dsh-tools` | 0.1.5-rc.2 | 单对象 `register(definition)` + 受限 JSON Schema 子集 |
| `@deepseek-ai/cordis` | 4.0.2 | `{ name, inject, apply }` |
| `@deepseek-ai/schemastery` | 3.18.2 | 数组元素 schema 在 `inner` 字段 |

插件版本与宿主版本的对应关系见 [../CHANGELOG.md](../CHANGELOG.md)。

---

## 2. 安装

### 方式一：本地源码（开发 / 自用，推荐）

```sh
# 1) 获取源码并构建（lib/ 是构建产物，仓库不含，必须构建一次）
git clone https://github.com/young1839/dsh-design-office.git ~/dsh-design-office
cd ~/dsh-design-office
npm install          # 会自动执行 prepare → npm run build
npm run build        # 若上一步被跳过，手动构建

# 2) 装进 web profile（link 方式：软链，改代码后重新 build 即可生效）
dsh plugin --profile web add link:~/dsh-design-office

# 3) 安装 Skill（使用指导 + 识图门禁流程）
mkdir -p ~/.dsh/skills/dsh-design-office
cp ~/dsh-design-office/skills/SKILL.md ~/.dsh/skills/dsh-design-office/

# 4) 重启宿主
dsh web
```

也可以使用绝对路径或相对路径：

```sh
dsh plugin --profile web add link:"$PWD/dsh-design-office"
dsh plugin --profile web add link:../dsh-design-office    # 相对当前目录解析
```

> `dsh plugin` 会把相对路径基于**你执行命令时的目录**解析，不会误解析到 profile 内部。

### 方式二：直接从 GitHub 安装

```sh
dsh plugin --profile web add github:young1839/dsh-design-office
```

包内的 `prepare` 脚本会自动构建 `lib/`。若你的包管理器跳过了构建脚本，
请改用**方式一**（本地构建最可控）。

### 方式三：npm 安装（发布到 npm 之后）

```sh
dsh plugin --profile web add @young1839/dsh-design-office
```

### 装到别的 profile

把 `--profile web` 换成目标 profile 名即可（例如 `dsh plugin --profile tui add ...`）。
插件本身与前端无关，任何宿主 profile 都能挂载。

---

## 3. 验证安装

```sh
# ① 组合树里应出现该插件行（组合成功 = 宿主能加载）
dsh --profile web --dump-config | grep -A 2 dsh-design-office

# ② profile 的依赖与 bundle 列表
cat ~/.dsh/profiles/web/package.json

# ③ 离线自检（含「真实加载插件并确认注册 20 个工具」）
cd ~/dsh-design-office && npm test
```

重启宿主机后新建会话，工具列表中应出现 `design_pptx_create`、
`design_pdf_create`、`asset_search`、`template_list` 等 20 个工具；
也可以直接让模型调用 `template_list` 验证。

预期输出示例（`--dump-config`）：

```yaml
- id: dsh-design-office
  name: '@young1839/dsh-design-office'
```

---

## 4. 更新

```sh
cd ~/dsh-design-office
git pull                 # ① 取新代码
npm install              # ② 依赖有变化时（会自动 rebuild）
npm run build            # ③ 重新构建 lib/
dsh web                  # ④ 重启宿主生效
```

- **link 方式安装**：无需重新 `dsh plugin add`，软链始终指向该目录，重新构建 + 重启即可。
- **GitHub / npm 安装**：

  ```sh
  dsh plugin --profile web update @young1839/dsh-design-office
  # 或指定版本
  dsh plugin --profile web add @young1839/dsh-design-office@0.1.1
  ```

- **同步 Skill**（方式一里 `SKILL.md` 是拷贝进去的，不会自动更新）：

  ```sh
  cp ~/dsh-design-office/skills/SKILL.md ~/.dsh/skills/dsh-design-office/
  ```

更新后自检：

```sh
cd ~/dsh-design-office
npm test          # 离线：工具注册 + 针对当前宿主 dsh-tools 的版本兼容
npm run test:all  # 含联网 / 渲染的完整套件
```

---

## 5. 卸载

```sh
# ① 从 profile 移除（bundles 列表会被自动清理）
dsh plugin --profile web remove @young1839/dsh-design-office

# ② 移除 Skill
rm -rf ~/.dsh/skills/dsh-design-office

# ③ 可选：素材 / 模板库（想保留请先备份）
ls ~/.dsh/design-office
rm -rf ~/.dsh/design-office

# ④ 可选：源码目录（方式一才有）
rm -rf ~/dsh-design-office

# ⑤ 重启宿主
dsh web
```

卸载前建议先导出素材来源清单（版权留档）：

```sh
# 在会话里调用 asset_report，或直接查看清单文件
cat ~/.dsh/design-office/asset-library.json 2>/dev/null || true
```

---

## 6. 配置

配置写在 profile 的 `cordis.patch.yml`（`~/.dsh/profiles/web/cordis.patch.yml`）：

```yaml
- id: dsh-design-office
  config:
    # 素材 / 模板库根目录；默认 $DSH_HOME/design-office（DSH_HOME 未设置时 ~/.dsh/design-office）
    data_dir: /your/path
    # 按需关闭某个工具族，默认全开
    enable:
      ppt: true
      pdf: true
      docx: true
      xlsx: true
      assets: true    # 同时控制素材与模板工具
```

改完配置同样需要 `dsh web` 重启。

### 目录结构

```
$DSH_HOME/design-office/
├── assets/             # 已下载素材（PNG + manifest 记录来源/许可）
├── templates/          # 用户导入的模板
└── asset-library.json  # 素材清单（asset_report 的来源）
```

---

## 7. 故障排查

| 现象 | 原因 | 处理 |
|------|------|------|
| 重启后工具列表里没有这 20 个工具 | 插件未挂进 profile，或宿主未重启 | `dsh --profile web --dump-config \| grep dsh-design-office`；确认 `package.json` 的 `dsh.profile.bundles` 含该包；重启 `dsh web` |
| 报 `Cannot find module '.../lib/index.js'` | 未构建（仓库不含 `lib/`） | `cd ~/dsh-design-office && npm run build` |
| 报 `... enum requires type or oneOf` | 插件版本 < 0.1.1，schema 不合新版 dsh-tools 子集 | 升级到 ≥ 0.1.1 |
| 模型看不到 `slides` / `content` 的字段结构 | 同上（< 0.1.1 数组 items 退化为 `{}`） | 升级到 ≥ 0.1.1 |
| `sharp` 安装失败 | 平台二进制未下载 | `npm install --include=optional`，或配置镜像后重装 |
| 生成的 PPT 右侧内容被裁切 | 插件 < 0.1.1 的页面尺寸 bug | 升级到 ≥ 0.1.1 |
| Word 水印不显示 | 插件 < 0.1.1 的水印实现问题 | 升级到 ≥ 0.1.1 |
| 素材下载失败 | 网络 / 代理 | 插件带 168 个离线图标可断网使用；`asset_cache_list` 查看已有素材 |
| 渲染不出图片 | 缺 LibreOffice 或 poppler-utils | 安装后重试；纯生成不需要它们 |
| PDF 里中文是方块 | 字体未随包安装 | 确认 `assets/fonts/` 存在，重装插件 |

排查时最有用的两条命令：

```sh
dsh --profile web --dump-config | grep -B 2 -A 6 dsh-design-office   # 组合是否成功
cd ~/dsh-design-office && npm run test:compat                        # 与当前宿主的兼容性
```

---

## 8. 回滚

```sh
# 代码回滚
cd ~/dsh-design-office
git log --oneline -5
git checkout <上一个可用版本>
npm install && npm run build
dsh web

# profile 配置回滚（若手工改过 package.json）
cp ~/.dsh/profiles/web/package.json.bak-<时间戳> ~/.dsh/profiles/web/package.json
dsh web

# 彻底卸载见第 5 节
```
