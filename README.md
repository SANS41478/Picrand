# Picrand

![GitHub release](https://img.shields.io/github/v/release/SANS41478/Picrand)
![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11%20x64-0078D6)
![License](https://img.shields.io/badge/license-GPL--3.0-blue)

> 面向创作者的图片素材浏览与灵感整理工具。

![Picrand](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/5013580/5da8af031f1daac2a89c737ecf9bb5374affa0e7/header.jpg)

Picrand 是一款功能强大的**本地素材管理器**，专为画师、设计师、游戏开发者、图片收藏家等创作者打造。从海量素材浏览、AI 搜索，到图片收藏、参考、分析与整理，把工作流中常用的功能集中在一处，浏览、收集、整理、查找、分析、参考一站完成。

素材与索引均保存在本地；以图搜图会跳转至外部搜索引擎。

## 功能特性

### 瀑布池式浏览

- 类瀑布流画廊结合虚拟滚动技术，无需翻页即可流畅浏览 **10 万+ 张图片**。
- 支持 **PSD / GIF / AVIF / MP4 等 18 种图片与视频格式**，打开文件夹即可沉浸式浏览。
- 指定根目录后自动递归遍历所有子文件夹，散落各层的图片一次全部收纳。

### 创意排序

- 支持常规排序、**随机种子排序**与**色彩属性排序**。
- 支持基于**视觉 / 内容相似度**的串联排序，让图片按照你的思路重新排列。

### 独立参考窗口

- 任意图片可一键弹出为独立参考窗口，兼容动图，并支持**置顶、鼠标穿透、半透明、缩放、翻转**。
- 可将「新建参考板」注册到系统右键菜单，无需启动主程序，即可从文件管理器直接打开参考窗口。

### 素材候选集

- 自由创建图钉板，浏览时随手将图片存入其中，灵感不再错过。
- 支持快捷键快速切换、一键批量导出。

### 查找与筛选

- 内置 **CLIP 视觉模型**，支持自然语言 AI 搜索：输入“下雨的城市”“黑白照片”“蓝色调”等描述即可找到匹配内容。
- 支持**以图搜图**，将选中图片一键跳转至不同搜图引擎，在线获取原图与相关素材，或进行图片溯源。
- 支持按**宽高比、注释、星级评分、印象色**等维度筛选，快速定位目标图片。

### 图片查看器

- 双击秒开原图，放大时自动点亮**像素网格**。
- 支持幻灯片放映、打开文件所在路径，或调用系统默认播放器打开图片与视频。

### 图形审计

- 提供**平均色、HSV 分布、RGB / 明度直方图、H-S 色盘**等色彩分析工具。
- 支持对像素点或区域取色，一键复制 **HEX / RGB / HSV** 数值。
- 从图片中量化提取主色，并按颜色占比展开为可视化色环。
- 快速查看分辨率、色彩空间、位深度、文件体积等元数据，并进行 **POT 检查**。

### 定制项

- 以图搜图、AI 搜索、图钉板、原图预加载等功能可一键启停。
- 瀑布池参数逐项可调，支持深色模式与自定义背景图。

## 界面预览

更多截图与功能演示请访问 [Steam 商店页](https://store.steampowered.com/app/5013580)。

## 下载与安装

- **GitHub Releases**：[下载最新版](https://github.com/SANS41478/Picrand/releases/latest)
- **Steam**：[Picrand 商店页](https://store.steampowered.com/app/5013580)（即将推出）

Windows 10/11 64 位免安装版，解压后直接运行 `PicRand.exe` 即可。

## 技术栈

- **Electron 33 + Vue 3 + Vite + Pinia**：桌面端与渲染层
- **better-sqlite3**：本地数据库
- **@xenova/transformers + onnxruntime-node**：本地 CLIP 视觉/文本模型推理
- **sharp / canvas / ffmpeg**：图片与视频处理
- **C++ / Direct2D**：`RefBoardHost` 原生参考板窗口

## 本地开发

### 环境要求

- Windows 10/11 x64
- Node.js 20 或更高版本
- Visual Studio 2022 Build Tools，安装「使用 C++ 的桌面开发」工作负载（编译原生模块与 RefBoardHost）
- CMake（可选，仓库已附带预编译的 `RefBoardHost.exe`）

### 安装与运行

```bash
git clone https://github.com/SANS41478/Picrand.git
cd Picrand
npm ci
npm run dev
```

### 下载 AI 搜索模型

AI 搜索依赖 CLIP 模型（约 220 MB），模型文件不随仓库分发：

```bash
node scripts/setup-clip.mjs
```

模型会下载到 `_internal_data/models/`。未下载时其余功能不受影响，仅 AI 搜索不可用。

### 编译原生参考板

```bash
npm run build:refboard
```

若本机没有 CMake / MSVC，会使用仓库中预编译的 `refboard-d2d/build/Release/RefBoardHost.exe`。

### 构建与打包

```bash
npm run build   # 构建主进程、预加载与渲染层
npm run dist    # 生成 Windows x64 发布包
```

打包产物位于 `release/PicRand-<version>-win64.zip`；如需免压缩目录版，可执行 `npm run dist:dir`。

## 目录结构

```
src/main          Electron 主进程：数据库、文件监听、CLIP 搜索、原生窗口桥接
src/preload       预加载脚本
src/renderer      Vue 3 渲染层
refboard-d2d      RefBoardHost 的 C++ / Direct2D 实现
scripts           模型下载、图标、许可清单等构建脚本
resources         图标与默认配置
_internal_data    CLIP 模型缓存（不入库）
```

## 反馈与支持

- [GitHub Issues](https://github.com/SANS41478/Picrand/issues)
- [Steam 商店页](https://store.steampowered.com/app/5013580)
- 邮箱：picrand_support@126.com

## 许可证

本项目基于 **GNU General Public License v3.0** 发布，详见 [LICENSE](LICENSE)。

第三方依赖的许可信息汇总于 [licenses/THIRD_PARTY.txt](licenses/THIRD_PARTY.txt)。
