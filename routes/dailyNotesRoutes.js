const express = require('express');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

/**
 * 日记本管理模块 (安全加固版)
 * @param {string} dailyNoteRootPath 日记本根目录
 * @param {boolean} DEBUG_MODE 是否开启调试模式
 * @returns {express.Router}
 */
module.exports = function(dailyNoteRootPath, DEBUG_MODE) {
    const router = express.Router();

    // ========== 搜索队列与并发控制 ==========
    const searchQueue = {
        pending: new Map(),      // 正在等待的请求 Map<hash, Promise>
        active: 0,               // 当前活跃的搜索数
        maxConcurrent: 2,        // 最大并发搜索数
        waitingQueue: [],        // 等待队列 [{resolve, reject, params}]
    };

    // 搜索配置常量
    const SEARCH_CONFIG = {
        MAX_RESULTS: 200,           // 最大返回结果数
        MAX_SEARCH_TERM_LENGTH: 100, // 搜索词最大长度
        MAX_KEYWORDS: 5,            // 最大关键词数量
        TIMEOUT_MS: 30000,          // 搜索超时时间 30秒
        PREVIEW_LENGTH: 100,        // 预览长度
        MAX_FILE_SIZE: 1024 * 1024, // 单文件最大读取大小 1MB
        MAX_DEPTH: 3,               // 最大目录深度
    };

    /**
     * 生成搜索参数的哈希值用于去重
     */
    function hashSearchParams(term, folder) {
        return `${term}:::${folder || 'GLOBAL'}`;
    }

    /**
     * 安全路径检查 - 防止路径遍历攻击
     */
    function isPathSafe(targetPath, rootPath) {
        const resolvedTarget = path.resolve(targetPath);
        const resolvedRoot = path.resolve(rootPath);
        return resolvedTarget.startsWith(resolvedRoot + path.sep) || resolvedTarget === resolvedRoot;
    }

    /**
     * 检查是否为符号链接
     */
    async function isSymlink(filePath) {
        try {
            const stats = await fs.lstat(filePath);
            return stats.isSymbolicLink();
        } catch {
            return false;
        }
    }

    /**
     * 带超时的 Promise 包装器
     */
    function withTimeout(promise, ms, message = 'Operation timed out') {
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error(message)), ms);
        });
        
        return Promise.race([promise, timeoutPromise]).finally(() => {
            clearTimeout(timeoutId);
        });
    }

    /**
     * 核心搜索执行函数
     */
    async function executeSearch(searchTerms, folder, abortSignal) {
        const matchedNotes = [];
        const visitedPaths = new Set(); // 防止循环引用
        let foldersToSearch = [];

        // 确定搜索范围
        if (folder) {
            const specificFolderPath = path.join(dailyNoteRootPath, folder);
            
            // 安全检查
            if (!isPathSafe(specificFolderPath, dailyNoteRootPath)) {
                throw new Error('Invalid folder path: path traversal detected');
            }
            
            // 符号链接检查
            if (await isSymlink(specificFolderPath)) {
                throw new Error('Cannot search in symbolic link folders');
            }
            
            await fs.access(specificFolderPath);
            const stat = await fs.stat(specificFolderPath);
            if (!stat.isDirectory()) {
                throw new Error(`Specified path '${folder}' is not a directory`);
            }
            
            foldersToSearch.push({ name: folder, path: specificFolderPath, depth: 0 });
        } else {
            // 全局搜索
            await fs.access(dailyNoteRootPath);
            const entries = await fs.readdir(dailyNoteRootPath, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const folderPath = path.join(dailyNoteRootPath, entry.name);
                    
                    // 跳过符号链接
                    if (await isSymlink(folderPath)) {
                        if (DEBUG_MODE) console.log(`[Search] Skipping symlink: ${entry.name}`);
                        continue;
                    }
                    
                    foldersToSearch.push({ name: entry.name, path: folderPath, depth: 0 });
                }
            }
        }

        if (foldersToSearch.length === 0) {
            return [];
        }

        // 遍历搜索
        for (const dir of foldersToSearch) {
            // 检查是否被中止
            if (abortSignal?.aborted) {
                if (DEBUG_MODE) console.log('[Search] Aborted by signal');
                break;
            }

            // 检查是否已达到最大结果数
            if (matchedNotes.length >= SEARCH_CONFIG.MAX_RESULTS) {
                if (DEBUG_MODE) console.log('[Search] Max results reached');
                break;
            }

            // 深度检查
            if (dir.depth > SEARCH_CONFIG.MAX_DEPTH) {
                if (DEBUG_MODE) console.log(`[Search] Max depth reached for: ${dir.path}`);
                continue;
            }

            // 循环检测
            const realPath = await fs.realpath(dir.path).catch(() => dir.path);
            if (visitedPaths.has(realPath)) {
                if (DEBUG_MODE) console.log(`[Search] Circular reference detected: ${dir.path}`);
                continue;
            }
            visitedPaths.add(realPath);

            try {
                const files = await fs.readdir(dir.path);
                const noteFiles = files.filter(file => 
                    file.toLowerCase().endsWith('.txt') || 
                    file.toLowerCase().endsWith('.md')
                );

                for (const fileName of noteFiles) {
                    // 再次检查中止信号
                    if (abortSignal?.aborted) break;
                    if (matchedNotes.length >= SEARCH_CONFIG.MAX_RESULTS) break;

                    const filePath = path.join(dir.path, fileName);
                    
                    // 安全检查
                    if (!isPathSafe(filePath, dailyNoteRootPath)) {
                        if (DEBUG_MODE) console.warn(`[Search] Skipping unsafe path: ${filePath}`);
                        continue;
                    }

                    // 符号链接检查
                    if (await isSymlink(filePath)) {
                        if (DEBUG_MODE) console.log(`[Search] Skipping symlink file: ${fileName}`);
                        continue;
                    }

                    try {
                        // 先检查文件大小
                        const stats = await fs.stat(filePath);
                        if (stats.size > SEARCH_CONFIG.MAX_FILE_SIZE) {
                            if (DEBUG_MODE) console.log(`[Search] Skipping large file: ${fileName} (${stats.size} bytes)`);
                            continue;
                        }

                        const content = await fs.readFile(filePath, 'utf-8');
                        const lowerContent = content.toLowerCase();
                        
                        // 检查是否包含所有关键字 (AND 逻辑)
                        const isMatch = searchTerms.every(t => lowerContent.includes(t));
                        
                        if (isMatch) {
                            let preview = content.substring(0, SEARCH_CONFIG.PREVIEW_LENGTH)
                                .replace(/\n/g, ' ') + 
                                (content.length > SEARCH_CONFIG.PREVIEW_LENGTH ? '...' : '');
                            
                            matchedNotes.push({
                                name: fileName,
                                folderName: dir.name,
                                lastModified: stats.mtime.toISOString(),
                                preview: preview
                            });
                        }
                    } catch (readError) {
                        if (DEBUG_MODE) {
                            console.warn(`[Search] Error reading file ${filePath}: ${readError.message}`);
                        }
                    }
                }
            } catch (dirError) {
                if (DEBUG_MODE) {
                    console.warn(`[Search] Error reading directory ${dir.path}: ${dirError.message}`);
                }
            }
        }

        // 按修改时间排序
        matchedNotes.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
        
        return matchedNotes;
    }

    /**
     * 队列化搜索请求
     */
    async function queuedSearch(term, folder) {
        const hash = hashSearchParams(term, folder);
        
        // 检查是否有相同的搜索正在进行
        if (searchQueue.pending.has(hash)) {
            if (DEBUG_MODE) console.log(`[Search Queue] Reusing pending search: ${hash}`);
            return searchQueue.pending.get(hash);
        }

        // 创建搜索 Promise
        const searchPromise = new Promise(async (resolve, reject) => {
            // 等待队列槽位
            const waitForSlot = () => new Promise((res) => {
                if (searchQueue.active < searchQueue.maxConcurrent) {
                    res();
                } else {
                    searchQueue.waitingQueue.push({ resolve: res });
                }
            });

            try {
                await waitForSlot();
                searchQueue.active++;

                if (DEBUG_MODE) {
                    console.log(`[Search Queue] Starting search (active: ${searchQueue.active}): ${hash}`);
                }

                // 创建中止控制器
                const abortController = new AbortController();
                
                // 执行带超时的搜索
                const results = await withTimeout(
                    executeSearch(term, folder, abortController.signal),
                    SEARCH_CONFIG.TIMEOUT_MS,
                    'Search operation timed out'
                );

                resolve(results);
            } catch (error) {
                reject(error);
            } finally {
                searchQueue.active--;
                searchQueue.pending.delete(hash);

                // 唤醒等待队列中的下一个
                if (searchQueue.waitingQueue.length > 0) {
                    const next = searchQueue.waitingQueue.shift();
                    next.resolve();
                }

                if (DEBUG_MODE) {
                    console.log(`[Search Queue] Search completed (active: ${searchQueue.active}): ${hash}`);
                }
            }
        });

        searchQueue.pending.set(hash, searchPromise);
        return searchPromise;
    }

    // ========== API 路由 ==========

    // GET /folders - 获取所有文件夹
    router.get('/folders', async (req, res) => {
        try {
            await fs.access(dailyNoteRootPath); 
            const entries = await fs.readdir(dailyNoteRootPath, { withFileTypes: true });
            
            const folders = [];
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const folderPath = path.join(dailyNoteRootPath, entry.name);
                    // 跳过符号链接
                    if (!(await isSymlink(folderPath))) {
                        folders.push(entry.name);
                    }
                }
            }
            
            res.json({ folders });
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.warn('[DailyNotes API] /folders - dailynote directory not found.');
                res.json({ folders: [] }); 
            } else {
                console.error('[DailyNotes API] Error listing daily note folders:', error);
                res.status(500).json({ error: 'Failed to list daily note folders', details: error.message });
            }
        }
    });

    // GET /folder/:folderName - 获取文件夹内的笔记
    router.get('/folder/:folderName', async (req, res) => {
        const folderName = req.params.folderName;
        const specificFolderPath = path.join(dailyNoteRootPath, folderName);

        // 安全检查
        if (!isPathSafe(specificFolderPath, dailyNoteRootPath)) {
            return res.status(403).json({ error: 'Invalid folder path' });
        }

        try {
            // 符号链接检查
            if (await isSymlink(specificFolderPath)) {
                return res.status(403).json({ error: 'Cannot access symbolic link folders' });
            }

            await fs.access(specificFolderPath); 
            const files = await fs.readdir(specificFolderPath);
            const noteFiles = files.filter(file => 
                file.toLowerCase().endsWith('.txt') || 
                file.toLowerCase().endsWith('.md')
            );

            const notes = await Promise.all(noteFiles.map(async (file) => {
                const filePath = path.join(specificFolderPath, file);
                
                // 跳过符号链接文件
                if (await isSymlink(filePath)) return null;
                
                const stats = await fs.stat(filePath);
                let preview = '';
                try {
                    // 限制读取大小
                    if (stats.size <= SEARCH_CONFIG.MAX_FILE_SIZE) {
                        const content = await fs.readFile(filePath, 'utf-8');
                        preview = content.substring(0, SEARCH_CONFIG.PREVIEW_LENGTH)
                            .replace(/\n/g, ' ') + 
                            (content.length > SEARCH_CONFIG.PREVIEW_LENGTH ? '...' : '');
                    } else {
                        preview = '[文件过大，无法预览]';
                    }
                } catch (readError) {
                    console.warn(`[DailyNotes API] Error reading file for preview ${filePath}: ${readError.message}`);
                    preview = '[无法加载预览]';
                }
                return {
                    name: file,
                    lastModified: stats.mtime.toISOString(),
                    preview: preview
                };
            }));

            // 过滤掉 null (符号链接)
            const validNotes = notes.filter(n => n !== null);
            
            // 按修改时间排序
            validNotes.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
            res.json({ notes: validNotes });
 
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.warn(`[DailyNotes API] /folder/${folderName} - Folder not found.`);
                res.status(404).json({ error: `Folder '${folderName}' not found.` });
            } else {
                console.error(`[DailyNotes API] Error listing notes in folder ${folderName}:`, error);
                res.status(500).json({ error: `Failed to list notes in folder ${folderName}`, details: error.message });
            }
        }
    });

    // GET /search - 搜索笔记 (队列化 + 安全加固)
    router.get('/search', async (req, res) => {
        let { term, folder, limit } = req.query; 

        // ===== 输入验证 =====
        if (!term || typeof term !== 'string' || term.trim() === '') {
            return res.status(400).json({ error: 'Search term is required.' });
        }

        // 限制搜索词长度
        term = term.trim();
        if (term.length > SEARCH_CONFIG.MAX_SEARCH_TERM_LENGTH) {
            term = term.substring(0, SEARCH_CONFIG.MAX_SEARCH_TERM_LENGTH);
        }

        // 解析关键词 (限制数量)
        let searchTerms = term.toLowerCase()
            .split(/\s+/)
            .filter(t => t !== '')
            .slice(0, SEARCH_CONFIG.MAX_KEYWORDS);

        if (searchTerms.length === 0) {
            return res.status(400).json({ error: 'No valid search terms provided.' });
        }

        // 验证 folder 参数
        if (folder && typeof folder === 'string') {
            folder = folder.trim();
            
            // 检查是否包含路径遍历尝试
            if (folder.includes('..') || folder.includes('/') || folder.includes('\\')) {
                console.warn(`[DailyNotes API Search] Path traversal attempt detected: ${folder}`);
                return res.status(403).json({ error: 'Invalid folder name' });
            }
            
            if (folder === '') folder = null;
        } else {
            folder = null;
        }

        // 解析结果限制
        const maxResults = Math.min(
            parseInt(limit, 10) || SEARCH_CONFIG.MAX_RESULTS,
            SEARCH_CONFIG.MAX_RESULTS
        );

        try {
            if (DEBUG_MODE) {
                console.log(`[DailyNotes API Search] Query: terms=${searchTerms.join(',')} folder=${folder || 'GLOBAL'} limit=${maxResults}`);
            }

            // 使用队列化搜索
            const notes = await queuedSearch(searchTerms, folder);
            
            // 限制返回结果数量
            const limitedNotes = notes.slice(0, maxResults);

            res.json({ 
                notes: limitedNotes,
                total: notes.length,
                limited: notes.length > maxResults
            });

        } catch (error) {
            if (error.message === 'Search operation timed out') {
                console.warn('[DailyNotes API Search] Search timeout');
                return res.status(504).json({ error: 'Search operation timed out. Please try with more specific keywords.' });
            }
            
            if (error.code === 'ENOENT') {
                console.warn('[DailyNotes API Search] dailynote directory not found.');
                return res.json({ notes: [], total: 0 }); 
            }
            
            console.error('[DailyNotes API Search] Error during daily note search:', error);
            res.status(500).json({ error: 'Failed to search daily notes', details: error.message });
        }
    });

    // GET /note/:folderName/:fileName - 获取笔记内容
    router.get('/note/:folderName/:fileName', async (req, res) => {
        const { folderName, fileName } = req.params;
        const filePath = path.join(dailyNoteRootPath, folderName, fileName);

        // 安全检查
        if (!isPathSafe(filePath, dailyNoteRootPath)) {
            return res.status(403).json({ error: 'Invalid file path' });
        }

        try {
            // 符号链接检查
            if (await isSymlink(filePath)) {
                return res.status(403).json({ error: 'Cannot read symbolic link files' });
            }

            await fs.access(filePath); 
            const content = await fs.readFile(filePath, 'utf-8');
            res.json({ content });
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.warn(`[DailyNotes API] /note/${folderName}/${fileName} - File not found.`);
                res.status(404).json({ error: `Note file '${fileName}' in folder '${folderName}' not found.` });
            } else {
                console.error(`[DailyNotes API] Error reading note file ${folderName}/${fileName}:`, error);
                res.status(500).json({ error: `Failed to read note file ${folderName}/${fileName}`, details: error.message });
            }
        }
    });

    // POST /note/:folderName/:fileName - 保存笔记
    router.post('/note/:folderName/:fileName', async (req, res) => {
        const { folderName, fileName } = req.params;
        const { content } = req.body;

        if (typeof content !== 'string') {
            return res.status(400).json({ error: 'Invalid request body. Expected { content: string }.' });
        }

        // 验证文件夹名和文件名
        if (folderName.includes('..') || fileName.includes('..') ||
            folderName.includes('/') || fileName.includes('/') ||
            folderName.includes('\\') || fileName.includes('\\')) {
            return res.status(403).json({ error: 'Invalid folder or file name' });
        }

        const targetFolderPath = path.join(dailyNoteRootPath, folderName); 
        const filePath = path.join(targetFolderPath, fileName);

        // 安全检查
        if (!isPathSafe(filePath, dailyNoteRootPath)) {
            return res.status(403).json({ error: 'Invalid file path' });
        }

        try {
            await fs.mkdir(targetFolderPath, { recursive: true });
            await fs.writeFile(filePath, content, 'utf-8');
            res.json({ message: `Note '${fileName}' in folder '${folderName}' saved successfully.` });
        } catch (error) {
            console.error(`[DailyNotes API] Error saving note file ${folderName}/${fileName}:`, error);
            res.status(500).json({ error: `Failed to save note file ${folderName}/${fileName}`, details: error.message });
        }
    });

    // POST /move - 移动笔记
    router.post('/move', async (req, res) => {
        const { sourceNotes, targetFolder } = req.body;

        if (!Array.isArray(sourceNotes) || sourceNotes.some(n => !n.folder || !n.file) || typeof targetFolder !== 'string') {
            return res.status(400).json({ error: 'Invalid request body. Expected { sourceNotes: [{folder, file}], targetFolder: string }.' });
        }

        // 验证目标文件夹名
        if (targetFolder.includes('..') || targetFolder.includes('/') || targetFolder.includes('\\')) {
            return res.status(403).json({ error: 'Invalid target folder name' });
        }

        const results = { moved: [], errors: [] };
        const targetFolderPath = path.join(dailyNoteRootPath, targetFolder);

        // 安全检查
        if (!isPathSafe(targetFolderPath, dailyNoteRootPath)) {
            return res.status(403).json({ error: 'Invalid target folder path' });
        }

        try {
            await fs.mkdir(targetFolderPath, { recursive: true });
        } catch (mkdirError) {
            console.error(`[DailyNotes API] Error creating target folder ${targetFolder} for move:`, mkdirError);
            return res.status(500).json({ error: `Failed to create target folder '${targetFolder}'`, details: mkdirError.message });
        }

        for (const note of sourceNotes) {
            // 验证路径
            if (note.folder.includes('..') || note.file.includes('..')) {
                results.errors.push({ note: `${note.folder}/${note.file}`, error: 'Invalid path' });
                continue;
            }

            const sourceFilePath = path.join(dailyNoteRootPath, note.folder, note.file);
            const destinationFilePath = path.join(targetFolderPath, note.file);

            // 安全检查
            if (!isPathSafe(sourceFilePath, dailyNoteRootPath) || 
                !isPathSafe(destinationFilePath, dailyNoteRootPath)) {
                results.errors.push({ note: `${note.folder}/${note.file}`, error: 'Invalid path' });
                continue;
            }

            try {
                await fs.access(sourceFilePath);
                try {
                    await fs.access(destinationFilePath);
                    results.errors.push({
                        note: `${note.folder}/${note.file}`,
                        error: `File already exists at destination '${targetFolder}/${note.file}'. Move aborted for this file.`
                    });
                    continue;
                } catch {
                    // 目标不存在，可以移动
                }
                
                await fs.rename(sourceFilePath, destinationFilePath);
                results.moved.push(`${note.folder}/${note.file} to ${targetFolder}/${note.file}`);
            } catch (error) {
                if (error.code === 'ENOENT') {
                    results.errors.push({ note: `${note.folder}/${note.file}`, error: 'Source file not found.' });
                } else {
                    console.error(`[DailyNotes API] Error moving note ${note.folder}/${note.file} to ${targetFolder}:`, error);
                    results.errors.push({ note: `${note.folder}/${note.file}`, error: error.message });
                }
            }
        }

        const message = `Moved ${results.moved.length} note(s). ${results.errors.length > 0 ? `Encountered ${results.errors.length} error(s).` : ''}`;
        res.json({ message, moved: results.moved, errors: results.errors });
    });

    // POST /delete-batch - 批量删除
    router.post('/delete-batch', async (req, res) => {
        if (DEBUG_MODE) console.log('[DailyNotes API] POST /delete-batch route hit!');
        const { notesToDelete } = req.body;

        if (!Array.isArray(notesToDelete) || notesToDelete.some(n => !n.folder || !n.file)) {
            return res.status(400).json({ error: 'Invalid request body. Expected { notesToDelete: [{folder, file}] }.' });
        }

        const results = { deleted: [], errors: [] };

        for (const note of notesToDelete) {
            // 验证路径
            if (note.folder.includes('..') || note.file.includes('..')) {
                results.errors.push({ note: `${note.folder}/${note.file}`, error: 'Invalid path' });
                continue;
            }

            const filePath = path.join(dailyNoteRootPath, note.folder, note.file);
            
            // 安全检查
            if (!isPathSafe(filePath, dailyNoteRootPath)) {
                results.errors.push({ note: `${note.folder}/${note.file}`, error: 'Invalid path' });
                continue;
            }

            try {
                await fs.access(filePath);
                await fs.unlink(filePath);
                results.deleted.push(`${note.folder}/${note.file}`);
            } catch (error) {
                if (error.code === 'ENOENT') {
                    results.errors.push({ note: `${note.folder}/${note.file}`, error: 'File not found.' });
                } else {
                    console.error(`[DailyNotes API] Error deleting note ${note.folder}/${note.file}:`, error);
                    results.errors.push({ note: `${note.folder}/${note.file}`, error: error.message });
                }
            }
        }

        const message = `Deleted ${results.deleted.length} note(s). ${results.errors.length > 0 ? `Encountered ${results.errors.length} error(s).` : ''}`;
        res.json({ message, deleted: results.deleted, errors: results.errors });
    });

    // POST /folder/delete - 删除空文件夹
    router.post('/folder/delete', async (req, res) => {
        const { folderName } = req.body;

        if (!folderName || typeof folderName !== 'string' || folderName.trim() === '') {
            return res.status(400).json({ error: 'Invalid request body. Expected { folderName: string }.' });
        }

        // 验证文件夹名
        if (folderName.includes('..') || folderName.includes('/') || folderName.includes('\\')) {
            return res.status(403).json({ error: 'Invalid folder name' });
        }

        const targetFolderPath = path.join(dailyNoteRootPath, folderName);

        try {
            const resolvedPath = path.resolve(targetFolderPath);
            const resolvedRoot = path.resolve(dailyNoteRootPath);
            if (!resolvedPath.startsWith(resolvedRoot + path.sep) || resolvedPath === resolvedRoot) {
                return res.status(403).json({ error: 'Forbidden: Cannot delete the root directory or paths outside of daily notes.' });
            }

            await fs.access(targetFolderPath);
            
            const files = await fs.readdir(targetFolderPath);
            if (files.length > 0) {
                return res.status(400).json({
                    error: `Folder '${folderName}' is not empty.`,
                    message: '为了安全起见，非空文件夹禁止删除。请先删除或移动其中的所有内容。'
                });
            }
            
            await fs.rmdir(targetFolderPath);
            res.json({ message: `Empty folder '${folderName}' has been deleted successfully.` });
        } catch (error) {
            if (error.code === 'ENOENT') {
                res.status(404).json({ error: `Folder '${folderName}' not found.` });
            } else {
                console.error(`[DailyNotes API] Error deleting folder ${folderName}:`, error);
                res.status(500).json({ error: `Failed to delete folder ${folderName}`, details: error.message });
            }
        }
    });

    // ===== 管理接口：查看队列状态 =====
    router.get('/admin/queue-status', (req, res) => {
        res.json({
            active: searchQueue.active,
            pending: searchQueue.pending.size,
            waiting: searchQueue.waitingQueue.length,
            maxConcurrent: searchQueue.maxConcurrent
        });
    });

    return router;
};