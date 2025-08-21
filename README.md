# 电子书语音朗读器 (Ebook TTS Reader)

一个基于Web的电子书语音朗读器，支持多种文件格式，提供流畅的语音合成和文本预览功能。

## 功能特点

- 📚 **多格式支持**: 支持TXT、EPUB电子书文件
- 🎵 **语音合成**: 基于Web Speech API的高质量语音合成
- 📖 **智能分句**: 自动将文本分割为适合朗读的句子
- 🎯 **精确控制**: 点击任意句子跳转播放位置
- 📊 **进度显示**: 实时显示朗读进度，支持进度条跳转
- 💾 **MP3导出**: 将朗读内容保存为MP3音频文件
- 🎨 **现代界面**: 响应式设计，美观易用

## 技术栈

- **前端**: HTML5, CSS3, JavaScript (ES6+)
- **后端**: Node.js, Express
- **语音合成**: Web Speech API
- **文件处理**: JSZip (EPUB解析)
- **音频处理**: Web Audio API

## 快速开始

### 环境要求

- Node.js 14.0 或更高版本
- 现代浏览器 (Chrome, Firefox, Safari, Edge)

### 安装运行

1. 克隆项目
```bash
git clone https://github.com/Goodahome/ebook-tts-reader.git
cd ebook-tts-reader
```

2. 安装依赖
```bash
npm install
```

3. 启动服务器
```bash
node server.js
```

4. 打开浏览器访问 `http://localhost:3000`

## 使用说明

### 基本操作

1. **上传文件**: 点击上传按钮或拖拽文件到左侧面板
2. **选择语音**: 在语音设置中选择合适的语音
3. **调整语速**: 使用语速控制调整朗读速度
4. **开始朗读**: 点击播放按钮开始朗读
5. **跳转播放**: 点击文本中的任意句子跳转到该位置
6. **保存音频**: 点击"保存为MP3"导出音频文件

### 支持的文件格式

- **TXT**: 纯文本文件
- **EPUB**: 电子书格式，自动解析章节和目录

### 键盘快捷键

- `空格键`: 播放/暂停
- `Esc`: 停止播放
- `←/→`: 上一句/下一句
- `Ctrl+O`: 打开文件

## 项目结构

```
ebook-tts-reader/
├── ebook-tts-reader.html    # 主页面
├── ebook-tts-reader.css     # 样式文件
├── ebook-tts-reader.js      # 核心逻辑
├── server.js                # Node.js服务器
├── package.json             # 项目配置
└── README.md                # 项目说明
```

## 开发说明

### 核心模块

- **EbookTTSReader**: 主要的朗读器类
- **文件解析**: 支持TXT和EPUB格式的文件解析
- **语音合成**: 基于Web Speech API的语音合成
- **进度管理**: 实时跟踪和显示朗读进度
- **音频导出**: 将语音合成结果保存为MP3文件

### 浏览器兼容性

- Chrome 33+
- Firefox 49+
- Safari 7+
- Edge 14+

## 贡献指南

欢迎提交Issue和Pull Request来改进项目。

## 许可证

MIT License

## 作者

[@Goodahome](https://github.com/Goodahome)
