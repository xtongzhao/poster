// 取色模块：调用 Worker 跑 k-means，选出背景色/辅色/描边色

import {
  rgbToHex,
  rgbToHsl,
  toComfortableBg,
  pickStrokeColor,
  makeGradientAuxColor,
} from '../utils/colorUtils.js';

let _worker = null;
function getWorker() {
  if (!_worker) {
    _worker = new Worker(new URL('../workers/kmeans.worker.js', import.meta.url), {
      type: 'module',
    });
  }
  return _worker;
}

/**
 * 将 ImageBitmap / HTMLImageElement 降采样到 100x100 提取像素
 */
function samplePixels(image, size = 100) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size).data;
}

/**
 * 对 poster 图片做聚类取色
 * @param {ImageBitmap | HTMLImageElement} image
 * @returns {Promise<{palette: Array<{hex:string, rgb:number[], ratio:number}>, bg:number[], bgAux:number[], stroke:number[]}>}
 */
export async function extractPalette(image) {
  const pixels = samplePixels(image, 100);

  const worker = getWorker();
  const result = await new Promise((resolve, reject) => {
    const handler = (e) => {
      worker.removeEventListener('message', handler);
      if (e.data && e.data.ok) resolve(e.data);
      else reject(new Error((e.data && e.data.error) || 'kmeans failed'));
    };
    worker.addEventListener('message', handler);
    worker.postMessage({ pixels, k: 5, maxIter: 12 });
  });

  const palette = result.centers.map((rgb, i) => ({
    rgb,
    hex: rgbToHex(rgb),
    ratio: result.ratios[i],
  }));

  // 选出背景色：优先占比最高的色，但如果过于灰暗/过亮则找下一个
  let bgRgb = palette[0].rgb;
  // 简单回退：如果第 1 主色饱和度极低（灰），尝试第 2 主色
  const [h0, s0] = rgbToHsl(bgRgb);
  if (s0 < 0.1 && palette.length > 1) {
    bgRgb = palette[1].rgb;
  }
  bgRgb = toComfortableBg(bgRgb);

  const bgAux = makeGradientAuxColor(bgRgb);
  const strokeRgb = pickStrokeColor(palette, bgRgb);

  return {
    palette,
    bg: bgRgb.map((v) => Math.round(v)),
    bgAux: bgAux.map((v) => Math.round(v)),
    stroke: strokeRgb.map((v) => Math.round(v)),
  };
}

