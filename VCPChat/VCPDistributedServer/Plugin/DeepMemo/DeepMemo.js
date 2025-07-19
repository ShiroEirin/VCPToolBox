const fs = require('fs').promises;
const path = require('path');
const dotenv = require('dotenv');

// --- 主逻辑 ---
async function main() {
    try {
        const input = await readStdin();
        const args = parseToolArgs(input);

        // 1. 加载配置
        const config = await loadConfig();
        const { VchatDataURL, MaxMemoTokens } = config;

        // 2. 获取请求信息
        const maidName = args.maid;
        if (!maidName) {
            throw new Error("请求中缺少 'maid' 参数。");
        }
        const keywords = (args.keyword || '').split(/[,，\s]+/).filter(Boolean);
        if (keywords.length === 0) {
            throw new Error("请求中缺少 'keyword' 参数。");
        }
        const windowSize = parseInt(args.window_size || '10', 10);

        // 3. 查找Agent信息
        const agentInfo = await findAgentInfo(VchatDataURL, maidName);
        if (!agentInfo) {
            throw new Error(`未找到名为 "${maidName}" 的Agent。`);
        }
        
        const userName = await findUserName(VchatDataURL);

        // 4. 搜索聊天记录
        const memories = await searchHistories(VchatDataURL, agentInfo.uuid, keywords, windowSize, userName, agentInfo.name);

        // 5. 格式化并输出结果
        let output = memories.join('\n\n');
        if (output.length > MaxMemoTokens) {
            output = output.substring(0, MaxMemoTokens) + "\n... [内容过长，已被截断]";
        }
        
        if (!output.trim()) {
             output = `[DeepMemo] 未找到与关键词“${keywords.join(', ')}”相关的回忆。`;
        }

        // 成功时，直接将结果字符串输出到 stdout
        console.log(output);

    } catch (error) {
        // 失败时，将JSON错误信息输出到 stderr，并以非零状态码退出
        console.error(JSON.stringify({ status: "error", error: `[DeepMemo] ${error.message}` }));
        process.exit(1);
    }
}

// --- 辅助函数 ---

function readStdin() {
    return new Promise((resolve) => {
        let data = '';
        process.stdin.on('data', chunk => data += chunk);
        process.stdin.on('end', () => resolve(data));
    });
}

function parseToolArgs(input) {
    let args;
    try {
        // VCP服务器通过stdin传递的是一个JSON字符串
        args = JSON.parse(input);
    } catch (e) {
        // 将错误输出到 stderr
        console.error(JSON.stringify({ status: "error", error: `[DeepMemo] 无效的输入格式，无法解析JSON: ${input}` }));
        process.exit(1);
    }

    // 兼容 keyword, key_word, KeyWord
    if (args.key_word) {
        args.keyword = args.key_word;
        delete args.key_word;
    }
    if (args.KeyWord) {
        args.keyword = args.KeyWord;
        delete args.KeyWord;
    }

    // 兼容 window_size, windowsize
    if (args.windowsize) {
        args.window_size = args.windowsize;
        delete args.windowsize;
    }
    
    return args;
}

async function loadConfig() {
    // 动态计算 VchatDataURL 路径，它应该是插件目录向上三层，然后进入 AppData
    const VchatDataURL = path.join(__dirname, '..', '..', '..', 'AppData');

    const configPath = path.join(__dirname, 'config.env');
    try {
        const configContent = await fs.readFile(configPath, 'utf-8');
        const config = dotenv.parse(configContent);
        if (!config.MaxMemoTokens) {
            throw new Error("config.env 文件不完整，缺少 MaxMemoTokens。");
        }
        return {
            VchatDataURL: VchatDataURL,
            MaxMemoTokens: parseInt(config.MaxMemoTokens, 10)
        };
    } catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error(`配置文件 config.env 未找到。`);
        }
        throw new Error(`无法加载或解析 config.env 文件: ${error.message}`);
    }
}

async function findAgentInfo(vchatPath, maidName) {
    const agentsDir = path.join(vchatPath, 'Agents');
    try {
        const agentFolders = await fs.readdir(agentsDir);
        for (const folder of agentFolders) {
            const configPath = path.join(agentsDir, folder, 'config.json');
            try {
                const content = await fs.readFile(configPath, 'utf-8');
                const config = JSON.parse(content);
                if (config.name.includes(maidName)) {
                    return { name: config.name, uuid: folder };
                }
            } catch (e) {
                // 忽略无效的config.json文件
            }
        }
        return null;
    } catch (error) {
        throw new Error("无法读取 Agents 目录。");
    }
}

async function findUserName(vchatPath) {
    const settingsPath = path.join(vchatPath, 'settings.json');
    try {
        const content = await fs.readFile(settingsPath, 'utf-8');
        const settings = JSON.parse(content);
        return settings.userName || '主人';
    } catch (error) {
        return '主人'; // Fallback
    }
}

async function searchHistories(vchatPath, agentUuid, keywords, windowSize, userName, agentName) {
    const topicsDir = path.join(vchatPath, 'UserData', agentUuid, 'topics');
    let allMemories = [];
    let memoryIndex = 1; // 为回忆片段添加索引

    try {
        const topicFolders = await fs.readdir(topicsDir);

        // 1. 获取所有 history.json 的路径及其最后修改时间
        let historyFiles = [];
        for (const topic of topicFolders) {
            const historyPath = path.join(topicsDir, topic, 'history.json');
            try {
                const stats = await fs.stat(historyPath);
                historyFiles.push({ path: historyPath, mtime: stats.mtime });
            } catch (e) {
                // 忽略无法获取状态的文件 (例如，目录中没有 history.json)
            }
        }

        // 2. 按修改时间降序排序
        historyFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

        // 3. 排除最新的一个文件进行搜索 (如果只有一个或没有文件，则不搜索)
        const filesToSearch = historyFiles.slice(1);

        // 4. 遍历剩余的文件进行搜索
        for (const fileInfo of filesToSearch) {
            try {
                const content = await fs.readFile(fileInfo.path, 'utf-8');
                const history = JSON.parse(content);

                for (let i = 0; i < history.length; i++) {
                    const entry = history[i];
                    if (entry.content && typeof entry.content === 'string') {
                        const contentLower = entry.content.toLowerCase();
                        if (keywords.some(kw => contentLower.includes(kw.toLowerCase()))) {
                            const start = Math.max(0, i - windowSize);
                            const end = Math.min(history.length, i + windowSize + 1);
                            const contextSlice = history.slice(start, end);

                            const formattedMemory = formatMemory(contextSlice, userName, agentName, memoryIndex);
                            if (formattedMemory) {
                                allMemories.push(formattedMemory);
                                memoryIndex++;
                            }
                        }
                    }
                }
            } catch (e) {
                // 忽略无法读取或解析的单个history.json
            }
        }
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw new Error("读取用户聊天记录时出错。");
        }
        // 如果topics目录不存在，说明没有历史记录，返回空数组
    }
    return allMemories;
}

function formatMemory(slice, userName, agentName, memoryIndex) {
    let memoryString = "";
    slice.forEach(entry => {
        if (entry.role === 'user' || entry.role === 'assistant') {
            const name = entry.role === 'user' ? userName : agentName;
            // 剔除HTML标签
            const cleanContent = entry.content.replace(/<[^>]*>/g, '').trim();
            if (cleanContent) {
                memoryString += `${name}: ${cleanContent}\n`;
            }
        }
    });
    return memoryString.trim() ? `[回忆片段${memoryIndex}]:\n${memoryString.trim()}` : null;
}

main();
