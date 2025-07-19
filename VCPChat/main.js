// main.js - Electron 主窗口

const sharp = require('sharp'); // 确保在文件顶部引入

const { app, BrowserWindow, ipcMain, nativeTheme, globalShortcut, screen, clipboard, shell, dialog } = require('electron'); // Added screen, clipboard, and shell
// selection-hook for non-clipboard text capture on Windows
let SelectionHook = null;
try {
    if (process.platform === 'win32') {
        SelectionHook = require('selection-hook');
        console.log('selection-hook loaded successfully.');
    } else {
        console.log('selection-hook is only available on Windows, text selection feature will be disabled.');
    }
} catch (error) {
    console.error('Failed to load selection-hook:', error);
}
const path = require('path');
const fs = require('fs-extra'); // Using fs-extra for convenience
const os = require('os');
const { spawn } = require('child_process'); // For executing local python
const { Worker } = require('worker_threads');
const WebSocket = require('ws'); // For VCPLog notifications
const { GlobalKeyboardListener } = require('node-global-key-listener');
const fileManager = require('./modules/fileManager'); // Import the new file manager
const groupChat = require('./Groupmodules/groupchat'); // Import the group chat module
const DistributedServer = require('./VCPDistributedServer/VCPDistributedServer.js'); // Import the new distributed server
const windowHandlers = require('./modules/ipc/windowHandlers'); // Import window IPC handlers
const settingsHandlers = require('./modules/ipc/settingsHandlers'); // Import settings IPC handlers
const fileDialogHandlers = require('./modules/ipc/fileDialogHandlers'); // Import file dialog handlers
const { getAgentConfigById, ...agentHandlers } = require('./modules/ipc/agentHandlers'); // Import agent handlers
const chatHandlers = require('./modules/ipc/chatHandlers'); // Import chat handlers
const groupChatHandlers = require('./modules/ipc/groupChatHandlers'); // Import group chat handlers
const musicMetadata = require('music-metadata');

// --- Configuration Paths ---
// Data storage will be within the project's 'AppData' directory
const PROJECT_ROOT = __dirname; // __dirname is the directory of main.js
const APP_DATA_ROOT_IN_PROJECT = path.join(PROJECT_ROOT, 'AppData');

const AGENT_DIR = path.join(APP_DATA_ROOT_IN_PROJECT, 'Agents');
const USER_DATA_DIR = path.join(APP_DATA_ROOT_IN_PROJECT, 'UserData'); // For chat histories and attachments
const SETTINGS_FILE = path.join(APP_DATA_ROOT_IN_PROJECT, 'settings.json');
const USER_AVATAR_FILE = path.join(USER_DATA_DIR, 'user_avatar.png'); // Standardized user avatar file
const MUSIC_PLAYLIST_FILE = path.join(APP_DATA_ROOT_IN_PROJECT, 'songlist.json');
const MUSIC_COVER_CACHE_DIR = path.join(APP_DATA_ROOT_IN_PROJECT, 'MusicCoverCache');
const NETWORK_NOTES_CACHE_FILE = path.join(APP_DATA_ROOT_IN_PROJECT, 'network-notes-cache.json'); // Cache for network notes

// Define a specific agent ID for notes attachments
const NOTES_AGENT_ID = 'notes_attachments_agent';

let mainWindow;
let vcpLogWebSocket;
let vcpLogReconnectInterval;
let openChildWindows = [];
let assistantWindow = null; // Keep track of the assistant window
let assistantBarWindow = null; // Keep track of the assistant bar window
let lastProcessedSelection = ''; // To avoid re-triggering on the same text
let selectionListenerActive = false;
let selectionHookInstance = null; // To hold the instance of SelectionHook
let mouseListener = null; // To hold the global mouse listener instance
let hideBarTimeout = null; // Timer for delayed hiding of the assistant bar
let distributedServer = null; // To hold the distributed server instance
let notesWindow = null; // To hold the single instance of the notes window
let musicWindow = null; // To hold the single instance of the music window
let currentSongInfo = null; // To store currently playing song info
let translatorWindow = null; // To hold the single instance of the translator window
let themesWindow = null; // To hold the single instance of the themes window
let networkNotesTreeCache = null; // In-memory cache for the network notes
const NOTES_MODULE_DIR = path.join(APP_DATA_ROOT_IN_PROJECT, 'Notemodules');


function processSelectedText(selectionData) {
    const selectedText = selectionData.text;
    // If selection is cleared (empty text), hide the bar and stop.
    if (!selectedText || selectedText.trim() === '') {
        if (assistantBarWindow && !assistantBarWindow.isDestroyed() && assistantBarWindow.isVisible()) {
            assistantBarWindow.hide();
        }
        lastProcessedSelection = ''; // Also clear the last processed text
        return;
    }

    // If the same text is selected again and the bar is already visible, do nothing.
    if (selectedText === lastProcessedSelection && assistantBarWindow && assistantBarWindow.isVisible()) {
        return;
    }
    lastProcessedSelection = selectedText;
    console.log('[Main] New text captured:', selectedText);

    if (!assistantBarWindow || assistantBarWindow.isDestroyed()) {
        console.error('[Main] Assistant bar window is not available.');
        return;
    }

    let refPoint;

    // Prioritize mouse position from the hook if it's valid (not 0,0)
    if (selectionData.mousePosEnd && (selectionData.mousePosEnd.x > 0 || selectionData.mousePosEnd.y > 0)) {
        refPoint = { x: selectionData.mousePosEnd.x, y: selectionData.mousePosEnd.y + 15 };
        console.log('[Main] Using mousePosEnd for positioning:', refPoint);
    // Fallback to the selection rectangle's bottom corner if valid
    } else if (selectionData.endBottom && (selectionData.endBottom.x > 0 || selectionData.endBottom.y > 0)) {
        refPoint = { x: selectionData.endBottom.x, y: selectionData.endBottom.y + 15 };
        console.log('[Main] Using endBottom for positioning:', refPoint);
    // If hook data is invalid or unavailable, use the global cursor position as the most reliable fallback.
    } else {
        const cursorPos = screen.getCursorScreenPoint();
        refPoint = { x: cursorPos.x, y: cursorPos.y + 15 };
        console.log('[Main] Hook position invalid, falling back to cursor position:', refPoint);
    }
    
    // Ensure the point is scaled correctly for the display
    // Ensure the point is scaled correctly for the display
    const dipPoint = screen.screenToDipPoint(refPoint);

    // Get the bar's width (which is in DIPs) to center it.
    const barWidth = 330; // The width is fixed at creation.
    const finalX = Math.round(dipPoint.x - (barWidth / 2));
    const finalY = Math.round(dipPoint.y);

    setImmediate(() => {
        assistantBarWindow.setPosition(finalX, finalY);
        assistantBarWindow.showInactive(); // Show the window without activating/focusing it

        // Start listening for a global click to hide the bar
        startGlobalMouseListener();

        (async () => {
            try {
                const settings = await fs.readJson(SETTINGS_FILE);
                if (settings.assistantEnabled && settings.assistantAgent) {
                    const agentConfig = await getAgentConfigById(settings.assistantAgent);
                    assistantBarWindow.webContents.send('assistant-bar-data', {
                        agentAvatarUrl: agentConfig.avatarUrl,
                        theme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
                    });
                }
            } catch (error) {
                console.error('[Main] Error sending data to assistant bar:', error);
            }
        })();
    });
}

// --- Global Mouse Listener for Assistant Bar ---
function startGlobalMouseListener() {
    if (mouseListener) {
        return;
    }
    mouseListener = new GlobalKeyboardListener();

    mouseListener.addListener((e, down) => {
        if (e.state === 'DOWN') {
            // Instead of immediate hide, set a timeout.
            // This gives the 'assistant-action' a chance to cancel it if the click was inside.
            if (hideBarTimeout) clearTimeout(hideBarTimeout); // Clear previous timeout if any
            hideBarTimeout = setTimeout(() => {
                console.log(`[Main] Global mouse down triggered hide after timeout. Button: ${e.name}`);
                hideAssistantBarAndStopListener();
            }, 150); // A short delay (e.g., 150ms)
        }
    });
}

function hideAssistantBarAndStopListener() {
    // Clear any pending hide timeout
    if (hideBarTimeout) {
        clearTimeout(hideBarTimeout);
        hideBarTimeout = null;
    }

    // Hide the window
    if (assistantBarWindow && !assistantBarWindow.isDestroyed() && assistantBarWindow.isVisible()) {
        assistantBarWindow.hide();
    }
    // Stop and kill the listener
    if (mouseListener) {
        mouseListener.kill();
        mouseListener = null;
        console.log('[Main] Global mouse listener stopped.');
    }
}

// --- Selection Listener ---
function startSelectionListener() {
    if (selectionListenerActive || !SelectionHook) {
        if (!SelectionHook) {
            console.log('[Main] SelectionHook not available on this platform. Listener not started.');
        } else {
            console.log('[Main] Selection listener is already running.');
        }
        return;
    }

    try {
        selectionHookInstance = new SelectionHook();
        selectionHookInstance.on('text-selection', processSelectedText);
        
        selectionHookInstance.on('error', (error) => {
            console.error('Error in SelectionHook:', error);
        });

        if (selectionHookInstance.start({ debug: false })) { // Set debug to true for verbose logging
            selectionListenerActive = true;
            console.log('[Main] selection-hook listener started.');
        } else {
            console.error('[Main] Failed to start selection-hook listener.');
            selectionHookInstance = null;
        }
    } catch (e) {
        console.error('[Main] Failed to instantiate or start selection-hook listener:', e);
        selectionHookInstance = null;
    }
}

function stopSelectionListener() {
    if (!selectionListenerActive || !selectionHookInstance) {
        return;
    }
    try {
        selectionHookInstance.stop();
        console.log('[Main] selection-hook listener stopped.');
    } catch (e) {
        console.error('[Main] Failed to stop selection-hook listener:', e);
    } finally {
        selectionHookInstance = null;
        selectionListenerActive = false;
    }
}


// --- Assistant Bar Window Creation ---
function createAssistantBarWindow() {
    // This function is now an initializer for a reusable, hidden window.
    // It's called once at startup.
    assistantBarWindow = new BrowserWindow({
        width: 410,
        height: 40,
        show: false, // Create hidden
        frame: false,
        transparent: true,
        hasShadow: false,
        alwaysOnTop: true,
        resizable: false,
        movable: true,
        skipTaskbar: true,
        focusable: false, // Prevent the window from taking focus
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
        }
    });

    assistantBarWindow.loadFile(path.join(__dirname, 'Assistantmodules/assistant-bar.html'));

    // The 'ready-to-show' logic that sent data prematurely has been removed.
    // The renderer will now request this data when it's ready.

    assistantBarWindow.on('blur', () => {
        // Hide the window on blur so it can be reused, instead of closing it.
        if (assistantBarWindow && !assistantBarWindow.isDestroyed() && assistantBarWindow.isVisible()) {
            assistantBarWindow.hide();
        }
    });

    assistantBarWindow.on('closed', () => {
        // If it's actually closed (e.g., app quit), nullify the variable.
        assistantBarWindow = null;
    });
}


// --- Assistant Window Creation ---
function createAssistantWindow(data) {
    if (assistantWindow && !assistantWindow.isDestroyed()) {
        assistantWindow.focus();
        // Optionally, send new data to the existing window
        assistantWindow.webContents.send('assistant-data', data);
        return;
    }

    assistantWindow = new BrowserWindow({
        width: 450,
        height: 600,
        minWidth: 350,
        minHeight: 400,
        title: '划词助手',
        modal: false,
        frame: false,
        titleBarStyle: 'hidden',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        icon: path.join(__dirname, 'assets', 'icon.png'),
        show: false,
        resizable: true,
        alwaysOnTop: false, // Keep assistant on top
    });

    assistantWindow.loadFile(path.join(__dirname, 'Assistantmodules/assistant.html'));
    
    assistantWindow.once('ready-to-show', () => {
        assistantWindow.show();
        // Send initial data to the window
        assistantWindow.webContents.send('assistant-data', data);
    });

    assistantWindow.on('closed', () => {
        assistantWindow = null;
    });
}

// --- Main Window Creation ---
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        frame: false, // 移除原生窗口框架
        titleBarStyle: 'hidden', // 隐藏标题栏
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,    // 恢复: 开启上下文隔离
            nodeIntegration: false,  // 恢复: 关闭Node.js集成在渲染进程
            spellcheck: true, // Enable spellcheck for input fields
        },
        icon: path.join(__dirname, 'assets', 'icon.png'), // Add an icon
        title: 'VCP AI 聊天客户端',
        show: false, // Don't show until ready
    });

    mainWindow.loadFile('main.html');

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.setMenu(null); // 移除应用程序菜单栏

    // Set theme source to 'system' by default. The renderer will send the saved preference on launch.
    nativeTheme.themeSource = 'system';

    // Listen for window events to notify renderer
    mainWindow.on('maximize', () => {
        if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
            mainWindow.webContents.send('window-maximized');
        }
    });
    mainWindow.on('unmaximize', () => {
        if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
            mainWindow.webContents.send('window-unmaximized');
        }
    });

    // Listen for theme changes and notify all relevant windows
    nativeTheme.on('updated', () => {
        const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
        console.log(`[Main] Theme updated to: ${theme}. Notifying windows.`);
        
        // Notify main window
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('theme-updated', theme);
        }
        // Notify assistant bar
        if (assistantBarWindow && !assistantBarWindow.isDestroyed()) {
            assistantBarWindow.webContents.send('theme-updated', theme);
        }
        // Notify assistant window
        if (assistantWindow && !assistantWindow.isDestroyed()) {
            assistantWindow.webContents.send('theme-updated', theme);
        }
        // Notify any other open child windows that might need theme updates
        openChildWindows.forEach(win => {
            if (win && !win.isDestroyed()) {
                win.webContents.send('theme-updated', theme);
            }
        });
    });
}

// --- App Lifecycle ---
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // 有人试图运行第二个实例，我们应该聚焦于我们的窗口
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

// --- Singleton Music Window Creation Function ---
function createOrFocusMusicWindow() {
    return new Promise((resolve, reject) => {
        if (musicWindow && !musicWindow.isDestroyed()) {
            console.log('[Main Process] Music window already exists. Focusing it.');
            musicWindow.focus();
            resolve(musicWindow);
            return;
        }

        console.log('[Main Process] Creating new music window instance.');
        musicWindow = new BrowserWindow({
            width: 550,
            height: 800,
            minWidth: 400,
            minHeight: 600,
            title: '音乐播放器',
            modal: false,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
                devTools: true
            },
            icon: path.join(__dirname, 'assets', 'icon.png'),
            show: false
        });

        musicWindow.loadFile(path.join(__dirname, 'Musicmodules', 'music.html'));
        
        openChildWindows.push(musicWindow);
        musicWindow.setMenu(null);

        musicWindow.once('ready-to-show', () => {
            musicWindow.show();
        });

        // Wait for the renderer to signal that it's ready
        ipcMain.once('music-renderer-ready', (event) => {
            // Ensure the signal is from the window we just created
            if (event.sender === musicWindow.webContents) {
                console.log('[Main Process] Received "music-renderer-ready" signal. Resolving promise.');
                resolve(musicWindow);
            }
        });

        musicWindow.on('closed', () => {
            openChildWindows = openChildWindows.filter(win => win !== musicWindow);
            musicWindow = null;
        });

        musicWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
            console.error(`[Main Process] Music window failed to load: ${errorDescription} (code: ${errorCode})`);
            reject(new Error(`Music window failed to load: ${errorDescription}`));
        });
    });
}

// --- Music Control Handler ---
async function handleMusicControl(args) {
    const { command, target } = args;
    console.log(`[MusicControl] Received command: ${command}, Target: ${target}`);

    try {
        // 优化点3: 确保音乐窗口存在，如果不存在则创建并等待其加载完成
        const targetWindow = await createOrFocusMusicWindow();

        // 窗口已加载完成，可以直接发送命令
        targetWindow.webContents.send('music-command', { command, target });

        const successMsg = `指令 '${command}' 已成功发送给播放器。`;
        console.log(`[MusicControl] ${successMsg}`);
        return { status: 'success', message: successMsg };
    } catch (error) {
        const errorMsg = `处理音乐指令失败: ${error.message}`;
        console.error(`[MusicControl] ${errorMsg}`, error);
        return { status: 'error', message: errorMsg };
    }
}

  function createThemesWindow() {
      if (themesWindow && !themesWindow.isDestroyed()) {
          themesWindow.focus();
          return;
      }
      themesWindow = new BrowserWindow({
          width: 850,
          height: 700,
          title: '主题选择',
          modal: false,
          webPreferences: {
              preload: path.join(__dirname, 'preload.js'),
              contextIsolation: true,
          },
          icon: path.join(__dirname, 'assets', 'icon.png'),
          show: false,
      });

      themesWindow.loadFile(path.join(__dirname, 'Themesmodules/themes.html'));
      themesWindow.setMenu(null); // 移除应用程序菜单栏
      openChildWindows.push(themesWindow); // Add to broadcast list
      
      themesWindow.once('ready-to-show', () => {
          themesWindow.show();
      });

      themesWindow.on('closed', () => {
          openChildWindows = openChildWindows.filter(win => win !== themesWindow); // Remove from broadcast list
          themesWindow = null;
      });
  }

  app.whenReady().then(async () => { // Make the function async
    fs.ensureDirSync(APP_DATA_ROOT_IN_PROJECT); // Ensure the main AppData directory in project exists
    fs.ensureDirSync(AGENT_DIR);
    fs.ensureDirSync(USER_DATA_DIR);
    fileManager.initializeFileManager(USER_DATA_DIR, AGENT_DIR); // Initialize FileManager
    groupChat.initializePaths({ APP_DATA_ROOT_IN_PROJECT, AGENT_DIR, USER_DATA_DIR, SETTINGS_FILE }); // Initialize GroupChat paths
    settingsHandlers.initialize({ SETTINGS_FILE, USER_AVATAR_FILE, AGENT_DIR }); // Initialize settings handlers


    // Add IPC handler for path operations
    ipcMain.handle('path:dirname', (event, p) => {
        return path.dirname(p);
    });
    // Add IPC handler for getting the extension name of a path
    ipcMain.handle('path:extname', (event, p) => {
        return path.extname(p);
    });


    // Group Chat IPC Handlers are now in modules/ipc/groupChatHandlers.js
 
    // Translator IPC Handlers
    const TRANSLATOR_DIR = path.join(APP_DATA_ROOT_IN_PROJECT, 'Translatormodules');
    fs.ensureDirSync(TRANSLATOR_DIR); // Ensure the Translator directory exists

    ipcMain.handle('open-translator-window', async (event) => {
        if (translatorWindow && !translatorWindow.isDestroyed()) {
            translatorWindow.focus();
            return;
        }
        translatorWindow = new BrowserWindow({
            width: 1000,
            height: 700,
            minWidth: 800,
            minHeight: 600,
            title: '翻译',
            modal: false,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
                devTools: true
            },
            icon: path.join(__dirname, 'assets', 'icon.png'),
            show: false
        });

        let settings = {};
        try {
            if (await fs.pathExists(SETTINGS_FILE)) {
                settings = await fs.readJson(SETTINGS_FILE);
            }
        } catch (readError) {
            console.error('Failed to read settings file for translator window:', readError);
        }

        const vcpServerUrl = settings.vcpServerUrl || '';
        const vcpApiKey = settings.vcpApiKey || '';

        const translatorUrl = `file://${path.join(__dirname, 'Translatormodules', 'translator.html')}?vcpServerUrl=${encodeURIComponent(vcpServerUrl)}&vcpApiKey=${encodeURIComponent(vcpApiKey)}`;
        console.log(`[Main Process] Attempting to load URL in translator window: ${translatorUrl.substring(0, 200)}...`);
        
        translatorWindow.webContents.on('did-start-loading', () => {
            console.log(`[Main Process] translatorWindow webContents did-start-loading for URL: ${translatorUrl.substring(0, 200)}`);
        });

        translatorWindow.webContents.on('dom-ready', () => {
            console.log(`[Main Process] translatorWindow webContents dom-ready for URL: ${translatorWindow.webContents.getURL()}`);
        });

        translatorWindow.webContents.on('did-finish-load', () => {
            console.log(`[Main Process] translatorWindow webContents did-finish-load for URL: ${translatorWindow.webContents.getURL()}`);
        });

        translatorWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
            console.error(`[Main Process] translatorWindow webContents did-fail-load: Code ${errorCode}, Desc: ${errorDescription}, URL: ${validatedURL}`);
        });

        translatorWindow.loadURL(translatorUrl)
            .then(() => {
                console.log(`[Main Process] translatorWindow successfully initiated URL loading (loadURL resolved): ${translatorUrl.substring(0, 200)}`);
            })
            .catch((err) => {
                console.error(`[Main Process] translatorWindow FAILED to initiate URL loading (loadURL rejected): ${translatorUrl.substring(0, 200)}`, err);
            });

        openChildWindows.push(translatorWindow);
        translatorWindow.setMenu(null);

        translatorWindow.once('ready-to-show', () => {
            console.log(`[Main Process] translatorWindow is ready-to-show. Window Title: "${translatorWindow.getTitle()}". Calling show().`);
            translatorWindow.show();
            console.log('[Main Process] translatorWindow show() called.');
        });

        translatorWindow.on('closed', () => {
            console.log('[Main Process] translatorWindow has been closed.');
            openChildWindows = openChildWindows.filter(win => win !== translatorWindow);
            translatorWindow = null;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.focus(); // 聚焦主窗口
            }
        });
    });

    // Notes IPC Handlers
    const NOTES_DIR = path.join(APP_DATA_ROOT_IN_PROJECT, 'Notemodules');
    fs.ensureDirSync(NOTES_DIR); // Ensure the Notes directory exists

    // --- Start of New/Updated Notes IPC Handlers ---

    // Helper to check if a file path is on the network notes drive
    async function isNetworkNote(filePath) {
        try {
            if (await fs.pathExists(SETTINGS_FILE)) {
                const settings = await fs.readJson(SETTINGS_FILE);
                const networkPath = settings.networkNotesPath;
                // Check if a network path is configured and the file path starts with it
                if (networkPath && filePath.startsWith(networkPath)) {
                    return true;
                }
            }
        } catch (e) { console.error("Error checking for network note:", e); }
        return false;
    }

    // Helper function to recursively read the directory structure
    async function readDirectoryStructure(dirPath) {
        const items = [];
        const files = await fs.readdir(dirPath, { withFileTypes: true });
        const orderFilePath = path.join(dirPath, '.folder-order.json');
        let orderedIds = [];

        try {
            if (await fs.pathExists(orderFilePath)) {
                const orderData = await fs.readJson(orderFilePath);
                orderedIds = orderData.order || [];
            }
        } catch (e) {
            console.error(`Error reading order file ${orderFilePath}:`, e);
        }

        for (const file of files) {
            const fullPath = path.join(dirPath, file.name);
            if (file.name.startsWith('.') || file.name.endsWith('.json')) continue; // Skip order and hidden files

            if (file.isDirectory()) {
                items.push({
                    id: `folder-${Buffer.from(fullPath).toString('hex')}`,
                    type: 'folder',
                    name: file.name,
                    path: fullPath,
                    children: await readDirectoryStructure(fullPath)
                });
            } else if (file.isFile() && (file.name.endsWith('.txt') || file.name.endsWith('.md'))) {
                try {
                    const content = await fs.readFile(fullPath, 'utf8');
                    const lines = content.split('\n');
                    const id = `note-${Buffer.from(fullPath).toString('hex')}`;

                    let title, username, timestamp, noteContent;

                    // Always use the filename (without extension) as the default title.
                    title = path.basename(file.name, path.extname(file.name));

                    // Check if the first line is a valid header that should be stripped.
                    const header = lines[0];
                    const parts = header ? header.split('-') : [];
                    const potentialTimestamp = parts.length > 0 ? parseInt(parts[parts.length - 1], 10) : NaN;

                    // A header is valid if it has >= 3 parts & the last part is a number (our timestamp).
                    if (parts.length >= 3 && !isNaN(potentialTimestamp) && potentialTimestamp > 0) {
                        // It's a valid header. Use its metadata and strip it from the content.
                        username = parts[parts.length - 2]; // Second to last part is username
                        timestamp = potentialTimestamp;
                        noteContent = lines.slice(1).join('\n');
                        
                        // Use the title from the header, but fall back to filename if header title is empty.
                        const headerTitle = parts.slice(0, -2).join('-');
                        title = headerTitle || path.basename(file.name, path.extname(file.name));
                    } else {
                        // It's not a valid header. Use the full content and file mtime.
                        noteContent = content;
                        username = 'unknown';
                        timestamp = (await fs.stat(fullPath)).mtime.getTime();
                    }

                    items.push({
                        id,
                        type: 'note',
                        title,
                        username,
                        timestamp,
                        content: noteContent,
                        fileName: file.name,
                        path: fullPath
                    });
                } catch (readError) {
                    console.error(`Error reading note file ${file.name}:`, readError);
                }
            }
        }

        // Sort items based on the .folder-order.json file, with fallbacks
        items.sort((a, b) => {
            const indexA = orderedIds.indexOf(a.id);
            const indexB = orderedIds.indexOf(b.id);

            if (indexA !== -1 && indexB !== -1) {
                return indexA - indexB; // Both are in the order file
            }
            if (indexA !== -1) return -1; // Only A is in the order file, so it comes first
            if (indexB !== -1) return 1;  // Only B is in the order file, so it comes first

            // Fallback for items not in the order file: folders first, then by name
            if (a.type === 'folder' && b.type !== 'folder') return -1;
            if (a.type !== 'folder' && b.type === 'folder') return 1;
            const nameA = a.name || a.title;
            const nameB = b.name || b.title;
            return nameA.localeCompare(nameB);
        });

        return items;
    }

    // IPC handler to read the entire note tree structure
    // IPC handler to read only the LOCAL note tree structure for fast initial load
    ipcMain.handle('read-notes-tree', async () => {
        try {
            return await readDirectoryStructure(NOTES_DIR);
        } catch (error) {
            console.error('读取本地笔记结构失败:', error);
            return { error: error.message };
        }
    });

    // Centralized function to scan network notes, update cache, and notify renderer
    async function scanAndCacheNetworkNotes() {
        try {
            if (await fs.pathExists(SETTINGS_FILE)) {
                const settings = await fs.readJson(SETTINGS_FILE);
                const networkPath = settings.networkNotesPath;

                if (networkPath && await fs.pathExists(networkPath)) {
                    console.log(`[scanAndCacheNetworkNotes] Starting async scan of: ${networkPath}`);
                    const networkNotes = await readDirectoryStructure(networkPath);
                    let networkTree = null;

                    if (networkNotes.length > 0) {
                        networkTree = {
                            id: 'folder-network-notes-root',
                            type: 'folder',
                            name: '云笔记dailynote',
                            path: networkPath,
                            children: networkNotes,
                            isNetwork: true
                        };
                    }

                    // Update cache (in-memory and on-disk)
                    networkNotesTreeCache = networkTree;
                    if (networkTree) {
                        await fs.writeJson(NETWORK_NOTES_CACHE_FILE, networkTree);
                    } else {
                        // If network folder is empty or inaccessible, clear the cache
                        await fs.remove(NETWORK_NOTES_CACHE_FILE);
                    }

                    // Push the result to the notes window when done
                    if (notesWindow && !notesWindow.isDestroyed()) {
                        notesWindow.webContents.send('network-notes-scanned', networkTree);
                    }
                }
            }
        } catch (e) {
            console.error('Error during async network notes scan:', e);
            if (notesWindow && !notesWindow.isDestroyed()) {
                notesWindow.webContents.send('network-notes-scan-error', { error: e.message });
            }
        }
    }

    // IPC handler to trigger the ASYNCHRONOUS scanning of network notes
    ipcMain.on('scan-network-notes', () => {
        scanAndCacheNetworkNotes();
    });

    // IPC handler to get the cached network notes tree for faster startup
    ipcMain.handle('get-cached-network-notes', async () => {
        return await fs.pathExists(NETWORK_NOTES_CACHE_FILE) ? await fs.readJson(NETWORK_NOTES_CACHE_FILE) : null;
    });

    // IPC handler to write a note file
    ipcMain.handle('write-txt-note', async (event, noteData) => {
        try {
            const { title, username, timestamp, content, oldFilePath, directoryPath, ext } = noteData;
            
            let filePath;
            let isNewNote = false;

            if (oldFilePath && await fs.pathExists(oldFilePath)) {
                // This is an existing note. Use its path. DO NOT RENAME.
                filePath = oldFilePath;
            } else {
                // This is a new note. Create a new path.
                isNewNote = true;
                const targetDir = directoryPath || NOTES_DIR;
                await fs.ensureDir(targetDir);
                const extension = ext || '.md'; // Use provided ext, or default to .md
                const newFileName = `${title}${extension}`;
                filePath = path.join(targetDir, newFileName);

                if (await fs.pathExists(filePath)) {
                    throw new Error(`A note named '${title}' already exists.`);
                }
            }

            const fileContent = `${title}-${username}-${timestamp}\n${content}`;
            await fs.writeFile(filePath, fileContent, 'utf8');
            console.log(`Note content saved to: ${filePath}`);

            // If it's a network note, trigger a background rescan
            if (await isNetworkNote(filePath)) {
                console.log(`Network note saved: ${filePath}. Triggering background rescan.`);
                setImmediate(scanAndCacheNetworkNotes);
            }
            
            const newId = `note-${Buffer.from(filePath).toString('hex')}`;
            return {
                success: true,
                filePath: filePath,
                fileName: path.basename(filePath),
                id: newId,
                isNewNote: isNewNote // Let the frontend know if it was a creation
            };
        } catch (error) {
            console.error('[Main Process - write-txt-note] Failed to save note:', error);
            return { success: false, error: error.message };
        }
    });

    // IPC handler to delete a file or a folder
    ipcMain.handle('delete-item', async (event, itemPath) => {
        try {
            if (await fs.pathExists(itemPath)) {
                const isNetwork = await isNetworkNote(itemPath);

                if (isNetwork) {
                    // For network paths, use direct deletion as trashItem can be unreliable.
                    await fs.remove(itemPath);
                    console.log(`Item permanently deleted (network): ${itemPath}`);
                } else {
                    // For local paths, move to trash.
                    await shell.trashItem(itemPath);
                    console.log(`Item moved to trash (local): ${itemPath}`);
                }

                if (isNetwork) {
                    console.log(`Network item deleted: ${itemPath}. Triggering background rescan.`);
                    setImmediate(scanAndCacheNetworkNotes);
                }
                
                // Let the renderer know if it should wait for a network scan or reload local immediately.
                return { success: true, networkRescanTriggered: isNetwork };
            }
            return { success: false, error: 'Item not found.' };
        } catch (error) {
            console.error('Failed to delete item:', error);
            return { success: false, error: error.message };
        }
    });

    // IPC handler to create a new folder
    ipcMain.handle('create-note-folder', async (event, { parentPath, folderName }) => {
        try {
            const newFolderPath = path.join(parentPath, folderName);
            if (await fs.pathExists(newFolderPath)) {
                return { success: false, error: 'A folder with the same name already exists.' };
            }
            await fs.ensureDir(newFolderPath);
            console.log(`Folder created: ${newFolderPath}`);

            // If it's a network folder, trigger a background rescan
            if (await isNetworkNote(newFolderPath)) {
                console.log(`Network folder created: ${newFolderPath}. Triggering background rescan.`);
                setImmediate(scanAndCacheNetworkNotes);
            }

            const newId = `folder-${Buffer.from(newFolderPath).toString('hex')}`;
            return { success: true, path: newFolderPath, id: newId };
        } catch (error) {
            console.error('Failed to create folder:', error);
            return { success: false, error: error.message };
        }
    });

    // IPC handler to rename a file or folder
    ipcMain.handle('rename-item', async (event, { oldPath, newName, newContentBody, ext }) => {
        try {
            const parentDir = path.dirname(oldPath);
            const stat = await fs.stat(oldPath);
            const isDirectory = stat.isDirectory();
            
            const sanitizedNewName = newName.replace(/[\\/:*?"<>|]/g, '');
            if (!sanitizedNewName) {
                return { success: false, error: 'Invalid name provided.' };
            }

            const newPath = isDirectory
                ? path.join(parentDir, sanitizedNewName)
                : path.join(parentDir, sanitizedNewName + (ext || path.extname(oldPath)));

            if (oldPath === newPath) {
                // If only content is changing, not the name, we should still proceed.
                if (newContentBody === undefined) {
                    return { success: true, newPath, id: `${isDirectory ? 'folder' : 'note'}-${Buffer.from(oldPath).toString('hex')}` };
                }
            }

            if (oldPath !== newPath && await fs.pathExists(newPath)) {
                return { success: false, error: 'A file or folder with the same name already exists.' };
            }

            if (isDirectory) {
                // For directories, rename the folder AND update the parent's order file.
                await fs.rename(oldPath, newPath);
                
                const orderFilePath = path.join(parentDir, '.folder-order.json');
                if (await fs.pathExists(orderFilePath)) {
                    try {
                        const orderData = await fs.readJson(orderFilePath);
                        const oldId = `folder-${Buffer.from(oldPath).toString('hex')}`;
                        const newId = `folder-${Buffer.from(newPath).toString('hex')}`;
                        const itemIndex = orderData.order.indexOf(oldId);
                        if (itemIndex !== -1) {
                            orderData.order[itemIndex] = newId;
                            await fs.writeJson(orderFilePath, orderData, { spaces: 2 });
                        }
                    } catch (e) {
                        console.error(`Failed to update order file during folder rename: ${orderFilePath}`, e);
                        // Don't block the rename operation if order update fails
                    }
                }
            } else {
                // For notes, we need to update the content AND potentially the filename.
                const content = await fs.readFile(oldPath, 'utf8');
                const lines = content.split('\n');
                let newFileContent = content; // Default to old content if header is malformed

                if (lines.length > 0) {
                    const header = lines[0];
                    const oldContentBody = lines.slice(1).join('\n');
                    const contentBody = newContentBody !== undefined ? newContentBody : oldContentBody;
                    
                    const parts = header.split('-');
                    if (parts.length >= 3) {
                        const timestampStr = parts.pop();
                        const username = parts.pop();
                        // The original title is parts.join('-'), but we don't need it.
                        
                        const newHeader = `${sanitizedNewName}-${username}-${timestampStr}`;
                        newFileContent = `${newHeader}\n${contentBody}`;
                    }
                }
                
                // If the path is the same, just overwrite. If different, write new and remove old.
                await fs.writeFile(newPath, newFileContent, 'utf8');
                if (oldPath !== newPath) {
                    await fs.remove(oldPath);
                }

                // Update order file for notes as well
                const orderFilePath = path.join(parentDir, '.folder-order.json');
                if (await fs.pathExists(orderFilePath)) {
                    try {
                        const orderData = await fs.readJson(orderFilePath);
                        const oldId = `note-${Buffer.from(oldPath).toString('hex')}`;
                        const newId = `note-${Buffer.from(newPath).toString('hex')}`;
                        const itemIndex = orderData.order.indexOf(oldId);
                        if (itemIndex !== -1) {
                            orderData.order[itemIndex] = newId;
                            await fs.writeJson(orderFilePath, orderData, { spaces: 2 });
                        }
                    } catch (e) {
                        console.error(`Failed to update order file during note rename: ${orderFilePath}`, e);
                    }
                }
            }

            console.log(`Renamed/Updated successfully: from ${oldPath} to ${newPath}`);

            // If it's a network item, trigger a background rescan
            if (await isNetworkNote(newPath)) {
                console.log(`Network item renamed/moved: ${newPath}. Triggering background rescan.`);
                setImmediate(scanAndCacheNetworkNotes);
            }
            
            const type = isDirectory ? 'folder' : 'note';
            const newId = `${type}-${Buffer.from(newPath).toString('hex')}`;
            return { success: true, newPath, newId };
        } catch (error) {
            console.error('Rename failed:', error);
            return { success: false, error: error.message };
        }
    });

    // IPC handler to move files/folders
    // IPC handler to move files/folders (Refactored for clarity and single source of truth)
    ipcMain.handle('notes:move-items', async (event, { sourcePaths, target }) => {
        try {
            const { destPath, targetId, position } = target;
            const sourceDir = path.dirname(sourcePaths[0]);

            // --- Step 1: Validate move ---
            for (const sourcePath of sourcePaths) {
                if (destPath.startsWith(sourcePath + path.sep)) {
                    throw new Error('Invalid move: Cannot move a folder into itself.');
                }
                const itemName = path.basename(sourcePath);
                const potentialNewPath = path.join(destPath, itemName);
                // Allow reordering within the same directory, but prevent name collisions when moving to a new directory.
                if (sourceDir !== destPath && await fs.pathExists(potentialNewPath)) {
                    throw new Error(`An item named '${itemName}' already exists at the destination.`);
                }
            }

            // --- Step 2: Physically move files and collect new info ---
            const movedItems = [];
            for (const oldPath of sourcePaths) {
                const itemName = path.basename(oldPath);
                const newPath = path.join(destPath, itemName);
                const stat = await fs.stat(oldPath);
                const type = stat.isDirectory() ? 'folder' : 'note';
                const oldId = `${type}-${Buffer.from(oldPath).toString('hex')}`;

                if (oldPath !== newPath) {
                    await fs.move(oldPath, newPath, { overwrite: true });
                }
                
                const newId = `${type}-${Buffer.from(newPath).toString('hex')}`;
                movedItems.push({ oldId, newId, id: newId });
            }

            // --- Step 3: Update order files ---
            const movedIdsSet = new Set(movedItems.map(i => i.id));
            const movedOldIdsSet = new Set(movedItems.map(i => i.oldId));
            const newIdsArray = movedItems.map(i => i.id);

            // 3a: Update source directory's order file if it's a real move
            if (sourceDir !== destPath) {
                const sourceOrderPath = path.join(sourceDir, '.folder-order.json');
                if (await fs.pathExists(sourceOrderPath)) {
                    try {
                        const sourceOrder = await fs.readJson(sourceOrderPath);
                        sourceOrder.order = sourceOrder.order.filter(id => !movedOldIdsSet.has(id));
                        if (sourceOrder.order.length > 0) {
                            await fs.writeJson(sourceOrderPath, sourceOrder, { spaces: 2 });
                        } else {
                            await fs.remove(sourceOrderPath);
                        }
                    } catch (e) {
                        console.error(`Could not process source order file ${sourceOrderPath}:`, e);
                    }
                }
            }

            // 3b: Update destination directory's order file
            const destOrderPath = path.join(destPath, '.folder-order.json');
            let destOrderIds = [];
            if (await fs.pathExists(destOrderPath)) {
                try {
                    destOrderIds = (await fs.readJson(destOrderPath)).order || [];
                } catch (e) {
                    console.error(`Could not read destination order file ${destOrderPath}, will regenerate.`, e);
                }
            }

            // Filter out any items that are being moved from the destination's current order
            let finalOrder = destOrderIds.filter(id => !movedIdsSet.has(id));

            // Insert moved items at the correct position
            if (targetId && position !== 'inside') {
                const targetIndex = finalOrder.indexOf(targetId);
                if (targetIndex !== -1) {
                    const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
                    finalOrder.splice(insertIndex, 0, ...newIdsArray);
                } else {
                    finalOrder.push(...newIdsArray); // Fallback: add to end if target not found
                }
            } else {
                // 'inside' or no specific target, add to the top
                finalOrder.unshift(...newIdsArray);
            }
            
            // Write the final order to the destination
            await fs.writeJson(destOrderPath, { order: finalOrder }, { spaces: 2 });

            // Trigger a rescan if the move involved a network directory
            const isMovingToNetwork = await isNetworkNote(destPath);
            const isMovingFromNetwork = await isNetworkNote(sourceDir);
            if (isMovingToNetwork || isMovingFromNetwork) {
                console.log(`Network items moved. Triggering background rescan.`);
                setImmediate(scanAndCacheNetworkNotes);
            }

            return { success: true };
        } catch (error) {
            console.error('Failed to move or reorder items:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('copy-note-content', async (event, filePath) => {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const lines = content.split('\n').slice(1).join('\n'); // Get content without header
            clipboard.writeText(lines);
            return { success: true };
        } catch (error) {
            console.error('Failed to copy note content:', error);
            return { success: false, error: error.message };
        }
    });

    // IPC handler to get the root directory for notes
    ipcMain.handle('get-notes-root-dir', () => {
        return NOTES_DIR;
    });

    // --- End of New/Updated Notes IPC Handlers ---

    // --- Singleton Notes Window Creation Function ---
    function createOrFocusNotesWindow() {
        if (notesWindow && !notesWindow.isDestroyed()) {
            console.log('[Main Process] Notes window already exists. Focusing it.');
            notesWindow.focus();
            return notesWindow;
        }

        console.log('[Main Process] Creating new notes window instance.');
        notesWindow = new BrowserWindow({
            width: 1000,
            height: 700,
            minWidth: 800,
            minHeight: 600,
            title: '我的笔记',
            modal: false,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
                devTools: true
            },
            icon: path.join(__dirname, 'assets', 'icon.png'),
            show: false
        });

        const notesUrl = `file://${path.join(__dirname, 'Notemodules', 'notes.html')}`;
        notesWindow.loadURL(notesUrl);
        
        openChildWindows.push(notesWindow); // Add to the broadcast list
        notesWindow.setMenu(null);

        notesWindow.once('ready-to-show', () => {
            notesWindow.show();
        });

        notesWindow.on('closed', () => {
            console.log('[Main Process] Notes window has been closed.');
            openChildWindows = openChildWindows.filter(win => win !== notesWindow); // Remove from broadcast list
            notesWindow = null; // Clear the reference
        });
        
        return notesWindow;
    }

    ipcMain.handle('open-notes-window', () => {
        createOrFocusNotesWindow();
    });

    ipcMain.handle('open-notes-with-content', async (event, data) => {
        const targetWindow = createOrFocusNotesWindow();
        const wc = targetWindow.webContents;

        // If the window is already loaded (not new), send the data immediately.
        if (!wc.isLoading()) {
            console.log(`[Main Process] Notes window already loaded. Sending shared content immediately.`);
            wc.send('shared-note-data', data);
            return;
        }

        // If the window is new and loading, wait for our custom 'ready' signal.
        console.log(`[Main Process] Notes window is new. Waiting for 'notes-window-ready' signal...`);
        ipcMain.once('notes-window-ready', (e) => {
            // Ensure the signal came from the window we just created.
            if (e.sender === wc) {
                console.log(`[Main Process] Received 'notes-window-ready' signal. Sending shared content.`);
                wc.send('shared-note-data', data);
            }
        });
    });

    // IPC handler for searching notes
    ipcMain.handle('search-notes', async (event, query) => {
        if (!query) {
            return [];
        }
        const lowerCaseQuery = query.toLowerCase();
        const results = [];

        async function searchInDirectory(directory) {
            try {
                const files = await fs.readdir(directory, { withFileTypes: true });
                for (const file of files) {
                    const fullPath = path.join(directory, file.name);
                    if (file.isDirectory()) {
                        await searchInDirectory(fullPath);
                    } else if (file.isFile() && (file.name.endsWith('.md') || file.name.endsWith('.txt'))) {
                        if (file.name.toLowerCase().includes(lowerCaseQuery)) {
                            results.push({
                                name: file.name,
                                path: fullPath,
                            });
                        }
                    }
                }
            } catch (error) {
                console.error(`Error searching for notes in directory ${directory}:`, error);
            }
        }

        await searchInDirectory(NOTES_MODULE_DIR);
        return results;
    });

    createWindow();
    windowHandlers.initialize(mainWindow);
    fileDialogHandlers.initialize(mainWindow, {
        getSelectionListenerStatus: () => selectionListenerActive,
        stopSelectionListener,
        startSelectionListener,
        openChildWindows
    });
    groupChatHandlers.initialize(mainWindow, {
        AGENT_DIR,
        USER_DATA_DIR,
        getSelectionListenerStatus: () => selectionListenerActive,
        stopSelectionListener,
        startSelectionListener
    });
    agentHandlers.initialize({
        AGENT_DIR,
        USER_DATA_DIR,
        SETTINGS_FILE,
        USER_AVATAR_FILE,
        getSelectionListenerStatus: () => selectionListenerActive,
        stopSelectionListener,
        startSelectionListener
    });
    chatHandlers.initialize(mainWindow, {
        AGENT_DIR,
        USER_DATA_DIR,
        APP_DATA_ROOT_IN_PROJECT,
        NOTES_AGENT_ID,
        getSelectionListenerStatus: () => selectionListenerActive,
        stopSelectionListener,
        startSelectionListener,
        getMusicState: () => ({ musicWindow, currentSongInfo })
    });
    createAssistantBarWindow(); // Pre-create the assistant bar window for performance

    // --- Distributed Server Initialization ---
    (async () => {
        try {
            const settings = await fs.readJson(SETTINGS_FILE);
            if (settings.enableDistributedServer) {
                console.log('[Main] Distributed server is enabled. Initializing...');
                const config = {
                    mainServerUrl: settings.vcpLogUrl, // Assuming the distributed server connects to the same base URL as VCPLog
                    vcpKey: settings.vcpLogKey,
                    serverName: 'VCP-Desktop-Client-Distributed-Server',
                    debugMode: true, // Or read from settings if you add this option
                    rendererProcess: mainWindow.webContents, // Pass the renderer process object
                    handleMusicControl: handleMusicControl // Inject the music control handler
                };
                distributedServer = new DistributedServer(config);
                distributedServer.initialize();
            } else {
                console.log('[Main] Distributed server is disabled in settings.');
            }
        } catch (error) {
            console.error('[Main] Failed to read settings or initialize distributed server:', error);
        }
    })();
    // --- End of Distributed Server Initialization ---

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });

    globalShortcut.register('Control+Shift+I', () => {
        const focusedWindow = BrowserWindow.getFocusedWindow();
        if (focusedWindow && focusedWindow.webContents && !focusedWindow.webContents.isDestroyed()) {
            focusedWindow.webContents.toggleDevTools();
        }
    });

    ipcMain.on('open-music-window', async (event) => {
        try {
            await createOrFocusMusicWindow();
        } catch (error) {
            console.error("Failed to open or focus music window from IPC:", error);
        }
    });
    
    // --- Music Player IPC Handlers ---
    ipcMain.on('music-track-changed', (event, songInfo) => {
        currentSongInfo = songInfo;
    });

    ipcMain.on('open-music-folder', async (event) => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        });

        if (result.canceled || result.filePaths.length === 0) {
            return;
        }

        const folderPath = result.filePaths[0];
        const supportedFormats = new Set(['.mp3', '.wav', '.ogg', '.flac', '.m4a']);
        const fileList = [];

        // Pass 1: Collect all file paths first
        async function collectFilePaths(dir) {
            try {
                const files = await fs.readdir(dir, { withFileTypes: true });
                for (const file of files) {
                    const fullPath = path.join(dir, file.name);
                    if (file.isDirectory()) {
                        await collectFilePaths(fullPath);
                    } else if (supportedFormats.has(path.extname(file.name).toLowerCase())) {
                        fileList.push(fullPath);
                    }
                }
            } catch (err) {
                console.error(`Error collecting file paths in ${dir}:`, err);
            }
        }

        try {
            await collectFilePaths(folderPath);
            event.sender.send('scan-started', { total: fileList.length });

            // Ensure the cache directory exists before starting the worker
            await fs.ensureDir(MUSIC_COVER_CACHE_DIR);

            // Pass 2: Process files using a worker
            const worker = new Worker(path.join(__dirname, 'modules', 'musicScannerWorker.js'), {
                workerData: {
                    coverCachePath: MUSIC_COVER_CACHE_DIR
                }
            });
            const finalPlaylist = [];
            let processedCount = 0;

            worker.on('message', (result) => {
                if (result.status === 'success') {
                    finalPlaylist.push(result.data);
                } else {
                    console.error(result.error); // Log the specific file error
                }
                
                processedCount++;
                event.sender.send('scan-progress');

                if (processedCount === fileList.length) {
                    // All files have been processed
                    event.sender.send('scan-finished', finalPlaylist);
                    worker.terminate();
                }
            });

            worker.on('error', (error) => {
                console.error('Worker thread error:', error);
                // In case of a worker crash, send what we have so far
                event.sender.send('scan-finished', finalPlaylist);
                worker.terminate();
            });

            worker.on('exit', (code) => {
                if (code !== 0) {
                    console.error(`Worker stopped with exit code ${code}`);
                }
            });

            // Send files to the worker one by one
            fileList.forEach(filePath => worker.postMessage(filePath));

        } catch (err) {
            console.error("Error during music scan setup:", err);
            event.sender.send('scan-finished', []); // Send empty list on error
        }
    });

    ipcMain.handle('get-music-playlist', async () => {
        try {
            if (await fs.pathExists(MUSIC_PLAYLIST_FILE)) {
                return await fs.readJson(MUSIC_PLAYLIST_FILE);
            }
            return [];
        } catch (error) {
            console.error('Error reading music playlist:', error);
            return [];
        }
    });

    ipcMain.on('save-music-playlist', async (event, playlist) => {
        try {
            await fs.writeJson(MUSIC_PLAYLIST_FILE, playlist, { spaces: 2 });
        } catch (error) {
            console.error('Error saving music playlist:', error);
        }
    });


     // --- Assistant IPC Handlers ---
    ipcMain.handle('get-assistant-bar-initial-data', async () => {
        try {
            const settings = await fs.readJson(SETTINGS_FILE);
            if (settings.assistantEnabled && settings.assistantAgent) {
                const agentConfig = await getAgentConfigById(settings.assistantAgent);
                return {
                    agentAvatarUrl: agentConfig.avatarUrl,
                    theme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
                };
            }
        } catch (error) {
            console.error('[Main] Error getting initial data for assistant bar:', error);
            return { error: error.message };
        }
        // Return default/empty data if not enabled
        return {
            agentAvatarUrl: null,
            theme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
        };
    });

    ipcMain.on('toggle-selection-listener', (event, enable) => {
        if (enable) {
            startSelectionListener();
        } else {
            stopSelectionListener();
        }
    });

    ipcMain.handle('get-selection-listener-status', () => {
        return selectionListenerActive;
    });

    ipcMain.on('assistant-action', async (event, action) => {
        // IMPORTANT: The click on the bar has happened.
        // First, cancel any pending hide operation from the global listener.
        if (hideBarTimeout) {
            clearTimeout(hideBarTimeout);
            hideBarTimeout = null;
            console.log('[Main] Assistant action cancelled pending hide.');
        }
    
        // When an action is taken, hide the bar and stop the listener
        hideAssistantBarAndStopListener();
        
        // Handle the 'note' action separately
        if (action === 'note') {
            try {
                console.log('[Main] Assistant action: note. Creating note from selection.');
                const noteTitle = `来自划词笔记：${lastProcessedSelection.substring(0, 20)}...`;
                const noteContent = lastProcessedSelection;
                
                // This is the same logic as in 'open-notes-with-content'
                const targetWindow = createOrFocusNotesWindow();
                const wc = targetWindow.webContents;
                const data = {
                    title: noteTitle,
                    content: noteContent,
                    theme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
                };

                if (!wc.isLoading()) {
                    console.log(`[Main Process] Notes window already loaded. Sending shared content immediately.`);
                    wc.send('shared-note-data', data);
                } else {
                    console.log(`[Main Process] Notes window is new. Waiting for 'notes-window-ready' signal...`);
                    ipcMain.once('notes-window-ready', (e) => {
                        if (e.sender === wc) {
                            console.log(`[Main Process] Received 'notes-window-ready' signal. Sending shared content.`);
                            wc.send('shared-note-data', data);
                        }
                    });
                }
            } catch (error) {
                console.error('[Main] Error creating note from assistant action:', error);
            }
            return; // Stop execution here for the note action
        }
        
        // Original logic for other actions
        try {
            const settings = await fs.readJson(SETTINGS_FILE);
            // No longer pass the full agent config. Just the ID.
            createAssistantWindow({
                selectedText: lastProcessedSelection,
                action: action,
                agentId: settings.assistantAgent, // Pass only the ID
            });
        } catch (error) {
            console.error('[Main] Error creating assistant window from action:', error);
        }
    });

    // Add the central theme getter
    ipcMain.handle('get-current-theme', () => {
        return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    });

    ipcMain.on('open-themes-window', () => {
        createThemesWindow();
    });

    ipcMain.handle('get-themes', async () => {
        const themesDir = path.join(__dirname, 'styles', 'themes');
        const files = await fs.readdir(themesDir);
        const themePromises = files
            .filter(file => file.startsWith('themes') && file.endsWith('.css'))
            .map(async (file) => {
                const filePath = path.join(themesDir, file);
                const content = await fs.readFile(filePath, 'utf-8');
                
                const nameMatch = content.match(/\* Theme Name: (.*)/);
                const name = nameMatch ? nameMatch[1].trim() : path.basename(file, '.css').replace('themes', '');

                // Helper to extract variables from a specific CSS scope (e.g., :root or body.light-theme)
                const extractVariables = (scopeRegex) => {
                    const scopeMatch = content.match(scopeRegex);
                    if (!scopeMatch || !scopeMatch[1]) return {};
                    
                    const variables = {};
                    const varRegex = /(--[\w-]+)\s*:\s*(.*?);/g;
                    let match;
                    // Execute regex on the captured group which contains the CSS rules
                    while ((match = varRegex.exec(scopeMatch[1])) !== null) {
                        variables[match[1]] = match[2].trim();
                    }
                    return variables;
                };

                // Regex to capture content within :root { ... } and body.light-theme { ... }
                const rootScopeRegex = /:root\s*\{([\s\S]*?)\}/;
                const lightThemeScopeRegex = /body\.light-theme\s*\{([\s\S]*?)\}/;

                const darkVariables = extractVariables(rootScopeRegex);
                const lightVariables = extractVariables(lightThemeScopeRegex);

                return {
                    fileName: file,
                    name: name,
                    // Organize variables by dark and light mode
                    variables: {
                        dark: darkVariables,
                        light: lightVariables
                    }
                };
            });
        return Promise.all(themePromises);
    });

    ipcMain.on('apply-theme', async (event, themeFileName) => {
        try {
            const sourcePath = path.join(__dirname, 'styles', 'themes', themeFileName);
            const targetPath = path.join(__dirname, 'styles', 'themes.css');
            const themeContent = await fs.readFile(sourcePath, 'utf-8');
            await fs.writeFile(targetPath, themeContent, 'utf-8');
            
            // Reload the main window to apply the new theme
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.reload();
            }
            // Reload the themes window as well to reflect the change
            if (themesWindow && !themesWindow.isDestroyed()) {
                themesWindow.reload();
            }
        } catch (error) {
            console.error('Failed to apply theme:', error);
        }
    });
});

    // --- Python Execution IPC Handler ---
    ipcMain.handle('execute-python-code', (event, code) => {
        return new Promise((resolve) => {
            // Use '-u' for unbuffered output and set PYTHONIOENCODING for proper UTF-8 handling
            const pythonProcess = spawn('python', ['-u'], {
                env: { ...process.env, PYTHONIOENCODING: 'UTF-8' },
                maxBuffer: 10 * 1024 * 1024 // Increase buffer to 10MB
            });

            let stdout = '';
            let stderr = '';

            pythonProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            pythonProcess.on('close', (exitCode) => {
                console.log(`Python process exited with code ${exitCode}`);
                console.log('Python stdout:', stdout); // Log full stdout
                console.log('Python stderr:', stderr); // Log full stderr
                resolve({ stdout, stderr });
            });

            pythonProcess.on('error', (err) => {
                console.error('Failed to start Python process:', err);
                // Resolve with an error message in stderr, so the frontend can display it
                resolve({ stdout: '', stderr: `Failed to start python process. Please ensure Python is installed and accessible in your system's PATH. Error: ${err.message}` });
            });

            // Write the code to the process's standard input and close it
            pythonProcess.stdin.write(code);
            pythonProcess.stdin.end();
        });
    });

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    // 1. 停止所有底层监听器
    console.log('[Main] App is quitting. Stopping all listeners...');
    stopSelectionListener();
    if (mouseListener) {
        try {
            mouseListener.kill();
            console.log('[Main] Global mouse listener killed.');
        } catch (e) {
            console.error('[Main] Error killing mouse listener on quit:', e);
        } finally {
            mouseListener = null;
        }
    }

    // 2. 注销所有全局快捷键
    globalShortcut.unregisterAll();
    console.log('[Main] All global shortcuts unregistered.');

    // 3. 关闭WebSocket连接
    if (vcpLogWebSocket && vcpLogWebSocket.readyState === WebSocket.OPEN) {
        vcpLogWebSocket.close();
    }
    if (vcpLogReconnectInterval) {
        clearTimeout(vcpLogReconnectInterval);
    }
    
    // 4. Stop the distributed server
    if (distributedServer) {
        console.log('[Main] Stopping distributed server...');
        distributedServer.stop();
        distributedServer = null;
    }

    // 5. 强制销毁所有窗口
    console.log('[Main] Destroying all open windows...');
    BrowserWindow.getAllWindows().forEach(win => {
        if (win && !win.isDestroyed()) {
            win.destroy();
        }
    });
});

// --- Helper Functions ---

function formatTimestampForFilename(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const milliseconds = date.getMilliseconds().toString().padStart(3, '0');
    return `${year}${month}${day}_${hours}${minutes}${seconds}_${milliseconds}`;
}

// --- IPC Handlers ---
// open-external-link handler is now in modules/ipc/fileDialogHandlers.js

// The getAgentConfigById helper function has been moved to agentHandlers.js

// VCP Server Communication is now handled in modules/ipc/chatHandlers.js

// VCPLog WebSocket Connection
function connectVcpLog(wsUrl, wsKey) {
    if (!wsUrl || !wsKey) {
        if (mainWindow) mainWindow.webContents.send('vcp-log-status', { source: 'VCPLog', status: 'error', message: 'URL或KEY未配置。' });
        return;
    }

    const fullWsUrl = `${wsUrl}/VCPlog/VCP_Key=${wsKey}`; 
    
    if (vcpLogWebSocket && (vcpLogWebSocket.readyState === WebSocket.OPEN || vcpLogWebSocket.readyState === WebSocket.CONNECTING)) {
        console.log('VCPLog WebSocket 已连接或正在连接。');
        return;
    }

    console.log(`尝试连接 VCPLog WebSocket: ${fullWsUrl}`);
    if (mainWindow) mainWindow.webContents.send('vcp-log-status', { source: 'VCPLog', status: 'connecting', message: '连接中...' });

    vcpLogWebSocket = new WebSocket(fullWsUrl);

    vcpLogWebSocket.onopen = () => {
        console.log('[MAIN_VCP_LOG] WebSocket onopen event triggered.'); 
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
            console.log('[MAIN_VCP_LOG] Attempting to send vcp-log-status "open" to renderer.'); 
            mainWindow.webContents.send('vcp-log-status', { source: 'VCPLog', status: 'open', message: '已连接' });
            console.log('[MAIN_VCP_LOG] vcp-log-status "open" sent.');
            mainWindow.webContents.send('vcp-log-message', { type: 'connection_ack', message: 'VCPLog 连接成功！' });
        } else {
            console.error('[MAIN_VCP_LOG] mainWindow or webContents not available in onopen. Cannot send status.');
        }
        if (vcpLogReconnectInterval) {
            clearTimeout(vcpLogReconnectInterval); // Corrected: Use clearTimeout for setTimeout
            vcpLogReconnectInterval = null;
        }
    };

    vcpLogWebSocket.onmessage = (event) => {
        console.log('VCPLog 收到消息:', event.data);
        try {
            const data = JSON.parse(event.data.toString()); 
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('vcp-log-message', data);
        } catch (e) {
            console.error('VCPLog 解析消息失败:', e);
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('vcp-log-message', { type: 'error', data: `收到无法解析的消息: ${event.data.toString().substring(0,100)}...` });
        }
    };

    vcpLogWebSocket.onclose = (event) => {
        console.log('VCPLog WebSocket 连接已关闭:', event.code, event.reason);
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('vcp-log-status', { source: 'VCPLog', status: 'closed', message: `连接已断开 (${event.code})` });
        if (!vcpLogReconnectInterval && wsUrl && wsKey) {
            console.log('将在5秒后尝试重连 VCPLog...');
            vcpLogReconnectInterval = setTimeout(() => {
                vcpLogReconnectInterval = null;
                connectVcpLog(wsUrl, wsKey);
            }, 5000);
        }
    };

    vcpLogWebSocket.onerror = (error) => {
        console.error('[MAIN_VCP_LOG] WebSocket onerror event:', error.message); 
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
            mainWindow.webContents.send('vcp-log-status', { source: 'VCPLog', status: 'error', message: '连接错误' });
        } else {
            console.error('[MAIN_VCP_LOG] mainWindow or webContents not available in onerror.'); 
        }
    };
}

ipcMain.on('connect-vcplog', (event, { url, key }) => {
    if (vcpLogWebSocket && vcpLogWebSocket.readyState === WebSocket.OPEN) {
        vcpLogWebSocket.close(); 
    }
    if (vcpLogReconnectInterval) {
        clearTimeout(vcpLogReconnectInterval);
        vcpLogReconnectInterval = null;
    }
    connectVcpLog(url, key);
});

ipcMain.on('disconnect-vcplog', () => {
    if (vcpLogWebSocket && vcpLogWebSocket.readyState === WebSocket.OPEN) {
        vcpLogWebSocket.close();
    }
    if (vcpLogReconnectInterval) {
        clearTimeout(vcpLogReconnectInterval);
        vcpLogReconnectInterval = null;
    }
    if (mainWindow) mainWindow.webContents.send('vcp-log-status', { source: 'VCPLog', status: 'closed', message: '已手动断开' });
    console.log('VCPLog 已手动断开');
});
}