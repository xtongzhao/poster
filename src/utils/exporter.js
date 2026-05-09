// 导出工具：下载单张 / 批量打包 ZIP

/**
 * 触发浏览器下载一个 Blob
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

/**
 * 将一组 {name, blob} 打包为 ZIP 并下载
 * 依赖全局 JSZip（通过 CDN 加载）
 */
export async function downloadZip(items, zipName = 'posters.zip') {
  if (typeof window.JSZip === 'undefined') {
    throw new Error('JSZip 未加载');
  }
  const zip = new window.JSZip();
  // 防止同名覆盖
  const used = new Map();
  for (const { name, blob } of items) {
    let finalName = name;
    if (used.has(finalName)) {
      const idx = used.get(finalName) + 1;
      used.set(finalName, idx);
      const dot = finalName.lastIndexOf('.');
      finalName = dot > 0
        ? finalName.slice(0, dot) + `_${idx}` + finalName.slice(dot)
        : finalName + `_${idx}`;
    } else {
      used.set(finalName, 0);
    }
    zip.file(finalName, blob);
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(zipBlob, zipName);
}

/**
 * 清洗文件名：去除非法字符
 */
export function sanitizeFilename(name) {
  return (name || 'untitled')
    .replace(/[\\/:*?"<>|\r\n\t]/g, '')
    .trim()
    .slice(0, 80) || 'untitled';
}
