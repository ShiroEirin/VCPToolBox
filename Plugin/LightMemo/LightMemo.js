// Plugin/LightMemoPlugin/LightMemo.js
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const dotenv = require('dotenv');
const { Jieba } = require('@node-rs/jieba');
const { dict } = require('@node-rs/jieba/dict');

class BM25Ranker {
    constructor() {
        this.k1 = 1.5;  // 词频饱和参数
        this.b = 0.75;  // 长度惩罚参数
    }

    /**
     * 计算BM25分数
     * @param {Array} queryTokens - 查询分词
     * @param {Array} docTokens - 文档分词
     * @param {Number} avgDocLength - 平均文档长度
     * @param {Object} idfScores - 每个词的IDF分数
     */
    score(queryTokens, docTokens, avgDocLength, idfScores) {
        const docLength = docTokens.length;
        const termFreq = {};
        
        // 统计词频
        for (const token of docTokens) {
            termFreq[token] = (termFreq[token] || 0) + 1;
        }

        let score = 0;
        for (const token of queryTokens) {
            const tf = termFreq[token] || 0;
            if (tf === 0) continue;

            const idf = idfScores[token] || 0;
            
            // BM25公式
            const numerator = tf * (this.k1 + 1);
            const denominator = tf + this.k1 * (1 - this.b + this.b * (docLength / avgDocLength));
            
            score += idf * (numerator / denominator);
        }

        return score;
    }

    /**
     * 计算IDF（逆文档频率）
     * @param {Array} allDocs - 所有文档的分词数组
     */
    calculateIDF(allDocs) {
        const N = allDocs.length;
        const df = {}; // document frequency

        // 统计每个词出现在多少文档中
        for (const doc of allDocs) {
            const uniqueTokens = new Set(doc);
            for (const token of uniqueTokens) {
                df[token] = (df[token] || 0) + 1;
            }
        }

        // 计算IDF
        const idfScores = {};
        for (const token in df) {
            // IDF = log((N - df + 0.5) / (df + 0.5) + 1)
            idfScores[token] = Math.log((N - df[token] + 0.5) / (df[token] + 0.5) + 1);
        }

        return idfScores;
    }
}

class LightMemoPlugin {
    constructor() {
        this.name = 'LightMemo';
        this.vectorDBManager = null;
        this.getSingleEmbedding = null;
        this.projectBasePath = '';
        this.dailyNoteRootPath = '';
        this.rerankConfig = {};
        this.excludedFolders = [];
        this.semanticGroups = null;
        this.wordToGroupMap = new Map();
        this.stopWords = new Set([
            '的', '了', '在', '是', '我', '你', '他', '她', '它',
            '这', '那', '有', '个', '就', '不', '人', '都', '一',
            '上', '也', '很', '到', '说', '要', '去', '能', '会'
        ]);
        
        // ✅ 初始化 jieba 实例（加载默认字典）
        try {
            this.jiebaInstance = Jieba.withDict(dict);
            console.log('[LightMemo] Jieba initialized successfully.');
        } catch (error) {
            console.error('[LightMemo] Failed to initialize Jieba:', error);
            this.jiebaInstance = null;
        }
    }

    initialize(config, dependencies) {
        this.projectBasePath = config.PROJECT_BASE_PATH || path.join(__dirname, '..', '..');
        this.dailyNoteRootPath = path.join(this.projectBasePath, 'dailynote');
        
        if (dependencies.vectorDBManager) {
            this.vectorDBManager = dependencies.vectorDBManager;
        }
        if (dependencies.getSingleEmbedding) {
            this.getSingleEmbedding = dependencies.getSingleEmbedding;
        }

        this.loadConfig(); // Load config after dependencies are set
        this.loadSemanticGroups();
        console.log('[LightMemo] Plugin initialized successfully as a hybrid service.');
    }

    loadConfig() {
        // config.env is already loaded by Plugin.js, we just need to read the values
        const excluded = process.env.EXCLUDED_FOLDERS || "已整理,夜伽,MusicDiary";
        this.excludedFolders = excluded.split(',').map(f => f.trim()).filter(Boolean);

        this.rerankConfig = {
            url: process.env.RerankUrl || '',
            apiKey: process.env.RerankApi || '',
            model: process.env.RerankModel || '',
            maxTokens: parseInt(process.env.RerankMaxTokensPerBatch) || 30000,
            multiplier: 2.0
        };
    }

    async processToolCall(args) {
        try {
            return await this.handleSearch(args);
        } catch (error) {
            console.error('[LightMemo] Error processing tool call:', error);
            // Return an error structure that Plugin.js can understand
            return { plugin_error: error.message || 'An unknown error occurred in LightMemo.' };
        }
    }

    async handleSearch(args) {
        const { query, maid, k = 5, rerank = false, search_all_knowledge_bases = false, tag_boost = 0.5 } = args;

        if (!query || !maid) {
            throw new Error("参数 'query' 和 'maid' 是必需的。");
        }

        // --- 第一阶段：关键词初筛（BM25） ---
        const queryTokens = this._tokenize(query);
        console.log(`[LightMemo] Query tokens: [${queryTokens.join(', ')}]`);

        // 扩展查询词（语义组）
        const expandedTokens = this._expandQueryTokens(queryTokens);
        const allQueryTokens = [...new Set([...queryTokens, ...expandedTokens])];
        console.log(`[LightMemo] Expanded tokens: [${allQueryTokens.join(', ')}]`);

        // 从所有日记本中收集候选chunks
        const candidates = await this._gatherCandidateChunks(maid, search_all_knowledge_bases);
        
        if (candidates.length === 0) {
            return `没有找到署名为 "${maid}" 的相关记忆。`;
        }

        console.log(`[LightMemo] Gathered ${candidates.length} candidate chunks from ${new Set(candidates.map(c => c.dbName)).size} diaries.`);

        // BM25排序
        const bm25Ranker = new BM25Ranker();
        const allDocs = candidates.map(c => c.tokens);
        const idfScores = bm25Ranker.calculateIDF(allDocs);
        const avgDocLength = allDocs.reduce((sum, doc) => sum + doc.length, 0) / allDocs.length;

        const scoredCandidates = candidates.map(candidate => {
            const bm25Score = bm25Ranker.score(
                allQueryTokens,
                candidate.tokens,
                avgDocLength,
                idfScores
            );
            return { ...candidate, bm25Score };
        });

        // 取top K*3用于向量检索
        const topByKeyword = scoredCandidates
            .filter(c => c.bm25Score > 0)  // 必须有关键词匹配
            .sort((a, b) => b.bm25Score - a.bm25Score)
            .slice(0, k * 3);

        if (topByKeyword.length === 0) {
            return `关于"${query}"，没有找到包含相关关键词的记忆片段。`;
        }

        console.log(`[LightMemo] BM25 filtered to ${topByKeyword.length} chunks.`);

        // --- 第二阶段：向量精排 ---
        let queryVector = await this.getSingleEmbedding(query);
        if (!queryVector) {
            throw new Error("查询内容向量化失败。");
        }

        let tagBoostInfo = null;
        // 🚀【新步骤】如果启用了 TagMemo，则调用 KBM 的功能来增强向量
        if (tag_boost > 0 && this.vectorDBManager && typeof this.vectorDBManager.applyTagBoost === 'function') {
            console.log(`[LightMemo] Applying TagMemo boost with factor: ${tag_boost}`);
            // KBM 的方法需要 Float32Array
            const boostResult = this.vectorDBManager.applyTagBoost(new Float32Array(queryVector), tag_boost);
            if (boostResult && boostResult.vector) {
                queryVector = boostResult.vector; // 使用增强后的向量 (Float32Array)
                tagBoostInfo = boostResult.info;
                console.log(`[LightMemo] TagMemo boost applied. Matched tags: ${tagBoostInfo?.matchedTags?.slice(0, 5).join(', ')}`);
            }
        }

        // 为每个候选chunk计算向量相似度
        const vectorScoredCandidates = await this._scoreByVectorSimilarity(
            topByKeyword,
            queryVector
        );

        // 混合BM25和向量分数
        const hybridScored = vectorScoredCandidates.map(c => ({
            ...c,
            hybridScore: c.bm25Score * 0.6 + c.vectorScore * 0.4,  // 提高关键词权重
            tagBoostInfo: tagBoostInfo // 注入增强信息
        })).sort((a, b) => b.hybridScore - a.hybridScore);

        // 取top K
        let finalResults = hybridScored.slice(0, k);

        // --- 第三阶段：Rerank（可选） ---
        if (rerank && finalResults.length > 0) {
            finalResults = await this._rerankDocuments(query, finalResults, k);
        }

        return this.formatResults(finalResults, query);
    }

    formatResults(results, query) {
        if (results.length === 0) {
            return `关于"${query}"，在指定的知识库中没有找到相关的记忆片段。`;
        }

        const searchedDiaries = [...new Set(results.map(r => r.dbName))];
        let content = `\n[--- LightMemo 轻量回忆 ---]\n`;
        content += `[查询内容: "${query}"]\n`;
        content += `[搜索范围: ${searchedDiaries.join(', ')}]\n\n`;
        content += `[找到 ${results.length} 条相关记忆片段:]\n`;

        results.forEach((r, index) => {
            // 👇 修复：正确获取分数
            let scoreValue = 0;
            let scoreType = '';
            
            if (typeof r.rerank_score === 'number' && !isNaN(r.rerank_score)) {
                scoreValue = r.rerank_score;
                scoreType = r.rerank_failed ? '混合' : 'Rerank';
            } else if (typeof r.hybridScore === 'number' && !isNaN(r.hybridScore)) {
                scoreValue = r.hybridScore;
                scoreType = '混合';
            } else if (typeof r.vectorScore === 'number' && !isNaN(r.vectorScore)) {
                scoreValue = r.vectorScore;
                scoreType = '向量';
            } else if (typeof r.bm25Score === 'number' && !isNaN(r.bm25Score)) {
                scoreValue = r.bm25Score;
                scoreType = 'BM25';
            }
            
            const scoreDisplay = scoreValue > 0
                ? `${(scoreValue * 100).toFixed(1)}%(${scoreType})`
                : 'N/A';
            
            content += `--- (来源: ${r.dbName}, 相关性: ${scoreDisplay})\n`;
            if (r.tagBoostInfo && r.tagBoostInfo.matchedTags && r.tagBoostInfo.matchedTags.length > 0) {
                content += `    [TagMemo 增强: ${r.tagBoostInfo.matchedTags.slice(0, 5).join(', ')}]\n`;
            }
            content += `${r.text.trim()}\n`;
        });

        content += `\n[--- 回忆结束 ---]\n`;
        return content;
    }

    _estimateTokens(text) {
        if (!text) return 0;
        const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
        const otherChars = text.length - chineseChars;
        return Math.ceil(chineseChars * 1.5 + otherChars * 0.25);
    }

    async _rerankDocuments(query, documents, originalK) {
        if (!this.rerankConfig.url || !this.rerankConfig.apiKey || !this.rerankConfig.model) {
            console.warn('[LightMemo] Rerank not configured. Skipping.');
            return documents.slice(0, originalK);
        }
        console.log(`[LightMemo] Starting rerank for ${documents.length} documents.`);

        const rerankUrl = new URL('v1/rerank', this.rerankConfig.url).toString();
        const headers = {
            'Authorization': `Bearer ${this.rerankConfig.apiKey}`,
            'Content-Type': 'application/json',
        };
        const maxTokens = this.rerankConfig.maxTokens;
        const queryTokens = this._estimateTokens(query);

        let batches = [];
        let currentBatch = [];
        let currentTokens = queryTokens;

        for (const doc of documents) {
            const docTokens = this._estimateTokens(doc.text);
            if (currentTokens + docTokens > maxTokens && currentBatch.length > 0) {
                batches.push(currentBatch);
                currentBatch = [doc];
                currentTokens = queryTokens + docTokens;
            } else {
                currentBatch.push(doc);
                currentTokens += docTokens;
            }
        }
        if (currentBatch.length > 0) {
            batches.push(currentBatch);
        }

        console.log(`[LightMemo] Split into ${batches.length} batches for reranking.`);

        let allRerankedDocs = [];
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            const docTexts = batch.map(d => d.text);
            
            try {
                const body = {
                    model: this.rerankConfig.model,
                    query: query,
                    documents: docTexts,
                    top_n: docTexts.length
                };

                console.log(`[LightMemo] Reranking batch ${i + 1}/${batches.length} (${docTexts.length} docs).`);
                const response = await axios.post(rerankUrl, body, {
                    headers,
                    timeout: 30000  // 👈 添加超时
                });

                let responseData = response.data;
                if (typeof responseData === 'string') {
                    try {
                        responseData = JSON.parse(responseData);
                    } catch (e) {
                        console.error('[LightMemo] Failed to parse rerank response:', responseData);
                        throw new Error('Invalid JSON response');
                    }
                }

                if (responseData && Array.isArray(responseData.results)) {
                    const rerankedResults = responseData.results;
                    console.log(`[LightMemo] Batch ${i + 1} rerank scores:`,
                        rerankedResults.map(r => r.relevance_score.toFixed(3)).join(', '));
                    
                    const orderedBatch = rerankedResults
                        .map(result => {
                            const originalDoc = batch[result.index];
                            if (!originalDoc) return null;
                            return {
                                ...originalDoc,
                                rerank_score: result.relevance_score
                            };
                        })
                        .filter(Boolean);
                    
                    allRerankedDocs.push(...orderedBatch);
                } else {
                    throw new Error('Invalid response format');
                }
            } catch (error) {
                console.error(`[LightMemo] Rerank failed for batch ${i + 1}:`, error.message);
                if (error.response) {
                    console.error(`[LightMemo] API Error - Status: ${error.response.status}, Data:`,
                        JSON.stringify(error.response.data).slice(0, 200));
                }
                
                // ⚠️ 关键修复：保留原有分数
                const fallbackBatch = batch.map(doc => ({
                    ...doc,
                    rerank_score: doc.hybridScore || doc.vectorScore || doc.bm25Score || 0,
                    rerank_failed: true  // 标记rerank失败
                }));
                allRerankedDocs.push(...fallbackBatch);
            }
        }

        // 👇 修复：安全排序
        allRerankedDocs.sort((a, b) => {
            const scoreA = a.rerank_score ?? 0;
            const scoreB = b.rerank_score ?? 0;
            return scoreB - scoreA;
        });

        const finalDocs = allRerankedDocs.slice(0, originalK);
        console.log(`[LightMemo] Rerank complete. Final scores:`,
            finalDocs.map(d => (d.rerank_score || 0).toFixed(3)).join(', '));
        
        return finalDocs;
    }

    /**
     * 改用jieba分词（保留词组）
     */
    _tokenize(text) {
        if (!text) return [];
        
        // ✅ 使用实例调用 cut 方法
        // 参数说明：
        // - text: 要分词的文本
        // - false: 不使用 HMM（隐藏马尔可夫模型），使用精确模式
        if (!this.jiebaInstance) {
            console.warn('[LightMemo] Jieba not initialized, falling back to simple split.');
            // 降级方案：简单分词
            return text.split(/\s+/)
                .map(w => w.toLowerCase().trim())
                .filter(w => w.length >= 2)
                .filter(w => !this.stopWords.has(w));
        }
        
        const words = this.jiebaInstance.cut(text, false);  // 精确模式
        
        return words
            .map(w => w.toLowerCase().trim())
            .filter(w => w.length >= 2)
            .filter(w => !this.stopWords.has(w))
            .filter(w => w.length > 0);
    }
    /**
     * 从所有相关日记本中收集chunks（带署名过滤）
     * 适配 KnowledgeBaseManager (SQLite)
     */
    async _gatherCandidateChunks(maid, searchAll) {
        const db = this.vectorDBManager.db;
        if (!db) {
            console.error('[LightMemo] Database not initialized in KnowledgeBaseManager.');
            return [];
        }

        const candidates = [];
        
        try {
            // 联表查询：chunks + files
            const sql = `
                SELECT c.id, c.content, f.diary_name, f.path
                FROM chunks c
                JOIN files f ON c.file_id = f.id
            `;
            
            const stmt = db.prepare(sql);
            
            // 流式遍历所有 chunks
            for (const row of stmt.iterate()) {
                const diaryName = row.diary_name;
                
                // 1. 文件夹/日记本过滤
                if (diaryName.startsWith('已整理') || diaryName.endsWith('簇')) continue;
                if (this.excludedFolders.includes(diaryName)) continue;
                
                // 2. 目标日记本过滤 (如果不是搜索全部)
                if (!searchAll && !diaryName.includes(maid)) continue;
                
                const text = row.content || '';
                
                // 3. 署名过滤 (如果不是搜索全部)
                if (!searchAll && !this._checkSignature(text, maid)) continue;
                
                // 4. 分词
                const tokens = this._tokenize(text);
                
                candidates.push({
                    dbName: diaryName,
                    label: row.id, // 使用 chunk.id 作为 label
                    text: text,
                    tokens: tokens,
                    sourceFile: row.path
                });
            }
        } catch (error) {
            console.error('[LightMemo] Error gathering chunks from DB:', error);
        }

        return candidates;
    }

    /**
     * 检查文本中是否包含特定署名
     */
    _checkSignature(text, maid) {
        if (!text || !maid) return false;
        
        // 提取第一行
        const firstLine = text.split('\n')[0].trim();
        
        // 检查第一行是否包含署名
        return firstLine.includes(maid);
    }

    /**
     * 为候选chunks计算向量相似度
     * 适配 KnowledgeBaseManager (SQLite)
     */
    async _scoreByVectorSimilarity(candidates, queryVector) {
        const db = this.vectorDBManager.db;
        if (!db) return [];

        const scored = [];
        const stmt = db.prepare('SELECT vector FROM chunks WHERE id = ?');
        const dim = this.vectorDBManager.config.dimension;

        for (const candidate of candidates) {
            try {
                const row = stmt.get(candidate.label); // label is chunk.id
                if (!row || !row.vector) continue;

                // 转换 BLOB 为 Float32Array
                // 注意：Buffer 是 Node.js 的 Buffer，可以直接作为 ArrayBuffer 使用，但需要注意 offset
                const chunkVector = new Float32Array(row.vector.buffer, row.vector.byteOffset, dim);
                
                const similarity = this._cosineSimilarity(queryVector, chunkVector);
                
                scored.push({
                    ...candidate,
                    vectorScore: similarity
                });
            } catch (error) {
                console.warn(`[LightMemo] Error calculating similarity for chunk ${candidate.label}:`, error.message);
                continue;
            }
        }

        return scored;
    }

    _cosineSimilarity(vecA, vecB) {
        if (!vecA || !vecB || vecA.length !== vecB.length) {
            return 0;
        }
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        if (normA === 0 || normB === 0) {
            return 0;
        }
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    /**
     * 基于语义组扩展查询词
     */
    _expandQueryTokens(queryTokens) {
        if (this.wordToGroupMap.size === 0) {
            return [];
        }

        const expandedTokens = new Set();
        const activatedGroups = new Set();

        for (const token of queryTokens) {
            const groupWords = this.wordToGroupMap.get(token.toLowerCase());
            if (groupWords) {
                const groupKey = groupWords.join(',');
                if (!activatedGroups.has(groupKey)) {
                    activatedGroups.add(groupKey);
                    groupWords.forEach(word => {
                        if (!queryTokens.includes(word)) {
                            expandedTokens.add(word);
                        }
                    });
                }
            }
        }

        return Array.from(expandedTokens);
    }

    async loadSemanticGroups() {
        const semanticGroupsPath = path.join(this.projectBasePath, 'Plugin', 'RAGDiaryPlugin', 'semantic_groups.json');
        try {
            const data = await fs.readFile(semanticGroupsPath, 'utf-8');
            this.semanticGroups = JSON.parse(data);
            this.wordToGroupMap = new Map();
            if (this.semanticGroups && this.semanticGroups.groups) {
                for (const groupName in this.semanticGroups.groups) {
                    const group = this.semanticGroups.groups[groupName];
                    if (group.words && Array.isArray(group.words)) {
                        const lowercasedWords = group.words.map(w => w.toLowerCase());
                        for (const word of lowercasedWords) {
                            this.wordToGroupMap.set(word, lowercasedWords);
                        }
                    }
                }
            }
            console.log(`[LightMemo] Semantic groups loaded successfully. ${this.wordToGroupMap.size} words mapped.`);
        } catch (error) {
            console.warn('[LightMemo] Could not load semantic_groups.json. Proceeding without query expansion.', error.message);
            this.semanticGroups = null;
            this.wordToGroupMap = new Map();
        }
    }
}

module.exports = new LightMemoPlugin();
