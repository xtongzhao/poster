// 对 poster 的左边缘和下边缘做 alpha 羽化过渡
// 采用「硬擦除 + 软渐变」两段式：
//   - 硬擦除区：从 poster 边缘向内 [0, eraseDepth] 范围完全擦除（→ 透明，露出背景色块）
//   - 软渐变区：[eraseDepth, eraseDepth + transitionSoftness] 范围从透明渐变到实体
//   - 实体区：剩余部分保留 poster 原貌
//
// 这样一来，eraseDepth 控制"色块覆盖 poster 多少"，transitionSoftness 控制"过渡软硬程度"。

/**
 * 对一张 canvas 做左/下边缘 alpha 羽化，直接修改并返回该 canvas
 *
 * @param {HTMLCanvasElement} canvas
 * @param {number} leftErase           左侧硬擦除深度（px）
 * @param {number} bottomErase         下侧硬擦除深度（px）
 * @param {number} leftSoftness        左侧软渐变带宽度（px）
 * @param {number} bottomSoftness      下侧软渐变带宽度（px）
 */
export function featherEdges(canvas, leftErase = 40, bottomErase = 65, leftSoftness = 135, bottomSoftness = 90) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';

  // ---------- 左边缘 ----------
  // 区间 [0, leftErase]：完全擦除（实色背景露出）
  // 区间 [leftErase, leftErase + leftSoftness]：从完全擦除 → 不擦除（软渐变）
  const leftTotal = Math.min(leftErase + leftSoftness, w);
  if (leftTotal > 0) {
    // 1) 硬擦除矩形
    if (leftErase > 0) {
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.fillRect(0, 0, Math.min(leftErase, w), h);
    }
    // 2) 软渐变带
    if (leftSoftness > 0 && leftErase < w) {
      const x0 = leftErase;
      const x1 = Math.min(leftErase + leftSoftness, w);
      const lg = ctx.createLinearGradient(x0, 0, x1, 0);
      lg.addColorStop(0, 'rgba(0,0,0,1)'); // 完全擦除
      lg.addColorStop(1, 'rgba(0,0,0,0)'); // 不擦除
      ctx.fillStyle = lg;
      ctx.fillRect(x0, 0, x1 - x0, h);
    }
  }

  // ---------- 下边缘 ----------
  // 区间 [h - bottomErase, h]：完全擦除
  // 区间 [h - bottomErase - bottomSoftness, h - bottomErase]：从不擦除 → 完全擦除（软渐变）
  const bottomTotal = Math.min(bottomErase + bottomSoftness, h);
  if (bottomTotal > 0) {
    if (bottomErase > 0) {
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.fillRect(0, h - Math.min(bottomErase, h), w, Math.min(bottomErase, h));
    }
    if (bottomSoftness > 0 && bottomErase < h) {
      const y1 = h - bottomErase;             // 软渐变带底部（贴近硬擦除区）
      const y0 = Math.max(y1 - bottomSoftness, 0); // 软渐变带顶部
      const bg = ctx.createLinearGradient(0, y0, 0, y1);
      bg.addColorStop(0, 'rgba(0,0,0,0)'); // 不擦除（实体）
      bg.addColorStop(1, 'rgba(0,0,0,1)'); // 完全擦除
      ctx.fillStyle = bg;
      ctx.fillRect(0, y0, w, y1 - y0);
    }
  }

  ctx.restore();
  return canvas;
}
