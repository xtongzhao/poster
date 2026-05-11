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
 *  - canvasW/H：成品画布尺寸（设计稿基准尺寸，未含 scale）
 *  - posterW/H：右上角原图区域尺寸
 *  - medalW/H：勋章尺寸
 *  - padLeft/padTop：左上角整体内边距
 *  - gapTitle：勋章与标题之间的水平间距
 *  - fontSize / strokeWidth：标题字号 / 描边宽度
 *  - feather: { leftErase, leftSoftness, bottomErase, bottomSoftness }
 *  - featherMax: { left, bottom }   羽化滑块的最大可调上限（基准尺寸下）
 *  - scale: 输出放大倍数（默认 1）。所有尺寸/字号/羽化值在渲染时统一乘以 scale，
 *           以提升 Pad/手机端的清晰度。
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
    scale: 1,
  },
  // Pad 端：基准 364×180，3 倍输出 → 1092×540
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
    feather: { leftErase: 60, leftSoftness: 50, bottomErase: 0, bottomSoftness: 60 },
    featherMax: { left: 221, bottom: 124 },
    scale: 3,
  },
  // 手机端：基准 358×200，3 倍输出 → 1074×600
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
    feather: { leftErase: 24, leftSoftness: 50, bottomErase: 0, bottomSoftness: 36 },
    featherMax: { left: 204, bottom: 115 },
    scale: 3,
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
 * 获取某个端的最终输出尺寸（含 scale）
 */
export function getOutputSize(device) {
  const p = DEVICE_PRESETS[device] || DEVICE_PRESETS.ott;
  const s = p.scale || 1;
  return { width: p.canvasW * s, height: p.canvasH * s, scale: s };
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
 *     （传入的为"基准像素值"，渲染时会按 scale 自动放大）
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
  const scale = preset.scale || 1;

  // 用预设默认值兜底（基准像素，未含 scale）
  const fLeftErase    = (typeof leftErase    === 'number') ? leftErase    : preset.feather.leftErase;
  const fLeftSoft     = (typeof leftSoftness === 'number') ? leftSoftness : preset.feather.leftSoftness;
  const fBottomErase  = (typeof bottomErase  === 'number') ? bottomErase  : preset.feather.bottomErase;
  const fBottomSoft   = (typeof bottomSoftness === 'number') ? bottomSoftness : preset.feather.bottomSoftness;

  // 实际渲染尺寸 = 设计基准 × scale
  const W = preset.canvasW * scale;
  const H = preset.canvasH * scale;
  const PW = preset.posterW * scale;
  const PH = preset.posterH * scale;

  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, W, H);

  // 1. 取色
  const { palette, bg, bgAux, stroke } = cachedPalette || await extractPalette(posterImage);

  // 2. 背景渐变
  drawGradientBackground(ctx, W, H, bg, bgAux);

  // 3. 裁剪 + 羽化 poster（直接用放大后的目标尺寸做高清裁剪）
  const posterCanvas = cropAndResize(posterImage, PW, PH);
  featherEdges(posterCanvas, fLeftErase * scale, fBottomErase * scale, fLeftSoft * scale, fBottomSoft * scale);

  // 4. 贴到右上角
  const px = W - PW;
  const py = 0;
  ctx.drawImage(posterCanvas, px, py);

  // 5. 勋章
  if (showMedal && medalImage) {
    ctx.drawImage(medalImage, preset.padLeft * scale, preset.padTop * scale, preset.medalW * scale, preset.medalH * scale);
  }

  // 6. 标题
  let titleX, titleMaxChars;
  if (showMedal) {
    titleX = (preset.padLeft + preset.medalW + preset.gapTitle) * scale;
    titleMaxChars = preset.titleMaxCharsWithMedal;
  } else {
    titleX = preset.padLeft * scale;
    titleMaxChars = preset.titleMaxCharsNoMedal;
  }
  drawTitleText(ctx, title || '', titleX, preset.padTop * scale, {
    fontSize: preset.fontSize * scale,
    fillColor: '#FFFFFF',
    strokeColor: rgbToHex(stroke),
    strokeWidth: preset.strokeWidth * scale,
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
