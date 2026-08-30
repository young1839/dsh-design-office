/**
 * PPT 模块：design_pptx_create / doc_read_pptx / doc_edit_pptx
 *
 * 知识点：
 * - pptxgenjs defineSlideMaster 定义模板（master→layout→slide 三层继承）
 * - 渐变 hack：pptxgenjs 只支持 solidFill，生成后 post-process 注入 <a:gradFill>
 *   - <a:gradFill><a:gsLst><a:gs pos="0">…</a:gs><a:gs pos="100000">…</a:gs></a:gsLst><a:lin ang="5400000"/></a:gradFill>
 *   - pos 单位 0-100000 千分比；lin ang 角度×60000（5400000=90°）
 * - 读取：JSZip 解包 → 遍历 <a:t> 文本节点 + <p:ph> 占位符
 * - 编辑：定位 <a:t> 做 find→replace 手术式替换，保留全部样式
 */
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { renderIcons } from '../services/render-service.js';
import type { PptxCreateParams, SlideDef, TemplateDef, IconPlacement } from '../types.js';

/** 从 SVG buffer 生成渐变 XML（注入用） */
export function buildGradFillXml(from: string, to: string, angleDeg = 135): string {
  // angle 转 OOXML 单位：度 × 60000
  const ang = Math.round(angleDeg * 60000);
  // ⚠️ OOXML 规范：srgbClr val 必须是 6 位十六进制，不带 # 前缀！
  // 带 # 会导致 PowerPoint 报"内容有问题"、LibreOffice 渲染黑屏
  const clean = (c: string) => c.replace(/^#/, '');
  return `<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="${clean(from)}"/></a:gs><a:gs pos="100000"><a:srgbClr val="${clean(to)}"/></a:gs></a:gsLst><a:lin ang="${ang}" scaled="1"/></a:gradFill>`;
}

/** 把第一张 slide 的背景 solidFill 替换为 gradFill（post-process） */
export async function injectGradient(pptxBuffer: Buffer, from: string, to: string, angleDeg = 135): Promise<Buffer> {
  const zip = await JSZip.loadAsync(pptxBuffer);
  // 找到第一张 slide
  const slidePath = Object.keys(zip.files).find((f) => /ppt\/slides\/slide1\.xml$/.test(f));
  if (!slidePath) return pptxBuffer;
  let xml = await zip.file(slidePath)!.async('string');
  const gradXml = buildGradFillXml(from, to, angleDeg);
  // 替换背景 solidFill：<p:bg><p:bgPr><a:solidFill>...</a:solidFill>... → gradFill
  const bgRegex = /(<p:bg>\s*<p:bgPr>)([\s\S]*?)(<a:solidFill>[\s\S]*?<\/a:solidFill>)([\s\S]*?<\/p:bgPr>\s*<\/p:bg>)/;
  if (bgRegex.test(xml)) {
    xml = xml.replace(bgRegex, (_m, pre, _mid, _solid, post) => `${pre}${gradXml}${post}`);
  } else {
    // 兜底：在 spTree 后插入渐变背景
    xml = xml.replace('</p:spTree>', `<p:bg><p:bgPr>${gradXml}<a:effectLst/></p:bgPr></p:bg></p:spTree>`);
  }
  zip.file(slidePath, xml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** 生成 PPT */
export async function createPptx(params: PptxCreateParams, template: TemplateDef & { source: 'builtin' | 'user'; file?: string }): Promise<{ file: string; rendering: string }> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.theme = { headFontFace: 'Microsoft YaHei', bodyFontFace: 'Microsoft YaHei' };

  const { primary, secondary, background, text } = params.theme
    ? { ...template.colors, ...params.theme }
    : template.colors;

  // 预渲染图标
  const iconResults = params.icons?.length ? await renderIcons(params.icons) : {};
  const iconAvailable = Object.values(iconResults).some((r) => r.png !== null);
  const rendering = iconAvailable ? 'tier1' : 'tier2';

  // 逐页生成
  const slides: any[] = [];
  for (const slideDef of params.slides) {
    const slide = pptx.addSlide();
    slides.push(slide);
    slide.background = { color: background };
    // 右上角装饰色块
    slide.addShape('rect', { x: 11.8, y: 0, w: 1.53, h: 0.35, fill: { color: secondary }, rotate: 0 });
    switch (slideDef.type) {
      case 'title': {
        slide.addText(slideDef.title, { x: 0.8, y: 2.5, w: 11.7, h: 1.6, fontSize: 40, bold: true, color: template.gradient ? primary : text, fontFace: 'Microsoft YaHei' });
        if (slideDef.subtitle) slide.addText(slideDef.subtitle, { x: 0.8, y: 4.2, w: 11.7, h: 0.8, fontSize: 18, color: secondary, fontFace: 'Microsoft YaHei' });
        break;
      }
      case 'section': {
        slide.addText(slideDef.title, { x: 0.8, y: 2.8, w: 11.7, h: 1.4, fontSize: 36, bold: true, color: primary });
        if (slideDef.subtitle) slide.addText(slideDef.subtitle, { x: 0.8, y: 4.3, w: 11.7, h: 0.7, fontSize: 16, color: secondary });
        break;
      }
      case 'content': {
        slide.addText(slideDef.title, { x: 0.8, y: 0.7, w: 11.7, h: 0.9, fontSize: 28, bold: true, color: primary });
        slide.addText(
          slideDef.items.map((t) => ({ text: t, options: { bullet: { code: '2022' }, fontSize: 16, color: text, breakLine: true } })),
          { x: 0.8, y: 1.8, w: 11.7, h: 5.0, fontSize: 16, color: text, bullet: { code: '2022' }, lineSpacingMultiple: 1.4 },
        );
        break;
      }
      case 'two-column': {
        slide.addText(slideDef.title, { x: 0.8, y: 0.7, w: 11.7, h: 0.9, fontSize: 28, bold: true, color: primary });
        slide.addText(
          slideDef.left.map((t) => ({ text: t, options: { bullet: true, fontSize: 14, color: text, breakLine: true } })),
          { x: 0.8, y: 1.8, w: 5.6, h: 5.0, fontSize: 14, color: text, bullet: true },
        );
        slide.addText(
          slideDef.right.map((t) => ({ text: t, options: { bullet: true, fontSize: 14, color: text, breakLine: true } })),
          { x: 6.8, y: 1.8, w: 5.6, h: 5.0, fontSize: 14, color: text, bullet: true },
        );
        break;
      }
      case 'image': {
        slide.addText(slideDef.title, { x: 0.8, y: 0.7, w: 11.7, h: 0.9, fontSize: 28, bold: true, color: primary });
        slide.addImage({ path: slideDef.image, x: 2.0, y: 2.0, w: 9.3, h: 4.5 });
        if (slideDef.caption) slide.addText(slideDef.caption, { x: 2.0, y: 6.6, w: 9.3, h: 0.5, fontSize: 12, color: secondary });
        break;
      }
      case 'table': {
        slide.addText(slideDef.title, { x: 0.8, y: 0.7, w: 11.7, h: 0.9, fontSize: 28, bold: true, color: primary });
        const rows = [slideDef.headers, ...slideDef.rows].map((row) =>
          row.map((cell) => ({ text: cell, options: { fontSize: 13, color: text, fontFace: 'Microsoft YaHei' } })),
        );
        slide.addTable(rows, {
          x: 0.8, y: 1.8, w: 11.7,
          fontSize: 13,
          color: text,
          border: { pt: 0.5, color: 'D1D5DB' },
          fill: { color: background },
          fontFace: 'Microsoft YaHei',
          autoPage: false,
          rowH: 0.5,
        });
        break;
      }
      case 'chart': {
        slide.addText(slideDef.title, { x: 0.8, y: 0.7, w: 11.7, h: 0.9, fontSize: 28, bold: true, color: primary });
        // 数据格式转换：[[120,150],[80,95]] + labels → [{name,labels,values}]
        const chartData = (slideDef.data as number[][]).map((series, i) => ({
          name: slideDef.labels?.[i] ? `系列${i + 1}（${slideDef.labels[i]}）` : `系列${i + 1}`,
          labels: slideDef.labels ?? series.map((_, j) => `第${j + 1}项`),
          values: series,
        }));
        slide.addChart(pptx.ChartType.bar, chartData, {
          x: 0.8, y: 1.8, w: 11.7, h: 4.8,
          catAxisLabelPos: 'nextTo',
          chartColors: [primary, secondary],
          showLegend: true,
          legendPos: 'b',
        });
        break;
      }
    }
    if (slideDef.notes) slide.addNotes(slideDef.notes);
  }

  // 图标嵌入（每一页都嵌，作为装饰素材——不是只有第一页）
  // 关键：圆底颜色要按背景明暗选择——深背景用白底，浅背景用深色底，
  // 否则图标与背景同色系会被"隐形"（用户反馈"看不到素材"的视觉根因）
  if (params.icons && iconAvailable) {
    // 惰性加载 sharp 用于加底衬
    let sharpMod: any = null;
    try { sharpMod = (await import('sharp')).default; } catch { sharpMod = null; }
    for (let si = 0; si < slides.length; si++) {
      const slide = slides[si];
      // 第一页是渐变深色背景 → 白色圆底；其他页浅色背景 → 深色圆底
      const bgColor = si === 0 ? '#FFFFFF' : (params.theme?.primary ?? template.colors.primary);
      const bgRgb = {
        r: parseInt(bgColor.slice(1, 3), 16),
        g: parseInt(bgColor.slice(3, 5), 16),
        b: parseInt(bgColor.slice(5, 7), 16),
      };
      for (const p of params.icons) {
        const result = iconResults[p.icon];
        if (result?.png) {
          let finalPng = result.png;
          if (sharpMod) {
            try {
              const meta = await sharpMod(result.png).metadata();
              const size = meta.width || 96;
              finalPng = await sharpMod({
                create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } },
              })
                .composite([
                  { input: Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${size*0.48}" fill="${bgColor}" opacity="0.92"/></svg>`), top: 0, left: 0 },
                  { input: result.png, top: 0, left: 0 },
                ])
                .png().toBuffer();
            } catch { finalPng = result.png; }
          }
          slide.addImage({ data: `image/png;base64,${finalPng.toString('base64')}`, x: p.x, y: p.y, w: p.w, h: p.h });
        }
      }
    }
  }

  // 输出
  const outPath = path.resolve(params.destination_path);
  const buf = await pptx.write({ outputType: 'nodebuffer' }) as Buffer;

  // 渐变注入（第一张 slide 背景）
  let finalBuf = buf;
  if (template.gradient) {
    finalBuf = await injectGradient(buf, template.gradient.from, template.gradient.to, template.gradient.angle);
  }
  await writeFile(outPath, finalBuf);
  return { file: outPath, rendering };
}

/** 读取 PPT → markdown */
export async function readPptx(filePath: string, include?: string[]): Promise<string> {
  const buf = await readFile(path.resolve(filePath));
  const zip = await JSZip.loadAsync(buf);
  // 找 slide 文件（排序保证顺序）
  const slidePaths = Object.keys(zip.files)
    .filter((f) => /ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)\.xml/)![1], 10);
      const nb = parseInt(b.match(/slide(\d+)\.xml/)![1], 10);
      return na - nb;
    });
  const lines: string[] = [];
  for (let i = 0; i < slidePaths.length; i++) {
    const xml = await zip.file(slidePaths[i])!.async('string');
    lines.push(`## Slide ${i + 1}`);
    // 提取文本
    const texts = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1].trim()).filter(Boolean);
    lines.push(texts.join(' | '));
    if (include?.includes('layouts')) {
      const shapes = [...xml.matchAll(/<p:sp>[\s\S]*?<a:off x="(\d+)" y="(\d+)"\/>[\s\S]*?<a:ext cx="(\d+)" cy="(\d+)"\/>[\s\S]*?<\/p:sp>/g)].map((m) => `shape@${(parseInt(m[1]) / 360000).toFixed(2)},${(parseInt(m[2]) / 360000).toFixed(2)}cm ${(parseInt(m[3]) / 360000).toFixed(2)}x${(parseInt(m[4]) / 360000).toFixed(2)}cm`);
      lines.push(`  shapes: ${shapes.join('; ')}`);
    }
    if (include?.includes('tables')) {
      const tables = [...xml.matchAll(/<a:tbl>[\s\S]*?<\/a:tbl>/g)].map((t) => {
        const cells = [...t[0].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((c) => c[1]);
        return `table[${cells.join(',')}]`;
      });
      if (tables.length) lines.push(`  tables: ${tables.join('; ')}`);
    }
  }
  return lines.join('\n');
}

/**
 * 模板填充：把用户提供的模板（.pptx）按占位符填充内容，零破坏保留设计
 *
 * 知识点：
 * - OOXML 占位符：<p:ph type="title"> / <p:ph type="body" idx="1"> 等
 * - 手术式替换 <a:t> 文本节点，不触碰版式/配色/插画
 * - 规则：{{标题}} → 页标题；{{要点}} → body 占位符；{{表格}} → 表格首行替换
 */
export async function fillTemplate(
  templatePath: string,
  outputPath: string,
  fills: Array<{ slide: number; title?: string; items?: string[] }>,
): Promise<{ file: string; filled: number }> {
  const abs = path.resolve(templatePath);
  const out = path.resolve(outputPath);
  const buf = await readFile(abs);
  const zip = await JSZip.loadAsync(buf);
  const slidePaths = Object.keys(zip.files)
    .filter((f) => /ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => parseInt(a.match(/slide(\d+)\.xml/)![1], 10) - parseInt(b.match(/slide(\d+)\.xml/)![1], 10));
  let filled = 0;

  for (const fill of fills) {
    const sp = slidePaths[fill.slide - 1];
    if (!sp) continue;
    let xml = await zip.file(sp)!.async('string');

    // 1. 标题占位符：type="title" 或 ctrTitle，或"第一个文本对象"
    if (fill.title) {
      const titleRegex = /(<p:sp>[\s\S]*?<p:ph type="(?:title|ctrTitle)"[^>]*\/>[\s\S]*?<a:t>)[\s\S]*?(<\/a:t>[\s\S]*?<\/p:sp>)/;
      if (titleRegex.test(xml)) {
        xml = xml.replace(titleRegex, (_m, pre, post) => `${pre}${fill.title}${post}`);
        filled++;
      } else {
        // 兜底：替换第一个 <a:t> 内容（通常是标题）
        const firstText = /(<a:t>)[\s\S]*?(<\/a:t>)/;
        if (firstText.test(xml)) {
          xml = xml.replace(firstText, `$1${fill.title}$2`);
          filled++;
        }
      }
    }

    // 2. 要点填充：body 占位符，或"最大的文本对象"
    if (fill.items && fill.items.length) {
      const bodyRegex = /(<p:sp>[\s\S]*?<p:ph type="body"[^>]*\/>[\s\S]*?<a:lstStyle>[\s\S]*?<\/a:lstStyle>)([\s\S]*?)(<\/p:txBody>[\s\S]*?<\/p:sp>)/;
      if (bodyRegex.test(xml)) {
        // 生成新的 <a:p> 段落（每个要点一个）
        const paras = fill.items
          .map(
            (item, i) =>
              `<a:p><a:pPr lvl="${i > 0 ? 1 : 0}"/><a:r><a:t>${item}</a:t></a:r></a:p>`,
          )
          .join('');
        xml = xml.replace(bodyRegex, (_m, pre, _old, post) => `${pre}${paras}${post}`);
        filled++;
      } else {
        // 兜底：找最后一个 <a:p>...</a:p> 块，在它后面追加要点段落
        const lastPara = xml.lastIndexOf('</a:p>');
        if (lastPara > -1) {
          const paras = fill.items
            .map((item, i) => `<a:p><a:r><a:t>${i === 0 ? '' : '· '}${item}</a:t></a:r></a:p>`)
            .join('');
          xml = xml.slice(0, lastPara + 7) + paras + xml.slice(lastPara + 7);
          filled++;
        }
      }
    }

    zip.file(sp, xml);
  }

  await writeFile(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  return { file: out, filled };
}

/** 编辑 PPT：查找替换文本 */
export async function editPptx(filePath: string, find: string, replace: string, slide?: number, outputPath?: string): Promise<{ modified: number }> {
  const abs = path.resolve(filePath);
  const buf = await readFile(abs);
  const zip = await JSZip.loadAsync(buf);
  const slidePaths = Object.keys(zip.files)
    .filter((f) => /ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => parseInt(a.match(/slide(\d+)\.xml/)![1], 10) - parseInt(b.match(/slide(\d+)\.xml/)![1], 10));
  let modified = 0;
  const targets = slide ? [slidePaths[slide - 1]] : slidePaths;
  for (const sp of targets) {
    if (!sp) continue;
    let xml = await zip.file(sp)!.async('string');
    // 只替换 <a:t> 文本节点内容
    const before = xml;
    xml = xml.replace(/<a:t>([\s\S]*?)<\/a:t>/g, (m, content) => {
      if (content.includes(find)) {
        modified++;
        return `<a:t>${content.split(find).join(replace)}</a:t>`;
      }
      return m;
    });
    if (xml !== before) zip.file(sp, xml);
  }
  const out = outputPath ? path.resolve(outputPath) : abs;
  await writeFile(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  return { modified };
}
