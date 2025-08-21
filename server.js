const express = require('express');
const cors = require('cors');
const { EdgeTTS, VoicesManager } = require('@travisvn/edge-tts');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('.'));

// 缓存语音列表
let cachedVoices = null;
let voicesLastFetch = 0;
const VOICES_CACHE_DURATION = 60 * 60 * 1000; // 1小时

// 获取语音列表
async function getVoices() {
    const now = Date.now();
    if (cachedVoices && (now - voicesLastFetch) < VOICES_CACHE_DURATION) {
        return cachedVoices;
    }

    try {
        const voicesManager = await VoicesManager.create();
        const voices = voicesManager.voices;
        
        // 格式化语音数据
        cachedVoices = voices.map(voice => ({
            name: voice.ShortName,
            displayName: voice.FriendlyName,
            language: voice.Locale,
            gender: voice.Gender,
            isOnline: true,
            isRecommended: voice.ShortName.includes('Yunyang') || 
                          voice.ShortName.includes('Xiaoxiao') ||
                          voice.ShortName.includes('Xiaoyi')
        }));
        
        voicesLastFetch = now;
        console.log(`已获取 ${cachedVoices.length} 个在线语音`);
        return cachedVoices;
    } catch (error) {
        console.error('获取语音列表失败:', error);
        return [];
    }
}

// API路由：健康检查
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// API路由：获取语音列表
app.get('/api/voices', async (req, res) => {
    try {
        const voices = await getVoices();
        res.json({ success: true, voices });
    } catch (error) {
        console.error('获取语音列表API错误:', error);
        res.status(500).json({ success: false, error: '获取语音列表失败' });
    }
});

// API路由：文本转语音
app.post('/api/synthesize', async (req, res) => {
    try {
        const { text, voice, options = {} } = req.body;
        
        if (!text || !voice) {
            return res.status(400).json({ 
                success: false, 
                error: '缺少必要参数：text 和 voice' 
            });
        }

        // 限制文本长度
        if (text.length > 1000) {
            return res.status(400).json({ 
                success: false, 
                error: '文本长度不能超过1000字符' 
            });
        }

        console.log(`开始合成语音: ${voice}, 文本长度: ${text.length}`);
        
        // 设置语音参数
        const synthesizeOptions = {
            rate: options.rate || '0%',
            volume: options.volume || '+0%',
            pitch: options.pitch || '0Hz'
        };
        
        // 合成语音
        const tts = new EdgeTTS(text, voice, synthesizeOptions);
        const result = await tts.synthesize();
        
        if (!result || !result.audio) {
            throw new Error('语音合成失败，未返回音频数据');
        }
        
        // 转换为Buffer
        const audioBuffer = Buffer.from(await result.audio.arrayBuffer());
        
        console.log(`语音合成成功，音频大小: ${audioBuffer.length} bytes`);
        
        // 设置响应头
        res.set({
            'Content-Type': 'audio/mpeg',
            'Content-Length': audioBuffer.length,
            'Cache-Control': 'public, max-age=3600'
        });
        
        res.send(audioBuffer);
        
    } catch (error) {
        console.error('语音合成API错误:', error);
        res.status(500).json({ 
            success: false, 
            error: `语音合成失败: ${error.message}` 
        });
    }
});

// API路由：批量合成MP3
app.post('/api/batch-synthesize', async (req, res) => {
    try {
        const { sentences, voice, options = {} } = req.body;
        
        if (!sentences || !Array.isArray(sentences) || sentences.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: '缺少必要参数：sentences 数组' 
            });
        }
        
        if (!voice) {
            return res.status(400).json({ 
                success: false, 
                error: '缺少必要参数：voice' 
            });
        }
        
        console.log(`开始批量合成语音: ${voice}, 句子数量: ${sentences.length}`);
        
        // 设置更长的超时时间
        req.setTimeout(600000); // 10分钟
        res.setTimeout(600000);
        
        // 设置语音参数
        const synthesizeOptions = {
            rate: options.rate || '0%',
            volume: options.volume || '+0%',
            pitch: options.pitch || '0Hz'
        };
        
        const audioBuffers = [];
        const totalSentences = sentences.length;
        const batchSize = 5; // 减少批次大小以避免内存问题
        
        // 分批处理句子以避免连接重置
        for (let batchStart = 0; batchStart < sentences.length; batchStart += batchSize) {
            const batchEnd = Math.min(batchStart + batchSize, sentences.length);
            const batch = sentences.slice(batchStart, batchEnd);
            
            console.log(`处理批次 ${Math.floor(batchStart/batchSize) + 1}/${Math.ceil(sentences.length/batchSize)}`);
            
            // 逐句合成音频（避免并发过多）
            for (let i = 0; i < batch.length; i++) {
                const globalIndex = batchStart + i;
                const sentence = batch[i];
                
                if (sentence.length > 1000) {
                    console.warn(`句子 ${globalIndex + 1} 过长，跳过: ${sentence.substring(0, 50)}...`);
                    continue;
                }
                
                try {
                    console.log(`合成进度: ${globalIndex + 1}/${totalSentences} - ${sentence.substring(0, 30)}...`);
                    
                    const tts = new EdgeTTS(sentence, voice, synthesizeOptions);
                    const result = await Promise.race([
                        tts.synthesize(),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('合成超时')), 30000)
                        )
                    ]);
                    
                    if (result && result.audio) {
                        const audioBuffer = Buffer.from(await result.audio.arrayBuffer());
                        audioBuffers.push(audioBuffer);
                    } else {
                        console.warn(`句子 ${globalIndex + 1} 合成失败，跳过`);
                    }
                    
                    // 添加延迟，避免请求过于频繁
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                } catch (error) {
                    console.error(`句子 ${globalIndex + 1} 合成失败:`, error.message);
                    continue;
                }
            }
            
            // 在批次之间稍作延迟
            if (batchEnd < sentences.length) {
                console.log('批次间休息...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        if (audioBuffers.length === 0) {
            return res.status(500).json({ 
                success: false, 
                error: '所有句子合成失败' 
            });
        }
        
        console.log(`成功合成 ${audioBuffers.length}/${totalSentences} 个音频片段`);
        
        // 合并音频缓冲区
        const combinedBuffer = Buffer.concat(audioBuffers);
        
        console.log(`合并完成，总音频大小: ${combinedBuffer.length} bytes`);
        
        // 设置响应头
        res.set({
            'Content-Type': 'audio/mpeg',
            'Content-Length': combinedBuffer.length,
            'Content-Disposition': `attachment; filename="ebook-tts-${Date.now()}.mp3"`,
            'Cache-Control': 'no-cache'
        });
        
        res.send(combinedBuffer);
        
    } catch (error) {
        console.error('批量语音合成API错误:', error);
        res.status(500).json({ 
            success: false, 
            error: `批量语音合成失败: ${error.message}` 
        });
    }
});

// 健康检查
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        message: '服务运行正常',
        timestamp: new Date().toISOString()
    });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`\n🚀 电子书TTS后端服务已启动`);
    console.log(`📡 服务地址: http://localhost:${PORT}`);
    console.log(`🎤 语音API: http://localhost:${PORT}/api/voices`);
    console.log(`🔊 合成API: http://localhost:${PORT}/api/synthesize`);
    console.log(`\n正在初始化语音列表...`);
    
    // 预加载语音列表
    getVoices().then(voices => {
        console.log(`✅ 语音列表初始化完成，共 ${voices.length} 个语音`);
    }).catch(error => {
        console.error('❌ 语音列表初始化失败:', error);
    });
});

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n正在关闭服务器...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n正在关闭服务器...');
    process.exit(0);
});