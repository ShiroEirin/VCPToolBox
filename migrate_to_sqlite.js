// migrate_to_sqlite.js
// 数据迁移工具：将现有的JSON数据迁移到SQLite数据库

const fs = require('fs').promises;
const path = require('path');
const VectorDBStorage = require('./VectorDBStorage.js');

const VECTOR_STORE_PATH = path.join(__dirname, 'VectorStore');
const MANIFEST_PATH = path.join(VECTOR_STORE_PATH, 'manifest.json');
const USAGE_STATS_PATH = path.join(VECTOR_STORE_PATH, 'usage_stats.json');
const DIARY_NAME_VECTOR_CACHE_PATH = path.join(VECTOR_STORE_PATH, 'diary_name_vectors.json');
const FAILED_REBUILDS_PATH = path.join(VECTOR_STORE_PATH, 'failed_rebuilds.json');

/**
 * 数据迁移主函数
 */
async function migrate() {
    console.log('='.repeat(60));
    console.log('开始数据迁移：JSON → SQLite');
    console.log('='.repeat(60));
    
    try {
        // 初始化SQLite存储
        const storage = new VectorDBStorage(VECTOR_STORE_PATH);
        await storage.initialize();
        console.log('✓ SQLite数据库初始化完成\n');
        
        // 1. 迁移manifest数据（文件哈希）
        await migrateManifest(storage);
        
        // 2. 迁移chunkMap数据
        await migrateChunkMaps(storage);
        
        // 3. 迁移使用统计
        await migrateUsageStats(storage);
        
        // 4. 迁移日记本名称向量
        await migrateDiaryNameVectors(storage);
        
        // 5. 迁移失败重建记录
        await migrateFailedRebuilds(storage);
        
        // 6. 验证迁移结果
        await verifyMigration(storage);
        
        // 7. 备份旧文件
        await backupOldFiles();
        
        storage.close();
        
        console.log('\n' + '='.repeat(60));
        console.log('✓ 数据迁移完成！');
        console.log('='.repeat(60));
        console.log('\n建议：');
        console.log('1. 检查 VectorStore/vectordb.sqlite 文件');
        console.log('2. 旧的JSON文件已备份到 VectorStore/backup_json/');
        console.log('3. 确认无误后可以删除备份文件');
        
    } catch (error) {
        console.error('\n❌ 迁移失败:', error);
        process.exit(1);
    }
}

/**
 * 迁移manifest数据
 */
async function migrateManifest(storage) {
    console.log('[1/5] 迁移manifest数据（文件哈希）...');
    
    try {
        const data = await fs.readFile(MANIFEST_PATH, 'utf-8');
        const manifest = JSON.parse(data);
        
        let count = 0;
        for (const [diaryName, fileHashes] of Object.entries(manifest)) {
            if (Object.keys(fileHashes).length > 0) {
                storage.updateFileHashes(diaryName, fileHashes);
                count++;
            }
        }
        
        console.log(`  ✓ 已迁移 ${count} 个日记本的文件哈希记录\n`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('  ⚠ manifest.json 不存在，跳过\n');
        } else {
            throw error;
        }
    }
}

/**
 * 迁移chunkMap数据
 */
async function migrateChunkMaps(storage) {
    console.log('[2/5] 迁移chunkMap数据...');
    
    try {
        const files = await fs.readdir(VECTOR_STORE_PATH);
        const mapFiles = files.filter(f => f.endsWith('_map.json'));
        
        let totalChunks = 0;
        for (const mapFile of mapFiles) {
            try {
                const mapPath = path.join(VECTOR_STORE_PATH, mapFile);
                const data = await fs.readFile(mapPath, 'utf-8');
                const chunkMap = JSON.parse(data);
                
                // 从文件名解析日记本名称
                const base64Name = mapFile.replace('_map.json', '');
                const diaryName = Buffer.from(base64Name, 'base64url').toString('utf-8');
                
                // 验证数据有效性
                const validChunkMap = {};
                let invalidCount = 0;
                
                for (const [label, data] of Object.entries(chunkMap)) {
                    if (data && data.chunkHash && data.text && data.sourceFile) {
                        validChunkMap[label] = data;
                    } else {
                        invalidCount++;
                    }
                }
                
                if (Object.keys(validChunkMap).length > 0) {
                    storage.saveChunks(diaryName, validChunkMap);
                    totalChunks += Object.keys(validChunkMap).length;
                    console.log(`  ✓ ${diaryName}: ${Object.keys(validChunkMap).length} chunks${invalidCount > 0 ? ` (跳过${invalidCount}个无效)` : ''}`);
                }
            } catch (e) {
                console.log(`  ⚠ 跳过损坏的文件: ${mapFile}`);
            }
        }
        
        console.log(`  ✓ 共迁移 ${totalChunks} 个文本块\n`);
    } catch (error) {
        console.log('  ⚠ 未找到chunkMap文件，跳过\n');
    }
}

/**
 * 迁移使用统计
 */
async function migrateUsageStats(storage) {
    console.log('[3/5] 迁移使用统计...');
    
    try {
        const data = await fs.readFile(USAGE_STATS_PATH, 'utf-8');
        const usageStats = JSON.parse(data);
        
        // 转换为Map格式
        const statsMap = new Map();
        for (const [diaryName, stats] of Object.entries(usageStats)) {
            statsMap.set(diaryName, {
                frequency: stats.frequency || 0,
                lastAccessed: stats.lastAccessed || Date.now()
            });
        }
        
        if (statsMap.size > 0) {
            storage.updateUsageStats(statsMap);
            console.log(`  ✓ 已迁移 ${statsMap.size} 条使用统计记录\n`);
        } else {
            console.log('  ⚠ 使用统计为空，跳过\n');
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('  ⚠ usage_stats.json 不存在，跳过\n');
        } else {
            throw error;
        }
    }
}

/**
 * 迁移日记本名称向量
 */
async function migrateDiaryNameVectors(storage) {
    console.log('[4/5] 迁移日记本名称向量...');
    
    try {
        const data = await fs.readFile(DIARY_NAME_VECTOR_CACHE_PATH, 'utf-8');
        const entries = JSON.parse(data);
        const vectorMap = new Map(entries);
        
        if (vectorMap.size > 0) {
            storage.saveDiaryNameVectors(vectorMap);
            console.log(`  ✓ 已迁移 ${vectorMap.size} 个日记本名称向量\n`);
        } else {
            console.log('  ⚠ 日记本名称向量为空，跳过\n');
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('  ⚠ diary_name_vectors.json 不存在，跳过\n');
        } else {
            throw error;
        }
    }
}

/**
 * 迁移失败重建记录
 */
async function migrateFailedRebuilds(storage) {
    console.log('[5/5] 迁移失败重建记录...');
    
    try {
        const data = await fs.readFile(FAILED_REBUILDS_PATH, 'utf-8');
        const entries = JSON.parse(data);
        
        let count = 0;
        for (const [diaryName, record] of entries) {
            // 直接写入数据库
            const stmt = storage.db.prepare(`
                INSERT OR REPLACE INTO failed_rebuilds 
                (diary_name, count, first_attempt, last_attempt, last_error, pause_until)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            stmt.run(
                diaryName,
                record.count || 0,
                record.firstAttempt || Date.now(),
                record.lastAttempt || Date.now(),
                record.lastError || '',
                record.pauseUntil || null
            );
            count++;
        }
        
        if (count > 0) {
            console.log(`  ✓ 已迁移 ${count} 条失败重建记录\n`);
        } else {
            console.log('  ⚠ 失败重建记录为空，跳过\n');
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('  ⚠ failed_rebuilds.json 不存在，跳过\n');
        } else {
            throw error;
        }
    }
}

/**
 * 验证迁移结果
 */
async function verifyMigration(storage) {
    console.log('验证迁移结果...');
    
    const stats = storage.getStats();
    console.log(`  数据库统计:`);
    console.log(`    - 日记本数量: ${stats.diaryCount}`);
    console.log(`    - 文本块数量: ${stats.chunkCount}`);
    console.log(`    - 文件记录数: ${stats.fileCount}`);
    console.log(`    - 数据库大小: ${(stats.dbSize / 1024 / 1024).toFixed(2)} MB`);
    
    // 验证一致性
    const diaryNames = storage.getAllDiaryNames();
    console.log(`  ✓ 成功加载 ${diaryNames.length} 个日记本名称\n`);
}

/**
 * 备份旧的JSON文件
 */
async function backupOldFiles() {
    console.log('备份旧的JSON文件...');
    
    const backupDir = path.join(VECTOR_STORE_PATH, 'backup_json');
    await fs.mkdir(backupDir, { recursive: true });
    
    const filesToBackup = [
        'manifest.json',
        'usage_stats.json',
        'diary_name_vectors.json',
        'failed_rebuilds.json'
    ];
    
    let backedUp = 0;
    for (const file of filesToBackup) {
        const srcPath = path.join(VECTOR_STORE_PATH, file);
        const destPath = path.join(backupDir, file);
        
        try {
            await fs.copyFile(srcPath, destPath);
            backedUp++;
        } catch (e) {
            // 文件不存在，跳过
        }
    }
    
    // 备份所有 *_map.json 文件
    try {
        const files = await fs.readdir(VECTOR_STORE_PATH);
        const mapFiles = files.filter(f => f.endsWith('_map.json'));
        
        for (const mapFile of mapFiles) {
            const srcPath = path.join(VECTOR_STORE_PATH, mapFile);
            const destPath = path.join(backupDir, mapFile);
            try {
                await fs.copyFile(srcPath, destPath);
                backedUp++;
            } catch (e) {
                // 跳过
            }
        }
    } catch (e) {
        // 跳过
    }
    
    console.log(`  ✓ 已备份 ${backedUp} 个文件到 backup_json/\n`);
}

/**
 * 清理旧文件（可选，需要用户确认）
 */
async function cleanupOldFiles() {
    console.log('\n⚠️  清理旧文件...');
    console.log('此操作将删除所有JSON文件，请确认已备份！');
    
    // 这里可以添加交互式确认逻辑
    // 或者保留此函数供用户手动调用
}

// 运行迁移
if (require.main === module) {
    migrate().catch(error => {
        console.error('迁移过程出错:', error);
        process.exit(1);
    });
}

module.exports = { migrate };