const { ipcMain } = require('electron');
const SovitsTTS = require('../SovitsTTS');

let sovitsTTSInstance = null;
let internalMainWindow = null; // 用于在 handler 内部可靠地访问 mainWindow

function initialize(mainWindow) {
    if (!mainWindow) {
        console.error("SovitsTTS a besoin de la fenêtre principale pour s'initialiser.");
        return;
    }
    internalMainWindow = mainWindow; // 保存对 mainWindow 的引用
    sovitsTTSInstance = new SovitsTTS(mainWindow);

    ipcMain.handle('sovits-get-models', async (event, forceRefresh) => {
        if (!sovitsTTSInstance) return null;
        return await sovitsTTSInstance.getModels(forceRefresh);
    });

    ipcMain.on('sovits-speak', (event, { text, voice, speed, msgId }) => {
        if (!sovitsTTSInstance) return;
        sovitsTTSInstance.speak(text, voice, speed, msgId);
    });

    ipcMain.on('sovits-stop', () => {
        // 首先，让 SovitsTTS 实例清理其内部状态（如队列）
        if (sovitsTTSInstance) {
            sovitsTTSInstance.stop();
        }
        
        // 关键修复：直接从 IPC handler 发送停止事件到渲染器，
        // 确保无论 SovitsTTS 实例的状态如何，停止命令都能被发送。
        if (internalMainWindow && !internalMainWindow.isDestroyed()) {
            console.log("[IPC Handler] Directly sending 'stop-tts-audio' to renderer.");
            internalMainWindow.webContents.send('stop-tts-audio');
        } else {
            console.error("[IPC Handler] Cannot send 'stop-tts-audio', mainWindow reference is invalid.");
        }
    });


    console.log('SovitsTTS IPC handlers initialisés.');
}

module.exports = {
    initialize
};