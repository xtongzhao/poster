// 应用入口：绑定 UI + 协调渲染管线（支持多端：OTT / Pad / Phone）

import {
  renderToCanvas,
  loadMedal,
  CANVAS_W,
  CANVAS_H,
  DEVICE_PRESETS,
  getOutputSize,
} from './core/posterRenderer.js?v=20260511a';
import { loadTitleFont } from './core/textRenderer.js?v=20260511a';
import { loadImageFromFile } from './utils/imageLoader.js?v=20260511a';
import { downloadBlob, downloadZip, sanitizeFilename } from './utils/exporter.js?v=20260511a';
import { rgbToHex } from './utils/colorUtils.js?v=20260511a';

// ---------- 状态 ----------
// 每个 device 维护独立的 image / 羽化参数，互不影响
function makeDeviceState(deviceKey) {
  const preset = DEVICE_PRESETS[deviceKey];
  return {
    file: null,
    image: null,
    meta: null,
    feather: { ...preset.feather },
  };
}

const state = {
  mode: 'single',
  device: 'ott',
  single: {
    title: '小红帽的故事',
    showMedal: true,
    devices: {
      ott: makeDeviceState('ott'),
      pad: makeDeviceState('pad'),
      phone: makeDeviceState('phone'),
    },
  },
  batch: {
    items: [],
  },
  medalImage: null,
  fontReady: false,
};

const getCurDevState = () => state.single.devices[state.device];

// ---------- DOM ----------
const $ = (sel) => document.querySelector(sel);

const dom = {
  body: document.body,
  modeBtns: document.querySelectorAll('.mode-btn'),
  deviceBtns: document.querySelectorAll('.device-btn'),
  brandSub: $('#brand-sub'),
  dropSub: $('#drop-sub'),
  dropHintSize: $('#drop-hint-size'),
  previewBadge: $('#preview-badge'),
  dropZone: $('#drop-zone'),
  fileInput: $('#file-input'),
  titleInput: $('#title-input'),
  leftErase: $('#left-erase'),
  leftEraseVal: $('#left-erase-val'),
  leftSoftness: $('#left-softness'),
  leftSoftnessVal: $('#left-softness-val'),
  bottomErase: $('#bottom-erase'),
  bottomEraseVal: $('#bottom-erase-val'),
  bottomSoftness: $('#bottom-softness'),
  bottomSoftnessVal: $('#bottom-softness-val'),
  unlockBtn: $('#unlock-btn'),
  featherControls: $('#feather-controls'),
  showMedal: $('#show-medal'),
  titleHint: $('#title-hint'),
  previewCanvas: $('#preview-canvas'),
  previewPlaceholder: $('#preview-placeholder'),
  generateBtn: $('#generate-btn'),
  batchGenerateBtn: $('#batch-generate-btn'),
  paletteSection: $('#palette-section'),
  palette: $('#palette'),
  bgDot: $('#bg-dot'),
  strokeDot: $('#stroke-dot'),
  renderTime: $('#render-time'),
  fontStatus: $('#font-status'),
  batchList: $('#batch-list'),
  batchGrid: $('#batch-grid'),
  batchProgress: $('#batch-progress'),
  batchDevicePick: $('#batch-device-pick'),
};

// ---------- 初始化 ----------
async function init() {
  setupModeSwitcher();
  setupDeviceSwitcher();
  setupDropZone();
  setupSingleControls();
  setupBatchControls();
  applyDevicePreset(state.device, false);

  // 预加载字体与勋章
  updateFontStatus('loading', '字体加载中…');
  try {
    [state.medalImage] = await Promise.all([
      loadMedal().catch((e) => { console.warn(e); return null; }),
      loadTitleFont(),
    ]);
    state.fontReady = true;
    updateFontStatus('ready', '字体已就绪 · 方正兰亭圆简体');
  } catch (e) {
    console.warn('字体加载失败', e);
    state.fontReady = false;
    updateFontStatus('error', '字体加载失败，将使用系统字体');
    state.medalImage = await loadMedal().catch(() => null);
  }

  if (getCurDevState().image) triggerSingleRender();
}

function updateFontStatus(kind, text) {
  dom.fontStatus.innerHTML = `<i class="status-dot ${kind}"></i>${text}`;
}

// ---------- 模式切换（单张/批量） ----------
function setupModeSwitcher() {
  dom.body.dataset.mode = 'single';
  dom.modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      state.mode = mode;
      dom.body.dataset.mode = mode;
      dom.modeBtns.forEach((b) => b.classList.toggle('active', b === btn));
      dom.fileInput.multiple = (mode === 'batch');
    });
  });
}

// ---------- 设备切换（OTT/Pad/Phone，仅单张模式） ----------
function setupDeviceSwitcher() {
  dom.deviceBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const device = btn.dataset.device;
      if (device === state.device) return;
      state.device = device;
      dom.deviceBtns.forEach((b) => b.classList.toggle('active', b === btn));
      applyDevicePreset(device, true);
    });
  });
}

/**
 * 应用某个 device 的预设：调整画布尺寸、羽化滑块的 max/默认值
 * @param {string} device
 * @param {boolean} render 是否触发重渲（图片存在时）
 */
function applyDevicePreset(device, render) {
  const preset = DEVICE_PRESETS[device];
  const dev = getCurDevState();
  const out = getOutputSize(device);

  // 1. 顶栏文案 & 上传区文案 & 预览徽章（显示输出实际像素）
  if (dom.brandSub) dom.brandSub.textContent = `上传 poster · 输入标题 · 一键生成 ${out.width}×${out.height} 精美卡片`;
  if (dom.dropHintSize) dom.dropHintSize.textContent = `建议上传尺寸 ${preset.posterW}×${preset.posterH}（设计稿基准）`;
  if (dom.previewBadge) {
    dom.previewBadge.textContent = out.scale > 1
      ? `预览 · ${out.width} × ${out.height}（${out.scale}x 高清）`
      : `预览 · ${out.width} × ${out.height}`;
  }

  // 2. canvas 尺寸切换：使用输出实际像素
  dom.previewCanvas.width = out.width;
  dom.previewCanvas.height = out.height;

  // 3. 羽化滑块上限 & 默认值（基准像素，不含 scale）
  dom.leftErase.max = preset.featherMax.left;
  dom.leftSoftness.max = preset.featherMax.left;
  dom.bottomErase.max = preset.featherMax.bottom;
  dom.bottomSoftness.max = preset.featherMax.bottom;

  dom.leftErase.value      = dev.feather.leftErase;
  dom.leftSoftness.value   = dev.feather.leftSoftness;
  dom.bottomErase.value    = dev.feather.bottomErase;
  dom.bottomSoftness.value = dev.feather.bottomSoftness;

  dom.leftEraseVal.textContent      = dev.feather.leftErase + 'px';
  dom.leftSoftnessVal.textContent   = dev.feather.leftSoftness + 'px';
  dom.bottomEraseVal.textContent    = dev.feather.bottomErase + 'px';
  dom.bottomSoftnessVal.textContent = dev.feather.bottomSoftness + 'px';

  // 4. 重置画布显示状态（无图则显示 placeholder）
  if (!dev.image) {
    dom.previewPlaceholder.style.display = '';
    const ctx = dom.previewCanvas.getContext('2d');
    ctx.clearRect(0, 0, out.width, out.height);
  } else if (render) {
    _needRecolor = true;
    triggerSingleRender();
  }
}

// ---------- 上传区 ----------
function setupDropZone() {
  dom.fileInput.multiple = false;

  ['dragenter', 'dragover'].forEach((ev) => {
    dom.dropZone.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      dom.dropZone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach((ev) => {
    dom.dropZone.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      dom.dropZone.classList.remove('dragover');
    });
  });
  dom.dropZone.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer.files || []).filter((f) => /^image\//.test(f.type));
    if (files.length === 0) return;
    handleFiles(files);
  });

  dom.fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    handleFiles(files);
    dom.fileInput.value = '';
  });
}

async function handleFiles(files) {
  if (state.mode === 'single') {
    const f = files[0];
    const dev = getCurDevState();
    dev.file = f;
    try {
      dev.image = await loadImageFromFile(f);
      dev.meta = null; // 新图片需要重新取色
      if (!dom.titleInput.value.trim()) {
        const baseName = f.name.replace(/\.[^.]+$/, '');
        dom.titleInput.value = baseName;
        state.single.title = baseName;
      }
      triggerSingleRender(true);
    } catch (e) {
      alert('图片加载失败：' + e.message);
    }
  } else {
    for (const f of files) {
      await addBatchItem(f);
    }
    renderBatchList();
  }
}

// ---------- 单张模式 ----------
function setupSingleControls() {
  dom.titleInput.addEventListener('input', (e) => {
    state.single.title = e.target.value;
    triggerSingleRender();
  });

  dom.showMedal.addEventListener('change', () => {
    const show = dom.showMedal.checked;
    state.single.showMedal = show;
    dom.titleHint.textContent = show
      ? '最多显示 8 个字，超出部分将显示为 ...'
      : '最多显示 9 个字，超出部分将显示为 ...';
    triggerSingleRender();
  });

  // 羽化滑块（写回当前 device 的状态）
  const bindSlider = (el, valEl, key) => {
    el.addEventListener('input', () => {
      valEl.textContent = el.value + 'px';
      getCurDevState().feather[key] = parseInt(el.value, 10);
      triggerSingleRender();
    });
  };
  bindSlider(dom.leftErase, dom.leftEraseVal, 'leftErase');
  bindSlider(dom.leftSoftness, dom.leftSoftnessVal, 'leftSoftness');
  bindSlider(dom.bottomErase, dom.bottomEraseVal, 'bottomErase');
  bindSlider(dom.bottomSoftness, dom.bottomSoftnessVal, 'bottomSoftness');

  dom.unlockBtn.addEventListener('click', () => {
    const locked = dom.featherControls.classList.contains('feather-locked');
    if (locked) {
      dom.featherControls.classList.remove('feather-locked');
      [dom.leftErase, dom.leftSoftness, dom.bottomErase, dom.bottomSoftness].forEach((el) => { el.disabled = false; });
      dom.unlockBtn.classList.add('unlocked');
      dom.unlockBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <span>已解锁，点击锁定</span>
      `;
    } else {
      dom.featherControls.classList.add('feather-locked');
      [dom.leftErase, dom.leftSoftness, dom.bottomErase, dom.bottomSoftness].forEach((el) => { el.disabled = true; });
      dom.unlockBtn.classList.remove('unlocked');
      dom.unlockBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
        <span>解锁羽化参数</span>
      `;
    }
  });

  dom.generateBtn.addEventListener('click', async () => {
    const dev = getCurDevState();
    if (!dev.image) {
      alert('请先上传绘本 poster');
      return;
    }
    dom.generateBtn.disabled = true;
    try {
      await triggerSingleRender();
      const blob = await canvasToBlob(dom.previewCanvas);
      const out = getOutputSize(state.device);
      const baseName = sanitizeFilename(state.single.title || 'poster');
      const name = `${baseName}_${out.width}x${out.height}.png`;
      downloadBlob(blob, name);
    } catch (e) {
      alert('生成失败：' + e.message);
      console.error(e);
    } finally {
      dom.generateBtn.disabled = false;
    }
  });
}

// 防抖渲染
let _renderTimer = null;
let _needRecolor = true;

function triggerSingleRender(recolor = false) {
  const dev = getCurDevState();
  if (!dev.image) return;
  if (recolor) _needRecolor = true;
  clearTimeout(_renderTimer);
  return new Promise((resolve) => {
    _renderTimer = setTimeout(async () => {
      await doSingleRender();
      resolve();
    }, 30);
  });
}

async function doSingleRender() {
  const dev = getCurDevState();
  if (!dev.image) return;
  const t0 = performance.now();
  dom.previewPlaceholder.style.display = 'none';

  const cachedPalette = (!_needRecolor && dev.meta) ? {
    palette: dev.meta.palette,
    bg: dev.meta.bg,
    bgAux: dev.meta.bgAux,
    stroke: dev.meta.stroke,
  } : null;

  const meta = await renderToCanvas(dom.previewCanvas, {
    posterImage: dev.image,
    title: state.single.title,
    medalImage: state.medalImage,
    device: state.device,
    leftErase: dev.feather.leftErase,
    bottomErase: dev.feather.bottomErase,
    leftSoftness: dev.feather.leftSoftness,
    bottomSoftness: dev.feather.bottomSoftness,
    showMedal: dom.showMedal.checked,
    cachedPalette,
  });
  dev.meta = meta;
  _needRecolor = false;

  updatePaletteUI(meta);

  const t1 = performance.now();
  dom.renderTime.textContent = `耗时 ${Math.round(t1 - t0)} ms`;
}

function updatePaletteUI(meta) {
  dom.paletteSection.style.display = '';
  dom.palette.innerHTML = '';
  (meta.palette || []).forEach((c) => {
    const sw = document.createElement('div');
    sw.className = 'swatch';
    sw.style.background = c.hex;
    sw.innerHTML = `<span class="tip">${c.hex} · ${(c.ratio * 100).toFixed(1)}%</span>`;
    dom.palette.appendChild(sw);
  });
  dom.bgDot.style.background = rgbToHex(meta.bg);
  dom.strokeDot.style.background = rgbToHex(meta.stroke);
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

// ---------- 批量模式 ----------
function setupBatchControls() {
  // 端选择复选框：变化时重渲预览网格
  if (dom.batchDevicePick) {
    dom.batchDevicePick.addEventListener('change', () => {
      renderBatchGrid();
    });
  }

  dom.batchGenerateBtn.addEventListener('click', async () => {
    if (state.batch.items.length === 0) {
      alert('请先上传至少一张 poster');
      return;
    }
    const devices = getSelectedBatchDevices();
    if (devices.length === 0) {
      alert('请至少选择一个端');
      return;
    }
    dom.batchGenerateBtn.disabled = true;
    try {
      await runBatch(devices);
    } finally {
      dom.batchGenerateBtn.disabled = false;
    }
  });
}

/** 读取批量模式下勾选的端 */
function getSelectedBatchDevices() {
  if (!dom.batchDevicePick) return ['ott'];
  return Array.from(dom.batchDevicePick.querySelectorAll('input[type="checkbox"]'))
    .filter((el) => el.checked)
    .map((el) => el.dataset.device);
}

let _batchIdSeq = 0;
async function addBatchItem(file) {
  try {
    const image = await loadImageFromFile(file);
    state.batch.items.push({
      id: ++_batchIdSeq,
      file,
      image,
      title: file.name.replace(/\.[^.]+$/, ''),
      // 状态按端存：results[device] = { status:'pending'|'done'|'error', blob }
      results: {},
    });
  } catch (e) {
    console.warn('加载失败', file.name, e);
    alert(`"${file.name}" 加载失败：${e.message}`);
  }
}

function renderBatchList() {
  if (state.batch.items.length === 0) {
    dom.batchList.innerHTML = '<div class="batch-empty">暂无文件，请上传后为每张图填写标题</div>';
    renderBatchGrid();
    return;
  }
  dom.batchList.innerHTML = '';
  state.batch.items.forEach((it) => {
    const el = document.createElement('div');
    el.className = 'batch-item';
    el.innerHTML = `
      <img class="thumb" alt="" />
      <div class="field">
        <span class="fname" title="${escapeHtml(it.file.name)}">${escapeHtml(it.file.name)}</span>
        <input class="tinput" type="text" placeholder="绘本标题" value="${escapeHtml(it.title)}" />
      </div>
      <button class="remove" title="移除">×</button>
    `;
    const thumb = el.querySelector('.thumb');
    makeThumbUrl(it.image).then((u) => { thumb.src = u; });

    el.querySelector('.tinput').addEventListener('input', (e) => {
      it.title = e.target.value;
    });
    el.querySelector('.remove').addEventListener('click', () => {
      state.batch.items = state.batch.items.filter((x) => x.id !== it.id);
      renderBatchList();
    });
    dom.batchList.appendChild(el);
  });
  renderBatchGrid();
}

async function makeThumbUrl(image) {
  const c = document.createElement('canvas');
  c.width = 48; c.height = 32;
  const ctx = c.getContext('2d');
  const sw = image.width, sh = image.height;
  const srcRatio = sw / sh, dstRatio = 48 / 32;
  let sx = 0, sy = 0, ssw = sw, ssh = sh;
  if (srcRatio > dstRatio) { ssw = sh * dstRatio; sx = (sw - ssw) / 2; }
  else { ssh = sw / dstRatio; sy = (sh - ssh) / 2; }
  ctx.drawImage(image, sx, sy, ssw, ssh, 0, 0, 48, 32);
  return c.toDataURL('image/png');
}

/**
 * 预览网格：按端分组横向展示。每个端下显示当前所有 item 的 canvas 占位。
 */
function renderBatchGrid() {
  const items = state.batch.items;
  const devices = getSelectedBatchDevices();

  if (items.length === 0) {
    dom.batchGrid.innerHTML = `
      <div class="batch-grid-empty">
        <p>切换到批量模式后，勾选要生成的端，上传多张 poster 并为每张填写标题，点击"一键生成并打包下载 ZIP"</p>
      </div>`;
    dom.batchProgress.textContent = '';
    return;
  }
  if (devices.length === 0) {
    dom.batchGrid.innerHTML = `
      <div class="batch-grid-empty">
        <p>请至少勾选一个要生成的端（OTT / Pad / 手机）</p>
      </div>`;
    dom.batchProgress.textContent = '';
    return;
  }

  dom.batchGrid.innerHTML = '';
  devices.forEach((device) => {
    const preset = DEVICE_PRESETS[device];
    const out = getOutputSize(device);
    const group = document.createElement('div');
    group.className = 'batch-group';
    group.dataset.device = device;
    const sizeLabel = out.scale > 1
      ? `${out.width}×${out.height} (${out.scale}x)`
      : `${out.width}×${out.height}`;
    group.innerHTML = `
      <div class="batch-group-head">
        <span class="bg-name">${preset.label}</span>
        <span class="bg-size">${sizeLabel}</span>
      </div>
      <div class="batch-group-cards"></div>
    `;
    const cardsWrap = group.querySelector('.batch-group-cards');
    items.forEach((it) => {
      const card = document.createElement('div');
      card.className = 'batch-card';
      card.dataset.id = it.id;
      card.dataset.device = device;
      card.innerHTML = `
        <canvas width="${out.width}" height="${out.height}"></canvas>
        <div class="cap">${escapeHtml(it.title || it.file.name)}</div>
      `;
      cardsWrap.appendChild(card);
    });
    dom.batchGrid.appendChild(group);
  });
}

async function runBatch(devices) {
  renderBatchGrid();
  const items = state.batch.items;
  const total = items.length * devices.length;
  let processed = 0;
  // 按端分目录的产物：{ ott: [{name, blob}], pad: [...], phone: [...] }
  const filesByDevice = {};
  devices.forEach((d) => { filesByDevice[d] = []; });

  for (const device of devices) {
    const preset = DEVICE_PRESETS[device];
    const out = getOutputSize(device);
    // 读取单张模式中该端当前的羽化参数
    const f = state.single.devices[device].feather;

    for (const it of items) {
      processed++;
      dom.batchProgress.textContent = `处理中 ${processed}/${total}（${preset.label}）…`;
      const card = dom.batchGrid.querySelector(
        `.batch-card[data-id="${it.id}"][data-device="${device}"]`
      );
      if (card) card.classList.add('processing');
      const canvas = card ? card.querySelector('canvas') : document.createElement('canvas');

      try {
        await renderToCanvas(canvas, {
          posterImage: it.image,
          title: it.title || '',
          medalImage: state.medalImage,
          device,
          leftErase: f.leftErase,
          bottomErase: f.bottomErase,
          leftSoftness: f.leftSoftness,
          bottomSoftness: f.bottomSoftness,
          showMedal: state.single.showMedal,
        });
        const blob = await canvasToBlob(canvas);
        it.results[device] = { status: 'done', blob };
        const baseName = sanitizeFilename(it.title || it.file.name.replace(/\.[^.]+$/, ''));
        filesByDevice[device].push({
          name: `${device}/${baseName}_${out.width}x${out.height}.png`,
          blob,
        });
        if (card) {
          card.classList.remove('processing');
          card.classList.add('done');
        }
      } catch (e) {
        console.error(e);
        it.results[device] = { status: 'error' };
        if (card) {
          card.classList.remove('processing');
          card.classList.add('error');
        }
      }
    }
  }

  // 汇总打包
  const allFiles = devices.reduce((acc, d) => acc.concat(filesByDevice[d]), []);
  dom.batchProgress.textContent = `完成 ${allFiles.length}/${total}，正在打包 ZIP…`;
  if (allFiles.length > 0) {
    try {
      const zipName = `picture-book-posters-${devices.join('+')}-${Date.now()}.zip`;
      await downloadZip(allFiles, zipName);
      dom.batchProgress.textContent = `完成 ${allFiles.length}/${total} · ZIP 已下载（按端分目录）`;
    } catch (e) {
      alert('打包 ZIP 失败：' + e.message);
    }
  } else {
    dom.batchProgress.textContent = '没有成功生成的图片';
  }
}

// ---------- 工具 ----------
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ---------- 启动 ----------
init().catch((e) => {
  console.error(e);
  alert('初始化失败：' + e.message);
});
