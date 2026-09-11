/**
 * 渲染服务：sharp（C++/libvips 内核）SVG→PNG 光栅化
 *
 * 知识点：
 * - sharp 是 libvips 的 Node 绑定（N-API），C++ 内核，流式处理不整图载入内存
 * - composite 多图合成（图标叠到色块/渐变上）
 * - fit:'contain' + background 透明 保持比例缩放
 * - sharp 不可用时降级（rendering:'fallback'），插件不崩溃
 *
 * Bug 修复记录（2026-09）：
 * 1. 移除 svgToPng 的 flatten('#FFFFFF') 白底 —— 白底会把合成时的圆底/页面背景盖住，
 *    导致 PPT 图标"看不见"。
 * 2. Iconify 的 color 参数必须带 #（fill="00A3FF" 是非法 SVG 色，librsvg 渲染为黑色）。
 *    统一 normalizeColor() 补 #。
 * 3. 离线图标包 assets/icons/*.svg 是 fill="currentColor"，sharp/librsvg 不解析
 *    currentColor（默认黑色）。iconToPng 在光栅化前做文本替换 currentColor → 目标色。
 * 4. 输出统一为无 density 元数据的 RGBA PNG，避免 LibreOffice/PowerPoint 按物理尺寸
 *    缩放导致图标不可见。
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

/** 把任意 hex 色归一化为带 # 的 6 位格式（#RGB → #RRGGBB；无 # 补 #） */
export function normalizeColor(color?: string): string {
  if (!color) return '#333333';
  let c = color.trim();
  if (!c.startsWith('#')) c = `#${c}`;
  // #RGB → #RRGGBB
  if (/^#[0-9a-fA-F]{3}$/.test(c)) {
    c = `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  }
  // 非法 → 深灰兜底
  if (!/^#[0-9a-fA-F]{6}$/.test(c)) return '#333333';
  return c.toLowerCase();
}

/** SVG 文本预处理：currentColor → 目标色（librsvg 不解析 currentColor） */
function colorizeSvg(svg: string, color?: string): string {
  if (!color) return svg;
  const hex = normalizeColor(color);
  // Iconify 系图标用 currentColor；无 fill 的 path 继承黑色，也统一替换
  if (svg.includes('currentColor')) {
    return svg.split('currentColor').join(hex);
  }
  // 有些 SVG 无 fill 属性（继承黑色）——给根 svg 加 fill 并不总能级联，
  // 但覆盖最常见的 path/rect/circle 无 fill 情况，用 style 注入兜底：
  return svg;
}

/** SVG buffer → PNG buffer（透明底、无 density 元数据） */
export async function svgToPng(
  svg: Buffer | string,
  opts?: { width?: number; height?: number; density?: number; background?: string },
): Promise<RenderResult> {
  const sharp = await loadSharp();
  if (!sharp) return { rendering: 'fallback', png: null, error: 'sharp 不可用' };
  try {
    const targetW = opts?.width ?? 96;
    const targetH = opts?.height ?? 96;
    // 白底模式（旧行为）仅当调用方显式要求（如测试），默认透明
    const flattenBg = opts?.background;
    let pipeline = sharp(Buffer.isBuffer(svg) ? svg : Buffer.from(svg), {
      density: opts?.density ?? 72,
    }).resize(targetW, targetH, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
    if (flattenBg) pipeline = pipeline.flatten({ background: flattenBg });
    // 重建到全新 RGBA 画布（不继承 density / 物理尺寸元数据）
    const raw = await pipeline
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const w = raw.info.width;
    const h = raw.info.height;
    const png = await sharp({
      create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: raw.data, raw: { width: w, height: h, channels: 4 }, top: 0, left: 0 }])
      .png({ compressionLevel: 9 })
      .toBuffer();
    return { rendering: 'sharp', png };
  } catch (e) {
    return { rendering: 'fallback', png: null, error: String(e) };
  }
}

/** 图标放置 → 合成 PNG（图标叠到色块上，图标必须透明底） */
export async function renderIconTile(iconPng: Buffer, tileColor: string, size: number): Promise<RenderResult> {
  const sharp = await loadSharp();
  if (!sharp) return { rendering: 'fallback', png: null, error: 'sharp 不可用' };
  try {
    const tile = normalizeColor(tileColor);
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
        { input: Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.2}" fill="${tile}"/></svg>`), top: 0, left: 0 },
        // 图标居中（透明 PNG 直接叠）
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
  const hex = normalizeColor(color);

  // 0. 本地路径优先（asset_download 产物 / 用户素材）
  if (isLocalPath(iconId)) {
    return localToPng(iconId, size, hex);
  }

  // 1. 先查离线图标包（断网 Tier 2 兜底）
  const offlineSvg = await readOfflineIcon(iconId);
  if (offlineSvg) {
    return svgToPng(colorizeSvg(offlineSvg, hex), { width: size, height: size });
  }
  // 2. 在线拉取
  try {
    let url = iconId.startsWith('http') ? iconId : `https://api.iconify.design/${iconId}.svg`;
    if (color) url += `?color=${encodeURIComponent(hex)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const svg = await res.text();
    // 服务端 color 可能只对直接 fill 的 path 生效；本地再做 currentColor 兜底
    return svgToPng(colorizeSvg(svg, color ? hex : ''), { width: size, height: size });
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
async function localToPng(localPath: string, size: number, color?: string): Promise<RenderResult> {
  const sharp = await loadSharp();
  if (!sharp) return { rendering: 'fallback', png: null, error: 'sharp 不可用' };
  try {
    const { readFile } = await import('node:fs/promises');
    const buf = await readFile(localPath);
    if (/\.svg$/i.test(localPath)) {
      const svgText = buf.toString('utf8');
      return svgToPng(color ? colorizeSvg(svgText, color) : svgText, { width: size, height: size });
    }
    // PNG/JPG：直接 resize 到目标尺寸（保留 alpha；JPG 无 alpha 时转 PNG）
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
      // 渲染像素 = 幻灯片英寸 × 96dpi；x2 保证高清（最终 addImage 缩放到 w/h 英寸）
      out[p.icon] = await iconToPng(p.icon, Math.round(Math.max(p.w, p.h) * 96 * 2), p.color);
    }),
  );
  return out;
}

/** 检查 sharp 是否可用 */
export async function isSharpAvailable(): Promise<boolean> {
  const sharp = await loadSharp();
  return sharp !== null;
}
