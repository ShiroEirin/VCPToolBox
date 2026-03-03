// EmbeddingUtils.js
const { get_encoding } = require("@dqbd/tiktoken");
const encoding = get_encoding("cl100k_base");

// 配置
const embeddingMaxToken = parseInt(process.env.WhitelistEmbeddingModelMaxToken, 10) || 8000;
const safeMaxTokens = Math.floor(embeddingMaxToken * 0.85);
const MAX_BATCH_ITEMS = 100; // Gemini/OpenAI 限制
const DEFAULT_CONCURRENCY = parseInt(process.env.TAG_VECTORIZE_CONCURRENCY) || 5; // 🌟 读取并发配置

/**
 * 内部函数：发送单个批次
 */
async function _sendBatch(batchTexts, config, batchNumber) {
    const { default: fetch } = await import('node-fetch');
    const retryAttempts = 3;
    const baseDelay = 1000;

    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
        try {
            const requestUrl = `${config.apiUrl}/v1/embeddings`;
            const requestBody = { model: config.model, input: batchTexts };
            const requestHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` };

            const response = await fetch(requestUrl, {
                method: 'POST',
                headers: requestHeaders,
                body: JSON.stringify(requestBody)
            });

            const responseBodyText = await response.text();

            if (!response.ok) {
                if (response.status === 429) {
                    // 429 限流时，增加等待时间
                    const waitTime = 5000 * attempt;
                    console.warn(`[Embedding] Batch ${batchNumber} rate limited (429). Retrying in ${waitTime / 1000}s...`);
                    await new Promise(r => setTimeout(r, waitTime));
                    continue;
                }
                throw new Error(`API Error ${response.status}: ${responseBodyText.substring(0, 500)}`);
            }

            let data;
            try {
                data = JSON.parse(responseBodyText);
            } catch (parseError) {
                console.error(`[Embedding] JSON Parse Error for Batch ${batchNumber}:`);
                console.error(`Response (first 500 chars): ${responseBodyText.substring(0, 500)}`);
                throw new Error(`Failed to parse API response as JSON: ${parseError.message}`);
            }

            // 增强的响应结构验证和详细错误信息
            if (!data) {
                throw new Error(`API returned empty/null response`);
            }

            // 检查是否是错误响应
            if (data.error) {
                const errorMsg = data.error.message || JSON.stringify(data.error);
                const errorCode = data.error.code || response.status;
                console.error(`[Embedding] API Error for Batch ${batchNumber}:`);
                console.error(`  Error Code: ${errorCode}`);
                console.error(`  Error Message: ${errorMsg}`);
                console.error(`  Hint: Check if embedding model "${config.model}" is available on your API server`);
                throw new Error(`API Error ${errorCode}: ${errorMsg}`);
            }

            if (!data.data) {
                console.error(`[Embedding] Missing 'data' field in response for Batch ${batchNumber}`);
                console.error(`Response keys: ${Object.keys(data).join(', ')}`);
                console.error(`Response preview: ${JSON.stringify(data).substring(0, 500)}`);
                throw new Error(`Invalid API response structure: missing 'data' field`);
            }

            if (!Array.isArray(data.data)) {
                console.error(`[Embedding] 'data' field is not an array for Batch ${batchNumber}`);
                console.error(`data type: ${typeof data.data}`);
                console.error(`data value: ${JSON.stringify(data.data).substring(0, 200)}`);
                throw new Error(`Invalid API response structure: 'data' is not an array`);
            }

            if (data.data.length === 0) {
                console.warn(`[Embedding] Warning: Batch ${batchNumber} returned empty embeddings array`);
            }

            // 简单的 Log，证明并发正在跑
            // console.log(`[Embedding] ✅ Batch ${batchNumber} completed (${batchTexts.length} items).`);

            return data.data.sort((a, b) => a.index - b.index).map(item => item.embedding);

        } catch (e) {
            console.warn(`[Embedding] Batch ${batchNumber}, Attempt ${attempt} failed: ${e.message}`);
            if (attempt === retryAttempts) throw e;
            await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
        }
    }
}

/**
 * 🚀 终极版：并发批量获取 Embeddings
 * 🛡️ 核心保证：返回数组长度 === 输入 texts 长度，跳过/失败的位置填 null
 */
async function getEmbeddingsBatch(texts, config) {
    if (!texts || texts.length === 0) return [];

    // 1. ⚡️ 第一步：纯 CPU 操作，先把所有文本切分成 Batches
    //    同时记录每个文本在原始数组中的索引，以便后续对齐
    const batches = [];         // 每个元素: { texts: string[], originalIndices: number[] }
    let currentBatchTexts = [];
    let currentBatchIndices = [];
    let currentBatchTokens = 0;
    const oversizeIndices = new Set(); // 记录被跳过的超长文本位置

    for (let i = 0; i < texts.length; i++) {
        const text = texts[i];
        const textTokens = encoding.encode(text).length;
        if (textTokens > safeMaxTokens) {
            console.warn(`[Embedding] ⚠️ Text at index ${i} exceeds token limit (${textTokens} > ${safeMaxTokens}), skipping.`);
            oversizeIndices.add(i);
            continue; // Skip oversize，但记录位置
        }

        const isTokenFull = currentBatchTexts.length > 0 && (currentBatchTokens + textTokens > safeMaxTokens);
        const isItemFull = currentBatchTexts.length >= MAX_BATCH_ITEMS;

        if (isTokenFull || isItemFull) {
            batches.push({ texts: currentBatchTexts, originalIndices: currentBatchIndices });
            currentBatchTexts = [text];
            currentBatchIndices = [i];
            currentBatchTokens = textTokens;
        } else {
            currentBatchTexts.push(text);
            currentBatchIndices.push(i);
            currentBatchTokens += textTokens;
        }
    }
    if (currentBatchTexts.length > 0) {
        batches.push({ texts: currentBatchTexts, originalIndices: currentBatchIndices });
    }

    if (oversizeIndices.size > 0) {
        console.warn(`[Embedding] ⚠️ ${oversizeIndices.size} texts skipped due to token limit.`);
    }
    console.log(`[Embedding] Prepared ${batches.length} batches from ${texts.length} texts. Executing with concurrency: ${DEFAULT_CONCURRENCY}...`);

    // 2. 🌊 第二步：并发执行器
    const batchResults = new Array(batches.length); // 预分配结果数组，保证顺序
    let cursor = 0; // 当前处理到的批次索引

    // 定义 Worker：只要队列里还有任务，就不断抢任务做
    const worker = async (workerId) => {
        while (true) {
            // 🔒 获取任务索引 (原子操作模拟)
            const batchIndex = cursor++;
            if (batchIndex >= batches.length) break; // 没任务了，下班

            const batch = batches[batchIndex];
            try {
                // 执行请求 (Batch ID 从 1 开始显示)
                batchResults[batchIndex] = {
                    vectors: await _sendBatch(batch.texts, config, batchIndex + 1),
                    originalIndices: batch.originalIndices
                };
            } catch (e) {
                // 🛡️ 不再让单个 batch 失败导致整个 Promise.all 崩溃
                // 而是记录失败，对应位置将填 null
                console.error(`[Embedding] ❌ Batch ${batchIndex + 1} failed permanently: ${e.message}`);
                batchResults[batchIndex] = {
                    vectors: null, // 标记为失败
                    originalIndices: batch.originalIndices,
                    error: e.message
                };
            }
        }
    };

    // 启动 N 个 Worker
    const workers = [];
    for (let i = 0; i < DEFAULT_CONCURRENCY; i++) {
        workers.push(worker(i));
    }

    // 等待所有 Worker 下班
    await Promise.all(workers);

    // 3. 📦 第三步：按原始索引回填结果，保证 output.length === input.length
    const finalResults = new Array(texts.length).fill(null); // 默认全部为 null
    let successCount = 0;
    let failCount = 0;

    for (const result of batchResults) {
        if (!result || !result.vectors) {
            // 整个 batch 失败，对应位置保持 null
            if (result) failCount += result.originalIndices.length;
            continue;
        }
        result.originalIndices.forEach((origIdx, vecIdx) => {
            finalResults[origIdx] = result.vectors[vecIdx] || null;
            if (result.vectors[vecIdx]) successCount++;
            else failCount++;
        });
    }

    failCount += oversizeIndices.size; // 超长文本也算失败

    if (failCount > 0) {
        console.warn(`[Embedding] ⚠️ Results: ${successCount} succeeded, ${failCount} failed/skipped out of ${texts.length} total.`);
    }

    return finalResults; // 🛡️ 长度严格等于 texts.length，失败位置为 null
}

module.exports = { getEmbeddingsBatch };