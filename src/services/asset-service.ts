/**
 * 素材服务：Iconify 搜索 / 下载 / 缓存 / 许可元数据
 *
 * 知识点：
 * - Iconify API 免费无 key（已实测 HTTP 200）
 *   - search:  GET https://api.iconify.design/search?query=car&limit=20
 *     → { icons: ['mdi:car',...], collections: { mdi: { name, license:{spdx,url} } } }
 *   - icon:    GET https://api.iconify.design/mdi:car.svg?color=%230078D4
 *     → 可着色 SVG 本体（fill="currentColor"）
 * - 许可白名单：仅接受 spdx 在 Apache-2.0/MIT/ISC/CC0 等开放许可内
 * - 缓存去重：文件名 = sha256(url)[:16].ext，元数据写 assets/.manifest.json
 * - 网络：AbortController 超时 + 指数退避重试 + 响应校验
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { AssetMeta, AssetSearchResult, AssetType } from '../types.js';

const ICONIFY_API = 'https://api.iconify.design';
const ICONIFY_COLLECTIONS = 'https://api.iconify.design/collections';

/** 开放许可白名单（SPDX） */
const LICENSE_ALLOWLIST = new Set(['Apache-2.0', 'MIT', 'ISC', 'CC0-1.0', 'Unlicense', 'BSD-2-Clause', 'BSD-3-Clause']);

/** 中→英关键词映射（提升 Iconify 命中率） */
const KEYWORD_MAP: Record<string, string[]> = {
  汽车: ['car', 'vehicle', 'ev', 'transport'],
  电动车: ['car', 'ev', 'electric', 'battery'],
  科技: ['tech', 'chip', 'code', 'cloud'],
  财务: ['finance', 'money', 'chart', 'wallet'],
  教育: ['education', 'book', 'school', 'graduation'],
  医疗: ['medical', 'health', 'hospital', 'stethoscope'],
  制造: ['factory', 'industry', 'gear', 'machine'],
  数据: ['data', 'chart', 'analytics', 'database'],
  图表: ['chart', 'graph', 'bar', 'pie'],
  增长: ['growth', 'trend', 'arrow-up', 'chart-up'],
  目标: ['target', 'goal', 'bullseye', 'flag'],
  团队: ['team', 'users', 'people', 'group'],
  市场: ['market', 'store', 'shopping', 'trend'],
  报告: ['report', 'document', 'file', 'clipboard'],
  合同: ['contract', 'document', 'signature', 'file'],
  简历: ['resume', 'cv', 'person', 'user'],
  论文: ['paper', 'thesis', 'book', 'document'],
  演讲: ['presentation', 'slide', 'screen', 'monitor'],
  时间: ['clock', 'time', 'calendar', 'schedule'],
  位置: ['location', 'map-pin', 'place', 'pin'],
  电话: ['phone', 'call', 'mobile'],
  邮件: ['email', 'mail', 'envelope', 'at'],
  搜索: ['search', 'magnifier', 'zoom'],
  下载: ['download', 'arrow-down', 'save'],
  上传: ['upload', 'arrow-up', 'cloud'],
  安全: ['security', 'shield', 'lock', 'safe'],
  环保: ['leaf', 'eco', 'recycle', 'plant'],
  能源: ['energy', 'bolt', 'power', 'flame'],
  建筑: ['building', 'home', 'city', 'construction'],
  物流: ['truck', 'shipping', 'package', 'delivery'],
};

/** 响应体（Iconify search） */
interface IconifySearchResponse {
  icons?: string[];
  collections?: Record<string, { name?: string; total?: number; license?: { title?: string; spdx?: string; url?: string } }>;
}

export class AssetService {
  constructor(private workspaceRoot: string) {}

  /** 素材库根目录 */
  private get assetsDir() {
    return path.join(this.workspaceRoot, 'assets');
  }

  private get manifestPath() {
    return path.join(this.assetsDir, '.manifest.json');
  }

  /** 网络 GET 带超时与重试 */
  private async fetchWithRetry(url: string, timeoutMs = 10000, retries = 3): Promise<Response> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'dsh-design-office/0.1' } });
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        return res;
      } catch (e) {
        lastErr = e;
        if (attempt < retries - 1) {
          // 指数退避：0.5s, 1s, 2s
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        }
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr ?? new Error(`fetch failed: ${url}`);
  }

  /** 中→英关键词翻译 */
  translateQuery(query: string): string {
    const lower = query.trim().toLowerCase();
    for (const [cn, en] of Object.entries(KEYWORD_MAP)) {
      if (lower.includes(cn)) return en[0];
    }
    // 去掉中文，保留英文标签
    const english = query.replace(/[\u4e00-\u9fa5]/g, ' ').trim();
    return english || query;
  }

  /** 搜索素材（目前 iconify 图标；illustration/photo 预留扩展） */
  async search(type: AssetType, query: string, limit = 20): Promise<AssetSearchResult[]> {
    if (type === 'icon') {
      const q = this.translateQuery(query);
      const url = `${ICONIFY_API}/search?query=${encodeURIComponent(q)}&limit=${limit}`;
      const res = await this.fetchWithRetry(url);
      const data = (await res.json()) as IconifySearchResponse;
      const icons = data.icons ?? [];
      const collections = data.collections ?? {};
      const results: AssetSearchResult[] = [];
      for (const id of icons) {
        const [collection, name] = id.split(':');
        const col = collections[collection];
        const license = col?.license;
        const spdx = license?.spdx ?? '';
        // 许可白名单过滤
        if (!LICENSE_ALLOWLIST.has(spdx)) continue;
        results.push({
          id,
          name,
          collection,
          collectionName: col?.name ?? collection,
          license: {
            title: license?.title ?? spdx,
            spdx,
            url: license?.url ?? '',
          },
          url: `${ICONIFY_API}/${id}.svg`,
          previewUrl: `${ICONIFY_API}/${id}.svg`,
          source: 'iconify',
        });
      }
      return results;
    }
    // 其他类型暂未接入源
    return [];
  }

  /** 下载素材到素材库，返回元数据 */
  async download(id: string, color?: string): Promise<AssetMeta> {
    await mkdir(this.assetsDir, { recursive: true });
    let url = id.startsWith('http') ? id : `${ICONIFY_API}/${id}.svg`;
    if (color && url.endsWith('.svg')) {
      url += `?color=${encodeURIComponent(color)}`;
    }
    const res = await this.fetchWithRetry(url);
    const buf = Buffer.from(await res.arrayBuffer());
    // 校验 SVG magic bytes
    const text = buf.toString('utf8', 0, 200);
    if (!text.includes('<svg')) {
      throw new Error(`下载内容不是合法 SVG（${id}）`);
    }
    // 尺寸上限（10MB）
    if (buf.length > 10 * 1024 * 1024) {
      throw new Error(`素材过大（${buf.length} bytes）`);
    }
    const sha = createHash('sha256').update(buf).digest('hex');
    const ext = id.startsWith('http') ? path.extname(new URL(id).pathname) || '.svg' : '.svg';
    const file = `${sha.slice(0, 16)}${ext}`;
    const filePath = path.join(this.assetsDir, file);
    await writeFile(filePath, buf);
    // 查询真实许可（Iconify collections API）
    const license = await this.fetchLicense(id);
    const meta: AssetMeta = {
      file,
      source: 'iconify',
      license,
      url,
      downloadedAt: new Date().toISOString(),
      sha256: sha,
    };
    // 写入 manifest（去重：同名覆盖）
    const manifest = await this.readManifest();
    manifest[id] = meta;
    await writeFile(this.manifestPath, JSON.stringify(manifest, null, 2));
    return { ...meta, file: filePath };
  }

  /** 查询 Iconify 图标集许可（真实许可，非硬编码） */
  private async fetchLicense(id: string): Promise<{ spdx: string; url: string }> {
    // 默认：未知许可
    const fallback = { spdx: 'Unknown', url: '' };
    try {
      if (id.startsWith('http')) return fallback;
      const [collection] = id.split(':');
      if (!collection) return fallback;
      // Iconify collections API 返回该图标集信息（含许可）
      const res = await this.fetchWithRetry(`${ICONIFY_COLLECTIONS}?prefix=${encodeURIComponent(collection)}`);
      const data = (await res.json()) as Record<string, { license?: { spdx?: string; url?: string } }>;
      const col = data[collection];
      if (!col?.license?.spdx) return fallback;
      return { spdx: col.license.spdx, url: col.license.url ?? '' };
    } catch {
      return fallback;
    }
  }

  /** 读取素材清单 */
  async listCache(): Promise<Record<string, AssetMeta>> {
    return this.readManifest();
  }

  /** 清理素材库 */
  async purge(file?: string): Promise<{ removed: number }> {
    const manifest = await this.readManifest();
    if (file) {
      const abs = path.resolve(file);
      // 路径边界校验：用 path.relative 防 /assets 与 /assets2 误匹配
      const rel = path.relative(this.assetsDir, abs);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`只能清理素材库内文件（拒绝: ${abs}）`);
      }
      await unlink(abs);
      // 从 manifest 删除
      for (const [k, v] of Object.entries(manifest)) {
        if (v.file === file) delete manifest[k];
      }
      await writeFile(this.manifestPath, JSON.stringify(manifest, null, 2));
      return { removed: 1 };
    }
    // 清空整个素材库
    const files = await readdir(this.assetsDir).catch(() => [] as string[]);
    let removed = 0;
    for (const f of files) {
      if (f === '.manifest.json') continue;
      await unlink(path.join(this.assetsDir, f)).catch(() => {});
      removed++;
    }
    await writeFile(this.manifestPath, '{}');
    return { removed };
  }

  private async readManifest(): Promise<Record<string, AssetMeta>> {
    try {
      return JSON.parse(await readFile(this.manifestPath, 'utf8')) as Record<string, AssetMeta>;
    } catch {
      return {};
    }
  }

  /**
   * 生成《素材来源清单》（版权合规最后一环）
   * 输出 markdown 表格：文件 / 来源 / 许可 / URL / 下载时间
   */
  async generateReport(reportPath?: string): Promise<{ report: string; file?: string }> {
    const manifest = await this.readManifest();
    const entries = Object.entries(manifest);
    const lines = [
      '# 素材来源清单',
      '',
      `生成时间：${new Date().toISOString()}`,
      `素材总数：${entries.length}`,
      '',
      '| 素材 ID | 文件 | 来源 | 许可 (SPDX) | 许可 URL | 下载时间 |',
      '|---------|------|------|-------------|----------|----------|',
    ];
    for (const [id, meta] of entries) {
      lines.push(`| ${id} | ${meta.file} | ${meta.source} | ${meta.license.spdx} | ${meta.license.url} | ${meta.downloadedAt} |`);
    }
    lines.push('', '> 本清单由 dsh-design-office 自动生成，供版权合规审查使用。');
    const report = lines.join('\n');
    if (reportPath) {
      await writeFile(path.resolve(reportPath), report, 'utf8');
      return { report, file: path.resolve(reportPath) };
    }
    return { report };
  }

  /**
   * 缓存 LRU 清理：素材库超过 maxEntries 时删除最旧的（按 downloadedAt）
   */
  async cleanupLRU(maxEntries = 100): Promise<{ removed: number; remaining: number }> {
    const manifest = await this.readManifest();
    const entries = Object.entries(manifest).sort(
      (a, b) => new Date(a[1].downloadedAt).getTime() - new Date(b[1].downloadedAt).getTime(),
    );
    let removed = 0;
    while (entries.length - removed > maxEntries) {
      const [id, meta] = entries[removed];
      delete manifest[id];
      await unlink(path.join(this.assetsDir, meta.file)).catch(() => {});
      removed++;
    }
    if (removed > 0) {
      await writeFile(this.manifestPath, JSON.stringify(manifest, null, 2));
    }
    return { removed, remaining: Object.keys(manifest).length };
  }

  /** 素材库目录大小（供展示） */
  async size(): Promise<number> {
    const files = await readdir(this.assetsDir).catch(() => [] as string[]);
    let total = 0;
    for (const f of files) {
      if (f === '.manifest.json') continue;
      try {
        const s = await stat(path.join(this.assetsDir, f));
        total += s.size;
      } catch { /* ignore */ }
    }
    return total;
  }
}
