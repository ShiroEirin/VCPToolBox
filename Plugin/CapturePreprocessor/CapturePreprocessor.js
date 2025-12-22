const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const dotenv = require('dotenv');

let vcpConfig = {};
let vcpProjectBasePath = '';

async function executePythonPluginWithPerfectEnvironment(pluginName, params, processingMode) {
    return new Promise(async (resolve, reject) => {
        const basePath = vcpProjectBasePath || path.join(__dirname, '..', '..');
        const pluginDir = path.join(basePath, 'Plugin', pluginName);
        const scriptName = pluginName === 'PyScreenshot' ? 'screenshot.py' : 'capture.py';
        const scriptPath = path.join(pluginDir, scriptName);

        const finalEnv = { ...process.env };

        for (const key in vcpConfig) {
            if (vcpConfig.hasOwnProperty(key) && vcpConfig[key] !== undefined) {
                finalEnv[key] = String(vcpConfig[key]);
            }
        }

        try {
            const targetPluginConfigPath = path.join(pluginDir, 'config.env');
            const targetPluginConfigContent = await fs.readFile(targetPluginConfigPath, 'utf-8');
            const targetPluginEnv = dotenv.parse(targetPluginConfigContent);
            for (const key in targetPluginEnv) {
                if (targetPluginEnv.hasOwnProperty(key)) {
                    finalEnv[key] = targetPluginEnv[key];
                }
            }
        } catch (e) {
            if (e.code !== 'ENOENT') {
                console.warn(`[CapturePreprocessor] Could not read config.env for ${pluginName}: ${e.message}`);
            }
        }

        finalEnv.PROJECT_BASE_PATH = basePath;
        if (process.env.PORT) finalEnv.SERVER_PORT = process.env.PORT;
        if (vcpConfig.IMAGESERVER_IMAGE_KEY) finalEnv.IMAGESERVER_IMAGE_KEY = vcpConfig.IMAGESERVER_IMAGE_KEY;
        if (process.env.Key) finalEnv.Key = process.env.Key;
        finalEnv.PYTHONIOENCODING = 'utf-8';
        finalEnv.PROCESSING_MODE = processingMode;

        const pythonProcess = spawn('python', [scriptPath], { cwd: pluginDir, env: finalEnv, shell: true, windowsHide: true });

        let stdoutData = '';
        let stderrData = '';

        pythonProcess.stdout.on('data', (data) => { stdoutData += data.toString(); });
        pythonProcess.stderr.on('data', (data) => { stderrData += data.toString(); });

        pythonProcess.on('close', (code) => {
            if (code === 0) {
                try {
                    const parsed = JSON.parse(stdoutData);
                    if (parsed.status === 'success') {
                        resolve(parsed.result);
                    } else {
                        reject(new Error(parsed.error?.message || 'Python script reported an error.'));
                    }
                } catch (e) {
                    reject(new Error('Failed to parse Python script output: ' + e.message));
                }
            } else {
                reject(new Error(`Script ${scriptName} exited with code ${code}: ${stderrData}`));
            }
        });

        pythonProcess.on('error', (err) => reject(new Error('Failed to start Python script: ' + err.message)));

        pythonProcess.stdin.write(JSON.stringify(params));
        pythonProcess.stdin.end();
    });
}

class CapturePreprocessor {
    async processMessages(messages, requestConfig = {}) {
        const currentConfig = { ...vcpConfig, ...requestConfig };
        let systemPrompt = messages.find(m => m.role === 'system');
        let lastUserMessage = messages.findLast(m => m.role === 'user');

        if (!systemPrompt || typeof systemPrompt.content !== 'string' || !lastUserMessage) {
            return messages;
        }

        const placeholderRegex = /{{\s*(VCPCameraCapture|VCPScreenShot)(?:\((\d+)\))?\s*}}/g;
        const matches = [...systemPrompt.content.matchAll(placeholderRegex)];

        if (matches.length === 0) {
            return messages;
        }

        // --- Parallel Execution Logic ---
        const captureTasks = [];
        let screenshotNeeded = false;
        let cameraCaptureNeeded = false;

        for (const match of matches) {
            const command = match[1];
            if (command === 'VCPScreenShot' && !screenshotNeeded) {
                screenshotNeeded = true;
                captureTasks.push({
                    name: 'PyScreenshot',
                    params: {},
                    mode: currentConfig.PLACEHOLDER_SCREENSHOT_MODE || 'full_analysis'
                });
            }
            if (command === 'VCPCameraCapture' && !cameraCaptureNeeded) {
                cameraCaptureNeeded = true;
                const cameraIndexStr = match[2];
                captureTasks.push({
                    name: 'PyCameraCapture',
                    params: { camera_index: cameraIndexStr ? parseInt(cameraIndexStr, 10) : 0 },
                    mode: currentConfig.PLACEHOLDER_CAMERA_MODE || 'full_analysis'
                });
            }
        }

        const promises = captureTasks.map(task => 
            executePythonPluginWithPerfectEnvironment(task.name, task.params, task.mode)
                .then(result => ({ name: task.name, status: 'success', data: result }))
                .catch(e => ({ name: task.name, status: 'error', message: e.message }))
        );

        const settledResults = await Promise.all(promises);

        // --- Inject results into user message ---
        let userContent = lastUserMessage.content;
        if (typeof userContent === 'string') {
            userContent = [{ type: 'text', text: userContent }];
        } else if (!Array.isArray(userContent)) {
            return messages;
        }

        for (const result of settledResults) {
            if (result.status === 'success') {
                if (result.data && Array.isArray(result.data.content)) {
                    userContent.push(...result.data.content);
                }
            } else {
                userContent.push({ type: 'text', text: `[Capture Error for ${result.name}: ${result.message}]` });
            }
        }

        // Clean the system prompt and merge user message content
        systemPrompt.content = systemPrompt.content.replace(placeholderRegex, '').trim();

        const mergedContent = [];
        for (const part of userContent) {
            const lastPart = mergedContent[mergedContent.length - 1];
            if (part.type === 'text' && lastPart && lastPart.type === 'text') {
                lastPart.text += '\n' + part.text;
            } else {
                mergedContent.push(part);
            }
        }

        lastUserMessage.content = mergedContent;

        return messages;
    }

    initialize(initialConfig, dependencies) {
        vcpConfig = initialConfig;
        if (dependencies && dependencies.projectBasePath) {
            vcpProjectBasePath = dependencies.projectBasePath;
        } else {
            vcpProjectBasePath = path.join(__dirname, '..', '..');
        }
        console.log('[CapturePreprocessor] Initialized with parallel execution logic.');
    }
}

module.exports = new CapturePreprocessor();