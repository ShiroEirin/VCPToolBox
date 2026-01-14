// build_tag_vector_library.js
// 🌟 手动构建全局Tag向量库的脚本

require('dotenv').config();
const TagVectorManager = require('./TagVectorManager.js');
const path = require('path');

/**
 * Embedding API调用函数
 */
async function getEmbeddings(texts) {
    const { default: fetch } = await import('node-fetch');
    
    const apiKey = process.env.API_Key;
    const apiUrl = process.env.API_URL;
    const embeddingModel = process.env.WhitelistEmbeddingModel;

    if (!apiKey || !apiUrl || !embeddingModel) {
        throw new Error('Missing API configuration in .env file');
    }

    console.log(`[Embeddings] Requesting ${texts.length} embeddings...`);

    const response = await fetch(`${apiUrl}/v1/embeddings`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: embeddingModel,
            input: texts
        })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Embedding API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.data.map(item => item.embedding);
}

/**
 * 主函数
 */
async function main() {
    console.log('🚀 Starting Tag Vector Library Builder...\n');

    const DIARY_ROOT_PATH = process.env.KNOWLEDGEBASE_ROOT_PATH || path.join(__dirname, 'dailynote');
    const VECTOR_STORE_PATH = path.join(__dirname, 'VectorStore');

    const tagManager = new TagVectorManager({
        diaryRootPath: DIARY_ROOT_PATH,
        vectorStorePath: VECTOR_STORE_PATH
    });

    try {
        console.log('Initializing Tag Vector Manager...');
        await tagManager.initialize(getEmbeddings);

        const stats = tagManager.getStats();
        console.log('\n✅ Build Complete!\n');
        console.log('Statistics:');
        console.log(`  Total Tags: ${stats.totalTags}`);
        console.log(`  Vectorized Tags: ${stats.vectorizedTags}`);
        console.log(`  Status: ${stats.initialized ? 'Initialized' : 'Not Initialized'}`);

        console.log('\n📊 Top 10 Most Frequent Tags:');
        const allTags = Array.from(tagManager.globalTags.entries())
            .sort((a, b) => b[1].frequency - a[1].frequency)
            .slice(0, 10);

        for (const [tag, data] of allTags) {
            console.log(`  ${tag}: ${data.frequency} times in ${data.diaries.size} diaries`);
        }

    } catch (error) {
        console.error('\n❌ Build Failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await tagManager.shutdown();
        console.log('\n👋 Tag Vector Manager shut down successfully');
    }
}

// 运行
main().catch(console.error);