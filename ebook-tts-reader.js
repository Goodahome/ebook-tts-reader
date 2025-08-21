// 电子书语音朗读器 - 主要功能实现

class EbookTTSReader {
    constructor() {
        this.currentText = '';
        this.sentences = [];
        this.currentSentenceIndex = 0;
        this.isPlaying = false;
        this.isPaused = false;
        this.audioChunks = [];
        this.mediaRecorder = null;
        this.audioContext = null;
        this.currentUtterance = null;
        this.currentAudio = null;
        this.currentAudioUrl = null;
        this.playbackTimer = null;
        this.speechSynthesis = window.speechSynthesis;
        this.onlineVoices = [];
        this.useOnlineVoice = false;
        this.serverUrl = 'http://localhost:3001';
        this.audioPreloadCache = new Map();
        this.currentSpeed = 1.0;
        this.pausedAudioTime = 0; // 记录暂停时的音频播放位置
        this.pausedUtteranceText = ''; // 记录暂停时的语音文本
        this.mp3GenerationCancelled = false; // MP3生成取消标志
        
        this.initializeEventListeners();
        this.loadVoices();
        this.loadOnlineVoices();
    }
    
    // 取消MP3生成
    cancelMP3Generation() {
        this.mp3GenerationCancelled = true;
        this.updateMP3Progress(0, '用户取消生成');
        
        // 恢复保存按钮
        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = '💾 保存MP3';
        }
        
        // 2秒后隐藏进度条
        setTimeout(() => {
            this.showMP3Progress(false);
            this.mp3GenerationCancelled = false; // 重置取消标志
        }, 2000);
        
        this.showStatus('MP3生成已取消', 'info');
    }
    
    // 显示/隐藏MP3生成进度条
    showMP3Progress(show) {
        const container = document.getElementById('mp3ProgressContainer');
        const cancelBtn = document.getElementById('mp3CancelBtn');
        if (container) {
            container.style.display = show ? 'block' : 'none';
        }
        if (cancelBtn) {
            cancelBtn.style.display = show ? 'block' : 'none';
        }
    }
    
    // 更新MP3生成进度
    updateMP3Progress(percentage, status) {
        const progressFill = document.getElementById('mp3ProgressFill');
        const progressText = document.getElementById('mp3ProgressText');
        const progressStatus = document.getElementById('mp3ProgressStatus');
        
        if (progressFill) {
            progressFill.style.width = `${percentage}%`;
            
            // 控制动画显示
            if (percentage > 0 && percentage < 100) {
                progressFill.classList.add('animating');
            } else {
                progressFill.classList.remove('animating');
            }
        }
        if (progressText) {
            progressText.textContent = `${percentage}%`;
        }
        if (progressStatus) {
            progressStatus.textContent = status;
        }
    }
    
    // 显示重试对话框
    async showRetryDialog(message, currentIndex) {
        return new Promise((resolve) => {
            const shouldContinue = confirm(
                message + '\n\n点击"确定"继续，"取消"停止生成。'
            );
            
            if (!shouldContinue) {
                // 用户选择停止，清理状态
                this.updateMP3Progress(0, '用户取消生成');
                setTimeout(() => {
                    this.showMP3Progress(false);
                }, 2000);
            }
            
            resolve(shouldContinue);
        });
    }
    
    // 检查连接状态
    async checkConnectionStatus() {
        try {
            const response = await fetch(`${this.serverUrl}/api/health`, {
                method: 'GET',
                timeout: 5000
            });
            return response.ok;
        } catch (error) {
            console.warn('连接检查失败:', error);
            return false;
        }
    }
    
    // 生成单个句子的音频（带重试机制）
    async generateSingleAudio(sentence, selectedVoice, maxRetries = 3) {
        if (!sentence || sentence.trim().length === 0) {
            return null;
        }
        
        // 处理在线语音和本地语音
        if (selectedVoice.startsWith('online:')) {
            const voiceId = selectedVoice.replace('online:', '');
            const speed = this.currentSpeed;
            const ratePercent = Math.round((speed - 1) * 100);
            const rateString = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;
            
            // 重试逻辑
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时
                    
                    const response = await fetch(`${this.serverUrl}/api/synthesize`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            text: sentence,
                            voice: voiceId,
                            options: {
                                rate: rateString,
                                volume: '+0%',
                                pitch: '+0Hz'
                            }
                        }),
                        signal: controller.signal
                    });
                    
                    clearTimeout(timeoutId);
                    
                    if (!response.ok) {
                        throw new Error(`服务器错误: ${response.status}`);
                    }
                    
                    return await response.arrayBuffer();
                    
                } catch (error) {
                    console.warn(`音频生成尝试 ${attempt}/${maxRetries} 失败:`, error.message);
                    
                    if (attempt === maxRetries) {
                        console.error('生成单个音频失败:', error);
                        throw error;
                    }
                    
                    // 指数退避延迟
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                    console.log(`等待 ${delay}ms 后重试...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        } else {
            // 本地语音暂不支持MP3导出
            throw new Error('本地语音暂不支持MP3导出，请选择在线语音');
        }
    }
    
    // 合并音频缓冲区
    async mergeAudioBuffers(audioBuffers) {
        try {
            // 计算总长度
            let totalLength = 0;
            audioBuffers.forEach(buffer => {
                totalLength += buffer.byteLength;
            });
            
            // 创建合并后的数组
            const mergedArray = new Uint8Array(totalLength);
            let offset = 0;
            
            audioBuffers.forEach(buffer => {
                mergedArray.set(new Uint8Array(buffer), offset);
                offset += buffer.byteLength;
            });
            
            // 返回Blob
            return new Blob([mergedArray], { type: 'audio/mpeg' });
        } catch (error) {
            console.error('合并音频失败:', error);
            throw error;
        }
    }

    initializeEventListeners() {
        // 文件拖拽功能 - 绑定到左侧面板
        const leftPanel = document.querySelector('.left-panel');
        
        if (leftPanel) {
            leftPanel.addEventListener('dragover', (e) => {
                e.preventDefault();
                leftPanel.classList.add('dragover');
            });
            
            leftPanel.addEventListener('dragleave', (e) => {
                e.preventDefault();
                leftPanel.classList.remove('dragover');
            });
            
            leftPanel.addEventListener('drop', (e) => {
                e.preventDefault();
                leftPanel.classList.remove('dragover');
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    this.handleFile(files[0]);
                }
            });
        }

        // 语音变化监听
        this.speechSynthesis.addEventListener('voiceschanged', () => {
            this.loadVoices();
        });
    }

    loadVoices() {
        const voices = this.speechSynthesis.getVoices();
        const voiceSelect = document.getElementById('voiceSelect');
        
        // 清空现有选项
        voiceSelect.innerHTML = '';
        
        // 创建统一的语音列表
        const allVoices = [];
        
        // 添加在线语音（优先级最高）
        if (this.onlineVoices.length > 0) {
            // 去重：使用Set来跟踪已添加的语音名称
            const addedOnlineVoices = new Set();
            
            const chineseOnlineVoices = this.onlineVoices.filter(voice => 
                voice.language.startsWith('zh')
            );
            
            chineseOnlineVoices.forEach(voice => {
                if (!addedOnlineVoices.has(voice.name)) {
                    addedOnlineVoices.add(voice.name);
                    
                    // 简化语音名称显示
                    let simplifiedName = voice.displayName;
                    if (simplifiedName.includes('Microsoft')) {
                        simplifiedName = simplifiedName.replace(/Microsoft\s+/g, '');
                    }
                    if (simplifiedName.includes('Online')) {
                        simplifiedName = simplifiedName.replace(/\s+Online/g, '');
                    }
                    
                    allVoices.push({
                        value: `online:${voice.name}`,
                        displayName: simplifiedName,
                        type: '在线',
                        isRecommended: voice.isRecommended,
                        priority: voice.isRecommended ? 1 : 2,
                        quality: 'high'
                    });
                }
            });
        }
        
        // 添加本地语音（只添加真正的本地语音）
        const chineseVoices = voices.filter(voice => 
            (voice.lang.startsWith('zh') || voice.name.includes('Chinese')) &&
            voice.localService === true // 确保是本地语音
        );
        
        chineseVoices.forEach(voice => {
            const isMicrosoft = voice.name.includes('Microsoft') || voice.name.includes('Neural');
            const isYunyang = voice.name.includes('Yunyang') || voice.name.includes('YunYang');
            
            // 简化本地语音名称
            let simplifiedName = voice.name;
            if (simplifiedName.includes('Microsoft')) {
                simplifiedName = simplifiedName.replace(/Microsoft\s+/g, '');
            }
            
            allVoices.push({
                value: voice.name,
                displayName: `${simplifiedName} (${voice.lang})`,
                type: '本地',
                isRecommended: isYunyang,
                priority: isYunyang ? 3 : (isMicrosoft ? 4 : 5),
                quality: isMicrosoft ? 'medium' : 'low'
            });
        });
        
        // 如果没有找到任何语音，添加默认选项
        if (allVoices.length === 0) {
            const defaultOptions = [
                { value: 'zh-CN-YunYangNeural', text: '云扬 (Yunyang) - 男声', priority: 1 },
                { value: 'zh-CN-XiaoxiaoNeural', text: '晓晓 (Xiaoxiao) - 女声', priority: 2 },
                { value: 'zh-CN-YunyeNeural', text: '云野 (Yunye) - 男声', priority: 3 },
                { value: 'zh-CN-XiaoyiNeural', text: '晓伊 (Xiaoyi) - 女声', priority: 4 },
                { value: 'zh-CN-YunjianNeural', text: '云健 (Yunjian) - 男声', priority: 5 },
                { value: 'zh-CN-XiaochenNeural', text: '晓辰 (Xiaochen) - 女声', priority: 6 }
            ];
            
            defaultOptions.forEach(option => {
                allVoices.push({
                    value: option.value,
                    displayName: option.text,
                    type: '默认',
                    isRecommended: option.priority === 1,
                    priority: option.priority,
                    quality: 'medium'
                });
            });
        }
        
        // 按优先级排序
        allVoices.sort((a, b) => a.priority - b.priority);
        
        // 添加到选择框
        allVoices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.value;
            
            // 构建显示名称
            let displayText = voice.displayName;
            if (voice.isRecommended) {
                displayText += ' ⭐ 推荐';
            }
            if (voice.type === '在线') {
                displayText += ' 🌐 高质量';
            } else if (voice.type === '本地') {
                displayText += ' 💻 本地';
            }
            
            option.textContent = displayText;
            voiceSelect.appendChild(option);
        });
        
        // 默认选择第一个推荐语音
        const recommendedVoice = allVoices.find(voice => voice.isRecommended);
        if (recommendedVoice) {
            voiceSelect.value = recommendedVoice.value;
        }
        
        // 添加语音选择提示
        const onlineCount = allVoices.filter(v => v.type === '在线').length;
        const localCount = allVoices.filter(v => v.type === '本地').length;
        this.showStatus(`语音列表已加载：${onlineCount} 个在线语音，${localCount} 个本地语音`, 'info');
    }

    async handleFile(file) {
        this.showStatus('正在解析文件...', 'info');
        
        try {
            const text = await this.parseFile(file);
            this.currentText = text;
            this.sentences = this.splitIntoSentences(text);
            this.currentSentenceIndex = 0;
            
            this.updateFileInfo(file.name);
            this.updateTextPreview();
            this.enableControls();
            this.showStatus(`文件解析成功！共 ${this.sentences.length} 个句子`, 'success');
            
        } catch (error) {
            this.showStatus(`文件解析失败: ${error.message}`, 'error');
        }
    }

    async parseFile(file) {
        const fileName = file.name.toLowerCase();
        
        if (fileName.endsWith('.txt')) {
            return await this.parseTxtFile(file);
        } else if (fileName.endsWith('.epub')) {
            return await this.parseEpubFile(file);
        } else {
            throw new Error('不支持的文件格式，请选择 .txt 或 .epub 文件');
        }
    }

    async parseTxtFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    let text = e.target.result;
                    // 处理编码问题
                    if (text.includes('�')) {
                        // 尝试使用 GBK 编码
                        const decoder = new TextDecoder('gbk');
                        const arrayBuffer = new Uint8Array(e.target.result);
                        text = decoder.decode(arrayBuffer);
                    }
                    resolve(text);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsText(file, 'utf-8');
        });
    }

    async parseEpubFile(file) {
        // 简化的EPUB解析 - 实际项目中建议使用专门的EPUB库
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target.result;
                    const zip = new JSZip();
                    const zipFile = await zip.loadAsync(arrayBuffer);
                    
                    let text = '';
                    const htmlFiles = [];
                    
                    // 查找HTML/XHTML文件
                    zipFile.forEach((relativePath, file) => {
                        if (relativePath.match(/\.(html|xhtml)$/i) && !file.dir) {
                            htmlFiles.push(relativePath);
                        }
                    });
                    
                    // 按顺序读取HTML文件
                    htmlFiles.sort();
                    for (const htmlFile of htmlFiles) {
                        const content = await zipFile.file(htmlFile).async('text');
                        const textContent = this.extractTextFromHtml(content);
                        text += textContent + '\n';
                    }
                    
                    if (text.trim() === '') {
                        throw new Error('EPUB文件中未找到可读取的文本内容');
                    }
                    
                    resolve(text);
                } catch (error) {
                    reject(new Error('EPUB文件解析失败: ' + error.message));
                }
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsArrayBuffer(file);
        });
    }

    extractTextFromHtml(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // 移除script和style标签
        const scripts = doc.querySelectorAll('script, style');
        scripts.forEach(script => script.remove());
        
        let result = '';
        const body = doc.body || doc.documentElement;
        
        // 递归处理节点，保留结构
        const processNode = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent.trim();
                if (text) {
                    return text;
                }
                return '';
            }
            
            if (node.nodeType === Node.ELEMENT_NODE) {
                const tagName = node.tagName.toLowerCase();
                
                // 处理图片
                if (tagName === 'img') {
                    const alt = node.getAttribute('alt') || '';
                    const src = node.getAttribute('src') || '';
                    return alt ? `[图片: ${alt}]` : '[图片]';
                }
                
                // 处理标题（可能是目录项）
                if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
                    const text = node.textContent.trim();
                    if (text) {
                        // 确保标题前后有足够的分隔，避免与前面的文本连接
                        // 检查是否可能是目录项（短文本，没有句号结尾）
                        const isTocItem = text.length < 50 && !text.match(/[。！？.!?]$/);
                        return isTocItem ? `\n\n\n【${text}】\n\n\n` : `\n\n\n${text}\n\n\n`;
                    }
                    return '';
                }
                
                // 处理段落
                if (['p', 'div'].includes(tagName)) {
                    let content = '';
                    for (const child of node.childNodes) {
                        content += processNode(child);
                    }
                    content = content.trim();
                    if (content) {
                        return `\n\n${content}\n\n`;
                    }
                    return '';
                }
                
                // 处理换行
                if (tagName === 'br') {
                    return '\n';
                }
                
                // 处理列表
                if (['ul', 'ol'].includes(tagName)) {
                    let listContent = '';
                    for (const child of node.childNodes) {
                        if (child.tagName && child.tagName.toLowerCase() === 'li') {
                            const itemText = processNode(child).trim();
                            if (itemText) {
                                listContent += `\n• ${itemText}`;
                            }
                        }
                    }
                    return listContent ? `\n${listContent}\n\n` : '';
                }
                
                // 处理其他元素
                let content = '';
                for (const child of node.childNodes) {
                    content += processNode(child);
                }
                return content;
            }
            
            return '';
        };
        
        result = processNode(body);
        
        // 清理和格式化文本
        result = result
            .replace(/\n{3,}/g, '\n\n')  // 限制连续换行
            .replace(/[ \t]+/g, ' ')     // 合并空格
            .replace(/\n /g, '\n')       // 移除行首空格
            .replace(/ \n/g, '\n')       // 移除行尾空格
            .trim();
        
        return result;
    }

    splitIntoSentences(text) {
        // 针对Microsoft Yunyang优化的文本分段处理
        // Yunyang语音对长文本敏感，需要更精细的分段
        const maxLength = 150; // 降低每个片段的最大字符数
        const result = [];
        
        // 首先按段落分割，保留段落结构
        const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
        
        paragraphs.forEach((paragraph, paragraphIndex) => {
            // 清理段落内的多余空白，但保留基本结构
            const cleanParagraph = paragraph.replace(/\s+/g, ' ').trim();
            
            // 检查是否是目录项（包含【】标记或短文本无句号结尾）
            const isTocItem = cleanParagraph.includes('【') && cleanParagraph.includes('】');
            const isShortNoPunctuation = cleanParagraph.length < 50 && !cleanParagraph.match(/[。！？.!?]$/);
            
            if (isTocItem || isShortNoPunctuation) {
                // 目录项或短文本直接作为一个单元，保持默认换行
                result.push(cleanParagraph);
            } else {
                // 按句子分割
                const sentences = cleanParagraph
                    .split(/([。！？；.!?;])\s*/)
                    .filter(sentence => sentence.trim().length > 0)
                    .reduce((acc, current, index, array) => {
                        // 重新组合句子和标点符号
                        if (index % 2 === 0) {
                            const punctuation = array[index + 1] || '';
                            const fullSentence = (current + punctuation).trim();
                            if (fullSentence.length > 0) {
                                acc.push(fullSentence);
                            }
                        }
                        return acc;
                    }, []);
                
                // 处理段落内的句子
                if (sentences.length === 0) {
                    // 如果没有明显的句子分隔符，将整个段落作为一个单元处理
                    if (cleanParagraph.length <= maxLength) {
                        result.push(cleanParagraph);
                    } else {
                        this.splitLongSentence(cleanParagraph, maxLength, result);
                    }
                } else {
                    // 有明确句子的情况下，尽量保持段落完整性
                    let currentChunk = '';
                    
                    sentences.forEach((sentence, sentenceIndex) => {
                        const testChunk = currentChunk + (currentChunk ? ' ' : '') + sentence;
                        
                        if (testChunk.length <= maxLength) {
                            currentChunk = testChunk;
                        } else {
                            // 当前块已满，保存并开始新块
                            if (currentChunk) {
                                result.push(currentChunk);
                            }
                            
                            if (sentence.length <= maxLength) {
                                currentChunk = sentence;
                            } else {
                                // 句子太长，需要分割
                                this.splitLongSentence(sentence, maxLength, result);
                                currentChunk = '';
                            }
                        }
                    });
                    
                    // 保存最后一个块
                    if (currentChunk) {
                        result.push(currentChunk);
                    }
                }
            }
            
            // 在段落末尾添加标记，用于后续格式化（除了目录项）
            if (paragraphIndex < paragraphs.length - 1 && result.length > 0 && !isTocItem && !isShortNoPunctuation) {
                const lastSentence = result[result.length - 1];
                if (!lastSentence.endsWith('\n\n')) {
                    result[result.length - 1] = lastSentence + '\n\n';
                }
            }
        });
        
        return result.filter(s => s.trim().length > 0);
    }
    
    splitLongSentence(sentence, maxLength, result) {
        // 分层分割长句子的策略
        
        // 第一层：按逗号、分号分割
        const parts = sentence.split(/[，,；;]\s*/);
        let currentPart = '';
        
        parts.forEach((part, index) => {
            const separator = index < parts.length - 1 ? '，' : '';
            const testPart = currentPart + (currentPart ? '，' : '') + part;
            
            if (testPart.length <= maxLength) {
                currentPart = testPart;
            } else {
                if (currentPart) {
                    result.push(currentPart);
                }
                
                // 如果单个部分仍然太长，进行第二层分割
                if (part.length > maxLength) {
                    this.splitByLength(part, maxLength, result);
                } else {
                    currentPart = part;
                }
            }
        });
        
        if (currentPart) {
            result.push(currentPart);
        }
    }
    
    splitByLength(text, maxLength, result) {
        // 按固定长度分割，尽量在合适的位置断开
        const breakChars = ['、', ' ', '的', '了', '在', '与', '和', '或'];
        
        while (text.length > maxLength) {
            let breakPoint = maxLength;
            
            // 寻找合适的断点
            for (let i = maxLength - 20; i < maxLength; i++) {
                if (breakChars.includes(text[i])) {
                    breakPoint = i + 1;
                    break;
                }
            }
            
            result.push(text.substring(0, breakPoint).trim());
            text = text.substring(breakPoint).trim();
        }
        
        if (text.length > 0) {
            result.push(text);
        }
    }

    updateTextPreview() {
        const textPreview = document.getElementById('textPreview');
        const floatingProgress = document.getElementById('floatingProgress');
        if (!textPreview) return;
        
        if (this.sentences.length === 0) {
            textPreview.innerHTML = '<div class="placeholder-text"><h3>📖 文本预览</h3><p>请选择并上传文件开始朗读...</p></div>';
            // 隐藏悬浮进度条
            if (floatingProgress) {
                floatingProgress.style.display = 'none';
            }
            return;
        }
        
        // 生成带有句子标记的HTML，保留原始格式和段落结构
        const htmlContent = this.sentences.map((sentence, index) => {
            const isCurrentSentence = index === this.currentSentenceIndex;
            let className = isCurrentSentence ? 'sentence current' : 'sentence';
            
            // 检查是否是目录项
            const isTocItem = sentence.includes('【') && sentence.includes('】');
            if (isTocItem) {
                className += ' toc-item';
            }
            
            // 检查句子是否包含段落标记
            const hasParagraphBreak = sentence.includes('\n\n');
            let formattedSentence, spacing;
            
            if (hasParagraphBreak) {
                // 移除段落标记并格式化句子
                const cleanSentence = sentence.replace(/\n\n$/, '');
                formattedSentence = this.escapeHtml(cleanSentence).replace(/\n/g, '<br>');
                
                // 如果是目录项，不添加段落样式
                if (isTocItem) {
                    spacing = '<br><br>';
                } else {
                    // 普通段落添加段落样式
                    formattedSentence = `<div class="paragraph">${formattedSentence}</div>`;
                    spacing = '';
                }
            } else {
                // 普通句子处理
                formattedSentence = this.escapeHtml(sentence).replace(/\n/g, '<br>');
                
                // 检查句子是否以句号等结尾（完整句子）
                const isCompleteSentence = sentence.trim().match(/[。！？.!?]\s*$/);
                
                if (isTocItem) {
                    spacing = '<br><br>';
                } else if (isCompleteSentence) {
                    // 完整句子，添加段落样式和间距
                    formattedSentence = `<div class="paragraph">${formattedSentence}</div>`;
                    spacing = '';
                } else {
                    // 不完整句子（可能是目录或其他），保持默认换行
                    spacing = '<br>';
                }
            }
            
            return `<span class="${className}" data-sentence-index="${index}">${formattedSentence}</span>${spacing}`;
        }).join('');
        
        textPreview.innerHTML = `<div class="text-content">${htmlContent}</div>`;
        
        // 添加点击事件监听器
        const sentenceElements = textPreview.querySelectorAll('.sentence');
        sentenceElements.forEach(element => {
            element.addEventListener('click', (e) => {
                // 使用currentTarget确保获取到正确的句子元素
                const index = parseInt(e.currentTarget.getAttribute('data-sentence-index'));
                if (!isNaN(index)) {
                    this.jumpToSentence(index);
                }
            });
        });
        
        // 滚动到当前句子
        this.scrollToCurrentSentence();
        
        // 更新进度条显示
        this.updateProgress();
    }

    displayText(text) {
        const textDisplay = document.getElementById('textDisplay');
        textDisplay.innerHTML = '';
        
        // 分割文本为句子
        this.sentences = this.splitIntoSentences(text);
        
        // 显示所有句子，每个句子都可点击
        this.sentences.forEach((sentence, index) => {
            const sentenceSpan = document.createElement('span');
            sentenceSpan.className = 'sentence clickable-sentence';
            sentenceSpan.textContent = sentence;
            sentenceSpan.id = `sentence-${index}`;
            sentenceSpan.dataset.index = index;
            
            // 添加点击事件
            sentenceSpan.addEventListener('click', () => {
                this.jumpToSentence(index);
            });
            
            textDisplay.appendChild(sentenceSpan);
            
            // 在句子之间添加换行
            if (index < this.sentences.length - 1) {
                textDisplay.appendChild(document.createElement('br'));
                textDisplay.appendChild(document.createElement('br'));
            }
        });
        
        this.currentSentenceIndex = 0;
        this.highlightCurrentSentence();
    }

    jumpToSentence(index) {
        if (index >= 0 && index < this.sentences.length) {
            this.currentSentenceIndex = index;
            this.updateTextPreview();
            this.updateProgress();
            this.highlightCurrentSentence();
            
            // 如果正在播放，完全停止当前播放并从新位置开始
            if (this.isPlaying) {
                this.stopCurrentPlayback();
                setTimeout(() => {
                    this.playCurrentSentence();
                }, 200);
            }
            
            this.showStatus(`跳转到第 ${index + 1} 句`, 'info');
        }
    }
    
    stopCurrentPlayback() {
        // 停止本地语音合成
        if (this.currentUtterance) {
            this.speechSynthesis.cancel();
            this.currentUtterance = null;
        }
        
        // 停止在线音频播放
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            if (this.currentAudioUrl) {
                URL.revokeObjectURL(this.currentAudioUrl);
                this.currentAudioUrl = null;
            }
            this.currentAudio = null;
        }
        
        // 清除所有定时器
        if (this.playbackTimer) {
            clearTimeout(this.playbackTimer);
            this.playbackTimer = null;
        }
    }

    enableControls() {
        document.getElementById('playBtn').disabled = false;
        document.getElementById('saveBtn').disabled = false;
    }

    async togglePlayback() {
        if (this.isPlaying) {
            this.pausePlayback();
        } else {
            await this.startPlayback();
        }
    }

    async startPlayback() {
        if (this.sentences.length === 0) {
            this.showStatus('请先选择文件', 'error');
            return;
        }

        this.isPlaying = true;
        
        document.getElementById('playBtn').textContent = '⏸️ 暂停';
        document.getElementById('stopBtn').disabled = false;
        
        // 如果是从暂停状态恢复
        if (this.isPaused) {
            this.isPaused = false;
            await this.resumeFromPause();
        } else {
            // 全新开始播放
            this.isPaused = false;
            this.pausedAudioTime = 0;
            this.pausedUtteranceText = '';
            
            // 初始化音频录制
            await this.initializeAudioRecording();
            
            this.playCurrentSentence();
        }
    }

    pausePlayback() {
        this.isPaused = true;
        this.isPlaying = false;
        
        // 记录当前播放状态
        if (this.currentAudio) {
            this.pausedAudioTime = this.currentAudio.currentTime;
            this.pausedUtteranceText = this.sentences[this.currentSentenceIndex];
            this.currentAudio.pause();
        } else if (this.currentUtterance) {
            // 对于本地语音，记录当前句子
            this.pausedUtteranceText = this.sentences[this.currentSentenceIndex];
            this.speechSynthesis.pause();
        }
        
        // 清除定时器但不重置播放位置
        if (this.playbackTimer) {
            clearTimeout(this.playbackTimer);
            this.playbackTimer = null;
        }
        
        document.getElementById('playBtn').textContent = '▶️ 继续';
        this.showStatus('播放已暂停', 'info');
    }

    async resumeFromPause() {
        const selectedVoice = document.getElementById('voiceSelect').value;
        
        // 检查是否使用在线语音
        if (selectedVoice.startsWith('online:')) {
            // 对于在线语音，如果有暂停的音频且暂停时间大于0，则从暂停位置继续
            if (this.currentAudio && this.pausedAudioTime > 0) {
                this.currentAudio.currentTime = this.pausedAudioTime;
                this.currentAudio.play();
                this.showStatus('从暂停位置继续播放...', 'info');
                
                // 设置播放结束监听器
                this.currentAudio.onended = () => {
                    this.currentSentenceIndex++;
                    this.updateProgress();
                    this.updateTextPreview();
                    this.highlightCurrentSentence();
                    this.playCurrentSentence();
                };
            } else {
                // 重新生成当前句子的音频
                await this.playOnlineVoice(this.sentences[this.currentSentenceIndex], selectedVoice);
            }
        } else {
            // 对于本地语音，检查是否可以恢复
            if (this.speechSynthesis.paused) {
                this.speechSynthesis.resume();
                this.showStatus('从暂停位置继续播放...', 'info');
            } else {
                // 重新播放当前句子
                this.playLocalVoice(this.sentences[this.currentSentenceIndex], selectedVoice);
            }
        }
        
        // 清除暂停状态
        this.pausedAudioTime = 0;
        this.pausedUtteranceText = '';
    }

    stopPlayback() {
        this.isPlaying = false;
        this.isPaused = false;
        this.currentSentenceIndex = 0;
        
        // 清除暂停状态
        this.pausedAudioTime = 0;
        this.pausedUtteranceText = '';
        
        this.stopCurrentPlayback();
        
        // 停止录制
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
        }
        
        document.getElementById('playBtn').textContent = '▶️ 开始朗读';
        document.getElementById('stopBtn').disabled = true;
        
        this.updateProgress();
        this.updateTextPreview();
        this.highlightCurrentSentence();
    }

    async playCurrentSentence() {
        if (!this.isPlaying || this.currentSentenceIndex >= this.sentences.length) {
            this.stopPlayback();
            this.showStatus('朗读完成！', 'success');
            return;
        }

        const sentence = this.sentences[this.currentSentenceIndex];
        
        // 检查句子长度，如果仍然过长则跳过
        if (sentence.length > 200) {
            console.warn('句子过长，跳过:', sentence.substring(0, 50) + '...');
            this.currentSentenceIndex++;
            this.updateProgress();
            this.updateTextPreview();
            setTimeout(() => this.playCurrentSentence(), 100);
            return;
        }
        
        const selectedVoice = document.getElementById('voiceSelect').value;
        
        // 检查是否使用在线语音
        if (selectedVoice.startsWith('online:')) {
            await this.playOnlineVoice(sentence, selectedVoice);
        } else {
            this.playLocalVoice(sentence, selectedVoice);
        }
    }
    
    async playOnlineVoice(sentence, selectedVoice) {
         try {
             const voiceId = selectedVoice.replace('online:', '');
             const speed = this.currentSpeed;
             
             // 计算速度参数（转换为百分比）
             const ratePercent = Math.round((speed - 1) * 100);
             const rateString = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;
             
             // 创建缓存键
             const cacheKey = `${voiceId}_${sentence}_${rateString}`;
             
             let audioBlob;
             
             // 检查缓存
             if (this.audioPreloadCache.has(cacheKey)) {
                 audioBlob = this.audioPreloadCache.get(cacheKey);
             } else {
                 const response = await fetch(`${this.serverUrl}/api/synthesize`, {
                     method: 'POST',
                     headers: {
                         'Content-Type': 'application/json',
                     },
                     body: JSON.stringify({
                          text: sentence,
                          voice: voiceId,
                          options: {
                              rate: rateString,
                              volume: '+0%',
                              pitch: '+0Hz'
                          }
                      })
                 });
                
                if (!response.ok) {
                    throw new Error(`服务器错误: ${response.status}`);
                }
                
                audioBlob = await response.blob();
                
                // 缓存音频（限制缓存大小）
                if (this.audioPreloadCache.size > 10) {
                    const firstKey = this.audioPreloadCache.keys().next().value;
                    this.audioPreloadCache.delete(firstKey);
                }
                this.audioPreloadCache.set(cacheKey, audioBlob);
             }
            
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            
            // 设置当前音频引用
            this.currentAudio = audio;
            this.currentAudioUrl = audioUrl;
            
            audio.onended = () => {
                if (this.currentAudioUrl === audioUrl) {
                    URL.revokeObjectURL(audioUrl);
                    this.currentAudio = null;
                    this.currentAudioUrl = null;
                }
                
                if (this.isPlaying) {
                    this.currentSentenceIndex++;
                    this.updateProgress();
                    this.updateTextPreview();
                    this.highlightCurrentSentence();
                    
                    // 预加载下一句
                    this.preloadNextSentence();
                    
                    // 减少延迟时间
                    this.playbackTimer = setTimeout(() => {
                        this.playCurrentSentence();
                    }, 100);
                }
            };
            
            audio.onerror = (error) => {
                console.error('音频播放错误:', error);
                if (this.currentAudioUrl === audioUrl) {
                    URL.revokeObjectURL(audioUrl);
                    this.currentAudio = null;
                    this.currentAudioUrl = null;
                }
                this.showStatus('音频播放失败，尝试下一句', 'error');
                if (this.isPlaying) {
                    this.currentSentenceIndex++;
                    this.updateProgress();
                    this.updateTextPreview();
                    this.highlightCurrentSentence();
                    this.playbackTimer = setTimeout(() => {
                        this.playCurrentSentence();
                    }, 500);
                }
            };
            
            await audio.play();
            
        } catch (error) {
            console.error('在线语音合成失败:', error);
            this.showStatus(`在线语音失败: ${error.message}，切换到本地语音`, 'error');
            
            // 回退到本地语音
            this.playLocalVoice(sentence, 'zh-CN-YunYangNeural');
        }
    }
    
    async preloadNextSentence() {
        const nextIndex = this.currentSentenceIndex + 1;
        if (nextIndex >= this.sentences.length) return;
        
        const selectedVoice = document.getElementById('voiceSelect').value;
        if (!selectedVoice.startsWith('online:')) return;
        
        const voiceId = selectedVoice.replace('online:', '');
        const speed = this.currentSpeed;
        const ratePercent = Math.round((speed - 1) * 100);
        const rateString = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;
        const nextSentence = this.sentences[nextIndex];
        const cacheKey = `${voiceId}_${nextSentence}_${rateString}`;
        
        // 如果已经缓存则跳过
        if (this.audioPreloadCache.has(cacheKey)) return;
        
        try {
            const response = await fetch(`${this.serverUrl}/api/synthesize`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                     text: nextSentence,
                     voice: voiceId,
                     options: {
                         rate: rateString,
                         volume: '+0%',
                         pitch: '+0Hz'
                     }
                 })
            });
           
           if (response.ok) {
               const audioBlob = await response.blob();
               
               // 缓存音频（限制缓存大小）
               if (this.audioPreloadCache.size > 10) {
                   const firstKey = this.audioPreloadCache.keys().next().value;
                   this.audioPreloadCache.delete(firstKey);
               }
               this.audioPreloadCache.set(cacheKey, audioBlob);
           }
        } catch (error) {
            // 预加载失败不影响当前播放
            console.warn('预加载下一句失败:', error);
        }
    }
    
    playLocalVoice(sentence, selectedVoice) {
        const utterance = new SpeechSynthesisUtterance(sentence);
        
        // 针对Yunyang语音优化的参数设置
        const voices = this.speechSynthesis.getVoices();
        const voice = voices.find(v => v.name === selectedVoice);
        if (voice) {
            utterance.voice = voice;
        }
        
        const speed = parseFloat(document.getElementById('speedRange').value);
        // 对于Yunyang语音，稍微降低速度以提高稳定性
        if (selectedVoice.includes('Yunyang') || selectedVoice.includes('YunYang')) {
            utterance.rate = Math.min(speed * 0.9, 1.5); // 最大1.5倍速
        } else {
            utterance.rate = speed;
        }
        
        utterance.pitch = 1;
        utterance.volume = 1;
        
        // 增加超时保护
        let timeoutId = setTimeout(() => {
            console.warn('语音合成超时，跳到下一句');
            if (this.isPlaying) {
                this.currentSentenceIndex++;
                this.updateProgress();
                this.updateTextPreview();
                this.playCurrentSentence();
            }
        }, 15000); // 15秒超时
        
        utterance.onend = () => {
            clearTimeout(timeoutId);
            if (this.isPlaying) {
                this.currentSentenceIndex++;
                this.updateProgress();
                this.updateTextPreview();
                this.highlightCurrentSentence();
                
                // 针对Yunyang语音增加延迟，避免连续播放导致的问题
                const delay = selectedVoice.includes('Yunyang') || selectedVoice.includes('YunYang') ? 300 : 200;
                this.playbackTimer = setTimeout(() => {
                    this.playCurrentSentence();
                }, delay);
            }
        };
        
        utterance.onerror = (event) => {
            clearTimeout(timeoutId);
            console.error('语音合成错误:', event);
            
            // 错误恢复机制
            if (this.isPlaying && event.error !== 'interrupted') {
                this.showStatus(`语音合成出错: ${event.error}，尝试继续下一句`, 'error');
                this.currentSentenceIndex++;
                this.updateProgress();
                this.updateTextPreview();
                this.highlightCurrentSentence();
                
                this.playbackTimer = setTimeout(() => {
                    this.playCurrentSentence();
                }, 1000);
            }
        };
        
        this.currentUtterance = utterance;
        
        // 在开始新的语音合成前，确保之前的已停止
        this.speechSynthesis.cancel();
        
        // 短暂延迟后开始播放，给系统时间处理
        setTimeout(() => {
            if (this.isPlaying) {
                this.speechSynthesis.speak(utterance);
            }
        }, 100);
    }

    async initializeAudioRecording() {
        try {
            // 创建音频上下文
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // 获取系统音频流（这在浏览器中有限制）
            // 注意：由于浏览器安全限制，无法直接录制系统音频
            // 这里提供一个替代方案的框架
            
            this.audioChunks = [];
            
        } catch (error) {
            console.warn('音频录制初始化失败:', error);
            this.showStatus('音频录制功能受限，但可以正常播放', 'info');
        }
    }

    async saveAsMP3(resumeFromIndex = 0) {
        try {
            if (!this.sentences || this.sentences.length === 0) {
                this.showStatus('没有可保存的内容', 'error');
                return;
            }
            
            const selectedVoice = document.getElementById('voiceSelect').value;
            if (!selectedVoice) {
                this.showStatus('请先选择语音', 'error');
                return;
            }
            
            // 重置取消标志
            this.mp3GenerationCancelled = false;
            
            // 显示进度条
            this.showMP3Progress(true);
            this.updateMP3Progress(0, '开始生成音频文件...');
            
            // 禁用保存按钮，添加取消按钮
            const saveBtn = document.getElementById('saveBtn');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.textContent = '正在生成...';
            }
            
            // 初始化或恢复音频缓冲区
            if (!this.mp3AudioBuffers || resumeFromIndex === 0) {
                this.mp3AudioBuffers = [];
                this.mp3FailedSentences = [];
            }
            
            const totalSentences = this.sentences.length;
            let consecutiveFailures = 0;
            const maxConsecutiveFailures = 10;
            
            // 从指定位置开始逐句生成音频
            let i = resumeFromIndex;
            while (i < this.sentences.length) {
                // 检查是否被取消
                if (this.mp3GenerationCancelled) {
                    throw new Error('用户取消生成');
                }
                
                const sentence = this.sentences[i];
                const progress = Math.round(((i + 1) / totalSentences) * 100);
                
                this.updateMP3Progress(progress, `正在处理第 ${i + 1}/${totalSentences} 句...`);
                
                let sentenceSuccess = false;
                
                try {
                    const audioBuffer = await this.generateSingleAudio(sentence, selectedVoice);
                    if (audioBuffer) {
                        // 确保数组索引正确
                        this.mp3AudioBuffers[i] = audioBuffer;
                        consecutiveFailures = 0;
                        sentenceSuccess = true;
                        console.log(`句子 ${i + 1} 生成成功`);
                    } else {
                        console.warn(`句子 ${i + 1} 生成失败: 未返回音频数据`);
                        consecutiveFailures++;
                    }
                } catch (error) {
                    console.warn(`句子 ${i + 1} 生成失败:`, error);
                    consecutiveFailures++;
                }
                
                // 只有成功生成音频才继续下一句，否则重新尝试当前句子
                if (sentenceSuccess) {
                    i++; // 成功后才移动到下一句
                } else {
                    // 失败时记录失败句子（避免重复记录）
                    if (!this.mp3FailedSentences.includes(i + 1)) {
                        this.mp3FailedSentences.push(i + 1);
                    }
                    
                    // 如果连续失败太多次，检查连接状态并询问用户
                    if (consecutiveFailures >= maxConsecutiveFailures) {
                        // 检查服务器连接状态
                        const isConnected = await this.checkConnectionStatus();
                        const connectionStatus = isConnected ? '服务器连接正常' : '服务器连接异常';
                        
                        const shouldContinue = await this.showRetryDialog(
                            `连续 ${consecutiveFailures} 句生成失败，${connectionStatus}。\n\n` +
                            `当前卡在第 ${i + 1} 句\n` +
                            `已成功生成: ${this.mp3AudioBuffers.filter(b => b).length} 句\n` +
                            `失败句子: ${this.mp3FailedSentences.join(', ')}\n\n` +
                            `${!isConnected ? '建议检查网络连接后重试。\n\n' : ''}` +
                            `是否继续尝试？`,
                            i + 1
                        );
                        
                        if (!shouldContinue) {
                            return;
                        }
                        consecutiveFailures = 0;
                        
                        // 如果连接异常，等待更长时间再继续
                        if (!isConnected) {
                            this.updateMP3Progress(progress, '等待网络恢复...');
                            await new Promise(resolve => setTimeout(resolve, 3000));
                        }
                    } else {
                        // 失败但未达到最大连续失败次数，等待一段时间后重试当前句子
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
                
                // 添加小延迟避免请求过于频繁
                if (sentenceSuccess) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }
            
            // 过滤出成功生成的音频
            const validAudioBuffers = this.mp3AudioBuffers.filter(buffer => buffer);
            
            if (validAudioBuffers.length === 0) {
                throw new Error('没有成功生成任何音频片段');
            }
            
            this.updateMP3Progress(100, '正在合并音频文件...');
            
            // 合并音频文件
            const mergedAudio = await this.mergeAudioBuffers(validAudioBuffers);
            
            // 创建下载链接
            const url = URL.createObjectURL(mergedAudio);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ebook-tts-${Date.now()}.mp3`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            const successCount = validAudioBuffers.length;
            const failureCount = this.mp3FailedSentences.length;
            
            this.updateMP3Progress(100, 
                `MP3文件生成完成！成功: ${successCount}/${totalSentences} 句` +
                (failureCount > 0 ? `，失败: ${failureCount} 句` : '')
            );
            
            if (failureCount > 0) {
                this.showStatus(
                    `MP3文件生成完成，但有 ${failureCount} 句失败。失败句子: ${this.mp3FailedSentences.join(', ')}`, 
                    'warning'
                );
            } else {
                this.showStatus('MP3文件生成成功！', 'success');
            }
            
            // 清理缓存
            this.mp3AudioBuffers = null;
            this.mp3FailedSentences = null;
            
            // 3秒后隐藏进度条
            setTimeout(() => {
                this.showMP3Progress(false);
            }, 3000);
            
        } catch (error) {
            console.error('生成MP3失败:', error);
            this.showStatus(`生成MP3失败: ${error.message}`, 'error');
            this.updateMP3Progress(0, `生成失败: ${error.message}`);
            
            // 5秒后隐藏进度条
            setTimeout(() => {
                this.showMP3Progress(false);
            }, 5000);
        } finally {
            // 恢复保存按钮
            const saveBtn = document.getElementById('saveBtn');
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = '💾 保存MP3';
            }
        }
    }
    
    async saveMultipleFormats(options) {
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const baseFileName = `ebook-tts-${timestamp}`;
        
        // 1. 保存纯文本文件
        if (options.textFile) {
            const textContent = this.sentences.join('\n\n');
            this.downloadFile(textContent, `${baseFileName}.txt`, 'text/plain;charset=utf-8');
        }
        
        // 2. 保存SSML格式文件（用于专业TTS软件）
        if (options.ssmlFile) {
            const ssmlContent = this.generateSSML();
            this.downloadFile(ssmlContent, `${baseFileName}.ssml`, 'application/xml;charset=utf-8');
        }
        
        // 3. 保存音频录制说明
        if (options.audioInstructions) {
            const instructions = this.generateAudioInstructions();
            this.downloadFile(instructions, `${baseFileName}-录音说明.txt`, 'text/plain;charset=utf-8');
        }
        
        this.showStatus('文件已保存！包含文本、SSML格式和录音说明。建议使用OBS Studio等软件录制系统音频。', 'success');
    }
    
    generateSSML() {
        const selectedVoice = document.getElementById('voiceSelect').value;
        const speed = this.currentSpeed;
        
        let ssml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        ssml += `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">\n`;
        ssml += `  <voice name="${selectedVoice}">\n`;
        ssml += `    <prosody rate="${speed}">\n`;
        
        this.sentences.forEach((sentence, index) => {
            ssml += `      <s>${this.escapeXml(sentence)}</s>\n`;
            if (index < this.sentences.length - 1) {
                ssml += `      <break time="500ms"/>\n`;
            }
        });
        
        ssml += `    </prosody>\n`;
        ssml += `  </voice>\n`;
        ssml += `</speak>`;
        
        return ssml;
    }
    
    generateAudioInstructions() {
        const selectedVoice = document.getElementById('voiceSelect').value;
        const speed = document.getElementById('speedRange').value;
        
        return `电子书语音朗读器 - 音频录制说明\n` +
               `生成时间: ${new Date().toLocaleString()}\n\n` +
               `选择的语音: ${selectedVoice}\n` +
               `朗读速度: ${speed}x\n` +
               `文本片段数: ${this.sentences.length}\n\n` +
               `录制步骤:\n` +
               `1. 使用OBS Studio、Audacity或其他录音软件\n` +
               `2. 设置录制系统音频（立体声混音）\n` +
               `3. 在浏览器中打开电子书朗读器\n` +
               `4. 开始录制，然后点击"开始朗读"\n` +
               `5. 等待朗读完成后停止录制\n` +
               `6. 导出为MP3格式\n\n` +
               `注意事项:\n` +
               `- 确保系统音量适中，避免爆音\n` +
               `- 录制期间避免其他应用产生声音\n` +
               `- 建议使用有线耳机监听录制质量\n` +
               `- 可以分段录制，后期合并\n\n` +
               `推荐软件:\n` +
               `- OBS Studio (免费，功能强大)\n` +
               `- Audacity (免费，专业音频编辑)\n` +
               `- Adobe Audition (付费，专业级)\n` +
               `- GoldWave (付费，简单易用)\n\n` +
               `文本内容预览:\n` +
               `${this.sentences.slice(0, 3).join('\n\n')}\n` +
               `${this.sentences.length > 3 ? '...（更多内容请查看完整文本文件）' : ''}`;
    }
    
    escapeXml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
    
    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    updateProgress() {
        const progress = (this.currentSentenceIndex / this.sentences.length) * 100;
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const floatingProgress = document.getElementById('floatingProgress');
        
        if (progressFill) {
            progressFill.style.width = progress + '%';
        }
        if (progressText) {
            progressText.textContent = 
                `进度: ${this.currentSentenceIndex}/${this.sentences.length} (${Math.round(progress)}%)`;
        }
        
        // 显示或隐藏悬浮进度条
        if (floatingProgress) {
            if (this.sentences.length > 0) {
                floatingProgress.style.display = 'block';
            } else {
                floatingProgress.style.display = 'none';
            }
        }
    }

    showStatus(message, type) {
        const status = document.getElementById('status');
        status.textContent = message;
        status.className = `status ${type}`;
        status.style.display = 'block';
        
        // 根据消息类型设置不同的显示时间
        let displayTime = 3000;
        if (type === 'success') displayTime = 5000;
        if (type === 'error') displayTime = 7000;
        if (type === 'info' && message.length > 50) displayTime = 8000;
        
        // 清除之前的定时器
        if (this.statusTimer) {
            clearTimeout(this.statusTimer);
        }
        
        this.statusTimer = setTimeout(() => {
            status.style.display = 'none';
        }, displayTime);
    }
    
    // 加载在线语音列表
     async loadOnlineVoices() {
         try {
             const response = await fetch(`${this.serverUrl}/api/voices`);
             if (response.ok) {
                 const data = await response.json();
                 if (data.success && data.voices) {
                     this.onlineVoices = data.voices;
                     this.showStatus('在线语音服务连接成功', 'success');
                 }
             } else {
                 console.warn('无法连接到在线语音服务');
                 this.showStatus('在线语音服务不可用，将使用本地语音', 'info');
             }
         } catch (error) {
             console.warn('在线语音服务连接失败:', error);
             this.showStatus('在线语音服务连接失败，将使用本地语音', 'info');
         }
         
         // 重新加载语音列表
         this.loadVoices();
     }
    
    calculateSpeedPercentage() {
        // 将速度值转换为百分比字符串
        const speedValue = parseFloat(this.currentSpeed);
        const percentage = Math.round((speedValue - 1) * 100);
        return percentage >= 0 ? `+${percentage}%` : `${percentage}%`;
    }
    
    // 添加键盘快捷键支持
    initializeKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // 只在没有焦点在输入框时响应快捷键
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
                return;
            }
            
            switch(e.code) {
                case 'Space':
                    e.preventDefault();
                    this.togglePlayback();
                    break;
                case 'KeyS':
                    if (e.ctrlKey) {
                        e.preventDefault();
                        this.saveAsMP3();
                    }
                    break;
                case 'Escape':
                    this.stopPlayback();
                    break;
                case 'ArrowUp':
                    if (e.ctrlKey) {
                        e.preventDefault();
                        this.adjustSpeed(0.1);
                    }
                    break;
                case 'ArrowDown':
                    if (e.ctrlKey) {
                        e.preventDefault();
                        this.adjustSpeed(-0.1);
                    }
                    break;
            }
        });
    }
    
    adjustSpeed(delta) {
        this.currentSpeed = Math.max(0.5, Math.min(2.0, this.currentSpeed + delta));
        document.getElementById('speedDisplay').textContent = this.currentSpeed.toFixed(1) + 'x';
        this.showStatus(`朗读速度调整为 ${this.currentSpeed.toFixed(1)}x`, 'info');
    }
    
    jumpToProgress(event) {
        if (this.sentences.length === 0) return;
        
        const progressBar = event.currentTarget;
        const rect = progressBar.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const progressPercent = clickX / rect.width;
        const targetIndex = Math.floor(progressPercent * this.sentences.length);
        
        this.jumpToSentence(Math.max(0, Math.min(targetIndex, this.sentences.length - 1)));
    }

    highlightCurrentSentence() {
        // 移除所有句子的高亮
        const allSentences = document.querySelectorAll('.sentence');
        allSentences.forEach(sentence => {
            sentence.classList.remove('current');
        });
        
        // 高亮当前句子
        const currentSentence = document.querySelector(`[data-sentence-index="${this.currentSentenceIndex}"]`);
        if (currentSentence) {
            currentSentence.classList.add('current');
        }
    }
    
    updateFileInfo(fileName) {
        // 更新左侧面板的文件名显示
        const fileNameElement = document.getElementById('fileName');
        if (fileNameElement) {
            fileNameElement.textContent = fileName;
        }
        
        // 更新顶部的文件名显示
        const currentFileNameElement = document.getElementById('currentFileName');
        if (currentFileNameElement) {
            currentFileNameElement.textContent = fileName;
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    scrollToCurrentSentence() {
        const currentSentence = document.querySelector(`[data-sentence-index="${this.currentSentenceIndex}"]`);
        if (currentSentence) {
            currentSentence.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        }
    }
}

// 全局函数
let reader;

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        reader.handleFile(file);
    }
}

function togglePlayback() {
    reader.togglePlayback();
}

function stopPlayback() {
    reader.stopPlayback();
}

function saveAsMP3() {
    reader.saveAsMP3();
}

function cancelMP3Generation() {
    reader.cancelMP3Generation();
}

function adjustSpeed(delta) {
    reader.adjustSpeed(delta);
}

function jumpToProgress(event) {
    reader.jumpToProgress(event);
}

// 添加在线语音API相关函数
function loadOnlineVoices() {
    reader.loadOnlineVoices();
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    reader = new EbookTTSReader();
    reader.initializeKeyboardShortcuts();
});

// 添加JSZip库的CDN引用检查
if (typeof JSZip === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    script.onload = () => {
        console.log('JSZip库加载成功');
    };
    script.onerror = () => {
        console.warn('JSZip库加载失败，EPUB功能将不可用');
    };
    document.head.appendChild(script);
}