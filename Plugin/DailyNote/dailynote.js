#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

// --- Load environment variables ---
require('dotenv').config({ path: path.join(__dirname, 'config.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', 'config.env') }); // Load root config

// --- Configuration ---
const DEBUG_MODE = (process.env.DebugMode || "false").toLowerCase() === "true";
const projectBasePath = process.env.PROJECT_BASE_PATH;
const dailyNoteRootPath = projectBasePath ? path.join(projectBasePath, 'dailynote') : path.join(__dirname, '..', '..', 'dailynote');

// Config for 'create' command
const CONFIGURED_EXTENSION = (process.env.DAILY_NOTE_EXTENSION || "txt").toLowerCase() === "md" ? "md" : "txt";


// --- Debug Logging (to stderr) ---
function debugLog(message, ...args) {
    if (DEBUG_MODE) {
        console.error(`[DailyNote][Debug] ${message}`, ...args); // Log debug to stderr
    }
}

// --- Helper Function for Sanitization ---
function sanitizePathComponent(name) {
    if (!name || typeof name !== 'string') {
        return 'Untitled';
    }
    const sanitized = name.replace(/[\\/:*?"<>|]/g, '')
                         .replace(/[\x00-\x1f\x7f]/g, '')
                         .trim()
                         .replace(/^[.]+|[.]+$/g, '')
                         .trim();
    return sanitized || 'Untitled';
}

// --- Tag Processing Functions (for 'create' command) ---

function detectTagLine(content) {
    const lines = content.split('\n');
    if (lines.length === 0) {
        return { hasTag: false, lastLine: '', contentWithoutLastLine: content };
    }
    const lastLine = lines[lines.length - 1].trim();
    const tagPattern = /^Tag:\s*.+/i;
    const hasTag = tagPattern.test(lastLine);
    const contentWithoutLastLine = hasTag ? lines.slice(0, -1).join('\n') : content;
    debugLog(`Tag detection - hasTag: ${hasTag}, lastLine: "${lastLine}"`);
    return { hasTag, lastLine, contentWithoutLastLine };
}

function fixTagFormat(tagLine) {
    debugLog('Fixing tag line format:', tagLine);
    let fixed = tagLine.trim();
    fixed = fixed.replace(/^tag:\s*/i, 'Tag: ');
    if (!fixed.startsWith('Tag: ')) {
        fixed = 'Tag: ' + fixed;
    }
    const tagContent = fixed.substring(5).trim();
    let normalizedContent = tagContent
        .replace(/[\uff1a]/g, '')
        .replace(/[\uff0c]/g, ', ')
        .replace(/[\u3001]/g, ', ');
    normalizedContent = normalizedContent
        .replace(/,\s*/g, ', ')
        .replace(/,\s{2,}/g, ', ')
        .replace(/\s+,/g, ',');
    normalizedContent = normalizedContent.replace(/\s{2,}/g, ' ').trim();
    const result = 'Tag: ' + normalizedContent;
    debugLog('Fixed tag line:', result);
    return result;
}


async function processTagsInContent(contentText) {
    debugLog('Processing tags in content...');
    const detection = detectTagLine(contentText);
    if (detection.hasTag) {
        debugLog('Tag detected, fixing format...');
        const fixedTag = fixTagFormat(detection.lastLine);
        // Ensure there's exactly one newline before the tag.
        return detection.contentWithoutLastLine.trimEnd() + '\n' + fixedTag;
    } else {
        // No tag found, throw an error to be sent back to the AI.
        debugLog('No tag detected. Throwing error.');
        throw new Error("Tag line is missing. Please add a 'Tag:' line at the end of the content with appropriate keywords.");
    }
}

// --- 'create' Command Logic ---
async function handleCreateCommand(args) {
    // 兼容 'Date'/'dateString', 'Content'/'contentText', 和 'maid'/'maidName' (case-insensitive for maid)
    const maid = args.maid || args.maidName || args.Maid || args.MAID;
    const dateString = args.dateString || args.Date;
    const contentText = args.contentText || args.Content;

    debugLog(`Processing 'create' for Maid: ${maid}, Date: ${dateString}`);
    if (!maid || !dateString || !contentText) {
        return { status: "error", error: 'Invalid input for create: Missing maid/maidName, dateString/Date, or contentText/Content.' };
    }

    try {
        const processedContent = await processTagsInContent(contentText);
        debugLog('Content after tag processing (length):', processedContent.length);

        const trimmedMaidName = maid.trim();
        let folderName = trimmedMaidName;
        let actualMaidName = trimmedMaidName;
        const tagMatch = trimmedMaidName.match(/^\[(.*?)\](.*)$/);

        if (tagMatch) {
            folderName = tagMatch[1].trim();
            actualMaidName = tagMatch[2].trim();
            debugLog(`Tagged note detected. Tag: ${folderName}, Actual Maid: ${actualMaidName}`);
        } else {
            debugLog(`No tag detected. Folder: ${folderName}, Actual Maid: ${actualMaidName}`);
        }

        const sanitizedFolderName = sanitizePathComponent(folderName);
        if (folderName !== sanitizedFolderName) {
            debugLog(`Sanitized folder name from "${folderName}" to "${sanitizedFolderName}"`);
        }

        const datePart = dateString.replace(/[.\\\/\s-]/g, '-').replace(/-+/g, '-');
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        const timeStringForFile = `${hours}_${minutes}_${seconds}`;

        const dirPath = path.join(dailyNoteRootPath, sanitizedFolderName);
        const baseFileNameWithoutExt = `${datePart}-${timeStringForFile}`;
        const fileExtension = `.${CONFIGURED_EXTENSION}`;
        const finalFileName = `${baseFileNameWithoutExt}${fileExtension}`;
        const filePath = path.join(dirPath, finalFileName);

        debugLog(`Target file path: ${filePath}`);

        await fs.mkdir(dirPath, { recursive: true });
        const fileContent = `[${datePart}] - ${actualMaidName}\n${processedContent}`;
        await fs.writeFile(filePath, fileContent);
        debugLog(`Successfully wrote file (length: ${fileContent.length})`);
        return { status: "success", message: `Diary saved to ${filePath}` };
    } catch (error) {
        console.error("[DailyNote] Error during 'create' command:", error.message);
        return { status: "error", error: error.message || "An unknown error occurred during diary creation." };
    }
}


// --- 'update' Command Logic ---
async function handleUpdateCommand(args) {
    debugLog("Processing 'update' command with args:", args);

    const { target, replace, maid } = args;

    if (typeof target !== 'string' || typeof replace !== 'string') {
        return { status: "error", error: "Invalid arguments for update: 'target' and 'replace' must be strings." };
    }

    if (target.length < 15) {
        return { status: "error", error: `Security check failed: 'target' must be at least 15 characters long. Provided length: ${target.length}` };
    }

    debugLog(`Validated input for update. Target length: ${target.length}. Maid: ${maid || 'Not specified'}`);

    try {
        let modificationDone = false;
        let modifiedFilePath = null;
        const directoriesToScan = [];

        if (maid) {
            const maidRegex = /^\[(.+?)\]/;
            const match = maid.match(maidRegex);

            if (match) {
                const subfolder = match[1];
                const scanPath = path.join(dailyNoteRootPath, subfolder);
                debugLog(`Maid specifies a folder: '${subfolder}'. Scanning directory: ${scanPath}`);
                try {
                    const stats = await fs.stat(scanPath);
                    if (stats.isDirectory()) {
                        directoriesToScan.push({ name: subfolder, path: scanPath });
                    } else {
                        return { status: "error", error: `Specified diary path is not a directory: ${scanPath}` };
                    }
                } catch (e) {
                    if (e.code === 'ENOENT') {
                        return { status: "error", error: `Diary subfolder not found: ${scanPath}` };
                    }
                    throw e;
                }
            } else {
                debugLog(`Maid specified: '${maid}'. Targeting directories starting with this name in root.`);
                const allDirs = await fs.readdir(dailyNoteRootPath, { withFileTypes: true });
                for (const dirEntry of allDirs) {
                    if (dirEntry.isDirectory() && dirEntry.name.startsWith(maid)) {
                        directoriesToScan.push({ name: dirEntry.name, path: path.join(dailyNoteRootPath, dirEntry.name) });
                    }
                }
            }

            if (directoriesToScan.length === 0) {
                return { status: "error", error: `No diary folders found for maid '${maid}'.` };
            }
        } else {
            debugLog("No maid specified. Scanning all directories.");
            const characterDirs = await fs.readdir(dailyNoteRootPath, { withFileTypes: true });
            for (const dirEntry of characterDirs) {
                if (dirEntry.isDirectory()) {
                    directoriesToScan.push({ name: dirEntry.name, path: path.join(dailyNoteRootPath, dirEntry.name) });
                }
            }
        }

        for (const dir of directoriesToScan) {
            if (modificationDone) break;
            debugLog(`Scanning directory: ${dir.path}`);
            try {
                const files = await fs.readdir(dir.path);
                const txtFiles = files.filter(file => file.toLowerCase().endsWith('.txt') || file.toLowerCase().endsWith('.md')).sort();
                debugLog(`Found ${txtFiles.length} diary files for ${dir.name}`);

                for (const file of txtFiles) {
                    if (modificationDone) break;
                    const filePath = path.join(dir.path, file);
                    debugLog(`Reading file: ${filePath}`);
                    let content;
                    try {
                        content = await fs.readFile(filePath, 'utf-8');
                    } catch (readErr) {
                        console.error(`[DailyNote] Error reading diary file ${filePath}:`, readErr.message);
                        continue;
                    }

                    const index = content.indexOf(target);
                    if (index !== -1) {
                        debugLog(`Found target in file: ${filePath}`);
                        const newContent = content.substring(0, index) + replace + content.substring(index + target.length);
                        try {
                            await fs.writeFile(filePath, newContent, 'utf-8');
                            modificationDone = true;
                            modifiedFilePath = filePath;
                            debugLog(`Successfully modified file: ${filePath}`);
                            break;
                        } catch (writeErr) {
                            console.error(`[DailyNote] Error writing to diary file ${filePath}:`, writeErr.message);
                            break;
                        }
                    }
                }
            } catch (charDirError) {
                console.error(`[DailyNote] Error reading character directory ${dir.path}:`, charDirError.message);
                continue;
            }
        }

        if (modificationDone) {
            return { status: "success", result: `Successfully edited diary file: ${modifiedFilePath}` };
        } else {
            const errorMessage = maid ? `Target content not found in any diary files for maid '${maid}'.` : "Target content not found in any diary files.";
            return { status: "error", error: errorMessage };
        }

    } catch (error) {
        if (error.code === 'ENOENT') {
            return { status: "error", error: `Daily note root directory not found at ${dailyNoteRootPath}` };
        } else {
            console.error(`[DailyNote] Unexpected error during 'update' command:`, error);
            return { status: "error", error: `An unexpected error occurred: ${error.message}` };
        }
    }
}


// --- Main Execution ---
async function main() {
    let inputData = '';
    process.stdin.setEncoding('utf8');

    process.stdin.on('readable', () => {
        let chunk;
        while ((chunk = process.stdin.read()) !== null) {
            inputData += chunk;
        }
    });

    process.stdin.on('end', async () => {
        debugLog('Received stdin data:', inputData);
        let result;
        try {
            if (!inputData) {
                throw new Error("No input data received via stdin.");
            }
            const args = JSON.parse(inputData);
            const { command, ...parameters } = args;

            switch (command) {
                case 'create':
                    result = await handleCreateCommand(parameters);
                    break;
                case 'update':
                    result = await handleUpdateCommand(parameters);
                    break;
                default:
                    result = { status: "error", error: `Unknown command: '${command}'. Use 'create' or 'update'.` };
            }
        } catch (error) {
            console.error("[DailyNote] Error processing request:", error.message);
            result = { status: "error", error: error.message || "An unknown error occurred." };
        }

        process.stdout.write(JSON.stringify(result));
        process.exit(result.status === "success" ? 0 : 1);
    });

    process.stdin.on('error', (err) => {
        console.error("[DailyNote] Stdin error:", err);
        process.stdout.write(JSON.stringify({ status: "error", error: "Error reading input." }));
        process.exit(1);
    });
}

main();