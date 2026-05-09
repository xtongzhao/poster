// 绘制渐变背景：主色 → 辅色轻微渐变

import { rgbToHex } from '../utils/colorUtils.js';

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {number[]} bg  主色 rgb
 * @param {number[]} bgAux 辅色 rgb
 */
export function drawGradientBackground(ctx, w, h, bg, bgAux) {
  // 对角线轻微渐变：左下 -> 右上
  const grad = ctx.createLinearGradient(0, h, w, 0);
  grad.addColorStop(0, rgbToHex(bgAux));
  grad.addColorStop(1, rgbToHex(bg));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // 叠加一个径向光晕增加层次感（非常微弱）
  const r = ctx.createRadialGradient(w * 0.25, h * 0.35, 20, w * 0.25, h * 0.35, Math.max(w, h) * 0.7);
  r.addColorStop(0, 'rgba(255,255,255,0.08)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, w, h);
}
