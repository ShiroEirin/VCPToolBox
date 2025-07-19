// modules/fileManager.js
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const crypto = require('crypto'); // 引入 crypto 模块
const pdf = require('pdf-parse'); // For PDF text extraction
const mammoth = require('mammoth'); // For DOCX text extraction
// const { exec } = require('child_process'); // For potential future use with textract or other CLI tools

// Base directory for all user-specific data, including attachments.
// This will be initialized by main.js
let USER_DATA_ROOT;
let AGENT_DATA_ROOT; // Might be needed if agent config influences storage
let ATTACHMENTS_DIR; // 新增：中心化附件存储目录

function initializeFileManager(userDataPath, agentDataPath) {
    USER_DATA_ROOT = userDataPath;
    AGENT_DATA_ROOT = agentDataPath;
    ATTACHMENTS_DIR = path.join(USER_DATA_ROOT, 'attachments'); // 定义中心化目录
    fs.ensureDirSync(ATTACHMENTS_DIR); // 确保目录存在
    console.log(`[FileManager] Initialized with USER_DATA_ROOT: ${USER_DATA_ROOT}`);
    console.log(`[FileManager] Central attachments directory ensured at: ${ATTACHMENTS_DIR}`);
}

/**
 * Stores a file (from a source path or buffer) into a centralized, content-addressed storage.
 * It calculates the file's SHA256 hash to ensure uniqueness and avoids storing duplicates.
 * Returns an object with details about the stored file, including its internal path and hash.
 */
async function storeFile(sourcePathOrBuffer, originalName, agentId, topicId, fileTypeHint = 'application/octet-stream') {
    if (!USER_DATA_ROOT || !ATTACHMENTS_DIR) {
        console.error('[FileManager] USER_DATA_ROOT or ATTACHMENTS_DIR not initialized.');
        throw new Error('File manager not properly initialized.');
    }
    
    // agentId and topicId are kept for logging/context but no longer determine the storage path.
    console.log(`[FileManager] storeFile called for original: "${originalName}", context: agent=${agentId}, topic=${topicId}`);

    // 1. Get file buffer
    let fileBuffer;
    if (typeof sourcePathOrBuffer === 'string') {
        fileBuffer = await fs.readFile(sourcePathOrBuffer);
    } else if (Buffer.isBuffer(sourcePathOrBuffer)) {
        fileBuffer = sourcePathOrBuffer;
    } else {
        throw new Error('Invalid file source. Must be a path string or a Buffer.');
    }

    // 2. Calculate hash
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const fileExtension = path.extname(originalName);
    const internalFileName = `${hash}${fileExtension}`;
    const internalFilePath = path.join(ATTACHMENTS_DIR, internalFileName);

    // 3. Store file if it doesn't exist
    if (!await fs.pathExists(internalFilePath)) {
        console.log(`[FileManager] Storing new unique file: ${internalFileName}`);
        await fs.writeFile(internalFilePath, fileBuffer);
    } else {
        console.log(`[FileManager] File already exists, reusing: ${internalFileName}`);
    }

    const fileSize = fileBuffer.length;

    // 4. Determine MIME type (logic remains the same)
    let mimeType = fileTypeHint;
    if (!mimeType || mimeType === 'application/octet-stream') {
        const ext = path.extname(originalName).toLowerCase();
        switch (ext) {
            case '.txt': mimeType = 'text/plain'; break;
            case '.json': mimeType = 'application/json'; break;
            case '.xml': mimeType = 'application/xml'; break;
            case '.csv': mimeType = 'text/csv'; break;
            case '.html': mimeType = 'text/html'; break;
            case '.css': mimeType = 'text/css'; break;
            case '.js': case '.mjs': mimeType = 'application/javascript'; break;
            case '.pdf': mimeType = 'application/pdf'; break;
            case '.doc': mimeType = 'application/msword'; break;
            case '.docx': mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; break;
            case '.xls': mimeType = 'application/vnd.ms-excel'; break;
            case '.xlsx': mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; break;
            case '.ppt': mimeType = 'application/vnd.ms-powerpoint'; break;
            case '.pptx': mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'; break;
            case '.jpg': case '.jpeg': mimeType = 'image/jpeg'; break;
            case '.png': mimeType = 'image/png'; break;
            case '.gif': mimeType = 'image/gif'; break;
            case '.svg': mimeType = 'image/svg+xml'; break;
            case '.mp3': mimeType = 'audio/mp3'; break;
            case '.wav': mimeType = 'audio/wav'; break;
            case '.ogg': mimeType = 'audio/ogg'; break;
            case '.flac': mimeType = 'audio/flac'; break;
            case '.aac': mimeType = 'audio/aac'; break;
            case '.aiff': mimeType = 'audio/aiff'; break;
            case '.mp4': mimeType = 'video/mp4'; break;
            case '.webm': mimeType = 'video/webm'; break;
            case '.bat': case '.sh': case '.py': case '.java': case '.c': case '.cpp': case '.h': case '.hpp': case '.cs': case '.go': case '.rb': case '.php': case '.swift': case '.kt': case '.ts': case '.tsx': case '.jsx': case '.vue': case '.yml': case '.yaml': case '.toml': case '.ini': case '.log': case '.sql': case '.jsonc':
                mimeType = 'text/plain';
                break;
            default:
                mimeType = fileTypeHint || 'application/octet-stream';
        }
    }

    // 强制修正MP3的MIME类型，因为浏览器或系统有时会错误地报告为 audio/mpeg
    if (path.extname(originalName).toLowerCase() === '.mp3') {
        mimeType = 'audio/mp3';
    }

    // 5. Construct the structured data object to return
    const attachmentData = {
        id: `attachment_${hash}`, // ID is now based on hash for consistency
        name: originalName,
        internalFileName: internalFileName,
        internalPath: `file://${internalFilePath}`, // The direct path to the unique file
        type: mimeType,
        size: fileSize,
        hash: hash, // Include the hash in the returned data
        createdAt: Date.now(),
        extractedText: null,
    };

    // 6. Attempt to extract text content
    try {
        const text = await getTextContent(attachmentData.internalPath, attachmentData.type);
        if (text !== null && typeof text === 'string') {
            attachmentData.extractedText = text;
            console.log(`[FileManager] Successfully extracted text for ${attachmentData.name}, length: ${text.length}`);
        } else if (text === null) {
            console.log(`[FileManager] No text content extracted or supported for ${attachmentData.name} (type: ${attachmentData.type}).`);
        }
    } catch (error) {
        console.error(`[FileManager] Error extracting text content during storeFile for ${attachmentData.name}:`, error);
    }

    console.log('[FileManager] File processed:', attachmentData);
    return attachmentData;
}

// Placeholder for future functions
async function getFileAsBase64(internalPath) {
    if (!internalPath.startsWith('file://')) {
        throw new Error('Invalid internal path format. Must be a file:// URL.');
    }
    const cleanPath = internalPath.substring(7);
    const fileBuffer = await fs.readFile(cleanPath);
    return fileBuffer.toString('base64');
}

async function getTextContent(internalPath, fileType) {
    let effectiveFileType = fileType;

    // If the provided fileType is generic or missing, try to infer from the path's extension
    if ((!effectiveFileType || effectiveFileType === 'application/octet-stream') && internalPath) {
        if (internalPath.startsWith('file://')) {
            const cleanPath = internalPath.substring(7); // Remove 'file://'
            const ext = path.extname(cleanPath).toLowerCase();
            switch (ext) {
                case '.txt':
                case '.md':
                case '.json':
                case '.xml':
                case '.csv':
                case '.html':
                case '.css':
                case '.js': // Some JS files can be treated as text
                case '.mjs': // ECMAScript module file
                case '.bat': // Batch file
                case '.sh': // Shell script
                case '.py': // Python
                case '.java': // Java
                case '.c': // C
                case '.cpp': // C++
                case '.h': // C/C++ header
                case '.hpp': // C++ header
                case '.cs': // C#
                case '.go': // Go
                case '.rb': // Ruby
                case '.php': // PHP
                case '.swift': // Swift
                case '.kt': // Kotlin
                case '.ts': // TypeScript
                case '.tsx': // TypeScript React
                case '.jsx': // JavaScript React
                case '.vue': // Vue.js Single File Component
                case '.yml': // YAML
                case '.yaml': // YAML
                case '.toml': // TOML
                case '.ini': // INI file
                case '.log': // Log file
                case '.sql': // SQL
                case '.jsonc': // JSON with comments
                    effectiveFileType = 'text/plain'; // Or more specific text types if needed
                    break;
                // Add other text-based extensions as needed
            }
        }
    }

    // Now use effectiveFileType for the check
    if (effectiveFileType && effectiveFileType.startsWith('text/')) {
        if (!internalPath.startsWith('file://')) {
            throw new Error('Invalid internalPath format. Must be a file:// URL.');
        }
        const cleanPath = internalPath.substring(7);
        try {
            console.log(`[FileManager] Reading text content for ${cleanPath} as UTF-8 (effective type: ${effectiveFileType})`);
            return await fs.readFile(cleanPath, 'utf-8');
        } catch (error) {
            console.error(`[FileManager] Error reading text content for ${cleanPath}:`, error);
            return null;
        }
    } else if (effectiveFileType === 'application/pdf') {
        if (!internalPath.startsWith('file://')) {
            throw new Error('Invalid internalPath format for PDF. Must be a file:// URL.');
        }
        const cleanPath = internalPath.substring(7);
        try {
            console.log(`[FileManager] Reading PDF content for ${cleanPath}`);
            const dataBuffer = await fs.readFile(cleanPath);
            const data = await pdf(dataBuffer);
            console.log(`[FileManager] Successfully extracted text from PDF ${cleanPath}, length: ${data.text.length}`);
            return data.text; // pdf-parse returns an object with a .text property
        } catch (error) {
            console.error(`[FileManager] Error reading or parsing PDF content for ${cleanPath}:`, error);
            return null;
        }
    } else if (effectiveFileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || effectiveFileType === 'application/msword') {
        if (!internalPath.startsWith('file://')) {
            throw new Error('Invalid internalPath format for DOCX/DOC. Must be a file:// URL.');
        }
        const cleanPath = internalPath.substring(7);
        try {
            console.log(`[FileManager] Reading DOCX/DOC content for ${cleanPath}`);
            // Mammoth expects a path or a buffer. Reading to buffer first.
            const dataBuffer = await fs.readFile(cleanPath);
            const result = await mammoth.extractRawText({ buffer: dataBuffer });
            // const result = await mammoth.convertToHtml({ path: cleanPath }); // Alternative: convert to HTML then strip tags
            console.log(`[FileManager] Successfully extracted text from DOCX/DOC ${cleanPath}, length: ${result.value.length}`);
            return result.value; // .value contains the raw text
        } catch (error) {
            console.error(`[FileManager] Error reading or parsing DOCX/DOC content for ${cleanPath}:`, error);
            return null;
        }
    }
    console.log(`[FileManager] getTextContent: File type '${effectiveFileType}' (original: '${fileType}') is not a supported text type, PDF, or DOCX/DOC for path '${internalPath}'. Returning null.`);
    return null;
}


module.exports = {
    initializeFileManager,
    storeFile,
    getFileAsBase64, // Exposing for now, might be internalized later
    getTextContent,   // Exposing for now
};