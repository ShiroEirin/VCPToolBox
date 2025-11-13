const fs = require('fs').promises;
const fsSync = require('fs'); // 用于同步操作
const path = require('path');
const { spawn } = require('child_process');
const dotenv = require('dotenv');

const DB_DIR = path.join(__dirname, 'database');
const FILE_CACHE_DIR = path.join(__dirname, 'file_cache');

// 加载配置
const configPath = path.join(__dirname, 'config.env');
let config = {};
try {
    const envContent = fsSync.readFileSync(configPath, 'utf-8');
    config = dotenv.parse(envContent);
} catch (error) {
    // 配置文件不存在时使用环境变量
    config = {};
}

// 确保数据库目录存在
async function ensureDbDirectory() {
    try {
        await fs.mkdir(DB_DIR, { recursive: true });
        await fs.mkdir(FILE_CACHE_DIR, { recursive: true });
    } catch (error) {
        console.error('Error creating database directory:', error);
        throw error; // 抛出错误，终止执行
    }
}

// 生成人类可读的时间戳
function getReadableTimestamp() {
    const date = new Date();
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${year}-${month}-${day}.${hours}.${minutes}`;
}

// 启动分析委托进程
function launchDelegate(directoryPath, analysisId, fullAnalyze = false) {
    const delegateScript = path.join(__dirname, 'AnalysisDelegate.js');
    const logFile = path.join(DB_DIR, `${analysisId}.log`);
    
    const out = fsSync.openSync(logFile, 'a');
    const err = fsSync.openSync(logFile, 'a');

    const delegateProcess = spawn('node', [
        delegateScript,
        directoryPath,
        analysisId,
        fullAnalyze ? 'full' : 'quick' // 添加分析模式参数
    ], {
        detached: true,
        stdio: ['ignore', out, err],
        windowsHide: true
    });

    // 允许父进程退出，而子进程继续运行
    delegateProcess.unref();
}

// 需要跳过的目录
const SKIP_DIRS = ['node_modules', '.git', '.env', 'env', '__pycache__', 'dist', 'build', '.next', '.nuxt'];
const LIST_ONLY_DIRS = ['vendor'];

// 递归获取文件树（快速版本，不收集待分析文件）
async function getQuickFileTree(dir, prefix = '', isRoot = true) {
    let tree = '';
    
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const isLast = i === entries.length - 1;
            const connector = isLast ? '└── ' : '├── ';
            const childPrefix = prefix + (isLast ? '    ' : '│   ');
            
            if (entry.isDirectory()) {
                if (SKIP_DIRS.includes(entry.name)) {
                    tree += `${prefix}${connector}${entry.name}/ [跳过]\n`;
                    continue;
                }
                
                if (LIST_ONLY_DIRS.includes(entry.name)) {
                    tree += `${prefix}${connector}${entry.name}/ [仅列出]\n`;
                    continue;
                }
                
                tree += `${prefix}${connector}${entry.name}/\n`;
                const subPath = path.join(dir, entry.name);
                tree += await getQuickFileTree(subPath, childPrefix, false);
                
            } else {
                tree += `${prefix}${connector}${entry.name}\n`;
            }
        }
    } catch (error) {
        tree += `${prefix}[错误: ${error.message}]\n`;
    }
    
    return tree;
}

// 查找README文件
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
        return null;
    }
}

// 调用AI模型（用于快速分析的项目总结）
async function callAI(systemPrompt, userPrompt, retries = 3) {
    const modelUrl = config.ProjectAnalystModelUrl || process.env.ProjectAnalystModelUrl;
    const modelKey = config.ProjectAnalystModelKey || process.env.ProjectAnalystModelKey;
    const modelName = config.ProjectAnalystModel || 'gemini-2.5-flash-lite-preview-09-2025-thinking';
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
            
            if (response.status === 429) {
                const waitTime = 60000; // 1分钟
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            
            if (response.status === 500 || response.status === 503) {
                if (attempt < retries) {
                    await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
                    continue;
                }
            }
            
            if (!response.ok) {
                throw new Error(`AI API返回错误: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            return data.choices[0].message.content;
            
        } catch (error) {
            if (attempt < retries) {
                await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
            } else {
                throw error;
            }
        }
    }
}

// 获取项目总结
async function getProjectSummary(fileTree, readmeContent) {
    const systemPrompt = `你是一位高级软件架构师。你的任务是深入分析项目结构和文档，精准地识别出项目的核心功能和关键实现。你的回答应该简洁、专业，并直指要点。`;
    
    const userPrompt = `请根据以下提供的项目文件结构树和README内容，完成以下任务：

1.  **核心功能总结**: 用一句话总结该项目的主要目标或核心功能。
2.  **关键实现定位**: 识别并列出 2-3 个实现上述核心功能的最关键的文件或类。
3.  **简要原因**: 对每个列出的文件/类，用一句话解释它为什么是核心。

**项目文件结构树:**
\`\`\`
${fileTree}
\`\`\`

**README内容:**
\`\`\`
${readmeContent}
\`\`\`

请按照以下格式输出，不要添加任何额外的解释或客套话：

**核心功能:** [此处填写项目核心功能总结]

**关键实现:**
*   \`[文件/类名1]\`: [选择该文件/类的原因]
*   \`[文件/类名2]\`: [选择该文件/类的原因]
*   \`[文件/类名3]\`: [选择该文件/类的原因]
`;
    
    try {
        return await callAI(systemPrompt, userPrompt);
    } catch (error) {
        return `[无法生成项目总结: ${error.message}]`;
    }
}

// 处理 "AnalyzeProject" 命令
async function handleAnalyzeProject(args) {
    const { directoryPath } = args;
    // 支持 fullAnalyze 和 full 两种参数键（鲁棒性优化）
    const fullAnalyze = args.fullAnalyze === true || args.fullAnalyze === 'true' ||
                        args.full === true || args.full === 'true';
    
    if (!directoryPath || typeof directoryPath !== 'string') {
        return { status: 'error', error: 'Missing or invalid "directoryPath" parameter.' };
    }

    try {
        const stats = await fs.stat(directoryPath);
        if (!stats.isDirectory()) {
            return { status: 'error', error: `The provided path is not a directory: ${directoryPath}` };
        }
    } catch (error) {
        return { status: 'error', error: `Cannot access directoryPath: ${error.message}` };
    }

    const projectName = path.basename(directoryPath);
    
    // 如果是完整分析，启动异步后台任务
    if (fullAnalyze) {
        const timestamp = getReadableTimestamp();
        const analysisId = `${projectName}-${timestamp}`;
        
        // 启动后台分析进程
        launchDelegate(directoryPath, analysisId, true);

        return {
            status: 'success',
            result: `项目 **完整** 分析任务已启动。\n分析ID: ${analysisId}\n你可以稍后使用 QueryAnalysis 命令查询分析报告。`
        };
    }
    
    // 如果是快速分析，同步执行并立即返回结果
    try {
        // 1. 获取文件树
        const fileTree = await getQuickFileTree(directoryPath);
        
        // 2. 查找并读取 README
        const readmePath = await findReadmeFile(directoryPath);
        let readmeContent = '';
        if (readmePath) {
            try {
                readmeContent = await fs.readFile(readmePath, 'utf-8');
            } catch (error) {
                readmeContent = '读取 README 文件失败。';
            }
        } else {
            readmeContent = '未找到 README.md 文件。';
        }
        
        // 3. 调用 AI 生成项目总结
        const summary = await getProjectSummary(fileTree, readmeContent);
        
        // 4. 生成快速报告
        const quickReport = `# 项目快速分析: ${projectName}

**项目路径:** ${directoryPath}
**分析时间:** ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

---

## 📋 项目简介

${summary}

---

## 📁 文件结构树

\`\`\`
${fileTree}
\`\`\`

---

*这是快速分析结果。如需逐文件深入分析，请使用 \`full: true\` 参数启动完整分析任务。*
`;
        
        return {
            status: 'success',
            result: quickReport
        };
        
    } catch (error) {
        return {
            status: 'error',
            error: `快速分析失败: ${error.message}`
        };
    }
}

// 从报告中提取简介和文件树部分
function extractSummaryAndTree(reportContent) {
    // 提取从开头到 "## 📝 文件详细分析" 之前的内容
    const detailSectionStart = reportContent.indexOf('## 📝 文件详细分析');
    if (detailSectionStart === -1) {
        // 如果没有找到详细分析部分，说明可能是快速分析报告，直接返回全部
        return reportContent;
    }
    return reportContent.substring(0, detailSectionStart).trim() + '\n\n---\n\n*提示：这是简化查询结果。使用 `full: true` 参数可查看完整报告。*';
}

// 从报告中搜索特定文件的分析
function searchFileInReport(reportContent, filePath) {
    const lines = reportContent.split('\n');
    const results = [];
    let currentFile = null;
    let currentContent = [];
    let inFileSection = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // 检测文件标题行：### 📄 `文件路径`
        if (line.startsWith('### 📄 `') && line.includes('`')) {
            // 保存上一个文件的内容
            if (currentFile && currentContent.length > 0) {
                results.push({ file: currentFile, content: currentContent.join('\n') });
            }
            
            // 提取新文件路径
            const match = line.match(/### 📄 `(.+?)`/);
            if (match) {
                currentFile = match[1];
                currentContent = [line];
                inFileSection = true;
            }
        } else if (inFileSection) {
            // 检测是否到达下一个文件或结束
            if (line.startsWith('### 📄 `') || line.startsWith('## ✅')) {
                if (currentFile && currentContent.length > 0) {
                    results.push({ file: currentFile, content: currentContent.join('\n') });
                }
                currentFile = null;
                currentContent = [];
                inFileSection = false;
                i--; // 重新处理这一行
            } else {
                currentContent.push(line);
            }
        }
    }
    
    // 保存最后一个文件
    if (currentFile && currentContent.length > 0) {
        results.push({ file: currentFile, content: currentContent.join('\n') });
    }

    // 过滤匹配的文件
    if (filePath) {
        const normalizedSearch = filePath.toLowerCase().replace(/\\/g, '/');
        return results.filter(item =>
            item.file.toLowerCase().replace(/\\/g, '/').includes(normalizedSearch)
        );
    }
    
    return results;
}

// 在报告中搜索关键词
function searchKeywordInReport(reportContent, keyword) {
    const lines = reportContent.split('\n');
    const results = [];
    const contextLines = 3; // 上下文行数

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.toLowerCase().includes(keyword.toLowerCase())) {
            // 获取上下文
            const start = Math.max(0, i - contextLines);
            const end = Math.min(lines.length, i + contextLines + 1);
            const context = lines.slice(start, end).join('\n');
            
            results.push({
                lineNumber: i + 1,
                context: context,
                matchedLine: line
            });
        }
    }

    return results;
}

// 处理 "QueryAnalysis" 命令
async function handleQueryAnalysis(args) {
    // 兼容 analysisId 和 analysisID 两种写法
    const analysisId = args.analysisId || args.analysisID || args.analysis_id;
    if (!analysisId || typeof analysisId !== 'string') {
        return { status: 'error', error: 'Missing or invalid "analysisId" parameter. (Accepts: analysisId, analysisID, or analysis_id)' };
    }

    // 防止路径遍历攻击
    if (analysisId.includes('..') || analysisId.includes('/') || analysisId.includes('\\')) {
        return { status: 'error', error: 'Invalid characters in analysisId.' };
    }

    const reportPath = path.join(DB_DIR, `${analysisId}.md`);

    try {
        const reportContent = await fs.readFile(reportPath, 'utf-8');
        
        // 获取查询参数
        const full = args.full === true || args.full === 'true';
        const filePath = args.filePath || args.file_path || args.file;
        const keyword = args.keyword || args.search;

        // 1. 如果指定了文件路径，进行文件检索
        if (filePath) {
            const fileResults = searchFileInReport(reportContent, filePath);
            if (fileResults.length === 0) {
                return {
                    status: 'success',
                    result: `未在分析报告中找到匹配 "${filePath}" 的文件。\n\n提示：请检查文件路径是否正确，或该文件可能未被分析。`
                };
            }
            
            let resultText = `# 文件检索结果\n\n**分析ID:** ${analysisId}\n**搜索路径:** ${filePath}\n**匹配文件数:** ${fileResults.length}\n\n---\n\n`;
            fileResults.forEach((item, index) => {
                resultText += `## 匹配 ${index + 1}: \`${item.file}\`\n\n${item.content}\n\n---\n\n`;
            });
            
            return { status: 'success', result: resultText };
        }

        // 2. 如果指定了关键词，进行关键词检索
        if (keyword) {
            const keywordResults = searchKeywordInReport(reportContent, keyword);
            if (keywordResults.length === 0) {
                return {
                    status: 'success',
                    result: `未在分析报告中找到关键词 "${keyword}"。`
                };
            }
            
            let resultText = `# 关键词检索结果\n\n**分析ID:** ${analysisId}\n**搜索关键词:** ${keyword}\n**匹配次数:** ${keywordResults.length}\n\n---\n\n`;
            keywordResults.slice(0, 20).forEach((item, index) => { // 限制最多返回20个结果
                resultText += `## 匹配 ${index + 1} (行 ${item.lineNumber})\n\n\`\`\`\n${item.context}\n\`\`\`\n\n---\n\n`;
            });
            
            if (keywordResults.length > 20) {
                resultText += `\n*注意：共找到 ${keywordResults.length} 个匹配，仅显示前 20 个结果。*\n`;
            }
            
            return { status: 'success', result: resultText };
        }

        // 3. 如果指定了 full，返回完整报告
        if (full) {
            return { status: 'success', result: reportContent };
        }

        // 4. 默认：返回简介和文件树
        const summary = extractSummaryAndTree(reportContent);
        return { status: 'success', result: summary };

    } catch (error) {
        if (error.code === 'ENOENT') {
            return { status: 'error', error: `Analysis report with ID "${analysisId}" not found. It might still be in progress or the ID is incorrect.` };
        }
        return { status: 'error', error: `Error reading analysis report: ${error.message}` };
    }
}


// 处理 "QueryProgress" 命令
async function handleQueryProgress(args) {
    const analysisId = args.analysisId || args.analysisID || args.analysis_id;
    if (!analysisId || typeof analysisId !== 'string') {
        return { status: 'error', error: 'Missing or invalid "analysisId" parameter.' };
    }

    if (analysisId.includes('..') || analysisId.includes('/') || analysisId.includes('\\')) {
        return { status: 'error', error: 'Invalid characters in analysisId.' };
    }

    const logPath = path.join(DB_DIR, `${analysisId}.log`);

    try {
        const logContent = await fs.readFile(logPath, 'utf-8');
        const logLines = logContent.trim().split('\n');
        
        // 检查分析是否完成
        const isComplete = logLines.some(line => line.includes('所有文件分析完成！') || line.includes('快速分析完成') || line.includes('致命错误'));
        
        // 提取最后 15 行日志作为当前状态
        const recentLogs = logLines.slice(-15).join('\n');
        
        const status = isComplete ? '已完成' : '进行中';
        
        return {
            status: 'success',
            result: `# 分析任务进度\n\n**分析ID:** ${analysisId}\n**状态:** ${status}\n\n---\n\n**最近日志:**\n\`\`\`\n${recentLogs}\n\`\`\``
        };
        
    } catch (error) {
        if (error.code === 'ENOENT') {
            return { status: 'error', error: `Analysis with ID "${analysisId}" not found. The task may not have started yet.` };
        }
        return { status: 'error', error: `Error reading progress log: ${error.message}` };
    }
}

// 主函数
async function main() {
    try {
        await ensureDbDirectory();

        const input = await new Promise((resolve) => {
            let data = '';
            process.stdin.on('data', chunk => data += chunk);
            process.stdin.on('end', () => resolve(data));
        });

        if (!input) {
            console.log(JSON.stringify({ status: 'error', error: 'No input received from stdin.' }));
            return;
        }

        const request = JSON.parse(input);
        const { command, ...args } = request;

        let response;
        switch (command) {
            case 'AnalyzeProject':
                response = await handleAnalyzeProject(args);
                break;
            case 'QueryAnalysis':
                response = await handleQueryAnalysis(args);
                break;
            case 'QueryProgress':
                response = await handleQueryProgress(args);
                break;
            default:
                response = { status: 'error', error: `Unknown command: ${command}` };
                break;
        }
        console.log(JSON.stringify(response));

    } catch (error) {
        console.log(JSON.stringify({ status: 'error', error: `An unexpected error occurred: ${error.message}` }));
        process.exit(1);
    }
}

main();