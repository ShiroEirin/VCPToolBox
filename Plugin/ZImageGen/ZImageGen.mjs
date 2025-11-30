#!/usr/bin/env node

import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// --- 1. 配置加载与初始化 ---

const {
    PROJECT_BASE_PATH,
    SERVER_PORT,
    IMAGESERVER_IMAGE_KEY,
    VAR_HTTP_URL
} = (() => {
    return {
        PROJECT_BASE_PATH: process.env.PROJECT_BASE_PATH || '.',
        SERVER_PORT: process.env.SERVER_PORT || '3000',
        IMAGESERVER_IMAGE_KEY: process.env.IMAGESERVER_IMAGE_KEY || 'default_key',
        VAR_HTTP_URL: process.env.VarHttpUrl || 'http://localhost'
    };
})();

const API_BASE_URL = 'https://mrfakename-z-image-turbo.hf.space/gradio_api';

// --- 2. 核心功能函数 ---

/**
 * 解析分辨率字符串为宽高
 * @param {string} resolution - 分辨率字符串，如 "1024x1024", "16:9", "landscape"
 * @returns {{width: number, height: number}}
 */
function parseResolution(resolution) {
    if (!resolution) return { width: 1024, height: 1024 };
    
    const res = resolution.toLowerCase().trim();
    
    // 预设比例
    const presets = {
        'square': { width: 1024, height: 1024 },
        'landscape': { width: 1280, height: 720 },
        'portrait': { width: 720, height: 1280 },
        '16:9': { width: 1280, height: 720 },
        '9:16': { width: 720, height: 1280 },
        '4:3': { width: 1152, height: 864 },
        '3:4': { width: 864, height: 1152 },
        '1:1': { width: 1024, height: 1024 }
    };
    
    if (presets[res]) return presets[res];
    
    // 解析 WxH 格式
    const match = res.match(/(\d+)\s*[x×]\s*(\d+)/i);
    if (match) {
        return { width: parseInt(match[1]), height: parseInt(match[2]) };
    }
    
    return { width: 1024, height: 1024 };
}

/**
 * 调用 Gradio API 生成图像 (新版API格式)
 * @param {object} args - 生成参数
 * @returns {Promise<{imageUrl: string, seed: number}>} - 生成的图像 URL 和 seed
 */
async function callGradioApi(args) {
    const prompt = args.prompt;
    const { width, height } = parseResolution(args.resolution);
    const seed = parseInt(args.seed) || 42;
    const steps = parseInt(args.steps) || 9; // 新API默认9步
    const randomSeed = args.random_seed !== 'false'; // 默认为 true

    // 新API格式: /generate_image 端点
    const payload = {
        data: [
            prompt,           // prompt: string
            height,           // height: number
            width,            // width: number  
            steps,            // num_inference_steps: number
            seed,             // seed: number
            randomSeed        // randomize_seed: boolean
        ]
    };

    try {
        const response = await axios.post(`${API_BASE_URL}/call/generate_image`, payload, {
            headers: { 'Content-Type': 'application/json' }
        });
        const eventId = response.data.event_id;

        // 监听结果 (SSE 接口)
        return await listenForResult(eventId);
    } catch (error) {
        throw new Error(`Gradio API 调用失败: ${error.message}`);
    }
}

/**
 * 监听 Gradio 任务结果
 * @param {string} eventId - 任务 ID
 * @returns {Promise<{imageUrl: string, seed: number}>} - 图像 URL 和 seed
 */
async function listenForResult(eventId) {
    const eventSourceUrl = `${API_BASE_URL}/call/generate_image/${eventId}`;
    
    try {
        const response = await axios.get(eventSourceUrl, {
            responseType: 'stream',
            headers: { 'Accept': 'text/event-stream' },
            timeout: 240000 // 4分钟超时
        });

        const stream = response.data;
        let buffer = '';

        for await (const chunk of stream) {
            buffer += chunk.toString();
            
            while (buffer.includes('\n\n')) {
                const index = buffer.indexOf('\n\n');
                const message = buffer.substring(0, index);
                buffer = buffer.substring(index + 2);

                const lines = message.split('\n');
                let eventType = null;
                let data = null;

                for (const line of lines) {
                    if (line.startsWith('event: ')) {
                        eventType = line.substring(7).trim();
                    } else if (line.startsWith('data: ')) {
                        try {
                            data = JSON.parse(line.substring(6));
                        } catch (e) {
                            // 忽略 JSON 解析错误
                        }
                    }
                }

                if (eventType === 'complete' && data) {
                    // 新API返回格式: [imageUrl, seedUsed]
                    if (Array.isArray(data) && data.length >= 2) {
                        const imageResult = data[0];
                        const seedUsed = data[1];
                        
                        let downloadUrl = null;
                        
                        // 处理不同的返回格式
                        if (typeof imageResult === 'string') {
                            downloadUrl = imageResult;
                        } else if (imageResult && imageResult.url) {
                            downloadUrl = imageResult.url;
                        } else if (imageResult && imageResult.path) {
                            downloadUrl = `${API_BASE_URL}/file=${imageResult.path}`;
                        }
                        
                        if (downloadUrl) {
                            return { imageUrl: downloadUrl, seed: seedUsed };
                        }
                    }
                }
            }
        }
        
        throw new Error('SSE 流已结束但未收到完成事件');

    } catch (err) {
        throw new Error(`SSE 监听失败: ${err.message}`);
    }
}

/**
 * 下载并保存图像
 * @param {string} imageUrl - 图像下载 URL
 * @returns {Promise<object>} - 本地文件信息
 */
async function saveImage(imageUrl) {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const buffer = response.data;
    const mimeType = response.headers['content-type'] || 'image/png';
    const extension = mimeType.split('/')[1] || 'png';
    
    const generatedFileName = `${uuidv4()}.${extension}`;
    const imageDir = path.join(PROJECT_BASE_PATH, 'image', 'zimagegen');
    const localImagePath = path.join(imageDir, generatedFileName);

    await fs.mkdir(imageDir, { recursive: true });
    await fs.writeFile(localImagePath, buffer);

    const relativePathForUrl = path.join('zimagegen', generatedFileName).replace(/\\/g, '/');
    const accessibleImageUrl = `${VAR_HTTP_URL}:${SERVER_PORT}/pw=${IMAGESERVER_IMAGE_KEY}/images/${relativePathForUrl}`;

    return {
        serverPath: `image/zimagegen/${generatedFileName}`,
        fileName: generatedFileName,
        imageUrl: accessibleImageUrl,
        base64: buffer.toString('base64'),
        mimeType: mimeType
    };
}

// --- 3. 主逻辑 ---

async function generateImage(args) {
    if (!args.prompt) {
        throw new Error("参数错误: 'prompt' 是必需的。");
    }

    // 1. 调用 API 生成 (新API返回 {imageUrl, seed})
    const apiResult = await callGradioApi(args);

    // 2. 下载并保存
    const savedImage = await saveImage(apiResult.imageUrl);

    // 3. 构造返回结果
    const { width, height } = parseResolution(args.resolution);
    const finalResponseText = `图片已成功生成！\n\n**图片详情:**\n- 提示词: ${args.prompt}\n- 分辨率: ${width}x${height}\n- Seed: ${apiResult.seed}\n- 可访问URL: ${savedImage.imageUrl}\n\n请利用可访问url将图片转发给用户`;

    return {
        content: [
            {
                type: 'text',
                text: finalResponseText
            },
            {
                type: 'image_url',
                image_url: {
                    url: `data:${savedImage.mimeType};base64,${savedImage.base64}`
                }
            }
        ],
        details: {
            ...savedImage,
            prompt: args.prompt,
            seed: apiResult.seed
        }
    };
}

async function main() {
    let inputData = '';
    
    // 设置全局超时，防止进程无限挂起
    const timeout = setTimeout(() => {
        console.log(JSON.stringify({ status: "error", error: "ZImageGen 插件执行超时 (5分钟)" }));
        process.exit(1);
    }, 300000); // 5分钟超时

    try {
        for await (const chunk of process.stdin) {
            inputData += chunk;
        }

        if (!inputData.trim()) {
            throw new Error("未从 stdin 接收到任何输入数据。");
        }
        
        const parsedArgs = JSON.parse(inputData);
        let resultObject;

        // 兼容多种命令格式：command='generate' 或直接传prompt
        const command = parsedArgs.command || (parsedArgs.prompt ? 'generate' : undefined);
        
        if (command === 'generate' || command === 'ZImageGenerate') {
            resultObject = await generateImage(parsedArgs);
        } else {
            throw new Error(`未知的命令: '${command}'. 输入数据: ${JSON.stringify(parsedArgs).substring(0, 200)}`);
        }

        console.log(JSON.stringify({ status: "success", result: resultObject }));
        clearTimeout(timeout);

    } catch (e) {
        console.log(JSON.stringify({ status: "error", error: `ZImageGen 插件错误: ${e.message}` }));
        process.exit(1);
    }
}

main();