/**
 * settingsManager.js
 * 
 * Manages the settings panel for both Agents and Groups.
 * Handles displaying, populating, saving, and deleting items.
 */
const settingsManager = (() => {
    // --- Private Variables ---
    let electronAPI = null;
    let uiHelper = null;
    let refs = {}; // To hold references to currentSelectedItem, etc.
    let mainRendererFunctions = {}; // To call back to renderer.js functions if needed

    // DOM Elements
    let agentSettingsContainer, groupSettingsContainer, selectItemPromptForSettings;
    let itemSettingsContainerTitle, selectedItemNameForSettingsSpan, deleteItemBtn;
    let agentSettingsForm, editingAgentIdInput, agentNameInput, agentAvatarInput, agentAvatarPreview;
    let agentSystemPromptTextarea, agentModelInput, agentTemperatureInput;
    let agentContextTokenLimitInput, agentMaxOutputTokensInput;

    /**
     * Displays the appropriate settings view (agent, group, or default prompt)
     * based on the currently selected item.
     */
    function displaySettingsForItem() {
        const currentSelectedItem = refs.currentSelectedItemRef.get();
        
        const agentSettingsExists = agentSettingsContainer && typeof agentSettingsContainer.style !== 'undefined';
        const groupSettingsExists = groupSettingsContainer && typeof groupSettingsContainer.style !== 'undefined';

        if (currentSelectedItem.id) {
            selectItemPromptForSettings.style.display = 'none';
            selectedItemNameForSettingsSpan.textContent = currentSelectedItem.name || currentSelectedItem.id;

            if (currentSelectedItem.type === 'agent') {
                if (agentSettingsExists) agentSettingsContainer.style.display = 'block';
                if (groupSettingsExists) groupSettingsContainer.style.display = 'none';
                itemSettingsContainerTitle.textContent = 'Agent 设置: ';
                deleteItemBtn.textContent = '删除此 Agent';
                populateAgentSettingsForm(currentSelectedItem.id, currentSelectedItem.config);
            } else if (currentSelectedItem.type === 'group') {
                if (agentSettingsExists) agentSettingsContainer.style.display = 'none';
                if (groupSettingsExists) groupSettingsContainer.style.display = 'block';
                itemSettingsContainerTitle.textContent = '群组设置: ';
                deleteItemBtn.textContent = '删除此群组';
                if (window.GroupRenderer && typeof window.GroupRenderer.displayGroupSettingsPage === 'function') {
                    window.GroupRenderer.displayGroupSettingsPage(currentSelectedItem.id);
                } else {
                    console.error("GroupRenderer or displayGroupSettingsPage not available.");
                    if (groupSettingsExists) groupSettingsContainer.innerHTML = "<p>无法加载群组设置界面。</p>";
                }
            }
        } else {
            if (agentSettingsExists) agentSettingsContainer.style.display = 'none';
            if (groupSettingsExists) groupSettingsContainer.style.display = 'none';
            selectItemPromptForSettings.textContent = '请先在左侧选择一个 Agent 或群组以查看或修改其设置。';
            selectItemPromptForSettings.style.display = 'block';
            itemSettingsContainerTitle.textContent = '设置';
            selectedItemNameForSettingsSpan.textContent = '';
        }
    }

    /**
     * Populates the agent settings form with the config of the selected agent.
     * @param {string} agentId - The ID of the agent.
     * @param {object} agentConfig - The configuration object for the agent.
     */
    async function populateAgentSettingsForm(agentId, agentConfig) {
        if (groupSettingsContainer) groupSettingsContainer.style.display = 'none';
        if (agentSettingsContainer) agentSettingsContainer.style.display = 'block';

        if (!agentConfig || agentConfig.error) {
            uiHelper.showToastNotification(`加载Agent配置失败: ${agentConfig?.error || '未知错误'}`, 'error');
            if (agentSettingsContainer) agentSettingsContainer.style.display = 'none';
            selectItemPromptForSettings.textContent = `加载 ${agentId} 配置失败。`;
            selectItemPromptForSettings.style.display = 'block';
            return;
        }
        
        editingAgentIdInput.value = agentId;
        agentNameInput.value = agentConfig.name || agentId;
        agentSystemPromptTextarea.value = agentConfig.systemPrompt || '';
        agentModelInput.value = agentConfig.model || '';
        agentTemperatureInput.value = agentConfig.temperature !== undefined ? agentConfig.temperature : 0.7;
        agentContextTokenLimitInput.value = agentConfig.contextTokenLimit !== undefined ? agentConfig.contextTokenLimit : 4000;
        agentMaxOutputTokensInput.value = agentConfig.maxOutputTokens !== undefined ? agentConfig.maxOutputTokens : 1000;

        const streamOutput = agentConfig.streamOutput !== undefined ? agentConfig.streamOutput : true;
        document.getElementById('agentStreamOutputTrue').checked = streamOutput === true || String(streamOutput) === 'true';
        document.getElementById('agentStreamOutputFalse').checked = streamOutput === false || String(streamOutput) === 'false';
        
        if (agentConfig.avatarUrl) {
            agentAvatarPreview.src = `${agentConfig.avatarUrl}${agentConfig.avatarUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
            agentAvatarPreview.style.display = 'block';
        } else {
            agentAvatarPreview.src = '#';
            agentAvatarPreview.style.display = 'none';
        }
        agentAvatarInput.value = '';
        mainRendererFunctions.setCroppedFile('agent', null);
    }

    /**
     * Handles the submission of the agent settings form, saving the changes.
     * @param {Event} event - The form submission event.
     */
    async function saveCurrentAgentSettings(event) {
        event.preventDefault();
        const agentId = editingAgentIdInput.value;
        const newConfig = {
            name: agentNameInput.value.trim(),
            systemPrompt: agentSystemPromptTextarea.value.trim(),
            model: agentModelInput.value.trim() || 'gemini-pro',
            temperature: parseFloat(agentTemperatureInput.value),
            contextTokenLimit: parseInt(agentContextTokenLimitInput.value),
            maxOutputTokens: parseInt(agentMaxOutputTokensInput.value),
            streamOutput: document.getElementById('agentStreamOutputTrue').checked
        };
     
        if (!newConfig.name) {
            uiHelper.showToastNotification("Agent名称不能为空！", 'error');
            return;
        }
     
        const croppedFile = mainRendererFunctions.getCroppedFile('agent');
        if (croppedFile) {
            try {
                const arrayBuffer = await croppedFile.arrayBuffer();
                const avatarResult = await electronAPI.saveAvatar(agentId, {
                    name: croppedFile.name,
                    type: croppedFile.type,
                    buffer: arrayBuffer
                });
     
                if (avatarResult.error) {
                    uiHelper.showToastNotification(`保存Agent头像失败: ${avatarResult.error}`, 'error');
                } else {
                    if (avatarResult.needsColorExtraction && electronAPI.saveAvatarColor) {
                         uiHelper.getAverageColorFromAvatar(avatarResult.avatarUrl, (avgColor) => {
                            if (avgColor) {
                                electronAPI.saveAvatarColor({ type: 'agent', id: agentId, color: avgColor })
                                    .then((saveColorResult) => {
                                        if (saveColorResult && saveColorResult.success) {
                                            if(refs.currentSelectedItemRef.get().id === agentId && refs.currentSelectedItemRef.get().type === 'agent' && window.messageRenderer) {
                                                window.messageRenderer.setCurrentItemAvatarColor(avgColor);
                                            }
                                        } else {
                                            console.warn(`Failed to save agent ${agentId} avatar color:`, saveColorResult?.error);
                                        }
                                    }).catch(err => console.error(`Error saving agent ${agentId} avatar color:`, err));
                            }
                        });
                    }
                    agentAvatarPreview.src = avatarResult.avatarUrl;
                    mainRendererFunctions.setCroppedFile('agent', null);
                    agentAvatarInput.value = '';
                }
            } catch (readError) {
                console.error("读取Agent头像文件失败:", readError);
                uiHelper.showToastNotification(`读取Agent头像文件失败: ${readError.message}`, 'error');
            }
        }
     
        const result = await electronAPI.saveAgentConfig(agentId, newConfig);
        const saveButton = agentSettingsForm.querySelector('button[type="submit"]');
     
        if (result.success) {
            if (saveButton) uiHelper.showSaveFeedback(saveButton, true, '已保存!', '保存 Agent 设置');
            await window.itemListManager.loadItems();
            
            const currentSelectedItem = refs.currentSelectedItemRef.get();
            if (currentSelectedItem.id === agentId && currentSelectedItem.type === 'agent') {
                const updatedAgentConfig = await electronAPI.getAgentConfig(agentId);
                currentSelectedItem.name = newConfig.name;
                currentSelectedItem.config = updatedAgentConfig;
                
                // Update other UI parts via callbacks or direct calls if modules are passed in
                if (mainRendererFunctions.updateChatHeader) {
                    mainRendererFunctions.updateChatHeader(`与 ${newConfig.name} 聊天中`);
                }
                if (window.messageRenderer) {
                    window.messageRenderer.setCurrentItemAvatar(updatedAgentConfig.avatarUrl);
                    window.messageRenderer.setCurrentItemAvatarColor(updatedAgentConfig.avatarCalculatedColor || null);
                }
                selectedItemNameForSettingsSpan.textContent = newConfig.name;
            }
        } else {
            if (saveButton) uiHelper.showSaveFeedback(saveButton, false, '保存失败', '保存 Agent 设置');
            uiHelper.showToastNotification(`保存Agent设置失败: ${result.error}`, 'error');
        }
    }

    /**
     * Handles the deletion of the currently selected item (agent or group).
     */
    async function handleDeleteCurrentItem() {
        const currentSelectedItem = refs.currentSelectedItemRef.get();
        if (!currentSelectedItem.id) {
            uiHelper.showToastNotification("没有选中的项目可删除。", 'info');
            return;
        }

        const itemTypeDisplay = currentSelectedItem.type === 'group' ? '群组' : 'Agent';
        const itemName = currentSelectedItem.name || '当前选中的项目';

        if (confirm(`您确定要删除 ${itemTypeDisplay} "${itemName}" 吗？其所有聊天记录和设置都将被删除，此操作不可撤销！`)) {
            let result;
            if (currentSelectedItem.type === 'agent') {
                result = await electronAPI.deleteAgent(currentSelectedItem.id);
            } else if (currentSelectedItem.type === 'group') {
                result = await electronAPI.deleteAgentGroup(currentSelectedItem.id);
            }

            if (result && result.success) {
                // Reset state in renderer via refs
                refs.currentSelectedItemRef.set({ id: null, type: null, name: null, avatarUrl: null, config: null });
                refs.currentTopicIdRef.set(null);
                refs.currentChatHistoryRef.set([]);
                
                // Call back to renderer to update UI
                if (mainRendererFunctions.onItemDeleted) {
                    mainRendererFunctions.onItemDeleted();
                }
            } else {
                uiHelper.showToastNotification(`删除${itemTypeDisplay}失败: ${result?.error || '未知错误'}`, 'error');
            }
        }
    }

    /**
     * Populates the assistant agent select dropdown with available agents.
     */
    async function populateAssistantAgentSelect() {
        const assistantAgentSelect = document.getElementById('assistantAgent');
        if (!assistantAgentSelect) {
            console.warn('[SettingsManager] populateAssistantAgentSelect: assistantAgentSelect element not found');
            return;
        }

        const agents = await electronAPI.getAgents();
        if (agents && !agents.error) {
            assistantAgentSelect.innerHTML = '<option value="">请选择一个Agent</option>'; // Clear and add placeholder
            agents.forEach(agent => {
                const option = document.createElement('option');
                option.value = agent.id;
                option.textContent = agent.name || agent.id;
                assistantAgentSelect.appendChild(option);
            });
        } else {
            console.error('[SettingsManager] Failed to load agents for assistant select:', agents?.error);
            assistantAgentSelect.innerHTML = '<option value="">加载Agent失败</option>';
        }
    }

    // --- Public API ---
    return {
        init: (options) => {
            electronAPI = options.electronAPI;
            uiHelper = options.uiHelper;
            refs = options.refs;
            mainRendererFunctions = options.mainRendererFunctions;

            // DOM Elements
            agentSettingsContainer = options.elements.agentSettingsContainer;
            groupSettingsContainer = options.elements.groupSettingsContainer;
            selectItemPromptForSettings = options.elements.selectItemPromptForSettings;
            itemSettingsContainerTitle = options.elements.itemSettingsContainerTitle;
            selectedItemNameForSettingsSpan = options.elements.selectedItemNameForSettingsSpan;
            deleteItemBtn = options.elements.deleteItemBtn;
            agentSettingsForm = options.elements.agentSettingsForm;
            editingAgentIdInput = options.elements.editingAgentIdInput;
            agentNameInput = options.elements.agentNameInput;
            agentAvatarInput = options.elements.agentAvatarInput;
            agentAvatarPreview = options.elements.agentAvatarPreview;
            agentSystemPromptTextarea = options.elements.agentSystemPromptTextarea;
            agentModelInput = options.elements.agentModelInput;
            agentTemperatureInput = options.elements.agentTemperatureInput;
            agentContextTokenLimitInput = options.elements.agentContextTokenLimitInput;
            agentMaxOutputTokensInput = options.elements.agentMaxOutputTokensInput;

            // Event Listeners
            if (agentSettingsForm) {
                agentSettingsForm.addEventListener('submit', saveCurrentAgentSettings);
            }
            if (deleteItemBtn) {
                deleteItemBtn.addEventListener('click', handleDeleteCurrentItem);
            }
            if(agentAvatarInput){
                agentAvatarInput.addEventListener('change', (event) => {
                    const file = event.target.files[0];
                    if (file) {
                        uiHelper.openAvatarCropper(file, (croppedFileResult) => {
                            mainRendererFunctions.setCroppedFile('agent', croppedFileResult);
                            if (agentAvatarPreview) {
                                agentAvatarPreview.src = URL.createObjectURL(croppedFileResult);
                                agentAvatarPreview.style.display = 'block';
                            }
                        }, 'agent');
                    } else {
                        if(agentAvatarPreview) agentAvatarPreview.style.display = 'none';
                        mainRendererFunctions.setCroppedFile('agent', null);
                    }
                });
            }

            console.log('settingsManager initialized.');
        },
        displaySettingsForItem: displaySettingsForItem,
        populateAssistantAgentSelect: populateAssistantAgentSelect,
    };
})();

window.settingsManager = settingsManager;