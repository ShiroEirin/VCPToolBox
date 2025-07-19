// modules/renderer/messageContextMenu.js

let mainRefs = {};
let contextMenuDependencies = {};

/**
 * Initializes the context menu module with necessary references and dependencies.
 * @param {object} refs - Core references (electronAPI, uiHelper, etc.).
 * @param {object} dependencies - Functions from other modules (e.g., from messageRenderer).
 */
function initializeContextMenu(refs, dependencies) {
    mainRefs = refs;
    contextMenuDependencies = dependencies;
    document.addEventListener('click', closeContextMenuOnClickOutside, true);
}

function closeContextMenu() {
    const existingMenu = document.getElementById('chatContextMenu');
    if (existingMenu) {
        existingMenu.remove();
    }
}

// Separate closer for topic context menu to avoid interference
function closeTopicContextMenu() {
    const existingMenu = document.getElementById('topicContextMenu');
    if (existingMenu) existingMenu.remove();
}

function closeContextMenuOnClickOutside(event) {
    const menu = document.getElementById('chatContextMenu');
    if (menu && !menu.contains(event.target)) {
        closeContextMenu();
    }
    const topicMenu = document.getElementById('topicContextMenu');
    if (topicMenu && !topicMenu.contains(event.target)) {
        closeTopicContextMenu();
    }
}

function showContextMenu(event, messageItem, message) {
    closeContextMenu();
    closeTopicContextMenu();

    const { electronAPI, uiHelper } = mainRefs;
    const currentChatHistoryArray = mainRefs.currentChatHistoryRef.get();
    const currentSelectedItemVal = mainRefs.currentSelectedItemRef.get();
    const currentTopicIdVal = mainRefs.currentTopicIdRef.get();

    const menu = document.createElement('div');
    menu.id = 'chatContextMenu';
    menu.classList.add('context-menu');

    const isThinkingOrStreaming = message.isThinking || messageItem.classList.contains('streaming');
    const isError = message.finishReason === 'error';

    if (isThinkingOrStreaming) {
        const cancelOption = document.createElement('div');
        cancelOption.classList.add('context-menu-item');
        cancelOption.textContent = message.isThinking ? "强制移除'思考中...'" : "取消回复生成";
        cancelOption.onclick = () => {
            if (message.isThinking) {
                contextMenuDependencies.removeMessageById(message.id);
            } else if (messageItem.classList.contains('streaming')) {
                contextMenuDependencies.finalizeStreamedMessage(message.id, 'cancelled_by_user');
            }
            closeContextMenu();
        };
        menu.appendChild(cancelOption);
    }
    
    // For non-thinking/non-streaming messages (including errors and completed messages)
    if (!isThinkingOrStreaming) {
        const isEditing = messageItem.classList.contains('message-item-editing');
        const textarea = isEditing ? messageItem.querySelector('.message-edit-textarea') : null;

        if (!isEditing) {
            const editOption = document.createElement('div');
            editOption.classList.add('context-menu-item');
            editOption.innerHTML = `<i class="fas fa-edit"></i> 编辑消息`;
            editOption.onclick = () => {
                toggleEditMode(messageItem, message);
                closeContextMenu();
            };
            menu.appendChild(editOption);
        }

        const copyOption = document.createElement('div');
        copyOption.classList.add('context-menu-item');
        copyOption.innerHTML = `<i class="fas fa-copy"></i> 复制文本`;
        copyOption.onclick = () => {
            let contentToProcess = message.content;
            if (typeof message.content === 'object' && message.content !== null && typeof message.content.text === 'string') {
                contentToProcess = message.content.text;
            } else if (typeof message.content !== 'string') {
                contentToProcess = '';
            }
            const textToCopy = contentToProcess.replace(/<img[^>]*>/g, '').trim();
            navigator.clipboard.writeText(textToCopy);
            closeContextMenu();
        };
        menu.appendChild(copyOption);

        if (isEditing && textarea) {
            const cutOption = document.createElement('div');
            cutOption.classList.add('context-menu-item');
            cutOption.innerHTML = `<i class="fas fa-cut"></i> 剪切文本`;
            cutOption.onclick = () => {
                textarea.focus(); document.execCommand('cut'); closeContextMenu();
            };
            menu.appendChild(cutOption);

            const pasteOption = document.createElement('div');
            pasteOption.classList.add('context-menu-item');
            pasteOption.innerHTML = `<i class="fas fa-paste"></i> 粘贴文本`;
            pasteOption.onclick = async () => {
                textarea.focus();
                try {
                    const text = await electronAPI.readTextFromClipboard();
                    if (text) {
                        const start = textarea.selectionStart; const end = textarea.selectionEnd;
                        textarea.value = textarea.value.substring(0, start) + text + textarea.value.substring(end);
                        textarea.selectionStart = textarea.selectionEnd = start + text.length;
                        textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                    }
                } catch (err) { console.error('Failed to paste text:', err); }
                closeContextMenu();
            };
            menu.appendChild(pasteOption);
        }

        if (currentSelectedItemVal.type === 'agent') {
            const createBranchOption = document.createElement('div');
            createBranchOption.classList.add('context-menu-item');
            createBranchOption.innerHTML = `<i class="fas fa-code-branch"></i> 创建分支`;
            createBranchOption.onclick = () => {
                if (typeof mainRefs.handleCreateBranch === 'function') {
                     mainRefs.handleCreateBranch(message);
                }
                closeContextMenu();
            };
            menu.appendChild(createBranchOption);
        }

        const readModeOption = document.createElement('div');
        readModeOption.classList.add('context-menu-item', 'info-item');
        readModeOption.innerHTML = `<i class="fas fa-book-reader"></i> 阅读模式`;
        readModeOption.onclick = () => {
            let contentToProcess = message.content;
            if (typeof message.content === 'object' && message.content !== null && typeof message.content.text === 'string') {
                contentToProcess = message.content.text;
            } else if (typeof message.content !== 'string') {
                contentToProcess = '';
            }
            // Split content by code blocks to selectively clean media tags
            const parts = contentToProcess.split(/(```[\s\S]*?```)/g);
            const processedParts = parts.map(part => {
                // If the part is a code block (starts and ends with ```), keep it as is.
                if (part.startsWith('```') && part.endsWith('```')) {
                    return part;
                } else {
                    // Otherwise, it's not a code block, so remove media tags.
                    return part.replace(/<img[^>]*>/gi, "")
                               .replace(/<audio[^>]*>.*?<\/audio>/gi, "[音频]")
                               .replace(/<video[^>]*>.*?<\/video>/gi, "[视频]");
                }
            });
            const plainTextContent = processedParts.join('');
            const windowTitle = `阅读: ${message.id.substring(0,10)}...`;
            const currentTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
            if (electronAPI && typeof electronAPI.openTextInNewWindow === 'function') {
                electronAPI.openTextInNewWindow(plainTextContent, windowTitle, currentTheme);
            }
            closeContextMenu();
        };
        menu.appendChild(readModeOption);

        const deleteOption = document.createElement('div');
        deleteOption.classList.add('context-menu-item', 'danger-item');
        deleteOption.innerHTML = `<i class="fas fa-trash-alt"></i> 删除消息`;
        deleteOption.onclick = async () => {
            let textForConfirm = "";
            if (typeof message.content === 'string') {
                textForConfirm = message.content;
            } else if (message.content && typeof message.content.text === 'string') {
                textForConfirm = message.content.text;
            } else {
                textForConfirm = '[消息内容无法预览]';
            }
            
            if (confirm(`确定要删除此消息吗？\n"${textForConfirm.substring(0, 50)}${textForConfirm.length > 50 ? '...' : ''}"`)) {
                contextMenuDependencies.removeMessageById(message.id, true); // Pass true to save history
            }
            closeContextMenu();
        };
        
        // Regenerate option should be here to maintain order
        if (message.role === 'assistant' && !message.isGroupMessage && currentSelectedItemVal.type === 'agent') {
            const regenerateOption = document.createElement('div');
            regenerateOption.classList.add('context-menu-item', 'regenerate-text');
            regenerateOption.innerHTML = `<i class="fas fa-sync-alt"></i> 重新回复`;
            regenerateOption.onclick = () => {
                handleRegenerateResponse(message);
                closeContextMenu();
            };
            menu.appendChild(regenerateOption);
        }

        menu.appendChild(deleteOption);
    }

    menu.style.visibility = 'hidden';
    menu.style.position = 'absolute';
    document.body.appendChild(menu);

    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    let top = event.clientY;
    let left = event.clientX;

    if (top + menuHeight > windowHeight) {
        top = event.clientY - menuHeight;
        if (top < 0) top = 5;
    }

    if (left + menuWidth > windowWidth) {
        left = event.clientX - menuWidth;
        if (left < 0) left = 5;
    }

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.style.visibility = 'visible';
}

function toggleEditMode(messageItem, message) {
    const { electronAPI, markedInstance, uiHelper } = mainRefs;
    const currentChatHistoryArray = mainRefs.currentChatHistoryRef.get();
    const currentSelectedItemVal = mainRefs.currentSelectedItemRef.get();
    const currentTopicIdVal = mainRefs.currentTopicIdRef.get();

    const contentDiv = messageItem.querySelector('.md-content');
    if (!contentDiv) return;

    const existingTextarea = messageItem.querySelector('.message-edit-textarea');
    const existingControls = messageItem.querySelector('.message-edit-controls');

    if (existingTextarea) { // Revert to display mode
        let textToDisplay = "";
        if (typeof message.content === 'string') {
            textToDisplay = message.content;
        } else if (message.content && typeof message.content.text === 'string') {
            textToDisplay = message.content.text;
        } else {
            textToDisplay = '[内容错误]';
        }
        
        const rawHtml = markedInstance.parse(contextMenuDependencies.preprocessFullContent(textToDisplay));
        contextMenuDependencies.setContentAndProcessImages(contentDiv, rawHtml, message.id);
        contextMenuDependencies.processRenderedContent(contentDiv);

        messageItem.classList.remove('message-item-editing');
        existingTextarea.remove();
        if (existingControls) existingControls.remove();
        contentDiv.style.display = '';
        const avatarEl = messageItem.querySelector('.chat-avatar');
        const nameTimeEl = messageItem.querySelector('.name-time-block');
        if(avatarEl) avatarEl.style.display = '';
        if(nameTimeEl) nameTimeEl.style.display = '';
    } else { // Switch to edit mode
        const originalContentHeight = contentDiv.offsetHeight;
        contentDiv.style.display = 'none';
        const avatarEl = messageItem.querySelector('.chat-avatar');
        const nameTimeEl = messageItem.querySelector('.name-time-block');
        if(avatarEl) avatarEl.style.display = 'none';
        if(nameTimeEl) nameTimeEl.style.display = 'none';

        messageItem.classList.add('message-item-editing');

        const textarea = document.createElement('textarea');
        textarea.classList.add('message-edit-textarea');
        
        let textForEditing = "";
        if (typeof message.content === 'string') {
            textForEditing = message.content;
        } else if (message.content && typeof message.content.text === 'string') {
            textForEditing = message.content.text;
        } else {
            textForEditing = '[内容加载错误]';
        }
        textarea.value = textForEditing;
        textarea.style.minHeight = `${Math.max(originalContentHeight, 50)}px`;
        textarea.style.width = '100%';

        const controlsDiv = document.createElement('div');
        controlsDiv.classList.add('message-edit-controls');

        const saveButton = document.createElement('button');
        saveButton.innerHTML = `<i class="fas fa-save"></i> 保存`;
        saveButton.onclick = async () => {
            const newContent = textarea.value;
            const messageIndex = currentChatHistoryArray.findIndex(msg => msg.id === message.id);
            if (messageIndex > -1) {
                currentChatHistoryArray[messageIndex].content = newContent;
                mainRefs.currentChatHistoryRef.set([...currentChatHistoryArray]);
                message.content = newContent;

                if (currentSelectedItemVal.id && currentTopicIdVal) {
                     if (currentSelectedItemVal.type === 'agent') {
                        await electronAPI.saveChatHistory(currentSelectedItemVal.id, currentTopicIdVal, currentChatHistoryArray);
                     } else if (currentSelectedItemVal.type === 'group' && electronAPI.saveGroupChatHistory) {
                        await electronAPI.saveGroupChatHistory(currentSelectedItemVal.id, currentTopicIdVal, currentChatHistoryArray);
                     }
                }
                
                const rawHtml = markedInstance.parse(contextMenuDependencies.preprocessFullContent(newContent));
                contextMenuDependencies.setContentAndProcessImages(contentDiv, rawHtml, message.id);
                contextMenuDependencies.processRenderedContent(contentDiv);
                contextMenuDependencies.renderAttachments(message, contentDiv);
            }
            toggleEditMode(messageItem, message);
        };

        const cancelButton = document.createElement('button');
        cancelButton.innerHTML = `<i class="fas fa-times"></i> 取消`;
        cancelButton.onclick = () => {
             toggleEditMode(messageItem, message);
        };

        controlsDiv.appendChild(saveButton);
        controlsDiv.appendChild(cancelButton);

        messageItem.appendChild(textarea);
        messageItem.appendChild(controlsDiv);
         
        if (uiHelper.autoResizeTextarea) uiHelper.autoResizeTextarea(textarea);
        textarea.focus();
        textarea.addEventListener('input', () => uiHelper.autoResizeTextarea(textarea));
        textarea.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                cancelButton.click();
            }
            if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey) {
                event.preventDefault();
                saveButton.click();
            } else if (event.ctrlKey && event.key === 'Enter') {
                saveButton.click();
            }
        });
    }
}

async function handleRegenerateResponse(originalAssistantMessage) {
    const { electronAPI, uiHelper } = mainRefs;
    const currentChatHistoryArray = mainRefs.currentChatHistoryRef.get();
    const currentSelectedItemVal = mainRefs.currentSelectedItemRef.get();
    const currentTopicIdVal = mainRefs.currentTopicIdRef.get();
    const globalSettingsVal = mainRefs.globalSettingsRef.get();

    if (!currentSelectedItemVal.id || currentSelectedItemVal.type !== 'agent' || !currentTopicIdVal || !originalAssistantMessage || originalAssistantMessage.role !== 'assistant') {
        uiHelper.showToastNotification("只能为 Agent 的回复进行重新生成。", "warning");
        return;
    }

    const originalMessageIndex = currentChatHistoryArray.findIndex(msg => msg.id === originalAssistantMessage.id);
    if (originalMessageIndex === -1) return;

    const historyForRegeneration = currentChatHistoryArray.slice(0, originalMessageIndex);
    
    // Remove original and subsequent messages from DOM and history
    const messagesToRemove = currentChatHistoryArray.splice(originalMessageIndex);
    mainRefs.currentChatHistoryRef.set([...currentChatHistoryArray]);
    messagesToRemove.forEach(msg => contextMenuDependencies.removeMessageById(msg.id, false)); // false = don't save history again

    if (currentSelectedItemVal.id && currentTopicIdVal) {
        try {
            await electronAPI.saveChatHistory(currentSelectedItemVal.id, currentTopicIdVal, currentChatHistoryArray);
        } catch (saveError) {
            console.error("ContextMenu: Failed to save chat history after splice in regenerate:", saveError);
        }
    }

    const regenerationThinkingMessage = {
        role: 'assistant',
        name: currentSelectedItemVal.name || 'AI',
        content: '',
        timestamp: Date.now(),
        id: `regen_${Date.now()}`,
        isThinking: true,
        avatarUrl: currentSelectedItemVal.avatarUrl,
        avatarColor: currentSelectedItemVal.config?.avatarCalculatedColor,
    };
    
    contextMenuDependencies.renderMessage(regenerationThinkingMessage, false);

    try {
        const agentConfig = await electronAPI.getAgentConfig(currentSelectedItemVal.id);
        
        let messagesForVCP = await Promise.all(historyForRegeneration.map(async msg => {
            let vcpImageAttachmentsPayload = [];
            let currentMessageTextContent = (typeof msg.content === 'string') ? msg.content : (msg.content?.text || '');

            if (msg.attachments && msg.attachments.length > 0) {
                for (const att of msg.attachments) {
                    if (att._fileManagerData && typeof att._fileManagerData.extractedText === 'string' && att._fileManagerData.extractedText.trim() !== '') {
                        currentMessageTextContent += `\n\n[附加文件: ${att.name || '未知文件'}]\n${att._fileManagerData.extractedText}\n[/附加文件结束: ${att.name || '未知文件'}]`;
                    } else if (att._fileManagerData && att.type && !att.type.startsWith('image/')) {
                        currentMessageTextContent += `\n\n[附加文件: ${att.name || '未知文件'} (无法预览文本内容)]`;
                    }
                }

                const imageAttachmentsPromises = msg.attachments
                    .filter(att => att.type.startsWith('image/'))
                    .map(async att => {
                        try {
                            const base64Data = await electronAPI.getFileAsBase64(att.src);
                            return base64Data && !base64Data.error ? { type: 'image_url', image_url: { url: `data:${att.type};base64,${base64Data}` } } : null;
                        } catch (e) { return null; }
                    });
                vcpImageAttachmentsPayload = (await Promise.all(imageAttachmentsPromises)).filter(Boolean);
            }

            const finalContentForVCP = [];
            if (currentMessageTextContent.trim() !== '') {
                finalContentForVCP.push({ type: 'text', text: currentMessageTextContent });
            }
            finalContentForVCP.push(...vcpImageAttachmentsPayload);

            if (finalContentForVCP.length === 0 && msg.role === 'user') {
                finalContentForVCP.push({ type: 'text', text: '(用户发送了附件，但无文本或图片内容)' });
            }

            return {
                role: msg.role,
                content: finalContentForVCP.length > 0 ? finalContentForVCP : msg.content
            };
        }));

        if (agentConfig.systemPrompt) {
            messagesForVCP.unshift({ role: 'system', content: agentConfig.systemPrompt.replace(/\{\{AgentName\}\}/g, agentConfig.name) });
        }

        const modelConfigForVCP = {
            model: agentConfig.model,
            temperature: parseFloat(agentConfig.temperature),
            max_tokens: agentConfig.maxOutputTokens ? parseInt(agentConfig.maxOutputTokens) : undefined,
            stream: agentConfig.streamOutput === true || String(agentConfig.streamOutput) === 'true'
        };
        
        const vcpResult = await electronAPI.sendToVCP(
            globalSettingsVal.vcpServerUrl,
            globalSettingsVal.vcpApiKey,
            messagesForVCP,
            modelConfigForVCP,
            regenerationThinkingMessage.id
        );

        if (modelConfigForVCP.stream) {
            contextMenuDependencies.startStreamingMessage({ ...regenerationThinkingMessage, content: "" });
            if (vcpResult.streamError || !vcpResult.streamingStarted) {
                let detailedError = vcpResult.error || '未能启动流';
                contextMenuDependencies.finalizeStreamedMessage(regenerationThinkingMessage.id, 'error', `VCP 流错误 (重新生成): ${detailedError}`);
            }
        } else {
            contextMenuDependencies.removeMessageById(regenerationThinkingMessage.id, false);
            if (vcpResult.error) {
                contextMenuDependencies.renderMessage({ role: 'system', content: `VCP错误 (重新生成): ${vcpResult.error}`, timestamp: Date.now() });
            } else if (vcpResult.choices && vcpResult.choices.length > 0) {
                const assistantMessageContent = vcpResult.choices[0].message.content;
                contextMenuDependencies.renderMessage({ role: 'assistant', name: agentConfig.name, avatarUrl: agentConfig.avatarUrl, avatarColor: agentConfig.avatarCalculatedColor, content: assistantMessageContent, timestamp: Date.now() });
            }
            mainRefs.currentChatHistoryRef.set([...currentChatHistoryArray]);
            if (currentSelectedItemVal.id && currentTopicIdVal) await electronAPI.saveChatHistory(currentSelectedItemVal.id, currentTopicIdVal, currentChatHistoryArray);
            uiHelper.scrollToBottom();
        }

    } catch (error) {
        contextMenuDependencies.finalizeStreamedMessage(regenerationThinkingMessage.id, 'error', `客户端错误 (重新生成): ${error.message}`);
        if (currentSelectedItemVal.id && currentTopicIdVal) await electronAPI.saveChatHistory(currentSelectedItemVal.id, currentTopicIdVal, currentChatHistoryArray);
        uiHelper.scrollToBottom();
    }
}

export {
    initializeContextMenu,
    showContextMenu,
    closeContextMenu,
    toggleEditMode,
    handleRegenerateResponse
};