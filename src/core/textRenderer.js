// 绘制描边标题文字（outside 描边效果）+ 字体加载

import { rgbToHex } from '../utils/colorUtils.js';

const FONT_FAMILY = 'FZLTYJW';
let _fontLoadPromise = null;

/**
 * 异步加载本地 TTF 字体
 * @returns {Promise<FontFace>}
 */
export function loadTitleFont() {
  if (_fontLoadPromise) return _fontLoadPromise;
  _fontLoadPromise = (async () => {
    const fontUrl = new URL('../../方正兰亭圆简体_大.ttf', import.meta.url).href;
    const face = new FontFace(FONT_FAMILY, `url("${fontUrl}")`);
    await face.load();
    document.fonts.add(face);
    await document.fonts.ready;
    return face;
  })();
  return _fontLoadPromise;
}

export function getTitleFontFamily() {
  return FONT_FAMILY;
}

/**
 * 测量标题文字宽度
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} fontSize
 * @returns {number}
 */
export function measureTitleWidth(ctx, text, fontSize) {
  ctx.save();
  ctx.font = `${fontSize}px "${FONT_FAMILY}", "PingFang SC", sans-serif`;
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}

/**
 * 绘制 outside 风格描边文字
 * 原理：strokeText 默认描边宽度一半在内一半在外；为了让描边 3.6px 完全在字形外部，
 * 将 lineWidth 设为 3.6 * 2 = 7.2，先描边再填充覆盖内部，视觉上等效为 3.6px outside 描边。
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x  文字左边 anchor
 * @param {number} y  文字基线 y (textBaseline = 'alphabetic')
 * @param {object} opts
 *   - fontSize: number
 *   - fillColor: string
 *   - strokeColor: string
 *   - strokeWidth: number  (outside 视觉宽度)
 *   - textBaseline?: string
 *   - textAlign?: string
 */
export function drawTitleText(ctx, text, x, y, opts) {
  const {
    fontSize = 44,
    fillColor = '#FFFFFF',
    strokeColor = '#000000',
    strokeWidth = 3.6,
    textBaseline = 'middle',
    textAlign = 'left',
    maxChars = 8,
  } = opts || {};

  // 超过 maxChars 个字截断并加省略号
  let displayText = text || '';
  if ([...displayText].length > maxChars) {
    displayText = [...displayText].slice(0, maxChars).join('') + '...';
  }

  ctx.save();
  ctx.font = `${fontSize}px "${FONT_FAMILY}", "PingFang SC", sans-serif`;
  ctx.textBaseline = textBaseline;
  ctx.textAlign = textAlign;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.miterLimit = 2;

  // outside 描边：lineWidth 加倍后 strokeText，再 fillText 覆盖内部
  ctx.lineWidth = strokeWidth * 2;
  ctx.strokeStyle = strokeColor;
  ctx.strokeText(displayText, x, y);

  ctx.fillStyle = fillColor;
  ctx.fillText(displayText, x, y);

  ctx.restore();
}

/** 便捷：将 rgb 数组转为 hex 写入 */
export const toHex = rgbToHex;
