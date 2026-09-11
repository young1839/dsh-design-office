# dsh-design-office 版本适配报告（→ DSH 0.1.5-rc.1）

日期：2026-09-11　插件版本：0.1.0 → **0.1.1**

## 目标环境

| 依赖 | 版本 |
|------|------|
| DeepSeek Harness (`dsh`) | **0.1.5-rc.1** |
| `@deepseek-ai/dsh-tools` | **0.1.5-rc.2** |
| `@deepseek-ai/cordis` | **4.0.2** |
| `@deepseek-ai/schemastery` | **3.18.2** |

## 一、代码层适配

### 1. JSON Schema 合规（关键）
新版 dsh-tools 的 `assertSupportedJsonSchema` 只接受受限子集，且要求
**带 `enum`/`const` 的节点必须声明 `type`**。旧实现有两处不合规：

- `z.union(['icon','photo',…])` → 生成裸 `{enum:[…]}`（无 type）→ 宿主报
  `…enum requires type or oneOf`（`asset_search` 实测触发）；
- 数组元素 schema 读错字段：schemastery 把内层 schema 存在 **`inner`**，
  旧代码读 `element`（不存在）→ **所有数组 `items` 退化成 `{}`**
  （`design_pptx_create.slides`、`design_pdf_create.content` 等嵌套结构对模型完全不可见）。

修复（`src/lib/tool-register.ts`）：
- 新增 `inferScalarType()`：enum/const 按字面量补 `type`（混合类型降级为 `oneOf`）；
- 数组改读 `s.inner`，数组项 schema 完整下发。

修复后：
- 20 个工具的参数/输出 schema 全部通过宿主子集校验；
- PTC（Code Mode）模式可正常渲染 TS/Python SDK；
- 参数值校验正常（非法枚举被拒绝）；
- `design_pptx_create.slides.items` 现在携带完整字段约束（`type/title/items/…`）。

### 2. 素材库默认位置（去掉 cwd 漂移）
`data_dir` 未配置时，默认从 `process.cwd()` 改为 **`$DSH_HOME/design-office`**
（`DSH_HOME` 未设置时回退 `~/.dsh/design-office`），新增 `resolveDefaultDataRoot()`。
仍可用 `data_dir` 覆盖。

### 3. 版本元数据
`package.json`：version `0.1.1`；peerDeps → `cordis ^4.0.2` / `dsh-tools ^0.1.5-rc.2`；
schemastery `^3.18.2`；新增 `engines.node >=18`；测试脚本改为可直接运行的 node 套件
（原 `vitest` 未安装，`npm test` 实际会失败）：
- `npm test` → 工具注册 + 版本兼容（离线）
- `npm run test:compat` → 针对当前安装 dsh-tools 的兼容校验
- `npm run test:all` → 含联网/渲染的完整套件

### 4. 新增兼容性测试 `tests/version-compat.mjs`
自动定位宿主 dsh-tools（`DSH_DESIGN_OFFICE_DSH_TOOLS` → 常见安装路径 → node 解析），
依次校验：schema 子集 / 数组项完整性 / PTC SDK 渲染 / 参数值校验 /
**用真实 ToolRuntime + cordis 实际加载插件并确认 20 工具注册** /
**经真实 ToolRuntime 执行 `template_list`（execute→render→输出契约）** /
配置与默认根目录。
找不到宿主包时自动跳过。

当前结果：**11 通过 0 失败**（真实加载 20/20 工具；真实执行返回 1 个 text 块）。

## 二、部署层适配（web profile）

原先 web profile 的 `@young1839/dsh-design-office` 依赖指向已空的
`<repo>`，且 `dsh.profile.bundles` 里没有该插件 → 未挂载。

已修改 `/home/young1839/.dsh/profiles/web/package.json`（备份：`package.json.bak-20260911_093745`）：

- `dependencies["@young1839/dsh-design-office"] = "link:<repo>"`
- `dsh.profile.bundles` 追加 `"@young1839/dsh-design-office"`
- 重建 `node_modules/@young1839/dsh-design-office` 符号链接 → 本仓库

校验：`dsh --profile web --dump-config` 成功，组合树第 546 行出现
`- id: dsh-design-office / name: '@young1839/dsh-design-office'`。

素材库迁移：旧 `~/assets/`（11 文件）已复制到 `~/.dsh/design-office/assets/`（含 manifest）。
旧目录保留为备份，确认无误后可自行删除。

## 三、生效方式

插件是宿主启动时加载的，**需要重启 web 服务**：

```sh
# 停掉当前 dsh web 进程后重新启动
dsh web
```

重启后可用 `template_list` 之类工具确认 20 个工具已回来；也可随时跑：

```sh
cd <repo>
npm test          # 离线：注册 + 版本兼容（含真实加载）
```

## 四、回滚

```sh
# 恢复 profile 配置
cp /home/young1839/.dsh/profiles/web/package.json.bak-20260911_093745 \
   /home/young1839/.dsh/profiles/web/package.json
# 代码回滚
cd <repo> && git checkout -- src package.json README.md cordis.patch.yml
```
