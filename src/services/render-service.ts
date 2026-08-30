/**
 * 渲染服务：sharp（C++/libvips 内核）SVG→PNG 光栅化
 *
 * 知识点：
 * - sharp 是 libvips 的 Node 绑定（N-API），C++ 内核，流式处理不整图载入内存
 * - density:300 控制 SVG 光栅化 DPI（默认 72），300 保证 @2x 高清
 * - composite 多图合成（图标叠到色块/渐变上）
 * - fit:'contain' + background 透明 保持比例缩放
 * - sharp 不可用时降级（rendering:'fallback'），插件不崩溃
 */
import type { IconPlacement } from '../types.js';

export interface RenderResult {
  /** 渲染模式：sharp 或 fallback（无 sharp 时） */
  rendering: 'sharp' | 'fallback';
  /** 输出的 PNG buffer（sharp 模式）或 null */
  png: Buffer | null;
  /** 渲染失败原因（fallback 时） */
  error?: string;
}

/** sharp 构造器类型（0.35+ 用 default 导出；宽松签名以兼容 create/resize 等 options） */
type SharpConstructor = (input?: any, options?: any) => any;

let sharpModule: SharpConstructor | null | undefined;

/** 惰性加载 sharp，失败返回 null 并缓存 */
async function loadSharp() {
  if (sharpModule !== undefined) return sharpModule;
  try {
    const mod = await import('sharp');
    sharpModule = (mod.default ?? mod.sharp) as SharpConstructor;
  } catch (e) {
    sharpModule = null;
    console.warn('[dsh-design-office] sharp 加载失败，降级为几何装饰模式:', String(e));
  }
  return sharpModule;
}

/** SVG buffer → PNG buffer（@2x） */
export async function svgToPng(svg: Buffer | string, opts?: { width?: number; height?: number; density?: number }): Promise<RenderResult> {
  const sharp = await loadSharp();
  if (!sharp) return { rendering: 'fallback', png: null, error: 'sharp 不可用' };
  try {
    // ⚠️ 兼容性关键（实测）：SVG 渲染的 PNG 会带 density 元数据，
    // LibreOffice 会按物理尺寸缩放 → 图标不可见；且 PowerPoint 可能报"内容有问题"。
    // 方案：渲染 → resize → 重建到全新画布（create 不继承密度元数据）
    const targetW = opts?.width ?? 96;
    const targetH = opts?.height ?? 96;
    const raw = await sharp(Buffer.isBuffer(svg) ? svg : Buffer.from(svg), {
      density: opts?.density ?? 72,
    })
      .resize(targetW, targetH, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .flatten({ background: '#FFFFFF' }) // 去 alpha，避免半透明兼容问题
      .raw()
      .toBuffer();
    // 重建到全新画布（无 density 元数据）
    const png = await sharp({
      create: { width: targetW, height: targetH, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .composite([{ input: raw, raw: { width: targetW, height: targetH, channels: 3 }, top: 0, left: 0 }])
      .png({ compressionLevel: 9 })
      .toBuffer();
    return { rendering: 'sharp', png };
  } catch (e) {
    return { rendering: 'fallback', png: null, error: String(e) };
  }
}

/** 图标放置 → 合成 PNG（图标叠到色块上） */
export async function renderIconTile(iconPng: Buffer, tileColor: string, size: number): Promise<RenderResult> {
  const sharp = await loadSharp();
  if (!sharp) return { rendering: 'fallback', png: null, error: 'sharp 不可用' };
  try {
    const png = await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        // 底色圆角方块（用圆角矩形遮罩近似）
        { input: Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.2}" fill="${tileColor}"/></svg>`), top: 0, left: 0 },
        // 图标居中
        { input: iconPng, top: Math.round(size * 0.25), left: Math.round(size * 0.25) },
      ])
      .png({ compressionLevel: 9 })
      .toBuffer();
    return { rendering: 'sharp', png };
  } catch (e) {
    return { rendering: 'fallback', png: null, error: String(e) };
  }
}

/** 从 Iconify 拉取 SVG 并转为 PNG（供 design_*_create 使用） */
export async function iconToPng(iconId: string, size = 48, color?: string): Promise<RenderResult> {
  const sharp = await loadSharp();
  if (!sharp) return { rendering: 'fallback', png: null, error: 'sharp 不可用' };

  // 0. 本地路径优先（asset_download 产物 / 用户素材）
  if (isLocalPath(iconId)) {
    return localToPng(iconId, size);
  }

  // 1. 先查离线图标包（断网 Tier 2 兜底）
  const offlineSvg = await readOfflineIcon(iconId);
  if (offlineSvg) {
    return svgToPng(offlineSvg, { width: size, height: size, });
  }
  // 2. 在线拉取
  try {
    let url = iconId.startsWith('http') ? iconId : `https://api.iconify.design/${iconId}.svg`;
    if (color) url += `?color=${encodeURIComponent(color)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const svg = await res.text();
    return svgToPng(svg, { width: size, height: size, });
  } catch (e) {
    // 3. 全部失败 → fallback
    return { rendering: 'fallback', png: null, error: String(e) };
  }
}

/** 判断是否为本地路径（绝对路径 / 含 / 或 \ 的路径 / .svg/.png 结尾） */
function isLocalPath(input: string): boolean {
  if (input.startsWith('http://') || input.startsWith('https://')) return false;
  if (input.startsWith('/') || input.startsWith('./') || input.startsWith('../')) return true;
  if (input.includes('/') || input.includes('\\')) return true;
  if (/\.(svg|png|jpg|jpeg)$/i.test(input)) return true;
  return false;
}

/** 本地文件 → PNG（SVG 走 sharp 光栅化；PNG/JPG 直接读取或 resize） */
async function localToPng(localPath: string, size: number): Promise<RenderResult> {
  const sharp = await loadSharp();
  if (!sharp) return { rendering: 'fallback', png: null, error: 'sharp 不可用' };
  try {
    const { readFile } = await import('node:fs/promises');
    const buf = await readFile(localPath);
    if (/\.svg$/i.test(localPath)) {
      return svgToPng(buf, { width: size, height: size, });
    }
    // PNG/JPG：直接 resize 到目标尺寸
    const png = await sharp(buf)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    return { rendering: 'sharp', png };
  } catch (e) {
    return { rendering: 'fallback', png: null, error: String(e) };
  }
}

/**
 * 离线图标包查找：iconId 可能是 "mdi:car" 或语义名 "car"
 * 匹配 assets/icons/{name}.svg（168 个精选图标，Apache-2.0）
 */
async function readOfflineIcon(iconId: string): Promise<string | null> {
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const iconsDir = path.join(__dirname, '..', '..', 'assets', 'icons');
  // 解析语义名：mdi:car → car；car → car；http → null
  let name = iconId;
  if (name.includes(':')) name = name.split(':')[1];
  if (name.startsWith('http')) return null;
  try {
    return await readFile(path.join(iconsDir, `${name}.svg`), 'utf8');
  } catch {
    return null;
  }
}

/** 批量图标→PNG（供 design_pptx_create 的 icons 参数） */
export async function renderIcons(placements: IconPlacement[]): Promise<Record<string, RenderResult>> {
  const out: Record<string, RenderResult> = {};
  await Promise.all(
    placements.map(async (p) => {
      out[p.icon] = await iconToPng(p.icon, Math.round(Math.max(p.w, p.h) * 96), p.color);
    }),
  );
  return out;
}

/** 检查 sharp 是否可用 */
export async function isSharpAvailable(): Promise<boolean> {
  const sharp = await loadSharp();
  return sharp !== null;
}
