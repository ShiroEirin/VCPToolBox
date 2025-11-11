
const fs = require('fs').promises;
const path = require('path');
const dotenv = require('dotenv');

// 加载配置 
const configPath = path.join(__dirname, 'config.env');
let config = {};
try {
    const envContent = require('fs').readFileSync(configPath, 'utf-8');
    config = dotenv.parse(envContent);
    log('成功加载 config.env 文件。');
} catch (error) {
    if (error.code === 'ENOENT') {
        log('警告: 未找到 config.env 文件。将尝试使用全局环境变量。');
    } else {
        console.error('加载 config.env 时出错:', error.message);
        process.exit(1); // 对于其他错误，如权限问题，则退出
    }
}

// 从命令行参数获取路径和ID
const [,, directoryPath, analysisId] = process.argv;
const DB_DIR = path.join(__dirname, 'database');
const REPORT_FILE = path.join(DB_DIR, `${analysisId}.md`);

// 需要跳过的目录
const SKIP_DIRS = ['node_modules', '.git', '.env', 'env', '__pycache__', 'dist', 'build', '.next', '.nuxt'];
// 只列出不分析的目录
const LIST_ONLY_DIRS = ['vendor'];
// 只列出不分析的文件扩展名
const LIST_ONLY_EXTENSIONS = ['.json'];
// 需要分析的文件扩展名
const ANALYZE_EXTENSIONS = ['.rs', '.js', '.ts', '.py'];
// 特殊依赖文件（直接返回内容）
const SPECIAL_FILES = ['package.json', 'Cargo.toml', 'requirements.txt'];

// --- 日志函数 ---
function log(message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
}

// --- 递归获取文件树 ---
async function getFileTree(dir, prefix = '', isRoot = true) {
    let tree = '';
    let filesToAnalyze = [];
    
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const isLast = i === entries.length - 1;
            const connector = isLast ? '└── ' : '├── ';
            const childPrefix = prefix + (isLast ? '    ' : '│   ');
            
            if (entry.isDirectory()) {
                // 检查是否需要完全跳过
                if (SKIP_DIRS.includes(entry.name)) {
                    tree += `${prefix}${connector}${entry.name}/ [跳过]\n`;
                    continue;
                }
                
                // 检查是否只列出不分析
                if (LIST_ONLY_DIRS.includes(entry.name)) {
                    tree += `${prefix}${connector}${entry.name}/ [仅列出]\n`;
                    continue;
                }
                
                tree += `${prefix}${connector}${entry.name}/\n`;
                const subPath = path.join(dir, entry.name);
                const subResult = await getFileTree(subPath, childPrefix, false);
                tree += subResult.tree;
                filesToAnalyze.push(...subResult.files);
                
            } else {
                const ext = path.extname(entry.name);
                const fullPath = path.join(dir, entry.name);
                
                // .example 文件只列出
                if (entry.name.endsWith('.example')) {
                    tree += `${prefix}${connector}${entry.name} [示例文件]\n`;
                    continue;
                }
                
                // 特殊依赖文件
                if (SPECIAL_FILES.includes(entry.name)) {
                    tree += `${prefix}${connector}${entry.name} [依赖配置]\n`;
                    filesToAnalyze.push({ path: fullPath, type: 'special' });
                    continue;
                }
                
                // .json 文件只列出
                if (LIST_ONLY_EXTENSIONS.includes(ext)) {
                    tree += `${prefix}${connector}${entry.name} [配置文件]\n`;
                    continue;
                }
                
                // 需要分析的文件
                if (ANALYZE_EXTENSIONS.includes(ext)) {
                    tree += `${prefix}${connector}${entry.name}\n`;
                    filesToAnalyze.push({ path: fullPath, type: 'code' });
                    continue;
                }
                
                // 其他文件
                tree += `${prefix}${connector}${entry.name}\n`;
            }
        }
    } catch (error) {
        tree += `${prefix}[错误: ${error.message}]\n`;
    }
    
    return { tree, files: filesToAnalyze };
}

// --- 调用AI模型 ---
async function callAI(systemPrompt, userPrompt, retries = 3) {
    const modelUrl = config.ProjectAnalystModelUrl || process.env.ProjectAnalystModelUrl;
    const modelKey = config.ProjectAnalystModelKey || process.env.ProjectAnalystModelKey;
    const modelName = config.ProjectAnalystModel || 'gemini-2.5-flash-lite-preview-09-2025-thinking';
    const maxTokens = parseInt(config.ProjectAnalystMaxToken || '80000');
    const maxOutputTokens = parseInt(config.ProjectAnalystMaxOutputToken || '50000');
    
    if (!modelUrl || !modelKey) {
        throw new Error('AI模型配置不完整，请检查 config.env 中的 ProjectAnalystModelUrl 和 ProjectAnalystModelKey');
    }
    
    const requestBody = {
        model: modelName,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        max_tokens: maxOutputTokens
    };
    
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(modelUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${modelKey}`
                },
                body: JSON.stringify(requestBody)
            });
            
            // 429 错误需要特殊处理：暂停更长时间
            if (response.status === 429) {
                const waitTime = 120000; // 2分钟
                log(`遇到 429 错误（请求过多），暂停 ${waitTime/1000} 秒后重试...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue; // 不计入重试次数，直接重试
            }
            
            if (response.status === 500 || response.status === 503) {
                log(`AI调用失败 (${response.status})，第 ${attempt}/${retries} 次重试...`);
                if (attempt < retries) {
                    await new Promise(resolve => setTimeout(resolve, 3000 * attempt)); // 递增等待时间
                    continue;
                }
            }
            
            if (!response.ok) {
                throw new Error(`AI API返回错误: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            return data.choices[0].message.content;
            
        } catch (error) {
            log(`AI调用异常 (第 ${attempt}/${retries} 次): ${error.message}`);
            if (attempt < retries) {
                await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
            } else {
                throw error;
            }
        }
    }
}

// --- 获取项目总结 ---
async function getProjectSummary(fileTree, readmeContent) {
    const systemPrompt = `你是一个专业的项目分析助手。你的任务是根据项目的文件结构树和README文件，快速总结这个项目的主要功能和技术栈。`;
    
    const userPrompt = `请分析以下项目信息，用2-3句话简洁地总结这个项目是做什么的：

文件结构树：
\`\`\`
${fileTree}
\`\`\`

README内容：
${readmeContent}

请直接给出总结，不要有多余的格式。`;
    
    try {
        return await callAI(systemPrompt, userPrompt);
    } catch (error) {
        log(`获取项目总结失败: ${error.message}`);
        return `[无法生成项目总结: ${error.message}]`;
    }
}

// --- 查找README文件（兼容大小写）---
async function findReadmeFile(dir) {
    try {
        const entries = await fs.readdir(dir);
        const readmeVariants = ['README.md', 'readme.md', 'Readme.md', 'README.MD', 'readme.MD'];
        for (const variant of readmeVariants) {
            if (entries.includes(variant)) {
                return path.join(dir, variant);
            }
        }
        return null;
    } catch (error) {
        log(`查找 README 文件时出错: ${error.message}`);
        return null;
    }
}

// --- 分析单个文件 ---
async function analyzeFile(fileInfo, fullTree) {
    const { path: filePath, type } = fileInfo;
    
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        
        // 特殊依赖文件直接返回内容
        if (type === 'special') {
            return `**依赖配置文件内容：**\n\`\`\`\n${content}\n\`\`\``;
        }
        
        // 读取分析提示词
        const promptPath = path.join(__dirname, config.ProjectAnalystModelPrompt || 'ProjectAnalystModelPrompt.txt');
        let systemPrompt;
        try {
            systemPrompt = await fs.readFile(promptPath, 'utf-8');
        } catch (error) {
            systemPrompt = '你是一个专业的代码分析助手。请分析给定的代码文件，总结其主要功能、关键逻辑和重要依赖。';
        }
        
        const userPrompt = `项目整体文件结构：
\`\`\`
${fullTree}
\`\`\`

当前需要分析的文件路径：${filePath}

文件内容：
\`\`\`
${content}
\`\`\`

请分析这个文件的功能和作用。`;
        
        const analysis = await callAI(systemPrompt, userPrompt);
        return analysis;
        
    } catch (error) {
        log(`分析文件 ${filePath} 失败: ${error.message}`);
        return `[分析失败: ${error.message}]`;
    }
}

// --- 主分析流程 ---
async function analyzeProject() {
    // 1. 设置90分钟自毁计时器
    const selfDestructTimeout = setTimeout(async () => {
        log('分析任务超时（超过90分钟），进程即将自动终止');
        try {
            await fs.appendFile(REPORT_FILE, '\n\n---\n**[错误]** 分析任务超时（超过90分钟），进程已自动终止。\n');
        } catch (e) {
            console.error('Failed to write timeout message:', e);
        }
        process.exit(1);
    }, 5400 * 1000); // 90分钟 = 5400秒

    try {
        log(`开始分析项目: ${directoryPath}`);
        log(`分析ID: ${analysisId}`);
        
        // 2. 获取文件树
        log('正在构建文件树...');
        const { tree: fileTree, files: filesToAnalyze } = await getFileTree(directoryPath);
        log(`文件树构建完成，发现 ${filesToAnalyze.length} 个需要分析的文件`);

        // 3. 查找并读取 README.md (兼容大小写)
        const readmePath = await findReadmeFile(directoryPath);
        let readmeContent = '';
        if (readmePath) {
            try {
                readmeContent = await fs.readFile(readmePath, 'utf-8');
                log(`已读取 ${path.basename(readmePath)}`);
            } catch (error) {
                readmeContent = '读取 README 文件失败。';
                log(`读取 README 文件失败: ${error.message}`);
            }
        } else {
            readmeContent = '未找到 README.md 文件。';
            log('未找到 README.md 文件');
        }

        // 4. 获取项目初步总结
        log('正在生成项目总结...');
        const summary = await getProjectSummary(fileTree, readmeContent);
        log('项目总结生成完成');

        // 5. 写入报告抬头
        const header = `# 项目分析报告: ${path.basename(directoryPath)}

**分析ID:** ${analysisId}  
**分析时间:** ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}  
**项目路径:** ${directoryPath}

---

## 📋 项目简介

${summary}

---

## 📁 文件结构树

\`\`\`
${fileTree}
\`\`\`

---

## 📝 文件详细分析

`;
        await fs.writeFile(REPORT_FILE, header);
        log('报告抬头已写入');

        // 6. 批量处理文件分析
        const batchSize = parseInt(config.ProjectAnalystBatch || '5');
        log(`开始分析文件，批次大小: ${batchSize}`);
        
        for (let i = 0; i < filesToAnalyze.length; i += batchSize) {
            const batch = filesToAnalyze.slice(i, i + batchSize);
            log(`处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(filesToAnalyze.length / batchSize)} (${batch.length} 个文件)`);
            
            const analysisPromises = batch.map(file => analyzeFile(file, fileTree));
            const results = await Promise.allSettled(analysisPromises);
            
            for (let j = 0; j < batch.length; j++) {
                const file = batch[j];
                const result = results[j];
                
                let fileAnalysis;
                if (result.status === 'fulfilled') {
                    fileAnalysis = result.value;
                } else {
                    fileAnalysis = `[分析失败: ${result.reason}]`;
                    log(`文件 ${file.path} 分析失败: ${result.reason}`);
                }
                
                const relativePath = path.relative(directoryPath, file.path);
                const analysisSection = `
### 📄 \`${relativePath}\`

${fileAnalysis}

---

`;
                await fs.appendFile(REPORT_FILE, analysisSection);
            }
            
            log(`批次 ${Math.floor(i / batchSize) + 1} 完成`);
        }

        // 7. 写入完成标记
        const footer = `
---

## ✅ 分析完成

**总计分析文件数:** ${filesToAnalyze.length}  
**完成时间:** ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

---
*本报告由 ProjectAnalyst 插件自动生成*
`;
        await fs.appendFile(REPORT_FILE, footer);
        log('所有文件分析完成！');

    } catch (error) {
        log(`致命错误: ${error.message}`);
        const errorMessage = `

---

## ❌ 致命错误

分析过程中发生意外错误：

\`\`\`
${error.message}
${error.stack}
\`\`\`

---
`;
        try {
            await fs.appendFile(REPORT_FILE, errorMessage);
        } catch (writeError) {
            console.error("Failed to write fatal error to report file:", writeError);
        }
    } finally {
        // 清除自毁计时器，正常退出
        clearTimeout(selfDestructTimeout);
        log('委托进程退出');
        process.exit(0);
    }
}

// --- 启动 ---
(async () => {
    if (!directoryPath || !analysisId) {
        console.error('Usage: node AnalysisDelegate.js <directoryPath> <analysisId>');
        process.exit(1);
    }

    await analyzeProject();
})();