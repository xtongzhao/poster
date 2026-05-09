// 按目标比例居中裁剪 + 缩放，返回目标尺寸的离屏 canvas

/**
 * @param {ImageBitmap | HTMLImageElement} image
 * @param {number} targetW
 * @param {number} targetH
 * @returns {HTMLCanvasElement}
 */
export function cropAndResize(image, targetW, targetH) {
  const srcW = image.width || image.naturalWidth;
  const srcH = image.height || image.naturalHeight;
  const srcRatio = srcW / srcH;
  const dstRatio = targetW / targetH;

  let sx = 0, sy = 0, sw = srcW, sh = srcH;
  if (srcRatio > dstRatio) {
    // 原图更宽，裁掉左右
    sw = srcH * dstRatio;
    sx = (srcW - sw) / 2;
  } else if (srcRatio < dstRatio) {
    // 原图更高，裁掉上下
    sh = srcW / dstRatio;
    sy = (srcH - sh) / 2;
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, targetW, targetH);
  return canvas;
}
