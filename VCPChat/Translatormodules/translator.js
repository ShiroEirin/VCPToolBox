document.addEventListener('DOMContentLoaded', async () => {
    // 获取所有需要的 DOM 元素
    const sourceTextarea = document.getElementById('sourceText');
    const translatedTextarea = document.getElementById('translatedText');
    const targetLanguageSelect = document.getElementById('targetLanguageSelect');
    const customPromptVarInput = document.getElementById('customPromptVar');
    const translateBtn = document.getElementById('translateBtn');
    const copyBtn = document.getElementById('copyBtn'); 

    // 配置和状态变量
    let vcpServerUrl = '';
    let vcpApiKey = '';
    let currentTheme = 'dark'; // 默认是暗色主题

    // 用于管理翻译流的状态变量
    let latestMessageId = null; 
    let fullTranslation = '';

    // 保存复制按钮原始的 SVG 图标
    const originalCopyBtnIcon = copyBtn.innerHTML;

    // 应用主题的函数 (与主程序同步)
    const applyTheme = (theme) => {
        document.body.classList.toggle('light-theme', theme === 'light');
        currentTheme = theme;
    };

    // 解析 URL 参数以获取配置
    const urlParams = new URLSearchParams(window.location.search);
    const vcpServerUrlParam = urlParams.get('vcpServerUrl');
    if (vcpServerUrlParam) {
        vcpServerUrl = decodeURIComponent(vcpServerUrlParam);
    }

    const vcpApiKeyParam = urlParams.get('vcpApiKey');
    if (vcpApiKeyParam) {
        vcpApiKey = decodeURIComponent(vcpApiKeyParam);
    }

    console.log('Translator loaded with:', { vcpServerUrl, vcpApiKey, currentTheme });

    // --- 监听流式数据 ---
    window.electronAPI.onVCPStreamChunk((eventData) => {
        if (eventData.messageId !== latestMessageId || !latestMessageId) {
            return;
        }

        if (eventData.type === 'data' && eventData.chunk) {
            const delta = eventData.chunk.choices?.[0]?.delta?.content;
            if (delta) {
                fullTranslation += delta;
                translatedTextarea.value = fullTranslation;
                translatedTextarea.scrollTop = translatedTextarea.scrollHeight;
            }
        } 
        else if (eventData.type === 'end') {
            console.log('Translation stream ended.');
            translatedTextarea.classList.remove('streaming');
            latestMessageId = null;
        } 
        else if (eventData.type === 'error') {
            console.error('Translation stream error:', eventData.error);
            translatedTextarea.value = `翻译错误: ${eventData.error.message || eventData.error}`;
            translatedTextarea.classList.remove('streaming');
            latestMessageId = null;
        }
    });

    // --- 为翻译按钮添加点击事件 ---
    translateBtn.addEventListener('click', async () => {
        const sourceText = sourceTextarea.value.trim();
        if (!sourceText) {
            alert('请输入要翻译的文本。');
            return;
        }
        if (!vcpServerUrl || !vcpApiKey) {
            alert('VCP 服务器 URL 或 API Key 未配置。');
            return;
        }

        const targetLanguage = targetLanguageSelect.value;
        const customPromptVar = customPromptVarInput.value.trim();

        let systemPrompt = `你是一个专业的翻译助手。请将用户提供的文本翻译成${targetLanguageSelect.options[targetLanguageSelect.selectedIndex].text}。`;
        if (customPromptVar) {
            systemPrompt += ` 额外要求: ${customPromptVar}。`;
        }
        systemPrompt += ` 仅返回翻译结果，不要包含任何解释或额外信息。`;

        const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: sourceText }];
        const modelConfig = { model: 'gemini-2.5-flash-preview-05-20', temperature: 0.7, stream: true };

        fullTranslation = '';
        translatedTextarea.value = '翻译中...';
        translatedTextarea.classList.add('streaming');
        
        const messageId = `translator-${Date.now()}`;
        latestMessageId = messageId;

        try {
            const response = await window.electronAPI.sendToVCP(vcpServerUrl, vcpApiKey, messages, modelConfig, messageId);
            if (response && response.streamError) {
                translatedTextarea.value = `翻译失败: ${response.errorDetail.message || response.error}`;
                translatedTextarea.classList.remove('streaming');
                latestMessageId = null;
            }
        } catch (error) {
            console.error('Error sending translation request to VCP:', error);
            translatedTextarea.value = `翻译请求失败: ${error.message}`;
            translatedTextarea.classList.remove('streaming');
            latestMessageId = null;
        }
    });

    // --- Theme Handling ---
    async function initializeTheme() {
        try {
            const theme = await window.electronAPI.getCurrentTheme();
            applyTheme(theme || 'dark');
        } catch (error) {
            console.error('Failed to get initial theme:', error);
            applyTheme('dark'); // Fallback
        }
    }

    if (window.electronAPI) {
        initializeTheme();
        window.electronAPI.onThemeUpdated((theme) => {
            console.log(`Theme update received in translator: ${theme}`);
            applyTheme(theme);
        });
    } else {
        console.warn('electronAPI not found. Theme updates will not work.');
        applyTheme('dark');
    }

    // --- 为复制按钮添加点击事件 ---
    copyBtn.addEventListener('click', () => {
        const textToCopy = translatedTextarea.value;
        if (textToCopy && !translatedTextarea.classList.contains('streaming')) {
            navigator.clipboard.writeText(textToCopy).then(() => {
                copyBtn.innerHTML = '<span class="copy-feedback">已复制!</span>';
                setTimeout(() => {
                    copyBtn.innerHTML = originalCopyBtnIcon;
                }, 2000);
            }).catch(err => {
                console.error('Could not copy text: ', err);
                copyBtn.innerHTML = '<span class="copy-feedback">失败</span>';
                 setTimeout(() => {
                    copyBtn.innerHTML = originalCopyBtnIcon;
                }, 2000);
            });
        }
    });

});
