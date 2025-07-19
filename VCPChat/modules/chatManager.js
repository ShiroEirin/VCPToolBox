// modules/chatManager.js

window.chatManager = (() => {
    // --- Private Variables ---
    let electronAPI;
    let uiHelper;
    let messageRenderer;
    let itemListManager;
    let topicListManager;
    let groupRenderer;

    // References to state in renderer.js
    let currentSelectedItemRef;
    let currentTopicIdRef;
    let currentChatHistoryRef;
    let attachedFilesRef;
    let globalSettingsRef;

    // DOM Elements from renderer.js
    let elements = {};
    
    // Functions from main renderer
    let mainRendererFunctions = {};

    /**
     * Initializes the ChatManager module.
     * @param {object} config - The configuration object.
     */
    function init(config) {
        electronAPI = config.electronAPI;
        uiHelper = config.uiHelper;
        
        // Modules
        messageRenderer = config.modules.messageRenderer;
        itemListManager = config.modules.itemListManager;
        topicListManager = config.modules.topicListManager;
        groupRenderer = config.modules.groupRenderer;

        // State References
        currentSelectedItemRef = config.refs.currentSelectedItemRef;
        currentTopicIdRef = config.refs.currentTopicIdRef;
        currentChatHistoryRef = config.refs.currentChatHistoryRef;
        attachedFilesRef = config.refs.attachedFilesRef;
        globalSettingsRef = config.refs.globalSettingsRef;

        // DOM Elements
        elements = config.elements;
        
        // Main Renderer Functions
        mainRendererFunctions = config.mainRendererFunctions;

        console.log('[ChatManager] Initialized successfully.');
    }

    // --- Functions moved from renderer.js ---

    function displayNoItemSelected() {
        const { currentChatNameH3, chatMessagesDiv, currentItemActionBtn, clearCurrentChatBtn, messageInput, sendMessageBtn, attachFileBtn } = elements;
        currentChatNameH3.textContent = '选择一个 Agent 或群组开始聊天';
        chatMessagesDiv.innerHTML = `<div class="message-item system welcome-bubble"><p>欢迎！请从左侧选择AI助手/群组，或创建新的开始对话。</p></div>`;
        currentItemActionBtn.style.display = 'none';
        clearCurrentChatBtn.style.display = 'none';
        messageInput.disabled = true;
        sendMessageBtn.disabled = true;
        attachFileBtn.disabled = true;
        if (mainRendererFunctions.displaySettingsForItem) {
            mainRendererFunctions.displaySettingsForItem(); 
        }
        if (topicListManager) topicListManager.loadTopicList();
    }

    async function selectItem(itemId, itemType, itemName, itemAvatarUrl, itemFullConfig) {
        const { currentChatNameH3, currentItemActionBtn, clearCurrentChatBtn, messageInput, sendMessageBtn, attachFileBtn } = elements;
        let currentSelectedItem = currentSelectedItemRef.get();
        let currentTopicId = currentTopicIdRef.get();

        if (currentSelectedItem.id === itemId && currentSelectedItem.type === itemType && currentTopicId) {
            console.log(`Item ${itemType} ${itemId} already selected with topic ${currentTopicId}. No change.`);
            return;
        }

        currentSelectedItem = { id: itemId, type: itemType, name: itemName, avatarUrl: itemAvatarUrl, config: itemFullConfig };
        currentSelectedItemRef.set(currentSelectedItem);
        currentTopicIdRef.set(null); // Reset topic
        currentChatHistoryRef.set([]);

        document.querySelectorAll('.topic-list .topic-item.active-topic-glowing').forEach(item => {
            item.classList.remove('active-topic-glowing');
        });

        if (messageRenderer) {
            messageRenderer.setCurrentSelectedItem(currentSelectedItem);
            messageRenderer.setCurrentTopicId(null);
            messageRenderer.setCurrentItemAvatar(itemAvatarUrl);
            messageRenderer.setCurrentItemAvatarColor(itemFullConfig?.avatarCalculatedColor || null);
        }

        if (itemType === 'group' && groupRenderer && typeof groupRenderer.handleSelectGroup === 'function') {
            await groupRenderer.handleSelectGroup(itemId, itemName, itemAvatarUrl, itemFullConfig);
        } else if (itemType === 'agent') {
            if (groupRenderer && typeof groupRenderer.clearInviteAgentButtons === 'function') {
                groupRenderer.clearInviteAgentButtons();
            }
        }
     
        currentChatNameH3.textContent = `与 ${itemName} ${itemType === 'group' ? '(群组)' : ''} 聊天中`;
        currentItemActionBtn.textContent = itemType === 'group' ? '新建群聊话题' : '新建聊天话题';
        currentItemActionBtn.title = `为 ${itemName} 新建${itemType === 'group' ? '群聊话题' : '聊天话题'}`;
        currentItemActionBtn.style.display = 'inline-block';
        clearCurrentChatBtn.style.display = 'inline-block';

        itemListManager.highlightActiveItem(itemId, itemType);
        if(mainRendererFunctions.displaySettingsForItem) mainRendererFunctions.displaySettingsForItem();

        try {
            let topics;
            if (itemType === 'agent') {
                topics = await electronAPI.getAgentTopics(itemId);
            } else if (itemType === 'group') {
                topics = await electronAPI.getGroupTopics(itemId);
            }

            if (topics && !topics.error && topics.length > 0) {
                let topicToLoadId = topics[0].id;
                const rememberedTopicId = localStorage.getItem(`lastActiveTopic_${itemId}_${itemType}`);
                if (rememberedTopicId && topics.some(t => t.id === rememberedTopicId)) {
                    topicToLoadId = rememberedTopicId;
                }
                currentTopicIdRef.set(topicToLoadId);
                if (messageRenderer) messageRenderer.setCurrentTopicId(topicToLoadId);
                await loadChatHistory(itemId, itemType, topicToLoadId);
            } else if (topics && topics.error) {
                console.error(`加载 ${itemType} ${itemId} 的话题列表失败:`, topics.error);
                if (messageRenderer) messageRenderer.renderMessage({ role: 'system', content: `加载话题列表失败: ${topics.error}`, timestamp: Date.now() });
                await loadChatHistory(itemId, itemType, null);
            } else {
                if (itemType === 'agent') {
                    const agentConfig = await electronAPI.getAgentConfig(itemId);
                    if (agentConfig && (!agentConfig.topics || agentConfig.topics.length === 0)) {
                        const defaultTopicResult = await electronAPI.createNewTopicForAgent(itemId, "主要对话");
                        if (defaultTopicResult.success) {
                            currentTopicIdRef.set(defaultTopicResult.topicId);
                            if (messageRenderer) messageRenderer.setCurrentTopicId(defaultTopicResult.topicId);
                            await loadChatHistory(itemId, itemType, defaultTopicResult.topicId);
                        } else {
                            if (messageRenderer) messageRenderer.renderMessage({ role: 'system', content: `创建默认话题失败: ${defaultTopicResult.error}`, timestamp: Date.now() });
                            await loadChatHistory(itemId, itemType, null);
                        }
                    } else {
                         await loadChatHistory(itemId, itemType, null);
                    }
                } else if (itemType === 'group') {
                    const defaultTopicResult = await electronAPI.createNewTopicForGroup(itemId, "主要群聊");
                    if (defaultTopicResult.success) {
                        currentTopicIdRef.set(defaultTopicResult.topicId);
                        if (messageRenderer) messageRenderer.setCurrentTopicId(defaultTopicResult.topicId);
                        await loadChatHistory(itemId, itemType, defaultTopicResult.topicId);
                    } else {
                        if (messageRenderer) messageRenderer.renderMessage({ role: 'system', content: `创建默认群聊话题失败: ${defaultTopicResult.error}`, timestamp: Date.now() });
                        await loadChatHistory(itemId, itemType, null);
                    }
                }
            }
        } catch (e) {
            console.error(`选择 ${itemType} ${itemId} 时发生错误: `, e);
            if (messageRenderer) messageRenderer.renderMessage({ role: 'system', content: `选择${itemType === 'group' ? '群组' : '助手'}时出错: ${e.message}`, timestamp: Date.now() });
        }

        messageInput.disabled = false;
        sendMessageBtn.disabled = false;
        attachFileBtn.disabled = false;
        messageInput.focus();
        if (topicListManager) topicListManager.loadTopicList();
    }

    async function selectTopic(topicId) {
        let currentTopicId = currentTopicIdRef.get();
        if (currentTopicId !== topicId) {
            currentTopicIdRef.set(topicId);
            if (messageRenderer) messageRenderer.setCurrentTopicId(topicId);
            
            const currentSelectedItem = currentSelectedItemRef.get();
            document.querySelectorAll('#topicList .topic-item').forEach(item => {
                const isClickedItem = item.dataset.topicId === topicId && item.dataset.itemId === currentSelectedItem.id;
                item.classList.toggle('active', isClickedItem);
                item.classList.toggle('active-topic-glowing', isClickedItem);
            });
            await loadChatHistory(currentSelectedItem.id, currentSelectedItem.type, topicId);
            localStorage.setItem(`lastActiveTopic_${currentSelectedItem.id}_${currentSelectedItem.type}`, topicId);
        }
    }

    async function handleTopicDeletion(remainingTopics) {
        let currentSelectedItem = currentSelectedItemRef.get();
        currentSelectedItem.config.topics = remainingTopics;
        currentSelectedItemRef.set(currentSelectedItem);

        if (remainingTopics && remainingTopics.length > 0) {
            const newSelectedTopic = remainingTopics.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
            await selectItem(currentSelectedItem.id, currentSelectedItem.type, currentSelectedItem.name, currentSelectedItem.avatarUrl, currentSelectedItem.config);
            await loadChatHistory(currentSelectedItem.id, currentSelectedItem.type, newSelectedTopic.id);
            currentTopicIdRef.set(newSelectedTopic.id);
            if (messageRenderer) messageRenderer.setCurrentTopicId(newSelectedTopic.id);
        } else {
            currentTopicIdRef.set(null);
            if (messageRenderer) {
                messageRenderer.setCurrentTopicId(null);
                messageRenderer.clearChat();
                messageRenderer.renderMessage({ role: 'system', content: '所有话题均已删除。请创建一个新话题。', timestamp: Date.now() });
            }
            await displayTopicTimestampBubble(currentSelectedItem.id, currentSelectedItem.type, null);
        }
    }

    async function loadChatHistory(itemId, itemType, topicId) {
        if (messageRenderer) messageRenderer.clearChat();
        currentChatHistoryRef.set([]);

        document.querySelectorAll('.topic-list .topic-item').forEach(item => {
            const isCurrent = item.dataset.topicId === topicId && item.dataset.itemId === itemId && item.dataset.itemType === itemType;
            item.classList.toggle('active', isCurrent);
            item.classList.toggle('active-topic-glowing', isCurrent);
        });

        if (messageRenderer) messageRenderer.setCurrentTopicId(topicId);

        if (!itemId) {
            const errorMsg = `错误：无法加载聊天记录，${itemType === 'group' ? '群组' : '助手'}ID (${itemId}) 缺失。`;
            console.error(errorMsg);
            if (messageRenderer) {
                messageRenderer.renderMessage({ role: 'system', content: errorMsg, timestamp: Date.now() });
            }
            await displayTopicTimestampBubble(null, null, null);
            return;
        }
        
        if (!topicId) {
            if (messageRenderer) {
                messageRenderer.renderMessage({ role: 'system', content: '请选择或创建一个话题以开始聊天。', timestamp: Date.now() });
            }
            await displayTopicTimestampBubble(itemId, itemType, null);
            return;
        }

        if (messageRenderer) {
            messageRenderer.renderMessage({ role: 'system', name: '系统', content: '加载聊天记录中...', timestamp: Date.now(), isThinking: true, id: 'loading_history' });
        }

        let historyResult;
        if (itemType === 'agent') {
            historyResult = await electronAPI.getChatHistory(itemId, topicId);
        } else if (itemType === 'group') {
            historyResult = await electronAPI.getGroupChatHistory(itemId, topicId);
        }
        
        if (messageRenderer) messageRenderer.removeMessageById('loading_history');

        await displayTopicTimestampBubble(itemId, itemType, topicId);

        if (historyResult && historyResult.error) {
            if (messageRenderer) messageRenderer.renderMessage({ role: 'system', content: `加载话题 "${topicId}" 的聊天记录失败: ${historyResult.error}`, timestamp: Date.now() });
        } else if (historyResult) {
            currentChatHistoryRef.set(historyResult);
            if (messageRenderer) {
                historyResult.forEach(msg => messageRenderer.renderMessage(msg, true));
            }
        } else {
             if (messageRenderer) messageRenderer.renderMessage({ role: 'system', content: `加载话题 "${topicId}" 的聊天记录时返回了无效数据。`, timestamp: Date.now() });
        }
        uiHelper.scrollToBottom();
        if (itemId && topicId && !(historyResult && historyResult.error)) {
            localStorage.setItem(`lastActiveTopic_${itemId}_${itemType}`, topicId);
        }
    }

    async function displayTopicTimestampBubble(itemId, itemType, topicId) {
        const { chatMessagesDiv } = elements;
        const chatMessagesContainer = document.querySelector('.chat-messages-container');

        if (!chatMessagesDiv || !chatMessagesContainer) {
            console.warn('[displayTopicTimestampBubble] Missing chatMessagesDiv or chatMessagesContainer.');
            const existingBubble = document.getElementById('topicTimestampBubble');
            if (existingBubble) existingBubble.style.display = 'none';
            return;
        }

        let timestampBubble = document.getElementById('topicTimestampBubble');
        if (!timestampBubble) {
            timestampBubble = document.createElement('div');
            timestampBubble.id = 'topicTimestampBubble';
            timestampBubble.className = 'topic-timestamp-bubble';
            if (chatMessagesDiv.firstChild) {
                chatMessagesDiv.insertBefore(timestampBubble, chatMessagesDiv.firstChild);
            } else {
                chatMessagesDiv.appendChild(timestampBubble);
            }
        } else {
            if (chatMessagesDiv.firstChild !== timestampBubble) {
                chatMessagesDiv.insertBefore(timestampBubble, chatMessagesDiv.firstChild);
            }
        }

        if (!itemId || !topicId) {
            timestampBubble.style.display = 'none';
            return;
        }

        try {
            let itemConfigFull;
            if (itemType === 'agent') {
                itemConfigFull = await electronAPI.getAgentConfig(itemId);
            } else if (itemType === 'group') {
                itemConfigFull = await electronAPI.getAgentGroupConfig(itemId);
            }

            if (itemConfigFull && !itemConfigFull.error && itemConfigFull.topics) {
                const currentTopicObj = itemConfigFull.topics.find(t => t.id === topicId);
                if (currentTopicObj && currentTopicObj.createdAt) {
                    const date = new Date(currentTopicObj.createdAt);
                    const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                    timestampBubble.textContent = `话题创建于: ${formattedDate}`;
                    timestampBubble.style.display = 'block';
                } else {
                    console.warn(`[displayTopicTimestampBubble] Topic ${topicId} not found or has no createdAt for ${itemType} ${itemId}.`);
                    timestampBubble.style.display = 'none';
                }
            } else {
                console.error('[displayTopicTimestampBubble] Could not load config or topics for', itemType, itemId, 'Error:', itemConfigFull?.error);
                timestampBubble.style.display = 'none';
            }
        } catch (error) {
            console.error('[displayTopicTimestampBubble] Error fetching topic creation time for', itemType, itemId, 'topic', topicId, ':', error);
            timestampBubble.style.display = 'none';
        }
    }

    async function attemptTopicSummarizationIfNeeded() {
        const currentSelectedItem = currentSelectedItemRef.get();
        const currentChatHistory = currentChatHistoryRef.get();
        const currentTopicId = currentTopicIdRef.get();

        if (currentSelectedItem.type !== 'agent' || currentChatHistory.length < 4 || !currentTopicId) return;

        try {
            const agentConfigForSummary = currentSelectedItem.config;
            if (!agentConfigForSummary || agentConfigForSummary.error) {
                console.error('[TopicSummary] Failed to get agent config for summarization:', agentConfigForSummary?.error);
                return;
            }
            const topics = agentConfigForSummary.topics || [];
            const currentTopicObject = topics.find(t => t.id === currentTopicId);
            const existingTopicTitle = currentTopicObject ? currentTopicObject.name : "主要对话";
            const currentAgentName = agentConfigForSummary.name || 'AI';

            if (existingTopicTitle === "主要对话" || existingTopicTitle.startsWith("新话题")) {
                if (messageRenderer && typeof messageRenderer.summarizeTopicFromMessages === 'function') {
                    const summarizedTitle = await messageRenderer.summarizeTopicFromMessages(currentChatHistory.filter(m => !m.isThinking), currentAgentName);
                    if (summarizedTitle) {
                        const saveResult = await electronAPI.saveAgentTopicTitle(currentSelectedItem.id, currentTopicId, summarizedTitle);
                        if (saveResult.success) {
                            // 话题标题更新成功后，直接更新 currentSelectedItem.config 中的话题名称
                            if (currentTopicObject) {
                                currentTopicObject.name = summarizedTitle;
                            }
                            if (document.getElementById('tabContentTopics').classList.contains('active')) {
                                if (topicListManager) topicListManager.loadTopicList();
                            }
                        } else {
                            console.error(`[TopicSummary] Failed to save new topic title "${summarizedTitle}":`, saveResult.error);
                        }
                    }
                } else {
                    console.error('[TopicSummary] summarizeTopicFromMessages function is not defined or not accessible via messageRenderer.');
                }
            }
        } catch (error) {
            console.error('[TopicSummary] Error during attemptTopicSummarizationIfNeeded:', error);
        }
    }

    async function handleSendMessage() {
        const { messageInput } = elements;
        const content = messageInput.value.trim();
        const attachedFiles = attachedFilesRef.get();
        const currentSelectedItem = currentSelectedItemRef.get();
        const currentTopicId = currentTopicIdRef.get();
        const globalSettings = globalSettingsRef.get();

        if (!content && attachedFiles.length === 0) return;
        if (!currentSelectedItem.id || !currentTopicId) {
            uiHelper.showToastNotification('请先选择一个项目和话题！', 'error');
            return;
        }
        if (!globalSettings.vcpServerUrl) {
            uiHelper.showToastNotification('请先在全局设置中配置VCP服务器URL！', 'error');
            uiHelper.openModal('globalSettingsModal');
            return;
        }

        if (currentSelectedItem.type === 'group') {
            if (groupRenderer && typeof groupRenderer.handleSendGroupMessage === 'function') {
                groupRenderer.handleSendGroupMessage(
                    currentSelectedItem.id,
                    currentTopicId,
                    { text: content, attachments: attachedFiles.map(af => ({ type: af.file.type, src: af.localPath, name: af.originalName, size: af.file.size })) },
                    globalSettings.userName || '用户'
                );
            } else {
                uiHelper.showToastNotification("群聊功能模块未加载，无法发送消息。", 'error');
            }
            messageInput.value = '';
            attachedFilesRef.set([]);
            if(mainRendererFunctions.updateAttachmentPreview) mainRendererFunctions.updateAttachmentPreview();
            uiHelper.autoResizeTextarea(messageInput);
            messageInput.focus();
            return;
        }

        // --- Standard Agent Message Sending ---
        let contentForVCP = content;

        const uiAttachments = [];
        if (attachedFiles.length > 0) {
            for (const af of attachedFiles) {
                uiAttachments.push({
                    type: af._fileManagerData.type,
                    src: af.localPath,
                    name: af.originalName,
                    size: af.file.size,
                    _fileManagerData: af._fileManagerData
                });
                if (af._fileManagerData && af._fileManagerData.extractedText) {
                    contentForVCP += `\n\n[附加文件: ${af.originalName}]\n${af._fileManagerData.extractedText}\n[/附加文件结束: ${af.originalName}]`;
                } else if (af._fileManagerData && af._fileManagerData.type && !af._fileManagerData.type.startsWith('image/') && !af._fileManagerData.type.startsWith('audio/') && !af._fileManagerData.type.startsWith('video/')) {
                    contentForVCP += `\n\n[附加文件: ${af.originalName} (无法预览文本内容)]`;
                }
            }
        }

        const userMessage = {
            role: 'user',
            name: globalSettings.userName || '用户',
            content: content,
            timestamp: Date.now(),
            id: `msg_${Date.now()}_user_${Math.random().toString(36).substring(2, 9)}`,
            attachments: uiAttachments
        };
        
        if (messageRenderer) {
            messageRenderer.renderMessage(userMessage);
        }

        messageInput.value = '';
        attachedFilesRef.set([]);
        if(mainRendererFunctions.updateAttachmentPreview) mainRendererFunctions.updateAttachmentPreview();
        uiHelper.autoResizeTextarea(messageInput);
        messageInput.focus();

        const thinkingMessageId = `msg_${Date.now()}_assistant_${Math.random().toString(36).substring(2, 9)}`;
        const thinkingMessage = {
            role: 'assistant',
            name: currentSelectedItem.name || 'AI',
            content: '思考中...',
            timestamp: Date.now(),
            id: thinkingMessageId,
            isThinking: true,
            avatarUrl: currentSelectedItem.avatarUrl,
            avatarColor: currentSelectedItem.config?.avatarCalculatedColor
        };

        if (messageRenderer) {
            messageRenderer.renderMessage(thinkingMessage);
        }

        try {
            const agentConfig = currentSelectedItem.config;
            const currentChatHistory = currentChatHistoryRef.get();
            const historySnapshotForVCP = currentChatHistory.filter(msg => msg.id !== thinkingMessage.id && !msg.isThinking);

            const messagesForVCP = await Promise.all(historySnapshotForVCP.map(async msg => {
                let vcpImageAttachmentsPayload = [];
                let vcpAudioAttachmentsPayload = [];
                let vcpVideoAttachmentsPayload = [];
                let currentMessageTextContent = msg.content;

                if (msg.role === 'user' && msg.id === userMessage.id) {
                    currentMessageTextContent = contentForVCP;
                } else if (msg.attachments && msg.attachments.length > 0) {
                    let historicalAppendedText = "";
                    for (const att of msg.attachments) {
                        if (att._fileManagerData && typeof att._fileManagerData.extractedText === 'string' && att._fileManagerData.extractedText.trim() !== '') {
                            historicalAppendedText += `\n\n[附加文件: ${att.name || '未知文件'}]\n${att._fileManagerData.extractedText}\n[/附加文件结束: ${att.name || '未知文件'}]`;
                        } else if (att._fileManagerData && att.type && !att.type.startsWith('image/') && !att.type.startsWith('audio/') && !att.type.startsWith('video/')) {
                            historicalAppendedText += `\n\n[附加文件: ${att.name || '未知文件'} (无法预览文本内容)]`;
                        } else if (!att._fileManagerData) {
                            console.warn(`[VCP Context] Historical message attachment for "${att.name}" is missing _fileManagerData. Text content cannot be appended.`);
                        }
                    }
                    currentMessageTextContent += historicalAppendedText;
                }

                if (msg.attachments && msg.attachments.length > 0) {
                    // --- IMAGE PROCESSING ---
                    const imageAttachments = await Promise.all(msg.attachments
                        .filter(att => att.type.startsWith('image/'))
                        .map(async att => {
                            try {
                                const base64Data = await electronAPI.getFileAsBase64(att.src);
                                if (base64Data && typeof base64Data === 'string') {
                                    return {
                                        type: 'image_url',
                                        image_url: {
                                            url: `data:${att.type};base64,${base64Data}`
                                        }
                                    };
                                } else if (base64Data && base64Data.error) {
                                    console.error(`Failed to get Base64 for ${att.name}: ${base64Data.error}`);
                                    uiHelper.showToastNotification(`处理图片 ${att.name} 失败: ${base64Data.error}`, 'error');
                                    return null;
                                } else {
                                    console.error(`Unexpected return from getFileAsBase64 for ${att.name}:`, base64Data);
                                    return null;
                                }
                            } catch (processingError) {
                                console.error(`Exception during getBase64 for ${att.name} (internal: ${att.src}):`, processingError);
                                uiHelper.showToastNotification(`处理图片 ${att.name} 时发生异常: ${processingError.message}`, 'error');
                                return null;
                            }
                        })
                    );
                    vcpImageAttachmentsPayload.push(...imageAttachments.filter(Boolean));

                    // --- AUDIO PROCESSING ---
                    const supportedAudioTypes = ['audio/wav', 'audio/mp3', 'audio/aiff', 'audio/aac', 'audio/ogg', 'audio/flac'];
                    const audioAttachments = await Promise.all(msg.attachments
                        .filter(att => supportedAudioTypes.includes(att.type))
                        .map(async att => {
                            try {
                                const base64Data = await electronAPI.getFileAsBase64(att.src);
                                if (base64Data && typeof base64Data === 'string') {
                                    return {
                                        type: 'source',
                                        source: {
                                            media_type: att.type,
                                            data: base64Data,
                                        }
                                    };
                                } else if (base64Data && base64Data.error) {
                                    console.error(`Failed to get Base64 for audio ${att.name}: ${base64Data.error}`);
                                    uiHelper.showToastNotification(`处理音频 ${att.name} 失败: ${base64Data.error}`, 'error');
                                    return null;
                                } else {
                                    console.error(`Unexpected return from getFileAsBase64 for audio ${att.name}:`, base64Data);
                                    return null;
                                }
                            } catch (processingError) {
                                console.error(`Exception during getBase64 for audio ${att.name} (internal: ${att.src}):`, processingError);
                                uiHelper.showToastNotification(`处理音频 ${att.name} 时发生异常: ${processingError.message}`, 'error');
                                return null;
                            }
                        })
                    );
                    vcpAudioAttachmentsPayload.push(...audioAttachments.filter(Boolean));

                    // --- VIDEO PROCESSING ---
                    const videoAttachments = await Promise.all(msg.attachments
                        .filter(att => att.type.startsWith('video/'))
                        .map(async att => {
                            try {
                                const base64Data = await electronAPI.getFileAsBase64(att.src);
                                if (base64Data && typeof base64Data === 'string') {
                                    return {
                                        type: 'source',
                                        source: {
                                            media_type: att.type,
                                            data: base64Data,
                                        }
                                    };
                                } else if (base64Data && base64Data.error) {
                                    console.error(`Failed to get Base64 for video ${att.name}: ${base64Data.error}`);
                                    uiHelper.showToastNotification(`处理视频 ${att.name} 失败: ${base64Data.error}`, 'error');
                                    return null;
                                } else {
                                    console.error(`Unexpected return from getFileAsBase64 for video ${att.name}:`, base64Data);
                                    return null;
                                }
                            } catch (processingError) {
                                console.error(`Exception during getBase64 for video ${att.name} (internal: ${att.src}):`, processingError);
                                uiHelper.showToastNotification(`处理视频 ${att.name} 时发生异常: ${processingError.message}`, 'error');
                                return null;
                            }
                        })
                    );
                    vcpVideoAttachmentsPayload.push(...videoAttachments.filter(Boolean));
                }

                let finalContentPartsForVCP = [];
                if (currentMessageTextContent && currentMessageTextContent.trim() !== '') {
                    finalContentPartsForVCP.push({ type: 'text', text: currentMessageTextContent });
                }
                finalContentPartsForVCP.push(...vcpImageAttachmentsPayload);
                finalContentPartsForVCP.push(...vcpAudioAttachmentsPayload);
                finalContentPartsForVCP.push(...vcpVideoAttachmentsPayload);

                if (finalContentPartsForVCP.length === 0 && msg.role === 'user') {
                     finalContentPartsForVCP.push({ type: 'text', text: '(用户发送了附件，但无文本或图片内容)' });
                }
                
                return { role: msg.role, content: finalContentPartsForVCP.length > 0 ? finalContentPartsForVCP : msg.content };
            }));

            if (agentConfig && agentConfig.systemPrompt) {
                const systemPromptContent = agentConfig.systemPrompt.replace(/\{\{AgentName\}\}/g, agentConfig.name || currentSelectedItem.id);
                messagesForVCP.unshift({ role: 'system', content: systemPromptContent });
            }

            const useStreaming = (agentConfig && agentConfig.streamOutput !== undefined) ? (agentConfig.streamOutput === true || agentConfig.streamOutput === 'true') : true;
            const modelConfigForVCP = {
                model: (agentConfig && agentConfig.model) ? agentConfig.model : 'gemini-pro',
                temperature: (agentConfig && agentConfig.temperature !== undefined) ? parseFloat(agentConfig.temperature) : 0.7,
                ...(agentConfig && agentConfig.maxOutputTokens && { max_tokens: parseInt(agentConfig.maxOutputTokens) }),
                stream: useStreaming
            };

            if (useStreaming) {
                if (messageRenderer) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    messageRenderer.startStreamingMessage({ ...thinkingMessage, content: "" });
                }
            }

            const vcpResponse = await electronAPI.sendToVCP(
                globalSettings.vcpServerUrl,
                globalSettings.vcpApiKey,
                messagesForVCP,
                modelConfigForVCP,
                thinkingMessage.id
            );

            if (!useStreaming) {
                if (messageRenderer) messageRenderer.removeMessageById(thinkingMessage.id);

                if (vcpResponse.error) {
                    if (messageRenderer) messageRenderer.renderMessage({ role: 'system', content: `VCP错误: ${vcpResponse.error}`, timestamp: Date.now() });
                } else if (vcpResponse.choices && vcpResponse.choices.length > 0) {
                    const assistantMessageContent = vcpResponse.choices[0].message.content;
                    if (messageRenderer) messageRenderer.renderMessage({ role: 'assistant', name: currentSelectedItem.name, avatarUrl: currentSelectedItem.avatarUrl, avatarColor: currentSelectedItem.config?.avatarCalculatedColor, content: assistantMessageContent, timestamp: Date.now() });
                } else {
                    if (messageRenderer) messageRenderer.renderMessage({ role: 'system', content: 'VCP返回了未知格式的响应。', timestamp: Date.now() });
                }
                await electronAPI.saveChatHistory(currentSelectedItem.id, currentTopicId, currentChatHistoryRef.get().filter(msg => !msg.isThinking));
                await attemptTopicSummarizationIfNeeded();
            } else {
                if (vcpResponse && vcpResponse.streamError) {
                    console.error("Streaming setup failed in main process:", vcpResponse.errorDetail || vcpResponse.error);
                } else if (vcpResponse && !vcpResponse.streamingStarted && !vcpResponse.streamError) {
                    console.warn("Expected streaming to start, but main process returned non-streaming or error:", vcpResponse);
                    if (messageRenderer) messageRenderer.removeMessageById(thinkingMessage.id);
                    if (messageRenderer) messageRenderer.renderMessage({ role: 'system', content: '请求流式回复失败，收到非流式响应或错误。', timestamp: Date.now() });
                    await electronAPI.saveChatHistory(currentSelectedItem.id, currentTopicId, currentChatHistoryRef.get().filter(msg => !msg.isThinking));
                    await attemptTopicSummarizationIfNeeded();
                }
            }
        } catch (error) {
            console.error('发送消息或处理VCP响应时出错:', error);
            if (messageRenderer) messageRenderer.removeMessageById(thinkingMessage.id);
            if (messageRenderer) messageRenderer.renderMessage({ role: 'system', content: `错误: ${error.message}`, timestamp: Date.now() });
            if(currentSelectedItem.id && currentTopicId) {
                await electronAPI.saveChatHistory(currentSelectedItem.id, currentTopicId, currentChatHistoryRef.get().filter(msg => !msg.isThinking));
            }
        }
    }

    async function createNewTopicForItem(itemId, itemType) {
        if (!itemId) {
            uiHelper.showToastNotification("请先选择一个项目。", 'error');
            return;
        }
        
        const currentSelectedItem = currentSelectedItemRef.get();
        const itemName = currentSelectedItem.name || (itemType === 'group' ? "当前群组" : "当前助手");
        const newTopicName = `新话题 ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
        
        try {
            let result;
            if (itemType === 'agent') {
                result = await electronAPI.createNewTopicForAgent(itemId, newTopicName);
            } else if (itemType === 'group') {
                result = await electronAPI.createNewTopicForGroup(itemId, newTopicName);
            }

            if (result && result.success && result.topicId) {
                currentTopicIdRef.set(result.topicId);
                currentChatHistoryRef.set([]);
                
                if (messageRenderer) {
                    messageRenderer.setCurrentTopicId(result.topicId);
                    messageRenderer.clearChat();
                    messageRenderer.renderMessage({ role: 'system', content: `新话题 "${result.topicName}" 已开始。`, timestamp: Date.now() });
                }
                localStorage.setItem(`lastActiveTopic_${itemId}_${itemType}`, result.topicId);
                
                if (document.getElementById('tabContentTopics').classList.contains('active')) {
                    if (topicListManager) await topicListManager.loadTopicList();
                }
                
                await displayTopicTimestampBubble(itemId, itemType, result.topicId);
                elements.messageInput.focus();
            } else {
                uiHelper.showToastNotification(`创建新话题失败: ${result ? result.error : '未知错误'}`, 'error');
            }
        } catch (error) {
            console.error(`创建新话题时出错:`, error);
            uiHelper.showToastNotification(`创建新话题时出错: ${error.message}`, 'error');
        }
    }


    async function handleCreateBranch(selectedMessage) { // Only for Agents
        const currentSelectedItem = currentSelectedItemRef.get();
        const currentTopicId = currentTopicIdRef.get();
        const currentChatHistory = currentChatHistoryRef.get();

        if (currentSelectedItem.type !== 'agent' || !currentSelectedItem.id || !currentTopicId || !selectedMessage) {
            uiHelper.showToastNotification("无法创建分支：当前非Agent聊天或缺少必要信息。", 'error');
            return;
        }

        const messageId = selectedMessage.id;
        const messageIndex = currentChatHistory.findIndex(msg => msg.id === messageId);

        if (messageIndex === -1) {
            uiHelper.showToastNotification("无法创建分支：在当前聊天记录中未找到选定消息。", 'error');
            return;
        }

        const historyForNewBranch = currentChatHistory.slice(0, messageIndex + 1);
        if (historyForNewBranch.length === 0) {
            uiHelper.showToastNotification("无法创建分支：没有可用于创建分支的消息。", 'error');
            return;
        }

        try {
            const agentConfig = await electronAPI.getAgentConfig(currentSelectedItem.id);
            if (!agentConfig || agentConfig.error) {
                uiHelper.showToastNotification(`创建分支失败：无法获取助手配置。 ${agentConfig?.error || ''}`, 'error');
                return;
            }
            const originalTopic = agentConfig.topics.find(t => t.id === currentTopicId);
            const originalTopicName = originalTopic ? originalTopic.name : "未命名话题";
            const newBranchTopicName = `${originalTopicName} (分支)`;

            const createResult = await electronAPI.createNewTopicForAgent(currentSelectedItem.id, newBranchTopicName, true); // true to refresh timestamp

            if (!createResult || !createResult.success || !createResult.topicId) {
                uiHelper.showToastNotification(`创建分支话题失败: ${createResult ? createResult.error : '未知错误'}`, 'error');
                return;
            }

            const newTopicId = createResult.topicId;
            const saveResult = await electronAPI.saveChatHistory(currentSelectedItem.id, newTopicId, historyForNewBranch);
            if (!saveResult || !saveResult.success) {
                uiHelper.showToastNotification(`无法将历史记录保存到新的分支话题: ${saveResult ? saveResult.error : '未知错误'}`, 'error');
                await electronAPI.deleteTopic(currentSelectedItem.id, newTopicId); // Clean up empty branch topic
                return;
            }

            currentTopicIdRef.set(newTopicId); // Switch to the new branch topic
            if (messageRenderer) messageRenderer.setCurrentTopicId(newTopicId);
            
            if (document.getElementById('tabContentTopics').classList.contains('active')) {
                if (topicListManager) await topicListManager.loadTopicList(); // Refresh topic list UI
            }
            await loadChatHistory(currentSelectedItem.id, 'agent', newTopicId); // Load history for the new branch
            localStorage.setItem(`lastActiveTopic_${currentSelectedItem.id}_agent`, newTopicId);

            uiHelper.showToastNotification(`已成功创建分支话题 "${newBranchTopicName}" 并切换。`);
            elements.messageInput.focus();

        } catch (error) {
            console.error("创建分支时发生错误:", error);
            uiHelper.showToastNotification(`创建分支时发生内部错误: ${error.message}`, 'error');
        }
    }

    // --- Public API ---
    return {
        init,
        selectItem,
        selectTopic,
        handleTopicDeletion,
        loadChatHistory,
        handleSendMessage,
        createNewTopicForItem,
        displayNoItemSelected,
        attemptTopicSummarizationIfNeeded,
        handleCreateBranch,
    };
})();