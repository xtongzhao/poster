// Web Worker：对降采样后的像素数组执行 k-means 聚类，返回调色板

/**
 * @param {Uint8ClampedArray} pixels  RGBA 像素数据
 * @param {number} k  聚类数
 * @param {number} maxIter  最大迭代次数
 * @returns {{centers:number[][], ratios:number[]}}
 */
function kmeans(pixels, k = 5, maxIter = 12) {
  const samples = [];
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3];
    if (a < 200) continue; // 跳过透明像素
    samples.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
  }
  if (samples.length === 0) {
    return { centers: [[128, 128, 128]], ratios: [1] };
  }

  // k-means++ 初始化
  const centers = [];
  centers.push(samples[Math.floor(Math.random() * samples.length)].slice());
  while (centers.length < k) {
    const dists = samples.map((p) => {
      let min = Infinity;
      for (const c of centers) {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < min) min = d;
      }
      return min;
    });
    const total = dists.reduce((a, b) => a + b, 0);
    if (total === 0) break;
    let r = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < dists.length; i++) {
      r -= dists[i];
      if (r <= 0) { idx = i; break; }
    }
    centers.push(samples[idx].slice());
  }

  const labels = new Int32Array(samples.length);
  for (let iter = 0; iter < maxIter; iter++) {
    // 分配
    let changed = 0;
    for (let i = 0; i < samples.length; i++) {
      const p = samples[i];
      let best = 0;
      let bestD = Infinity;
      for (let j = 0; j < centers.length; j++) {
        const c = centers[j];
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bestD) { bestD = d; best = j; }
      }
      if (labels[i] !== best) { labels[i] = best; changed++; }
    }
    // 更新
    const sums = centers.map(() => [0, 0, 0, 0]); // r,g,b,count
    for (let i = 0; i < samples.length; i++) {
      const l = labels[i];
      const s = sums[l];
      s[0] += samples[i][0];
      s[1] += samples[i][1];
      s[2] += samples[i][2];
      s[3] += 1;
    }
    for (let j = 0; j < centers.length; j++) {
      if (sums[j][3] > 0) {
        centers[j][0] = sums[j][0] / sums[j][3];
        centers[j][1] = sums[j][1] / sums[j][3];
        centers[j][2] = sums[j][2] / sums[j][3];
      }
    }
    if (changed / samples.length < 0.01) break;
  }

  // 比例
  const counts = new Array(centers.length).fill(0);
  for (let i = 0; i < labels.length; i++) counts[labels[i]]++;
  const total = samples.length;
  const ratios = counts.map((c) => c / total);

  // 按占比排序
  const combined = centers.map((c, i) => ({ c, r: ratios[i] }));
  combined.sort((a, b) => b.r - a.r);

  return {
    centers: combined.map((x) => x.c.map((v) => Math.round(v))),
    ratios: combined.map((x) => x.r),
  };
}

self.onmessage = (e) => {
  const { pixels, k, maxIter } = e.data;
  try {
    const result = kmeans(pixels, k || 5, maxIter || 12);
    self.postMessage({ ok: true, ...result });
  } catch (err) {
    self.postMessage({ ok: false, error: err && err.message ? err.message : String(err) });
  }
};
