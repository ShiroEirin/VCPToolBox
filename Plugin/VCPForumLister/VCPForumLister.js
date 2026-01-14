const fs = require('fs').promises;
const path = require('path');

const FORUM_DIR = process.env.KNOWLEDGEBASE_ROOT_PATH ? path.join(process.env.KNOWLEDGEBASE_ROOT_PATH, 'VCP论坛') : path.join(__dirname, '..', '..', 'dailynote', 'VCP论坛');
const POST_COUNT = 20; // 定义返回的帖子数量

/**
 * Main function to generate the forum post list.
 */
async function generateForumList() {
    try {
        await fs.mkdir(FORUM_DIR, { recursive: true });
        const files = await fs.readdir(FORUM_DIR);
        const mdFiles = files.filter(file => file.endsWith('.md'));

        if (mdFiles.length === 0) {
            console.log("VCP论坛中尚无帖子。");
            return;
        }

        // 获取每个文件的最后修改时间
        const filesWithStats = await Promise.all(
            mdFiles.map(async (file) => {
                const fullPath = path.join(FORUM_DIR, file);
                const stats = await fs.stat(fullPath);
                return { file, mtime: stats.mtime };
            })
        );

        // 按最后修改时间降序排序
        filesWithStats.sort((a, b) => b.mtime - a.mtime);

        // 获取最新的 POST_COUNT 个帖子
        const recentFiles = filesWithStats.slice(0, POST_COUNT);

        let output = `告知所有帖子都在 ../../dailynote/VCP论坛/ 文件夹下\n\n————[最近的热门帖子]————\n`;
        
        for (const { file } of recentFiles) {
            const fullPath = path.join(FORUM_DIR, file);
            const content = await fs.readFile(fullPath, 'utf-8');

            // 正则表达式从文件名中提取信息
            // 格式: [版块][[标题]][作者][时间戳][UID].md
            const fileMatch = file.match(/^\[(.*?)\]\[\[(.*?)\]\]\[(.*?)\]\[(.*?)\]\[(.*?)\]\.md$/);

            let displayLine;

            if (fileMatch) {
                const board = fileMatch[1];
                const title = fileMatch[2];
                const author = fileMatch[3];
                const postTimestamp = fileMatch[4];
                
                const formattedPostTime = new Date(postTimestamp).toLocaleString('zh-CN', { hour12: false });

                displayLine = `[${board}][${author}] ${title} (发布于: ${formattedPostTime})`;
            } else {
                displayLine = file;
            }

            const replyMatches = [...content.matchAll(/\*\*回复者:\*\* (.*?)\s*\n\*\*时间:\*\* (.*?)\s*\n/g)];
            if (replyMatches.length > 0) {
                const lastReply = replyMatches[replyMatches.length - 1];
                const replier = lastReply[1].trim();
                const replyTimestamp = lastReply[2].trim();
                const formattedReplyTime = new Date(replyTimestamp).toLocaleString('zh-CN', { hour12: false });

                displayLine += ` (最后回复: ${replier} at ${formattedReplyTime})`;
            }
            
            output += `${displayLine}\n`;
        }

        console.log(output.trim());

    } catch (error) {
        console.log(`[VCPForumLister Error: ${error.message}]`);
        process.exit(1);
    }
}

generateForumList();