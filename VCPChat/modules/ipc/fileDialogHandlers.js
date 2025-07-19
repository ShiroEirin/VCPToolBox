// modules/ipc/fileDialogHandlers.js
const { ipcMain, dialog, shell, clipboard, net, nativeImage, BrowserWindow, Menu, app } = require('electron');
const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');

/**
 * Initializes file and dialog related IPC handlers.
 * @param {BrowserWindow} mainWindow The main window instance.
 * @param {object} context - An object containing necessary context.
 * @param {function} context.getSelectionListenerStatus - Function to get the current status of the selection listener.
 * @param {function} context.stopSelectionListener - Function to stop the selection listener.
 * @param {function} context.startSelectionListener - Function to start the selection listener.
 * @param {Array<BrowserWindow>} context.openChildWindows - Array of open child windows.
 */
function initialize(mainWindow, context) {
    let { openChildWindows } = context;

    ipcMain.handle('select-avatar', async () => {
        const listenerWasActive = context.getSelectionListenerStatus();
        if (listenerWasActive) {
            context.stopSelectionListener();
            console.log('[Main] Temporarily stopped selection listener for avatar dialog.');
        }

        const result = await dialog.showOpenDialog(mainWindow, {
            title: '选择头像文件',
            properties: ['openFile'],
            filters: [
                { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif'] }
            ]
        });

        if (listenerWasActive) {
            context.startSelectionListener();
            console.log('[Main] Restarted selection listener after avatar dialog.');
        }

        if (!result.canceled && result.filePaths.length > 0) {
            return result.filePaths[0];
        }
        return null;
    });

    ipcMain.handle('read-image-from-clipboard-main', async () => {
        console.log('[Main Process] Received request to read image from clipboard.');
        try {
            const nativeImg = clipboard.readImage();
            if (nativeImg && !nativeImg.isEmpty()) {
                console.log('[Main Process] NativeImage is not empty.');
                const buffer = nativeImg.toPNG();
                if (buffer && buffer.length > 0) {
                    console.log('[Main Process] Conversion to PNG successful.');
                    return { success: true, data: buffer.toString('base64'), extension: 'png' };
                } else {
                    console.warn('[Main Process] Conversion to PNG resulted in empty buffer.');
                    return { success: false, error: 'Conversion to PNG resulted in empty buffer.' };
                }
            } else if (nativeImg && nativeImg.isEmpty()) {
                console.warn('[Main Process] NativeImage is empty. No image on clipboard or unsupported format.');
                return { success: false, error: 'No image on clipboard or unsupported format.' };
            } else {
                console.warn('[Main Process] clipboard.readImage() returned null or undefined.');
                return { success: false, error: 'Failed to read image from clipboard (readImage returned null/undefined).' };
            }
        } catch (error) {
            console.error('[Main Process] Error reading image from clipboard:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('read-text-from-clipboard-main', async () => {
        console.log('[Main Process] Received request to read text from clipboard.');
        try {
            const text = clipboard.readText();
            return { success: true, text: text };
        } catch (error) {
            console.error('[Main Process] Error reading text from clipboard:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('get-file-as-base64', async (event, filePath) => {
        try {
            console.log(`[Main - get-file-as-base64] ===== REQUEST START ===== Received raw filePath: "${filePath}"`);
            if (!filePath || typeof filePath !== 'string') {
                console.error('[Main - get-file-as-base64] Invalid file path received:', filePath);
                return { error: 'Invalid file path provided.', base64String: null };
            }
            
            const cleanPath = filePath.startsWith('file://') ? decodeURIComponent(filePath.substring(7)) : decodeURIComponent(filePath);
            console.log(`[Main - get-file-as-base64] Cleaned path: "${cleanPath}"`);
            
            if (!await fs.pathExists(cleanPath)) {
                console.error(`[Main - get-file-as-base64] File not found at path: ${cleanPath}`);
                return { error: `File not found at path: ${cleanPath}`, base64String: null };
            }
            
            let originalFileBuffer = await fs.readFile(cleanPath);
            let processedFileBuffer = originalFileBuffer;

            const fileExtension = path.extname(cleanPath).toLowerCase();
            const isImage = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tiff', '.svg'].includes(fileExtension);

            if (isImage) {
                console.log(`[Main - get-file-as-base64] Processing image: ${cleanPath}`);
                const MAX_DIMENSION = 800;
                const JPEG_QUALITY = 70;

                try {
                    let image = sharp(originalFileBuffer);
                    const metadata = await image.metadata();
                    console.log(`[Main Sharp] Original: ${metadata.format}, ${metadata.width}x${metadata.height}, size: ${originalFileBuffer.length} bytes`);

                    if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
                        image = image.resize({
                            width: MAX_DIMENSION,
                            height: MAX_DIMENSION,
                            fit: sharp.fit.inside,
                            withoutEnlargement: true
                        });
                    }
                    
                    console.log(`[Main Sharp] Forcing encoding to JPEG with quality ${JPEG_QUALITY}.`);
                    processedFileBuffer = await image.jpeg({ quality: JPEG_QUALITY }).toBuffer();

                    const finalMetadata = await sharp(processedFileBuffer).metadata();
                    console.log(`[Main Sharp] Processed: ${finalMetadata.format}, ${finalMetadata.width}x${finalMetadata.height}, final buffer length: ${processedFileBuffer.length} bytes`);

                } catch (sharpError) {
                    console.error(`[Main Sharp] Error processing image with sharp: ${sharpError.message}. Using original image buffer.`, sharpError);
                    processedFileBuffer = originalFileBuffer;
                    console.warn('[Main Sharp] Sharp processing failed. Will attempt to send original image data.');
                }
            } else {
                console.log(`[Main - get-file-as-base64] Non-image file. Buffer length: ${originalFileBuffer.length}`);
            }

            const base64String = processedFileBuffer.toString('base64');
            console.log(`[Main - get-file-as-base64] Successfully converted "${cleanPath}" to Base64. Final Base64 length: ${base64String.length}`);
            console.log(`[Main - get-file-as-base64] ===== REQUEST END (SUCCESS) =====`);
            return base64String;

        } catch (error) {
            console.error(`[Main - get-file-as-base64] Outer catch: Error processing path "${filePath}":`, error.message, error.stack);
            console.log(`[Main - get-file-as-base64] ===== REQUEST END (ERROR) =====`);
            return { error: `获取/处理文件Base64失败: ${error.message}`, base64String: null };
        }
    });

    ipcMain.on('open-external-link', (event, url) => {
        if (url && (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('file:'))) {
            shell.openExternal(url).catch(err => {
                console.error('Failed to open external link:', err);
            });
        } else {
            console.warn(`[Main Process] Received request to open non-standard link externally, ignoring: ${url}`);
        }
    });

    ipcMain.on('show-image-context-menu', (event, imageUrl) => {
        console.log(`[Main Process] Received show-image-context-menu for URL: ${imageUrl}`);
        const template = [
            {
                label: '复制图片',
                click: async () => {
                    console.log(`[Main Process] Context menu: "复制图片" clicked for ${imageUrl}`);
                    if (!imageUrl || (!imageUrl.startsWith('http:') && !imageUrl.startsWith('https:') && !imageUrl.startsWith('file:'))) {
                        console.error('[Main Process] Invalid image URL for copying:', imageUrl);
                        dialog.showErrorBox('复制错误', '无效的图片URL。');
                        return;
                    }

                    try {
                        if (imageUrl.startsWith('file:')) {
                            const filePath = decodeURIComponent(imageUrl.substring(7));
                            const image = nativeImage.createFromPath(filePath);
                            if (!image.isEmpty()) {
                                clipboard.writeImage(image);
                                console.log('[Main Process] Local image copied to clipboard successfully.');
                            } else {
                                 console.error('[Main Process] Failed to create native image from local file path or image is empty.');
                                 dialog.showErrorBox('复制失败', '无法从本地文件创建图片对象。');
                            }
                        } else { // http or https
                            const request = net.request(imageUrl);
                            let chunks = [];
                            request.on('response', (response) => {
                                response.on('data', (chunk) => chunks.push(chunk));
                                response.on('end', () => {
                                    if (response.statusCode === 200) {
                                        const buffer = Buffer.concat(chunks);
                                        const image = nativeImage.createFromBuffer(buffer);
                                        if (!image.isEmpty()) {
                                            clipboard.writeImage(image);
                                            console.log('[Main Process] Image copied to clipboard successfully.');
                                        } else {
                                            dialog.showErrorBox('复制失败', '无法从URL创建图片对象。');
                                        }
                                    } else {
                                        dialog.showErrorBox('复制失败', `下载图片失败，服务器状态: ${response.statusCode}`);
                                    }
                                });
                                response.on('error', (error) => dialog.showErrorBox('复制失败', `下载图片响应错误: ${error.message}`));
                            });
                            request.on('error', (error) => dialog.showErrorBox('复制失败', `请求图片失败: ${error.message}`));
                            request.end();
                        }
                    } catch (e) {
                        dialog.showErrorBox('复制失败', `复制过程中发生意外错误: ${e.message}`);
                    }
                }
            },
            { type: 'separator' },
            {
                label: '在新标签页中打开图片',
                click: () => {
                    shell.openExternal(imageUrl);
                }
            }
        ];
        const menu = Menu.buildFromTemplate(template);
        if (mainWindow) {
            menu.popup({ window: mainWindow });
        }
    });

    ipcMain.on('open-image-in-new-window', async (event, imageUrl, imageTitle) => {
        const imageViewerWindow = new BrowserWindow({
            width: 800, height: 600, minWidth: 400, minHeight: 300,
            title: imageTitle || '图片预览',
            parent: mainWindow, modal: false, show: false,
            backgroundColor: '#28282c', // Default to dark, will be updated by JS
            icon: path.join(__dirname, '..', 'assets', 'icon.png'),
            webPreferences: {
                preload: path.join(app.getAppPath(), 'preload.js'),
                contextIsolation: true, nodeIntegration: false, devTools: true
            }
        });

        const viewerUrl = `file://${path.join(__dirname, '..', 'image-viewer.html')}?src=${encodeURIComponent(imageUrl)}&title=${encodeURIComponent(imageTitle || '图片预览')}`;
        imageViewerWindow.loadURL(viewerUrl);
        openChildWindows.push(imageViewerWindow);
        
        imageViewerWindow.setMenu(null);

        imageViewerWindow.once('ready-to-show', () => imageViewerWindow.show());

        imageViewerWindow.on('closed', () => {
            context.openChildWindows = openChildWindows.filter(win => win !== imageViewerWindow);
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.focus();
        });
    });

    ipcMain.handle('display-text-content-in-viewer', async (event, textContent, windowTitle) => {
        const textViewerWindow = new BrowserWindow({
            width: 800, height: 700, minWidth: 500, minHeight: 400,
            title: decodeURIComponent(windowTitle) || '阅读模式',
            parent: mainWindow, modal: false, show: false,
            icon: path.join(__dirname, '..', 'assets', 'icon.png'),
            webPreferences: {
                preload: path.join(__dirname, '..', '..', 'preload.js'),
                contextIsolation: true, nodeIntegration: false, devTools: true
            }
        });

        const base64Text = Buffer.from(textContent).toString('base64');
        const viewerUrl = `file://${path.join(__dirname, '..', 'text-viewer.html')}?text=${encodeURIComponent(base64Text)}&title=${encodeURIComponent(windowTitle || '阅读模式')}&encoding=base64`;
        
        textViewerWindow.loadURL(viewerUrl).catch(err => console.error(`[Main Process] textViewerWindow FAILED to initiate URL loading`, err));
        
        openChildWindows.push(textViewerWindow);
        
        textViewerWindow.setMenu(null);

        textViewerWindow.once('ready-to-show', () => textViewerWindow.show());

        textViewerWindow.on('closed', () => {
            context.openChildWindows = openChildWindows.filter(win => win !== textViewerWindow);
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.focus();
        });
    });
}

module.exports = {
    initialize
};