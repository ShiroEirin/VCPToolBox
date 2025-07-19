const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');
const crypto = require('crypto');

const SOVITS_API_BASE_URL = "http://127.0.0.1:8000";
// 修正路径问题，确保缓存和模型列表都在项目内的AppData目录
const PROJECT_ROOT = path.join(__dirname, '..'); // 更可靠的方式获取项目根目录
const APP_DATA_ROOT_IN_PROJECT = path.join(PROJECT_ROOT, 'AppData');
const MODELS_CACHE_PATH = path.join(APP_DATA_ROOT_IN_PROJECT, 'sovits_models.json');
const TTS_CACHE_DIR = path.join(APP_DATA_ROOT_IN_PROJECT, 'tts_cache');

class SovitsTTS {
    constructor(mainWindow) {
        this.mainWindow = mainWindow;
        this.isSpeaking = false;
        this.speechQueue = [];
        this.currentSpeechItemId = null; // 用于跟踪当前朗读的气泡ID
        this.sessionId = 0; // 新增：会话ID，用于作废过时的播放事件
        this.initCacheDir();
    }

    async initCacheDir() {
        try {
            await fs.mkdir(TTS_CACHE_DIR, { recursive: true });
        } catch (error) {
            console.error("无法创建TTS缓存目录:", error);
        }
    }

    /**
     * 获取模型列表，优先从缓存读取
     * @param {boolean} forceRefresh 是否强制刷新缓存
     * @returns {Promise<Object>} 模型列表
     */
    async getModels(forceRefresh = false) {
        if (!forceRefresh) {
            try {
                const cachedModels = await fs.readFile(MODELS_CACHE_PATH, 'utf-8');
                console.log('从缓存加载Sovits模型列表。');
                return JSON.parse(cachedModels);
            } catch (error) {
                console.log('Sovits模型缓存不存在或读取失败，将从API获取。');
            }
        }

        try {
            console.log(`正在从 ${SOVITS_API_BASE_URL}/models 获取模型列表...`);
            const response = await axios.post(`${SOVITS_API_BASE_URL}/models`, { version: "v4" });

            if (response.data && response.data.msg === "获取成功" && response.data.models) {
                await fs.writeFile(MODELS_CACHE_PATH, JSON.stringify(response.data.models, null, 2));
                console.log('Sovits模型列表已获取并缓存。');
                return response.data.models;
            } else {
                console.error("获取Sovits模型列表失败: ", response.data);
                return null;
            }
        } catch (error) {
            console.error("请求Sovits模型列表API时出错: ", error.message);
            try {
                const cachedModels = await fs.readFile(MODELS_CACHE_PATH, 'utf-8');
                return JSON.parse(cachedModels);
            } catch (e) {
                return null;
            }
        }
    }

    /**
     * 将文本转换为语音并返回音频数据
     * @param {string} text 要转换的文本
     * @param {string} voice 使用的模型名称
     * @param {number} speed 语速
     * @returns {Promise<Buffer|null>} 音频数据的Buffer
     */
    async textToSpeech(text, voice, speed) {
        const cacheKey = crypto.createHash('md5').update(text + voice + speed).digest('hex');
        const cacheFilePath = path.join(TTS_CACHE_DIR, `${cacheKey}.mp3`);
        console.log(`[TTS] 尝试缓存路径: ${cacheFilePath}`);

        // 1. 检查缓存
        try {
            const cachedAudio = await fs.readFile(cacheFilePath);
            console.log(`[TTS] 成功从缓存加载音频: ${cacheKey}`);
            return cachedAudio;
        } catch (error) {
            console.log(`[TTS] 缓存未命中或读取失败: ${error.message}`);
        }

        // 2. 如果没有缓存，请求API
        const payload = {
            model: "tts-v2ProPlus",
            input: text,
            voice: voice,
            response_format: "mp3",
            speed: speed,
            other_params: {
                text_lang: "中英混合",
                prompt_lang: "中文",
                emotion: "默认",
                text_split_method: "按标点符号切",
            }
        };

        try {
            console.log('[TTS] 发送API请求:', JSON.stringify(payload));
            const response = await axios.post(`${SOVITS_API_BASE_URL}/v1/audio/speech`, payload, {
                responseType: 'arraybuffer'
            });
            console.log(`[TTS]收到API响应: 状态 ${response.status}, 类型 ${response.headers['content-type']}`);

            if (response.headers['content-type'] === 'audio/mpeg') {
                const audioBuffer = Buffer.from(response.data);
                // 3. 保存到缓存
                try {
                    await fs.writeFile(cacheFilePath, audioBuffer);
                    console.log(`[TTS] 音频已成功缓存: ${cacheKey}`);
                } catch (cacheError) {
                    console.error("[TTS] 保存音频缓存失败:", cacheError);
                }
                return audioBuffer;
            } else {
                console.error("[TTS] API没有返回正确的音频文件类型。");
                return null;
            }
        } catch (error) {
            console.error("[TTS] 请求语音合成API时出错: ", error.message);
            return null;
        }
    }

    /**
     * 将长文本分割成句子队列
     * @param {string} text 
     * @returns {string[]}
     */
    splitText(text) {
        // 根据用户建议，仅按换行符分割
        return text.split('\n').filter(line => line.trim() !== '');
    }

    /**
     * 开始朗读或将朗读任务加入队列
     * @param {string} text 要朗读的完整文本
     * @param {string} voice 模型
     * @param {number} speed 语速
     * @param {string} msgId 消息ID
     */
    speak(text, voice, speed, msgId) {
        // 关键修复：每次新的speak请求都应被视为一个全新的播放序列。
        // 因此，先调用stop()来清空任何正在进行的或排队的任务。
        this.stop();

        const textQueue = this.splitText(text);
        this.speechQueue.push(...textQueue.map(chunk => ({ text: chunk, voice, speed, msgId })));
        
        // stop() 已经将 isSpeaking 设置为 false，所以这里可以直接开始处理新队列。
        this.processQueue();
    }

    /**
     * 处理语音队列
     */
    async processQueue() {
        if (this.isSpeaking) return; // 防止重入
        this.isSpeaking = true;
        
        const loopSessionId = this.sessionId; // 捕获当前循环的会话ID

        while (this.speechQueue.length > 0) {
            // 在每次循环开始时检查会话ID是否已改变
            if (this.sessionId !== loopSessionId) {
                console.log(`[TTS] Session ID changed (${loopSessionId} -> ${this.sessionId}). Stopping current processing loop.`);
                break;
            }

            const currentTask = this.speechQueue.shift();
            this.currentSpeechItemId = currentTask.msgId;

            const audioBuffer = await this.textToSpeech(currentTask.text, currentTask.voice, currentTask.speed);

            // 在异步操作后，再次检查会话ID
            if (this.sessionId !== loopSessionId) {
                console.log(`[TTS] Session ID changed during TTS synthesis. Discarding audio.`);
                break;
            }

            if (audioBuffer) {
                const audioBase64 = audioBuffer.toString('base64');
                // 发送音频数据、msgId 和会话ID
                this.mainWindow.webContents.send('play-tts-audio', {
                    audioData: audioBase64,
                    msgId: currentTask.msgId,
                    sessionId: loopSessionId
                });
            } else {
                console.error(`合成失败: "${currentTask.text.substring(0, 20)}..."`);
            }
        }

        // 队列处理完毕或被中断
        this.isSpeaking = false;
        // 只有当会话未被更新时，才清除 currentSpeechItemId
        if (this.sessionId === loopSessionId) {
            this.currentSpeechItemId = null;
        }
        console.log(`TTS processing loop for session ${loopSessionId} finished.`);
    }

    /**
     * 停止当前所有朗读
     */
    stop() {
        this.speechQueue = [];
        this.isSpeaking = false;
        this.sessionId++; // 关键：使当前所有操作和事件失效
        console.log(`[TTS] Stop called. New session ID: ${this.sessionId}`);
        // 停止事件的发送逻辑已移至 ipc/sovitsHandlers.js，以确保可靠性。
        // 这里只负责清理内部状态。
        this.currentSpeechItemId = null;
        // console.log('TTS朗读已停止。'); // 日志由上方的 sessionId 变化日志替代
    }
}

module.exports = SovitsTTS;