const fs = require('fs').promises;
const fsSync = require('fs'); // 用于同步操作
const path = require('path');
const { spawn } = require('child_process');

const DB_DIR = path.join(__dirname, 'database');

// 确保数据库目录存在
async function ensureDbDirectory() {
    try {
        await fs.mkdir(DB_DIR, { recursive: true });
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
function launchDelegate(directoryPath, analysisId) {
    const delegateScript = path.join(__dirname, 'AnalysisDelegate.js');
    const logFile = path.join(DB_DIR, `${analysisId}.log`);
    
    const out = fsSync.openSync(logFile, 'a');
    const err = fsSync.openSync(logFile, 'a');

    const delegateProcess = spawn('node', [delegateScript, directoryPath, analysisId], {
        detached: true,
        stdio: ['ignore', out, err],
        windowsHide: true
    });

    // 允许父进程退出，而子进程继续运行
    delegateProcess.unref();
}

// 处理 "AnalyzeProject" 命令
async function handleAnalyzeProject(args) {
    const { directoryPath } = args;
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
    const timestamp = getReadableTimestamp();
    const analysisId = `${projectName}-${timestamp}`;
    
    // 启动后台分析进程
    launchDelegate(directoryPath, analysisId);

    return {
        status: 'success',
        result: `项目分析任务已启动。\n分析ID: ${analysisId}\n你可以稍后使用 QueryAnalysis 命令查询分析报告。`
    };
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
        return { status: 'success', result: reportContent };
    } catch (error) {
        if (error.code === 'ENOENT') {
            return { status: 'error', error: `Analysis report with ID "${analysisId}" not found. It might still be in progress or the ID is incorrect.` };
        }
        return { status: 'error', error: `Error reading analysis report: ${error.message}` };
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