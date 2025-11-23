// check_vectordb_status.js - 诊断VectorDB状态
const VectorDBStorage = require('./VectorDBStorage.js');
const path = require('path');

async function checkStatus() {
    const VECTOR_STORE_PATH = path.join(__dirname, 'VectorStore');
    const storage = new VectorDBStorage(VECTOR_STORE_PATH);
    
    try {
        await storage.initialize();
        
        console.log('='.repeat(60));
        console.log('VectorDB 状态检查');
        console.log('='.repeat(60));
        
        // 1. 数据库统计
        const stats = storage.getStats();
        console.log('\n📊 数据库统计:');
        console.log(`  日记本数量: ${stats.diaryCount}`);
        console.log(`  文本块数量: ${stats.chunkCount}`);
        console.log(`  文件记录数: ${stats.fileCount}`);
        console.log(`  数据库大小: ${(stats.dbSize / 1024 / 1024).toFixed(2)} MB`);
        
        // 2. 所有日记本
        const diaries = storage.getAllDiaryNames();
        console.log(`\n📚 所有日记本 (${diaries.length}个):`);
        diaries.forEach(name => console.log(`  - ${name}`));
        
        // 3. Nova的状态
        console.log('\n🔍 Nova 详细状态:');
        const novaFileHashes = storage.getFileHashes('Nova');
        const novaChunkMap = storage.getChunkMap('Nova');
        console.log(`  文件数量: ${Object.keys(novaFileHashes).length}`);
        console.log(`  文本块数量: ${Object.keys(novaChunkMap).length}`);
        
        if (Object.keys(novaFileHashes).length > 0) {
            console.log('  文件列表:');
            for (const [filename, hash] of Object.entries(novaFileHashes)) {
                console.log(`    - ${filename}: ${hash.substring(0, 8)}...`);
            }
        }
        
        // 4. 失败重建记录
        const failedRebuilds = storage.loadFailedRebuilds();
        console.log(`\n⚠️  失败重建记录 (${failedRebuilds.size}个):`);
        for (const [diaryName, info] of failedRebuilds.entries()) {
            console.log(`  - ${diaryName}:`);
            console.log(`    失败次数: ${info.count}`);
            console.log(`    最后错误: ${info.lastError}`);
            if (info.pauseUntil && Date.now() < info.pauseUntil) {
                const remaining = Math.ceil((info.pauseUntil - Date.now()) / 1000 / 60);
                console.log(`    ⏸️  暂停中 (剩余 ${remaining} 分钟)`);
            }
        }
        
        // 5. 使用统计
        const usageStats = storage.loadUsageStats();
        console.log(`\n📈 使用统计 (前10个):`);
        const sorted = Object.entries(usageStats)
            .sort(([,a], [,b]) => b.frequency - a.frequency)
            .slice(0, 10);
        sorted.forEach(([name, stats]) => {
            const lastAccessed = new Date(stats.lastAccessed).toLocaleString('zh-CN');
            console.log(`  - ${name}: ${stats.frequency}次 (最后访问: ${lastAccessed})`);
        });
        
        console.log('\n' + '='.repeat(60));
        
        storage.close();
    } catch (error) {
        console.error('检查失败:', error);
        storage.close();
        process.exit(1);
    }
}

checkStatus();