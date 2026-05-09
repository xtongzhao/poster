# 绘本 Poster 生成器

一个纯前端网页工具，将任意尺寸的绘本 poster 一键处理为统一视觉规范的 **816 × 426** 推荐卡片。免构建、零依赖安装，直接用静态服务器打开即可使用。

## 功能特性

- **智能居中裁剪**：输入任意尺寸图片，自动按 580 × 326 比例居中裁剪
- **AI 取色（k-means 聚类）**：Worker 线程提取 5 主色，智能挑选背景、辅色、描边色
- **柔和融合**：poster 左 / 下边缘 alpha 羽化，与背景自然过渡
- **精准排版**：勋章 44×52 / 左上 32dp / 标题间距 12dp / 字号 44 / 白字 + 3.6px outside 描边
- **实时预览**：上传即预览，标题修改即时更新
- **单张 & 批量**：单张下载 PNG；批量一键打包 ZIP
- **本地运行**：所有处理都在浏览器中完成，图片不会上传任何服务器

## 使用方式

### 启动

```bash
cd /Users/link/CodeBuddy/PictureBookPosterGeneration
python3 -m http.server 5173
```

然后访问：<http://127.0.0.1:5173/>

> ⚠️ 必须通过 HTTP 协议访问（不能直接用 file:// 打开 HTML），因为 FontFace 加载本地 TTF 和 ES Modules + Worker 都依赖同源策略。

### 操作流程

1. 选择模式：**单张** 或 **批量**
2. 单张模式：拖拽或点击上传一张 poster → 输入标题 → 实时预览 → 点击"生成并下载 PNG"
3. 批量模式：一次上传多张 → 为每张填写标题 → 点击"一键生成并打包下载 ZIP"

## 目录结构

```
PictureBookPosterGeneration/
├── index.html              # 页面入口
├── README.md
├── 方正兰亭圆简体_大.ttf    # 标题字体
├── 勋章 9.png              # 勋章图标
├── 绘本poster.png           # 示例 poster
├── 设计规范.png             # 设计参考图
└── src/
    ├── main.js             # 应用入口，绑定 UI + 协调渲染管线
    ├── styles.css          # 样式（Tailwind CDN + 自定义样式 token）
    ├── core/
    │   ├── posterRenderer.js  # 核心渲染管线
    │   ├── colorExtractor.js  # 取色调度（使用 Worker）
    │   ├── cropper.js         # 居中裁剪 + 缩放
    │   ├── feather.js         # 左/下边缘羽化 mask
    │   ├── gradientBg.js      # 渐变背景绘制
    │   └── textRenderer.js    # outside 描边文字 + 字体加载
    ├── workers/
    │   └── kmeans.worker.js   # k-means 聚类 Worker
    └── utils/
        ├── colorUtils.js      # RGB/HSL 转换 + 描边色智能选择
        ├── imageLoader.js     # 图片解码
        └── exporter.js        # 下载 / ZIP 打包
```

## 关键算法

### 取色（`colorExtractor.js` + `kmeans.worker.js`）

- Poster 降采样到 100×100（1 万像素）
- 跳过透明像素后运行 k-means（k=5，最大迭代 12 次）
- 按像素占比排序得到主色调色板
- **背景色**：选占比最高且饱和度 ≥ 0.1 的色，舒化到 l∈[0.26, 0.62]、s≤0.55
- **辅色（渐变终点）**：主色色相 +14°、亮度 -0.12
- **描边色**：从调色板中挑选饱和度 ≥ 0.22 且色相差背景 ≥ 60° 的色，并按背景亮度反向调节

### outside 描边（`textRenderer.js`）

Canvas `strokeText` 默认是中心描边；将 `lineWidth` 设为 `3.6 × 2 = 7.2` 先描边，再 `fillText` 覆盖内部，视觉上等效 3.6px outside 描边。

### 羽化（`feather.js`）

使用 `globalCompositeOperation = 'destination-out'` + 线性渐变填充，对 poster 的左边缘（70px）和下边缘（56px）做非线性 alpha 衰减，与背景柔和融合。

## 规范一览

| 项 | 值 |
| --- | --- |
| 画布 | 816 × 426 |
| Poster | 580 × 326（贴右上角） |
| 勋章 | 44 × 52（左 32 / 上 32） |
| 勋章 ↔ 标题间距 | 12 |
| 字号 | 44 |
| 文字色 | #FFFFFF |
| 描边宽度 | 3.6px outside |
| 字体 | 方正兰亭圆简体 |

## 兼容性

- Chrome / Edge 88+
- Safari 15+
- Firefox 90+
