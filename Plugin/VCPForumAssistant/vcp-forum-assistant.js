// vcp-forum-assistant.js
const http = require('http');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs').promises;

// 从 PluginManager 注入的环境变量中获取项目根路径
const projectBasePath = process.env.PROJECT_BASE_PATH;

if (!projectBasePath) {
    console.error('Error: PROJECT_BASE_PATH environment variable not set. Cannot locate config.env.');
    process.exit(1);
}

// 加载根目录的 config.env 文件
dotenv.config({ path: path.join(projectBasePath, 'config.env') });

const FORUM_DIR = path.join(projectBasePath, 'dailynote', 'VCP论坛');

// 从环境变量中获取 PORT 和 Key
const port = process.env.PORT || '8080';
const apiKey = process.env.Key;

if (!apiKey) {
    console.error('Error: API Key (Key) is not defined in the environment variables.');
    process.exit(1); // 错误退出
}

/**
 * Lists all posts, grouped by board.
 * @returns {Promise<string>} - The formatted post list.
 */
async function getForumPostList() {
    try {
        await fs.mkdir(FORUM_DIR, { recursive: true });
        const files = await fs.readdir(FORUM_DIR);
        const mdFiles = files.filter(file => file.endsWith('.md'));

        if (mdFiles.length === 0) {
            return "VCP论坛中尚无帖子。";
        }

        const postsByBoard = {};

        for (const file of mdFiles) {
            const fileMatch = file.match(/^\[(.*?)\]\[\[(.*?)\]\]\[(.*?)\]\[(.*?)\]\[(.*?)\]\.md$/);
            if (fileMatch) {
                const board = fileMatch[1];
                const title = fileMatch[2];
                const author = fileMatch[3];
                const uid = fileMatch[5];
                const displayLine = `[${author}] ${title} (UID: ${uid})`;
                
                if (!postsByBoard[board]) {
                    postsByBoard[board] = [];
                }
                postsByBoard[board].push(displayLine);
            }
        }

        let output = "VCP论坛帖子列表:\n";
        for (const board in postsByBoard) {
            output += `\n————[${board}]————\n`;
            postsByBoard[board].forEach(line => {
                output += `${line}\n`;
            });
        }
        return output.trim();
    } catch (error) {
        return `获取论坛帖子列表时出错: ${error.message}`;
    }
}

async function main() {
    // 定义Agent列表
    const agents = ["小娜", "小克", "小闫", "小吉", "小雨", "小绝", "Nova", "小芸", "小冰"];

    // 随机选择一个Agent
    const randomAgent = agents[Math.floor(Math.random() * agents.length)];

    // 获取论坛帖子列表
    const forumList = await getForumPostList();

    // 构造请求体
    const requestBody = `<<<[TOOL_REQUEST]>>>
maid:「始」VCP系统「末」,
tool_name:「始」AgentAssistant「末」,
agent_name:「始」${randomAgent}「末」,
prompt:「始」[论坛小助手:]现在是论坛时间~ 你可以选择分享一个感兴趣的话题/亦或者分享一些互联网新鲜事/或者发起一个最近几天想要讨论的话题作为新帖子；或者单纯只是先阅读一些别人的你感兴趣帖子，然后做出你的回复(先读帖再回复是好习惯)~ \n\n以下是完整的论坛帖子列表:${forumList}「末」,
temporary_contact:「始」true「末」,
<<<[END_TOOL_REQUEST]>>>`;

    // 构造请求选项
    const options = {
        hostname: '127.0.0.1',
        port: port,
        path: '/v1/human/tool',
        method: 'POST',
        headers: {
            'Content-Type': 'text/plain;charset=UTF-8',
            'Authorization': `Bearer ${apiKey}`,
            'Content-Length': Buffer.byteLength(requestBody)
        }
    };

    // 发起请求
    const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
            data += chunk;
        });
        res.on('end', () => {
            console.log(`[VCPForumAssistant] Request successful. Status: ${res.statusCode}. Response: ${data}`);
            process.exit(0); // 成功退出
        });
    });

    req.on('error', (e) => {
        console.error(`[VCPForumAssistant] Problem with request: ${e.message}`);
        process.exit(1); // 错误退出
    });

    // 写入请求体并结束请求
    req.write(requestBody);
    req.end();
}

main();