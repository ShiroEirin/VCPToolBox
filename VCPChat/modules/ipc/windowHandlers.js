// modules/ipc/windowHandlers.js
const { ipcMain, app, BrowserWindow } = require('electron');

/**
 * Initializes window control IPC handlers.
 * @param {BrowserWindow} mainWindow The main window instance.
 */
function initialize(mainWindow) {
    // --- Window Control IPC Handlers ---
    ipcMain.on('minimize-window', () => {
        if (mainWindow) {
            mainWindow.minimize();
        }
    });

    ipcMain.on('maximize-window', () => {
        if (mainWindow) {
            mainWindow.maximize();
        }
    });

    ipcMain.on('unmaximize-window', () => {
        if (mainWindow) {
            mainWindow.unmaximize();
        }
    });

    ipcMain.on('close-window', () => {
        // Directly quit the app. This will trigger the 'will-quit' event
        // which handles closing all windows and cleaning up resources.
        app.quit();
    });

    ipcMain.on('toggle-notifications-sidebar', () => {
        if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
            mainWindow.webContents.send('do-toggle-notifications-sidebar');
        }
    });

    ipcMain.on('open-dev-tools', () => {
        console.log('[Main Process] Received open-dev-tools event.'); 
        if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
            mainWindow.webContents.openDevTools({ mode: 'detach' });
            console.log('[Main Process] Attempting to open detached dev tools.'); 
        } else {
            console.error('[Main Process] Cannot open dev tools: mainWindow or webContents is not available or destroyed.'); 
            if (!mainWindow) console.error('[Main Process] mainWindow is null or undefined.');
            else if (!mainWindow.webContents) console.error('[Main Process] mainWindow.webContents is null or undefined.');
            else if (mainWindow.webContents.isDestroyed()) console.error('[Main Process] mainWindow.webContents is destroyed.');
        }
    });
}

module.exports = {
    initialize
};