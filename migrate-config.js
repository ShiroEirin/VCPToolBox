#!/usr/bin/env node
/**
 * VCP ToolBox 配置迁移脚本
 * 用于从旧版配置安全迁移到新版配置（知识库V2）
 *
 * 功能：
 * - 保留本地真实密钥和个人信息
 * - 添加新版配置项
 * - 删除废弃的旧配置
 * - 生成详细迁移报告
 */

const fs = require('fs');
const path = require('path');

// 配置文件路径
const CONFIG_DIR = __dirname;
const LOCAL_CONFIG = path.join(CONFIG_DIR, 'config.env');
const EXAMPLE_CONFIG = path.join(CONFIG_DIR, 'config.env.example');
const OUTPUT_CONFIG = path.join(CONFIG_DIR, 'config.env.new');
const MIGRATION_LOG = path.join(CONFIG_DIR, 'migration-report.txt');

// 需要删除的旧配置（RAG数据库配置已废弃）
const DEPRECATED_KEYS = [
    'VECTORDB_CHANGE_THRESHOLD',
    'VECTORDB_MAX_MEMORY_MB',
    'VECTORDB_CACHE_SIZE',
    'VECTORDB_CACHE_TTL_MS',
    'VECTORDB_RETRY_ATTEMPTS',
    'VECTORDB_RETRY_BASE_DELAY_MS',
    'VECTORDB_RETRY_MAX_DELAY_MS',
    'VECTORDB_PREWARM_COUNT',
    'VECTORDB_EF_SEARCH',
    'VECTORDB_BATCH_SIZE'
];

// 必须保留本地值的配置（密钥和个人信息）
const PRESERVE_LOCAL_KEYS = [
    'API_Key',
    'API_URL',
    'Key',
    'Image_Key',
    'File_Key',
    'VCP_Key',
    'AdminPassword',
    'WeatherKey',
    'WeatherUrl',
    'TavilyKey',
    'SILICONFLOW_API_KEY',
    'BILIBILI_COOKIE',
    'VarCity',
    'VarUser',
    'VarUserInfo',
    'VarHome',
    'VarVchatPath',
    'VarHttpUrl',
    'VarDdnsUrl'
];

// 特殊处理的配置项
const SPECIAL_HANDLING = {
    'VarDivRender': 'value_comparison', // 对比值的差异
    'WhitelistEmbeddingModel': 'model_upgrade', // 模型升级提示
    'SarModel3': 'merge_models' // 合并模型列表
};

/**
 * 解析 .env 文件，保留注释和结构
 */
function parseEnvFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const parsed = {
        sections: [], // 结构化的配置段
        keyValues: {}, // 键值对映射
        comments: {}, // 每个键对应的注释
        lineMap: {} // 键对应的行号
    };

    let currentSection = { title: '', lines: [], startLine: 0 };
    let lastComment = [];
    let lineNumber = 0;

    lines.forEach((line, idx) => {
        lineNumber = idx + 1;
        const trimmed = line.trim();

        // 段落标题（注释块）
        if (trimmed.startsWith('#')) {
            if (trimmed.includes('---')) {
                // 新段落开始
                if (currentSection.lines.length > 0) {
                    parsed.sections.push(currentSection);
                }
                currentSection = { title: '', lines: [], startLine: lineNumber };
            }
            currentSection.lines.push(line);
            lastComment.push(line);
        }
        // 空行
        else if (trimmed === '') {
            currentSection.lines.push(line);
            if (lastComment.length > 0) {
                lastComment = [];
            }
        }
        // 键值对
        else if (trimmed.includes('=')) {
            const [key, ...valueParts] = trimmed.split('=');
            const cleanKey = key.trim();
            const value = valueParts.join('='); // 处理值中可能包含 = 的情况

            parsed.keyValues[cleanKey] = value;
            parsed.lineMap[cleanKey] = lineNumber;
            if (lastComment.length > 0) {
                parsed.comments[cleanKey] = [...lastComment];
                lastComment = [];
            }
            currentSection.lines.push(line);
        }
        // 其他行
        else {
            currentSection.lines.push(line);
        }
    });

    // 添加最后一个段落
    if (currentSection.lines.length > 0) {
        parsed.sections.push(currentSection);
    }

    return parsed;
}

/**
 * 生成迁移报告
 */
function generateReport(report) {
    const timestamp = new Date().toLocaleString('zh-CN');
    let reportContent = `
================================================================================
VCP ToolBox 配置迁移报告
================================================================================
生成时间: ${timestamp}
源文件: config.env
目标文件: config.env.new
参考文件: config.env.example

================================================================================
1. 迁移统计
================================================================================
保留的配置项: ${report.preserved.length}
新增的配置项: ${report.added.length}
删除的废弃配置: ${report.deprecated.length}
需要手动检查的项: ${report.warnings.length}

================================================================================
2. 保留的本地配置（含真实值）
================================================================================
`;

    report.preserved.forEach(item => {
        const valuePreview = item.value.length > 50
            ? item.value.substring(0, 50) + '...'
            : item.value;
        reportContent += `✓ ${item.key} = ${valuePreview}\n`;
    });

    reportContent += `
================================================================================
3. 新增的配置项（来自 config.env.example）
================================================================================
`;

    report.added.forEach(item => {
        reportContent += `+ ${item.key} = ${item.value}\n`;
        if (item.comment) {
            reportContent += `  说明: ${item.comment}\n`;
        }
    });

    reportContent += `
================================================================================
4. 删除的废弃配置（旧版RAG数据库）
================================================================================
`;

    report.deprecated.forEach(item => {
        reportContent += `- ${item.key} = ${item.value} [已废弃]\n`;
    });

    reportContent += `
================================================================================
5. ⚠️ 需要手动检查的配置项
================================================================================
`;

    if (report.warnings.length === 0) {
        reportContent += `[无需手动检查] 所有配置项已自动处理\n`;
    } else {
        report.warnings.forEach(warning => {
            reportContent += `⚠️ ${warning.key}\n`;
            reportContent += `   原因: ${warning.reason}\n`;
            reportContent += `   本地值: ${warning.localValue}\n`;
            reportContent += `   示例值: ${warning.exampleValue}\n`;
            reportContent += `   建议: ${warning.suggestion}\n\n`;
        });
    }

    reportContent += `
================================================================================
6. 重要升级说明
================================================================================

【知识库系统 V2 升级】
本次迁移已将旧版 RAG 数据库配置替换为新版知识库系统（Powered by Vexus-Lite）。

关键变更：
1. 删除了 10 个旧版 VECTORDB_* 配置参数
2. 新增了 21 个知识库 V2 配置参数
3. 新增文件监听和批处理机制
4. 新增 Tag 过滤和增强系统

必须手动配置的参数：
- VECTORDB_DIMENSION: 必须与你使用的 embedding 模型匹配！
  * gemini-embedding-exp-03-07 -> 3072
  * text-embedding-3-small -> 1536
  * Qwen/Qwen3-Embedding-8B -> 根据模型文档确认

- WhitelistEmbeddingModel: 建议更新到新版模型
  * 当前本地: Qwen/Qwen3-Embedding-8B
  * 示例推荐: gemini-embedding-exp-03-07

================================================================================
7. 下一步操作
================================================================================

1. 检查生成的 config.env.new 文件
2. 根据本报告的"需要手动检查"部分进行调整
3. 确认 VECTORDB_DIMENSION 与你的 embedding 模型匹配
4. 测试无误后：
   cp config.env config.env.old
   mv config.env.new config.env
5. 重启 VCP 服务

================================================================================
`;

    fs.writeFileSync(MIGRATION_LOG, reportContent, 'utf-8');
    console.log(`\n✅ 迁移报告已生成: ${MIGRATION_LOG}`);
}

/**
 * 执行迁移
 */
function migrate() {
    console.log('🚀 开始配置迁移...\n');

    // 检查文件存在性
    if (!fs.existsSync(LOCAL_CONFIG)) {
        console.error(`❌ 错误: 找不到本地配置文件 ${LOCAL_CONFIG}`);
        process.exit(1);
    }

    if (!fs.existsSync(EXAMPLE_CONFIG)) {
        console.error(`❌ 错误: 找不到示例配置文件 ${EXAMPLE_CONFIG}`);
        process.exit(1);
    }

    console.log('📖 正在解析配置文件...');
    const localParsed = parseEnvFile(LOCAL_CONFIG);
    const exampleParsed = parseEnvFile(EXAMPLE_CONFIG);

    console.log(`   本地配置: ${Object.keys(localParsed.keyValues).length} 个配置项`);
    console.log(`   示例配置: ${Object.keys(exampleParsed.keyValues).length} 个配置项\n`);

    // 迁移报告
    const report = {
        preserved: [],
        added: [],
        deprecated: [],
        warnings: []
    };

    // 合并后的配置
    const mergedConfig = {};

    // 第一步：保留本地的真实值
    console.log('🔒 保留本地真实配置...');
    PRESERVE_LOCAL_KEYS.forEach(key => {
        if (localParsed.keyValues.hasOwnProperty(key)) {
            mergedConfig[key] = localParsed.keyValues[key];
            report.preserved.push({ key, value: localParsed.keyValues[key] });
        }
    });

    // 第二步：从示例配置添加新配置项
    console.log('➕ 添加新配置项...');
    Object.keys(exampleParsed.keyValues).forEach(key => {
        // 跳过已保留的配置
        if (mergedConfig.hasOwnProperty(key)) {
            return;
        }

        // 如果本地有这个配置，优先使用本地值
        if (localParsed.keyValues.hasOwnProperty(key) && !DEPRECATED_KEYS.includes(key)) {
            mergedConfig[key] = localParsed.keyValues[key];

            // 检查是否需要警告
            if (SPECIAL_HANDLING[key]) {
                const localValue = localParsed.keyValues[key];
                const exampleValue = exampleParsed.keyValues[key];

                if (localValue !== exampleValue) {
                    let reason = '';
                    let suggestion = '';

                    switch (SPECIAL_HANDLING[key]) {
                        case 'value_comparison':
                            reason = '本地值与示例值不同，可能是内联内容 vs 文件引用';
                            suggestion = '检查是否需要将内联内容提取到独立文件';
                            break;
                        case 'model_upgrade':
                            reason = '使用的 embedding 模型不同';
                            suggestion = '确认 VECTORDB_DIMENSION 与模型匹配，考虑升级到新版模型';
                            break;
                        case 'merge_models':
                            reason = '模型列表有差异';
                            suggestion = '根据需要合并本地和示例的模型列表';
                            break;
                    }

                    report.warnings.push({
                        key,
                        reason,
                        localValue: localValue.substring(0, 100),
                        exampleValue: exampleValue.substring(0, 100),
                        suggestion
                    });
                }
            }
        } else {
            // 使用示例配置的默认值
            mergedConfig[key] = exampleParsed.keyValues[key];

            // 获取注释
            const comment = exampleParsed.comments[key]
                ? exampleParsed.comments[key].join('\n').replace(/^#\s*/gm, '').trim()
                : '';

            report.added.push({ key, value: exampleParsed.keyValues[key], comment });
        }
    });

    // 第三步：删除废弃配置
    console.log('🗑️  删除废弃配置...');
    DEPRECATED_KEYS.forEach(key => {
        if (localParsed.keyValues.hasOwnProperty(key)) {
            report.deprecated.push({ key, value: localParsed.keyValues[key] });
        }
    });

    // 第四步：生成新配置文件（保留示例的结构和注释）
    console.log('📝 生成新配置文件...');
    let outputContent = '';

    exampleParsed.sections.forEach(section => {
        section.lines.forEach(line => {
            const trimmed = line.trim();

            // 注释和空行直接保留
            if (trimmed.startsWith('#') || trimmed === '') {
                outputContent += line + '\n';
            }
            // 键值对：使用合并后的值
            else if (trimmed.includes('=')) {
                const key = trimmed.split('=')[0].trim();

                // 跳过废弃的配置
                if (DEPRECATED_KEYS.includes(key)) {
                    return;
                }

                // 使用合并后的值
                if (mergedConfig.hasOwnProperty(key)) {
                    outputContent += `${key}=${mergedConfig[key]}\n`;
                } else {
                    // 保留原始行（理论上不应该到这里）
                    outputContent += line + '\n';
                }
            }
            // 其他行保留
            else {
                outputContent += line + '\n';
            }
        });
    });

    // 写入新配置文件
    fs.writeFileSync(OUTPUT_CONFIG, outputContent, 'utf-8');
    console.log(`\n✅ 新配置已生成: ${OUTPUT_CONFIG}\n`);

    // 生成迁移报告
    console.log('📊 生成迁移报告...');
    generateReport(report);

    // 打印统计信息
    console.log('\n📈 迁移统计:');
    console.log(`   ✓ 保留配置: ${report.preserved.length} 项`);
    console.log(`   + 新增配置: ${report.added.length} 项`);
    console.log(`   - 删除配置: ${report.deprecated.length} 项`);
    console.log(`   ⚠️  需检查: ${report.warnings.length} 项`);

    console.log('\n✨ 迁移完成！请查看 migration-report.txt 了解详情。\n');
    console.log('⚠️  下一步操作:');
    console.log('   1. 检查 config.env.new');
    console.log('   2. 阅读 migration-report.txt');
    console.log('   3. 确认 VECTORDB_DIMENSION 与 embedding 模型匹配');
    console.log('   4. 执行: cp config.env config.env.old && mv config.env.new config.env');
    console.log('   5. 重启 VCP 服务\n');
}

// 执行迁移
try {
    migrate();
} catch (error) {
    console.error(`\n❌ 迁移失败: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
}
