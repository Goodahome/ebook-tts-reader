# 电子书语音朗读器 (Ebook TTS Reader)

一个基于Web的电子书语音朗读器，支持多种文件格式，提供流畅的语音合成和文本预览功能。

## ⚠️ 重要声明

**法律免责声明与使用警告**

- 🚫 **禁止违法用途**: 本工具严禁用于任何违法犯罪活动，包括但不限于侵犯版权、传播非法内容等
- 📖 **合法来源**: 请确保您使用的电子书来源合法，建议从正规渠道购买或获取授权的电子书
- ⚖️ **版权尊重**: 使用本工具处理的内容应遵守相关版权法律法规，尊重作者和出版商的知识产权
- 🔒 **个人使用**: 本工具仅供个人学习和合法使用，不得用于商业盗版或非法传播
- 📋 **用户责任**: 用户需对使用本工具产生的任何法律后果承担全部责任
- 🛡️ **开发者免责**: 开发者不对用户的违法使用行为承担任何法律责任

**请在使用前仔细阅读并同意以上声明，继续使用即表示您已知晓并同意遵守相关法律法规。**

## 功能特点

- 📚 **多格式支持**: 支持TXT、EPUB电子书文件
- 🎵 **语音合成**: 基于Web Speech API的高质量语音合成
- 📖 **智能分句**: 自动将文本分割为适合朗读的句子
- 🎯 **精确控制**: 点击任意句子跳转播放位置
- 📊 **进度显示**: 实时显示朗读进度，支持进度条跳转
- 💾 **MP3导出**: 将朗读内容保存为MP3音频文件
- 🎨 **现代界面**: 响应式设计，美观易用

## 技术栈

- **前端**: HTML5, CSS3, JavaScript (ES6+) - 静态文件
- **后端**: Node.js, Express - API服务
- **语音合成**: Web Speech API
- **文件处理**: JSZip (EPUB解析)
- **音频处理**: Web Audio API
- **架构**: 前后端分离设计

## 快速开始

### 环境要求

- Node.js 14.0 或更高版本 (仅后端API服务)
- Web服务器 (Nginx, Apache, Tomcat 或 Python HTTP服务器)
- 现代浏览器 (Chrome, Firefox, Safari, Edge)

### 部署方式

#### 方式一：开发环境快速启动

1. 克隆项目
```bash
git clone https://github.com/Goodahome/ebook-tts-reader.git
cd ebook-tts-reader
```

2. 启动后端API服务
```bash
npm install
node server.js
```

3. 启动前端静态文件服务
```bash
# 使用Python (推荐)
python -m http.server 8000

# 或使用Node.js
npx http-server . -p 8000
```

4. 打开浏览器访问 `http://localhost:8000`

#### 方式二：生产环境部署

**前端部署**

将以下静态文件部署到Web服务器:
- `ebook-tts-reader.html` (主页面)
- `ebook-tts-reader.css` (样式文件)
- `ebook-tts-reader.js` (前端逻辑)

**后端部署**

1. 安装依赖并启动API服务
```bash
npm install
node server.js
```

2. API服务默认运行在 `http://localhost:3000`

**Nginx配置示例**

参考项目根目录的 `nginx.conf` 配置文件

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
├── ebook-tts-reader.html    # 前端主页面
├── ebook-tts-reader.css     # 前端样式文件
├── ebook-tts-reader.js      # 前端核心逻辑
├── server.js                # 后端Node.js API服务
├── nginx.conf               # Nginx配置文件模板
├── package.json             # 后端依赖配置
├── package-lock.json        # 依赖锁定文件
├── .gitignore               # Git忽略文件
└── README.md                # 项目说明文档
```

## 开发说明

### 架构设计

本项目采用前后端分离架构：

- **前端**: 纯静态文件，负责用户界面和语音合成
- **后端**: Node.js API服务，负责文件处理和数据交互
- **通信**: 前后端通过RESTful API进行数据交换

### 核心模块

**前端模块**
- **EbookTTSReader**: 主要的朗读器类
- **文件解析**: 支持TXT和EPUB格式的文件解析
- **语音合成**: 基于Web Speech API的语音合成
- **进度管理**: 实时跟踪和显示朗读进度
- **音频导出**: 将语音合成结果保存为MP3文件

**后端模块**
- **Express服务器**: 提供API接口
- **文件上传处理**: 处理电子书文件上传
- **CORS支持**: 支持跨域请求

### 部署注意事项

1. **端口配置**: 确保前端访问端口(80)和后端API端口(3000)不冲突
2. **跨域设置**: 后端已配置CORS，支持跨域请求
3. **文件路径**: 根据实际部署环境调整nginx配置中的文件路径
4. **SSL证书**: 生产环境建议配置HTTPS

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
