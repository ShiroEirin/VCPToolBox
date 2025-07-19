// VCPDistributedServer.js
// VCPDistributedServer.js
const WebSocket = require('ws');
const path = require('path');
// const { ipcMain } = require('electron'); // This was incorrect. ipcMain should be injected.
const pluginManager = require('./Plugin.js');

// DEBUG_MODE is now passed in config
// const DEBUG_MODE = (process.env.DebugMode || "False").toLowerCase() === "true";

class DistributedServer {
    constructor(config = {}) {
        this.mainServerUrl = config.mainServerUrl;
        this.vcpKey = config.vcpKey;
        this.serverName = config.serverName || 'Unnamed-Distributed-Server';
        this.debugMode = config.debugMode || false;
        this.rendererProcess = config.rendererProcess; // To communicate with the renderer
        this.handleMusicControl = config.handleMusicControl; // Inject the music control handler
        this.ws = null;
        this.reconnectInterval = 5000;
        this.maxReconnectInterval = 60000;
        this.reconnectTimeoutId = null; // To keep track of the reconnect timeout
        this.stopped = false; // Flag to prevent reconnection when stopped manually
        this.initialConnection = true; // Flag to handle one-time actions on first connect
    }

    async initialize() {
        console.log(`[${this.serverName}] Initializing...`);
        // The base path should be relative to this file's location.
        const basePath = path.dirname(require.resolve('./VCPDistributedServer.js'));
        pluginManager.setProjectBasePath(basePath);
        await pluginManager.loadPlugins();
        this.connect();
    }

    connect() {
        if (this.stopped) {
            console.log(`[${this.serverName}] Server is stopped, not connecting.`);
            return;
        }
        if (!this.mainServerUrl || !this.vcpKey) {
            console.error(`[${this.serverName}] Error: mainServerUrl or vcpKey is not configured. Cannot connect.`);
            return;
        }

        const connectionUrl = `${this.mainServerUrl}/vcp-distributed-server/VCP_Key=${this.vcpKey}`;
        console.log(`[${this.serverName}] Attempting to connect to main server at ${this.mainServerUrl}`);

        this.ws = new WebSocket(connectionUrl);

        this.ws.on('open', () => {
            console.log(`[${this.serverName}] Successfully connected to main server.`);
            this.reconnectInterval = 5000; // Reset reconnect interval on successful connection
            this.registerTools();
        });

        this.ws.on('message', (message) => {
            this.handleMainServerMessage(message);
        });

        this.ws.on('close', () => {
            console.log(`[${this.serverName}] Disconnected from main server.`);
            this.scheduleReconnect();
        });

        this.ws.on('error', (error) => {
            console.error(`[${this.serverName}] WebSocket error:`, error.message);
            // The 'close' event will be triggered next, which handles reconnection.
        });
    }

    scheduleReconnect() {
        if (this.stopped) {
            console.log(`[${this.serverName}] Stop called, cancelling reconnection.`);
            return;
        }
        console.log(`[${this.serverName}] Attempting to reconnect in ${this.reconnectInterval / 1000}s...`);
        // Clear any existing timeout to avoid multiple reconnect loops
        if (this.reconnectTimeoutId) {
            clearTimeout(this.reconnectTimeoutId);
        }
        this.reconnectTimeoutId = setTimeout(() => this.connect(), this.reconnectInterval);
        // Exponential backoff
        this.reconnectInterval = Math.min(this.reconnectInterval * 2, this.maxReconnectInterval);
    }

    registerTools() {
        const manifests = pluginManager.getAllPluginManifests();

        // On the very first successful connection, send a notification about loaded plugins.
        if (this.initialConnection && manifests.length > 0) {
            const pluginCount = manifests.length;
            // Directly send a structured message to the renderer process for notification
            if (this.rendererProcess && !this.rendererProcess.isDestroyed()) {
                // Add a delay to give the renderer process time to set up its listeners
                setTimeout(() => {
                    if (this.rendererProcess && !this.rendererProcess.isDestroyed()) {
                        this.rendererProcess.send('vcp-log-message', {
                            type: 'vcp_log',
                            data: {
                                source: 'DistPluginManager',
                                content: `分布式服务器已启动，已推送 ${pluginCount} 个本地插件。`
                            }
                        });
                    }
                }, 1000); // 2-second delay
            }
            this.initialConnection = false; // Ensure this only runs once
        }

        if (manifests.length > 0) {
            const payload = {
                type: 'register_tools',
                data: {
                    serverName: this.serverName,
                    tools: manifests
                }
            };
            this.sendMessage(payload);
            console.log(`[${this.serverName}] Sent registration for ${manifests.length} tools to the main server.`);
        } else {
            if (this.debugMode) console.log(`[${this.serverName}] No local tools found to register.`);
        }
    }

    async handleMainServerMessage(message) {
        try {
            const parsedMessage = JSON.parse(message);
            if (this.debugMode) console.log(`[${this.serverName}] Received message from main server:`, parsedMessage.type);

            if (parsedMessage.type === 'execute_tool') {
                await this.handleToolExecutionRequest(parsedMessage.data);
            }
        } catch (e) {
            console.error(`[${this.serverName}] Error parsing message from main server:`, e);
        }
    }

    async handleToolExecutionRequest(data) {
        const { requestId, toolName, toolArgs } = data;
        if (!requestId || !toolName) {
            console.error(`[${this.serverName}] Invalid tool execution request received.`);
            return;
        }

        if (this.debugMode) console.log(`[${this.serverName}] Executing tool '${toolName}' for request ID: ${requestId}`);

        let responsePayload;
        try {
            const result = await pluginManager.processToolCall(toolName, toolArgs);
            let finalResult;

            // --- Special Handling for MusicController ---
            if (toolName === 'MusicController') {
                const commandPayload = JSON.parse(result);
                if (commandPayload.status === 'error') {
                    throw new Error(commandPayload.error);
                }
                
                if (typeof this.handleMusicControl !== 'function') {
                    throw new Error('Music control handler is not configured for the Distributed Server.');
                }

                // Directly call the injected handler function from main.js
                const resultFromMain = await this.handleMusicControl(commandPayload);

                if (resultFromMain.status === 'error') {
                    throw new Error(resultFromMain.message);
                }
                
                // For AI, we want a simple, natural language response.
                let naturalResponse = `指令 '${commandPayload.command}' 已成功执行。`;
                if (commandPayload.command === 'play' && commandPayload.target) {
                    naturalResponse = `已为您播放歌曲: ${commandPayload.target}`;
                } else if (commandPayload.command === 'play') {
                    naturalResponse = `已恢复播放。`;
                } else if (commandPayload.command === 'pause') {
                    naturalResponse = `已暂停播放。`;
                } else if (commandPayload.command === 'next') {
                    naturalResponse = `已切换到下一首。`;
                } else if (commandPayload.command === 'prev') {
                    naturalResponse = `已切换到上一首。`;
                }
                finalResult = { message: naturalResponse };

            } else {
                // --- Default Handling for all other plugins ---
                try {
                    // The result from other plugins is expected to be a JSON string.
                    finalResult = JSON.parse(result);
                } catch (e) {
                    // If not JSON, wrap it for safety.
                    finalResult = { original_plugin_output: result };
                }
            }

            responsePayload = {
                type: 'tool_result',
                data: {
                    requestId,
                    status: 'success',
                    result: finalResult
                }
            };
        } catch (error) {
            console.error(`[${this.serverName}] Error executing tool '${toolName}':`, error.message);
            responsePayload = {
                type: 'tool_result',
                data: {
                    requestId,
                    status: 'error',
                    error: error.message || 'An unknown error occurred.'
                }
            };
        }

        this.sendMessage(responsePayload);
        if (this.debugMode) console.log(`[${this.serverName}] Sent result for request ID: ${requestId}`);
    }

    sendMessage(payload) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(payload));
        } else {
            console.error(`[${this.serverName}] Cannot send message, WebSocket is not open.`);
        }
    }

    stop() {
        console.log(`[${this.serverName}] Stopping server...`);
        this.stopped = true;
        if (this.reconnectTimeoutId) {
            clearTimeout(this.reconnectTimeoutId);
            this.reconnectTimeoutId = null;
        }
        if (this.ws) {
            // Remove listeners to prevent reconnection logic from firing on manual close
            this.ws.removeAllListeners('close');
            this.ws.removeAllListeners('error');
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.close(1000, 'Client initiated disconnect'); // 1000 is a normal closure
            }
            this.ws = null;
        }
        console.log(`[${this.serverName}] Server stopped.`);
    }
}

module.exports = DistributedServer;