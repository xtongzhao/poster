// 图片解码工具

/**
 * 将 File / Blob 解码为 ImageBitmap（兼容降级到 HTMLImageElement）
 * @param {File | Blob} file
 * @returns {Promise<ImageBitmap | HTMLImageElement>}
 */
export async function loadImageFromFile(file) {
  if (!file) throw new Error('未提供图片文件');
  if (!/^image\//.test(file.type)) throw new Error('请选择有效的图片文件（PNG / JPG）');

  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      if (bmp.width < 40 || bmp.height < 40) throw new Error('图片尺寸过小');
      return bmp;
    } catch (e) {
      // 继续回退到 img 元素
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    img.onerror = () => { reject(new Error('图片解码失败')); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

/**
 * 从 URL 加载一张图片（用于勋章等静态资源）
 * @param {string} url
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('资源加载失败：' + url));
    img.src = url;
  });
}
