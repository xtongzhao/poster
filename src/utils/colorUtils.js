// 颜色工具：RGB / HSL 转换，和谐度与距离计算

/** rgb [0..255] -> hex */
export function rgbToHex([r, g, b]) {
  const to2 = (n) => {
    const h = Math.max(0, Math.min(255, Math.round(n))).toString(16);
    return h.length === 1 ? '0' + h : h;
  };
  return '#' + to2(r) + to2(g) + to2(b);
}

/** hex -> rgb [0..255] */
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}

/** rgb [0..255] -> hsl [h:0..360, s:0..1, l:0..1] */
export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = ((b - r) / d + 2); break;
      case b: h = ((r - g) / d + 4); break;
    }
    h *= 60;
  }
  return [h, s, l];
}

/** hsl [h,s,l] -> rgb [0..255] */
export function hslToRgb([h, s, l]) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)       [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else              [r, g, b] = [c, 0, 0];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** 环状色相差 0..180 */
export function hueDistance(h1, h2) {
  const d = Math.abs(h1 - h2) % 360;
  return d > 180 ? 360 - d : d;
}

/** 调节 HSL 到舒适背景范围（避免过亮/过暗/过艳） */
export function toComfortableBg(rgb) {
  const [h, s, l] = rgbToHsl(rgb);
  // 背景更偏中等明度 & 饱和度收敛
  const s2 = Math.min(s, 0.55);
  let l2 = l;
  if (l2 > 0.72) l2 = 0.62;
  else if (l2 < 0.2) l2 = 0.26;
  return hslToRgb([h, s2, l2]);
}

/**
 * 选出用于描边的颜色（方案 B：同色系主色深化）
 *
 * 策略：
 * 1) 只从 palette 前 3 主色中挑（过滤低占比的点缀色，防止红帽子式撞色）
 * 2) 在候选中优先选择"色相最接近背景"的色（同色系，和谐）
 * 3) 排除与背景几乎一样的色（占比最高那个通常就是被调成 bg 的色）
 * 4) 选中后做亮度压深/提亮 + 饱和度温和调整，保证与背景有清晰对比
 * 5) 兜底：若候选全是灰/与背景重合，基于背景色自身深化（色相不变）
 */
export function pickStrokeColor(palette, bgRgb) {
  const [bh, bs, bl] = rgbToHsl(bgRgb);

  // 仅考虑前 3 主色（按占比已排序）
  const candidates = (palette || []).slice(0, 3);

  // 筛掉：① 饱和度太低的灰 ② 色相与背景极近（< 8°）且亮度也极近（< 0.1）→ 视为和背景同色
  const filtered = candidates
    .map((c) => {
      const [h, s, l] = rgbToHsl(c.rgb);
      return { ...c, h, s, l };
    })
    .filter((c) => {
      if (c.s < 0.15) return false; // 灰色过滤
      const hDiff = hueDistance(c.h, bh);
      const lDiff = Math.abs(c.l - bl);
      if (hDiff < 8 && lDiff < 0.1) return false; // 与背景几乎同色
      return true;
    });

  let picked = null;
  if (filtered.length > 0) {
    // 按"色相接近度"打分：色相差越小越好；再叠加占比权重（主色优先）
    let bestScore = -Infinity;
    for (const c of filtered) {
      const hueCloseness = 180 - hueDistance(c.h, bh); // 0~180，越大越同色系
      const ratioBonus = (c.ratio || 0) * 100;         // 占比加分
      const score = hueCloseness * 1.0 + ratioBonus * 0.6;
      if (score > bestScore) {
        bestScore = score;
        picked = c;
      }
    }
  }

  // 兜底：用背景自身色相，做深化
  const baseHsl = picked ? [picked.h, picked.s, picked.l] : [bh, bs, bl];
  let [h, s, l] = baseHsl;

  // 饱和度：温和区间 [0.35, 0.7]，整体不再追求高饱和
  s = Math.max(0.35, Math.min(0.7, s));

  // 亮度：与背景形成至少 ~0.28 的对比
  if (bl > 0.5) {
    // 背景偏亮 → 描边深沉，落在 [0.18, 0.38]
    l = Math.max(0.18, Math.min(0.38, bl - 0.28));
  } else {
    // 背景偏暗 → 描边提亮，落在 [0.62, 0.82]
    l = Math.max(0.62, Math.min(0.82, bl + 0.32));
  }

  return hslToRgb([h, s, l]);
}

/** 生成渐变终点辅色：沿色相轻微偏移 + 亮度降低一点 */
export function makeGradientAuxColor(bgRgb) {
  const [h, s, l] = rgbToHsl(bgRgb);
  const h2 = (h + 14) % 360;
  const s2 = Math.min(0.6, s * 0.95);
  const l2 = Math.max(0.12, l - 0.12);
  return hslToRgb([h2, s2, l2]);
}
