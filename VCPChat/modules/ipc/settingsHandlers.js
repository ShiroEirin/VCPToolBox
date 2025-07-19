// modules/ipc/settingsHandlers.js
const { ipcMain, nativeTheme } = require('electron');
const fs = require('fs-extra');
const path = require('path');

/**
 * Initializes settings and theme related IPC handlers.
 * @param {object} paths - An object containing required paths.
 * @param {string} paths.SETTINGS_FILE - The path to the settings.json file.
 * @param {string} paths.USER_AVATAR_FILE - The path to the user_avatar.png file.
 * @param {string} paths.AGENT_DIR - The path to the agents directory.
 */
function initialize(paths) {
    const { SETTINGS_FILE, USER_AVATAR_FILE, AGENT_DIR } = paths;

    // Settings Management
    ipcMain.handle('load-settings', async () => {
        try {
            let settings = {};
            if (await fs.pathExists(SETTINGS_FILE)) {
                settings = await fs.readJson(SETTINGS_FILE);
            }
            // Check for user avatar
            if (await fs.pathExists(USER_AVATAR_FILE)) {
                settings.userAvatarUrl = `file://${USER_AVATAR_FILE}?t=${Date.now()}`;
            } else {
                settings.userAvatarUrl = null; // Or a default path
            }
            return settings;
        } catch (error) {
            console.error('加载设置失败:', error);
            return { 
                error: error.message,
                sidebarWidth: 260,
                notificationsSidebarWidth: 300,
                userAvatarUrl: null
            };
        }
    });

    ipcMain.handle('save-settings', async (event, settings) => {
        try {
            // User avatar URL is handled by 'save-user-avatar', remove it from general settings to avoid saving a file path
            const { userAvatarUrl, ...settingsToSave } = settings;
            await fs.writeJson(SETTINGS_FILE, settingsToSave, { spaces: 2 });
            return { success: true };
        } catch (error) {
            console.error('保存设置失败:', error);
            return { error: error.message };
        }
    });

    // New IPC Handler to save calculated avatar color
    ipcMain.handle('save-avatar-color', async (event, { type, id, color }) => {
        try {
            if (type === 'user') {
                const settings = await fs.pathExists(SETTINGS_FILE) ? await fs.readJson(SETTINGS_FILE) : {};
                settings.userAvatarCalculatedColor = color;
                await fs.writeJson(SETTINGS_FILE, settings, { spaces: 2 });
                console.log(`[Main] User avatar color saved: ${color}`);
                return { success: true };
            } else if (type === 'agent' && id) {
                const configPath = path.join(AGENT_DIR, id, 'config.json');
                if (await fs.pathExists(configPath)) {
                    const agentConfig = await fs.readJson(configPath);
                    agentConfig.avatarCalculatedColor = color;
                    await fs.writeJson(configPath, agentConfig, { spaces: 2 });
                    console.log(`[Main] Agent ${id} avatar color saved: ${color}`);
                    return { success: true };
                } else {
                    return { success: false, error: `Agent config for ${id} not found.` };
                }
            }
            return { success: false, error: 'Invalid type or missing ID for saving avatar color.' };
        } catch (error) {
            console.error('Error saving avatar color:', error);
            return { success: false, error: error.message };
        }
    });

    // Theme control
    ipcMain.on('set-theme', (event, theme) => {
        if (theme === 'light' || theme === 'dark') {
            nativeTheme.themeSource = theme;
            console.log(`[Main] Theme source explicitly set to: ${theme}`);
        }
    });
}

module.exports = {
    initialize
};