// 核心渲染管线：输入 poster + 标题 → 输出 Blob / ImageData
// 支持多端预设（OTT / Pad / Phone）

import { loadImageFromFile, loadImageFromUrl } from '../utils/imageLoader.js';
import { extractPalette } from './colorExtractor.js';
import { cropAndResize } from './cropper.js';
import { featherEdges } from './feather.js';
import { drawGradientBackground } from './gradientBg.js';
import { drawTitleText, loadTitleFont, measureTitleWidth } from './textRenderer.js';
import { rgbToHex } from '../utils/colorUtils.js';

/**
 * 设备预设
 *  - canvasW/H：成品画布尺寸
 *  - posterW/H：右上角原图区域尺寸
 *  - medalW/H：勋章尺寸
 *  - padLeft/padTop：左上角整体内边距
 *  - gapTitle：勋章与标题之间的水平间距
 *  - fontSize / strokeWidth：标题字号 / 描边宽度
 *  - feather: { leftErase, leftSoftness, bottomErase, bottomSoftness }
 *  - featherMax: { left, bottom }   羽化滑块的最大可调上限
 */
export const DEVICE_PRESETS = {
  // 现有 OTT 端（保持不变）
  ott: {
    label: 'OTT 端',
    canvasW: 816,
    canvasH: 426,
    posterW: 580,
    posterH: 326,
    medalW: 44,
    medalH: 52,
    padLeft: 32,
    padTop: 32,
    gapTitle: 12,
    fontSize: 44,
    strokeWidth: 3.6,
    titleMaxCharsWithMedal: 8,
    titleMaxCharsNoMedal: 9,
    feather: { leftErase: 40, leftSoftness: 135, bottomErase: 65, bottomSoftness: 90 },
    featherMax: { left: 580, bottom: 326 },
  },
  // Pad 端：成品 364×180，poster 区域 221×124
  pad: {
    label: 'Pad 端',
    canvasW: 364,
    canvasH: 180,
    posterW: 221,
    posterH: 124,
    medalW: 18,
    medalH: 22,
    padLeft: 12,
    padTop: 12,
    gapTitle: 4,
    fontSize: 18,
    strokeWidth: 1.6,
    titleMaxCharsWithMedal: 7,
    titleMaxCharsNoMedal: 8,
    // 渐变规范：横向 304×158（左 0% / 中 50% 100% / 右 100%）
    // 转换到 poster 内部，约等于：左侧硬擦 60，软渐 50；下侧硬擦 0，软渐 60
    feather: { leftErase: 60, leftSoftness: 50, bottomErase: 0, bottomSoftness: 60 },
    featherMax: { left: 221, bottom: 124 },
  },
  // 手机端：成品 358×200，poster 区域 204×115
  phone: {
    label: '手机端',
    canvasW: 358,
    canvasH: 200,
    posterW: 204,
    posterH: 115,
    medalW: 16,
    medalH: 19,
    padLeft: 12,
    padTop: 12,
    gapTitle: 4,
    fontSize: 16,
    strokeWidth: 1.4,
    titleMaxCharsWithMedal: 7,
    titleMaxCharsNoMedal: 8,
    // 渐变规范：纵向 358×124（上 0% → 30% 100% → 100% 100%）
    // 体现为下侧无硬擦、软渐变较大；左侧也有少量软过渡承接背景
    feather: { leftErase: 24, leftSoftness: 50, bottomErase: 0, bottomSoftness: 36 },
    featherMax: { left: 204, bottom: 115 },
  },
};

// 兼容旧导出（默认使用 OTT 预设）
export const CANVAS_W = DEVICE_PRESETS.ott.canvasW;
export const CANVAS_H = DEVICE_PRESETS.ott.canvasH;
export const POSTER_W = DEVICE_PRESETS.ott.posterW;
export const POSTER_H = DEVICE_PRESETS.ott.posterH;
export const MEDAL_W  = DEVICE_PRESETS.ott.medalW;
export const MEDAL_H  = DEVICE_PRESETS.ott.medalH;
export const PAD_LEFT = DEVICE_PRESETS.ott.padLeft;
export const PAD_TOP  = DEVICE_PRESETS.ott.padTop;
export const GAP_TITLE = DEVICE_PRESETS.ott.gapTitle;
export const FONT_SIZE = DEVICE_PRESETS.ott.fontSize;
export const STROKE_WIDTH = DEVICE_PRESETS.ott.strokeWidth;

// 勋章预加载（返回 Promise<HTMLImageElement>）
let _medalPromise = null;
export function loadMedal() {
  if (!_medalPromise) {
    const candidates = [
      new URL('../../勋章 9.png', import.meta.url).href,
      './勋章 9.png',
    ];
    _medalPromise = (async () => {
      for (const url of candidates) {
        try {
          return await loadImageFromUrl(url);
        } catch (_) { /* try next */ }
      }
      throw new Error('勋章图片加载失败');
    })();
  }
  return _medalPromise;
}

/**
 * 渲染单张成品到目标 canvas
 * @param {HTMLCanvasElement} canvas
 * @param {object} opts
 *   - posterImage: ImageBitmap | HTMLImageElement
 *   - title: string
 *   - medalImage: HTMLImageElement
 *   - device: 'ott' | 'pad' | 'phone'   设备预设，默认 'ott'
 *   - leftErase / bottomErase / leftSoftness / bottomSoftness: 可覆盖预设
 *   - showMedal: boolean  默认 true
 *   - cachedPalette: object 跳过取色
 */
export async function renderToCanvas(canvas, opts) {
  const {
    posterImage, title, medalImage,
    device = 'ott',
    leftErase, bottomErase, leftSoftness, bottomSoftness,
    showMedal = true,
    cachedPalette,
  } = opts;

  const preset = DEVICE_PRESETS[device] || DEVICE_PRESETS.ott;

  // 用预设默认值兜底
  const fLeftErase    = (typeof leftErase    === 'number') ? leftErase    : preset.feather.leftErase;
  const fLeftSoft     = (typeof leftSoftness === 'number') ? leftSoftness : preset.feather.leftSoftness;
  const fBottomErase  = (typeof bottomErase  === 'number') ? bottomErase  : preset.feather.bottomErase;
  const fBottomSoft   = (typeof bottomSoftness === 'number') ? bottomSoftness : preset.feather.bottomSoftness;

  canvas.width = preset.canvasW;
  canvas.height = preset.canvasH;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, preset.canvasW, preset.canvasH);

  // 1. 取色
  const { palette, bg, bgAux, stroke } = cachedPalette || await extractPalette(posterImage);

  // 2. 背景渐变
  drawGradientBackground(ctx, preset.canvasW, preset.canvasH, bg, bgAux);

  // 3. 裁剪 + 羽化 poster
  const posterCanvas = cropAndResize(posterImage, preset.posterW, preset.posterH);
  featherEdges(posterCanvas, fLeftErase, fBottomErase, fLeftSoft, fBottomSoft);

  // 4. 贴到右上角
  const px = preset.canvasW - preset.posterW;
  const py = 0;
  ctx.drawImage(posterCanvas, px, py);

  // 5. 勋章
  if (showMedal && medalImage) {
    ctx.drawImage(medalImage, preset.padLeft, preset.padTop, preset.medalW, preset.medalH);
  }

  // 6. 标题
  let titleX, titleMaxChars;
  if (showMedal) {
    titleX = preset.padLeft + preset.medalW + preset.gapTitle;
    titleMaxChars = preset.titleMaxCharsWithMedal;
  } else {
    titleX = preset.padLeft;
    titleMaxChars = preset.titleMaxCharsNoMedal;
  }
  drawTitleText(ctx, title || '', titleX, preset.padTop, {
    fontSize: preset.fontSize,
    fillColor: '#FFFFFF',
    strokeColor: rgbToHex(stroke),
    strokeWidth: preset.strokeWidth,
    textBaseline: 'top',
    textAlign: 'left',
    maxChars: titleMaxChars,
  });

  return { palette, bg, bgAux, stroke };
}

/**
 * 一次性完整流程：file + title → Blob
 */
export async function renderPoster({ posterFile, title, device = 'ott' }) {
  const [posterImage, medalImage] = await Promise.all([
    loadImageFromFile(posterFile),
    loadMedal().catch(() => null),
  ]);
  await loadTitleFont().catch(() => null);

  const canvas = document.createElement('canvas');
  const meta = await renderToCanvas(canvas, { posterImage, title, medalImage, device });

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return { blob, canvas, ...meta };
}

export { measureTitleWidth };
