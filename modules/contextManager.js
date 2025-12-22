/**
 * 上下文管理器 - 处理 VCP 特有的 contextTokenLimit 参数
 */

/**
 * 估算消息的 Token 数量 (仅计算文本内容，排除 Base64 等多媒体数据)
 * @param {Array} messages
 * @returns {number}
 */
function estimateTokens(messages) {
    let textLength = 0;
    for (const msg of messages) {
        if (typeof msg.content === 'string') {
            textLength += msg.content.length;
        } else if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                if (part.type === 'text' && typeof part.text === 'string') {
                    textLength += part.text.length;
                }
                // 忽略 image_url 等非文本类型，因为它们的 Token 计算逻辑完全不同
            }
        }
    }
    return textLength;
}

/**
 * 根据限制修剪消息历史
 * @param {Array} messages 原始消息数组
 * @param {number} limit Token 限制 (字符数估算)
 * @param {boolean} debugMode 是否开启调试日志
 * @returns {Array} 修剪后的消息数组
 */
function pruneMessages(messages, limit, debugMode = false) {
    if (!limit || !Array.isArray(messages) || messages.length <= 2) {
        return messages;
    }

    const totalLen = messages.length;
    const mustKeepIndices = new Set();

    // --- 规则 1 & 2: 系统提示词和特定前缀的 User 消息必须保留 ---
    for (let i = 0; i < totalLen; i++) {
        const msg = messages[i];
        if (msg.role === 'system') {
            mustKeepIndices.add(i);
        } else if (msg.role === 'user' && typeof msg.content === 'string' && msg.content.startsWith('[系统提示:]')) {
            mustKeepIndices.add(i);
        }
    }

    // --- 规则 3: 至少保存最后一组 AI 和用户的讨论 ---
    // 通常是最后两条消息
    mustKeepIndices.add(totalLen - 1);
    if (totalLen >= 2) {
        mustKeepIndices.add(totalLen - 2);
    }

    let currentEstimatedTokens = estimateTokens(messages);
    if (debugMode) {
        console.log(`[ContextManager] 初始估算长度: ${currentEstimatedTokens}, 限制: ${limit}`);
    }

    if (currentEstimatedTokens <= limit) {
        return messages;
    }

    // 复制一份索引数组用于操作
    let resultIndices = [];
    for (let i = 0; i < totalLen; i++) {
        resultIndices.push(i);
    }

    // 从前往后尝试删除不在 mustKeepIndices 中的消息
    // 注意：我们从索引 0 开始遍历原始消息
    for (let i = 0; i < totalLen; i++) {
        if (currentEstimatedTokens <= limit) break;

        // 如果不是必须保留的消息，则从结果中移除
        if (!mustKeepIndices.has(i)) {
            const indexInResult = resultIndices.indexOf(i);
            if (indexInResult !== -1) {
                resultIndices.splice(indexInResult, 1);
                // 重新计算当前估算长度
                const currentMessages = resultIndices.map(idx => messages[idx]);
                currentEstimatedTokens = estimateTokens(currentMessages);
                
                if (debugMode) {
                    console.log(`[ContextManager] 已移除索引为 ${i} 的消息。剩余估算长度: ${currentEstimatedTokens}`);
                }
            }
        }
    }

    return resultIndices.map(idx => messages[idx]);
}

module.exports = {
    pruneMessages,
    estimateTokens
};