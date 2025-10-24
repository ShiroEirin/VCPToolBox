"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.post = exports.get = void 0;
const config_js_1 = require("../config.js");
const cache_js_1 = require("./cache.js");
const logger_js_1 = __importDefault(require("./logger.js"));
const axios_1 = __importDefault(require("axios"));
// 基础配置
const request = axios_1.default.create({
    // 请求超时设置
    timeout: config_js_1.config.REQUEST_TIMEOUT,
    withCredentials: true,
    // 添加默认请求头以模拟浏览器访问
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
    }
});
// 请求拦截
request.interceptors.request.use((request) => {
    if (!request.params)
        request.params = {};
    // 发送请求
    return request;
}, (error) => {
    logger_js_1.default.error("❌ [ERROR] request failed");
    return Promise.reject(error);
});
// 响应拦截
request.interceptors.response.use((response) => {
    return response;
}, (error) => {
    // 继续传递错误
    return Promise.reject(error);
});
// GET
const get = async (options) => {
    const { url, headers, params, noCache, ttl = config_js_1.config.CACHE_TTL, originaInfo = false, responseType = "json", } = options;
    logger_js_1.default.info(`🌐 [GET] ${url}`);
    try {
        // 检查缓存
        if (noCache)
            await (0, cache_js_1.delCache)(url);
        else {
            const cachedData = await (0, cache_js_1.getCache)(url);
            if (cachedData) {
                logger_js_1.default.info("💾 [CHCHE] The request is cached");
                return {
                    fromCache: true,
                    updateTime: cachedData.updateTime,
                    data: cachedData.data,
                };
            }
        }
        // 缓存不存在时请求接口
        const response = await request.get(url, { headers, params, responseType });
        const responseData = response?.data || response;
        // 存储新获取的数据到缓存
        const updateTime = new Date().toISOString();
        const data = originaInfo ? response : responseData;
        await (0, cache_js_1.setCache)(url, { data, updateTime }, ttl);
        // 返回数据
        logger_js_1.default.info(`✅ [${response?.status}] request was successful`);
        return { fromCache: false, updateTime, data };
    }
    catch (error) {
        logger_js_1.default.error("❌ [ERROR] request failed");
        throw error;
    }
};
exports.get = get;
// POST
const post = async (options) => {
    const { url, headers, body, noCache, ttl = config_js_1.config.CACHE_TTL, originaInfo = false } = options;
    logger_js_1.default.info(`🌐 [POST] ${url}`);
    try {
        // 检查缓存
        if (noCache)
            await (0, cache_js_1.delCache)(url);
        else {
            const cachedData = await (0, cache_js_1.getCache)(url);
            if (cachedData) {
                logger_js_1.default.info("💾 [CHCHE] The request is cached");
                return { fromCache: true, updateTime: cachedData.updateTime, data: cachedData.data };
            }
        }
        // 缓存不存在时请求接口
        const response = await request.post(url, body, { headers });
        const responseData = response?.data || response;
        // 存储新获取的数据到缓存
        const updateTime = new Date().toISOString();
        const data = originaInfo ? response : responseData;
        if (!noCache) {
            await (0, cache_js_1.setCache)(url, { data, updateTime }, ttl);
        }
        // 返回数据
        logger_js_1.default.info(`✅ [${response?.status}] request was successful`);
        return { fromCache: false, updateTime, data };
    }
    catch (error) {
        logger_js_1.default.error("❌ [ERROR] request failed");
        throw error;
    }
};
exports.post = post;
