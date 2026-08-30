/** 素材类型 */
export type AssetType = 'icon' | 'illustration' | 'photo' | 'template';

/** 素材搜索结果项 */
export interface AssetSearchResult {
  /** 唯一 ID，如 mdi:car */
  id: string;
  /** 显示名 */
  name: string;
  /** 所属图标集 */
  collection: string;
  /** 图标集名称 */
  collectionName: string;
  /** 许可信息（SPDX） */
  license: {
    title: string;
    spdx: string;
    url: string;
  };
  /** 下载 URL（SVG 本体） */
  url: string;
  /** 预览 URL */
  previewUrl: string;
  /** 来源 */
  source: 'iconify';
}

/** 素材元数据（许可闭环） */
export interface AssetMeta {
  file: string;
  source: string;
  license: {
    spdx: string;
    url: string;
  };
  url: string;
  downloadedAt: string;
  sha256: string;
}

/** 模板定义 */
export interface TemplateDef {
  id: string;
  name: string;
  style: string;
  description: string;
  /** 适用场景 */
  scenes: string[];
  /** 主题色（主色/辅色/背景） */
  colors: {
    primary: string;
    secondary: string;
    background: string;
    text: string;
  };
  /** 渐变（可选） */
  gradient?: {
    from: string;
    to: string;
    angle: number;
  };
}

/** PPT 幻灯片定义（传给 design_pptx_create） */
export type SlideDef =
  | { type: 'title'; title: string; subtitle?: string; notes?: string }
  | { type: 'section'; title: string; subtitle?: string; notes?: string }
  | { type: 'content'; title: string; items: string[]; notes?: string }
  | { type: 'two-column'; title: string; left: string[]; right: string[]; notes?: string }
  | { type: 'image'; title: string; image: string; caption?: string; notes?: string }
  | { type: 'table'; title: string; headers: string[]; rows: string[][]; notes?: string }
  | { type: 'chart'; title: string; chartType: string; data: number[][]; labels: string[]; notes?: string };

/** design_pptx_create 入参 */
export interface PptxCreateParams {
  destination_path: string;
  slides: SlideDef[];
  /** 模板 ID（内置）或模板文件路径（用户提供） */
  template?: string;
  /** 图标嵌入：{ 关键词: [{ icon, x, y, w, h, color? }] } 或平铺列表 */
  icons?: IconPlacement[];
  /** 主题色覆盖 */
  theme?: {
    primary?: string;
    secondary?: string;
    background?: string;
  };
}

/** 图标放置 */
export interface IconPlacement {
  /** Iconify id 或本地素材路径 */
  icon: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 图标颜色（SVG 着色） */
  color?: string;
  /** 透明度 */
  opacity?: number;
}
