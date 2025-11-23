import { apiFetch, showMessage } from './utils.js';

const API_BASE_URL = '/admin_api';

let listenersAttached = false;

/**
 * 初始化 AgentAssistant 配置界面。
 * 可以被多次调用，事件监听只注册一次，每次都会重新加载最新配置。
 */
export async function initializeAgentAssistantConfig() {
    const section = document.getElementById('agent-assistant-config-section');
    if (!section) return;

    if (!listenersAttached) {
        attachEventListeners();
        listenersAttached = true;
    }

    await Promise.all([loadAgentAssistantConfig(), loadExistingAgents()]);
}

function attachEventListeners() {
    const saveButton = document.getElementById('aa-save-config-button');
    const addCustomButton = document.getElementById('aa-add-custom-agent-button');
    const addFromExistingButton = document.getElementById('aa-add-from-existing-button');

    if (saveButton && !saveButton.dataset.listenerAttached) {
        saveButton.addEventListener('click', saveAgentAssistantConfig);
        saveButton.dataset.listenerAttached = 'true';
    }

    if (addCustomButton && !addCustomButton.dataset.listenerAttached) {
        addCustomButton.addEventListener('click', () => {
            addAgentCard({
                baseName: '',
                chineseName: '',
                modelId: '',
                systemPrompt: '',
                maxOutputTokens: 8000,
                temperature: 0.7,
                description: ''
            });
        });
        addCustomButton.dataset.listenerAttached = 'true';
    }

    if (addFromExistingButton && !addFromExistingButton.dataset.listenerAttached) {
        addFromExistingButton.addEventListener('click', handleAddFromExisting);
        addFromExistingButton.dataset.listenerAttached = 'true';
    }
}

async function loadAgentAssistantConfig() {
    const statusSpan = document.getElementById('aa-status');
    const cardsContainer = document.getElementById('aa-agent-cards-container');
    const maxHistoryInput = document.getElementById('aa-max-history');
    const contextTtlInput = document.getElementById('aa-context-ttl');
    const globalSystemPromptInput = document.getElementById('aa-global-system-prompt');

    if (statusSpan) {
        statusSpan.textContent = '正在加载 AgentAssistant 配置...';
        statusSpan.className = 'status-message info';
    }
    if (cardsContainer) {
        cardsContainer.innerHTML = '';
    }

    try {
        const data = await apiFetch(`${API_BASE_URL}/agent-assistant/config`);

        if (maxHistoryInput) {
            maxHistoryInput.value = data.maxHistoryRounds ?? 7;
        }
        if (contextTtlInput) {
            contextTtlInput.value = data.contextTtlHours ?? 24;
        }
        if (globalSystemPromptInput) {
            globalSystemPromptInput.value = data.globalSystemPrompt || '';
        }

        if (Array.isArray(data.agents) && data.agents.length > 0) {
            data.agents.forEach(agent => addAgentCard(agent));
        } else if (cardsContainer) {
            cardsContainer.innerHTML = '<p>当前还没有配置任何 Agent 助手，可以通过上方按钮创建。</p>';
        }

        if (statusSpan) {
            statusSpan.textContent = '配置已加载。';
            statusSpan.className = 'status-message success';
        }
    } catch (error) {
        if (statusSpan) {
            statusSpan.textContent = `加载配置失败：${error.message}`;
            statusSpan.className = 'status-message error';
        }
    }
}

async function loadExistingAgents() {
    const select = document.getElementById('aa-existing-agent-select');
    if (!select) return;

    try {
        const [mapData] = await Promise.all([
            apiFetch(`${API_BASE_URL}/agents/map`, {}, false),
        ]);

        const currentValue = select.value;
        select.innerHTML = '<option value="">选择一个已注册 Agent...</option>';

        const entries = Object.entries(mapData || {});
        if (entries.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '（当前没有已注册的 Agent）';
            select.appendChild(opt);
            select.disabled = true;
            return;
        }

        entries
            .sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
            .forEach(([alias]) => {
                const option = document.createElement('option');
                option.value = alias;
                option.textContent = alias;
                select.appendChild(option);
            });

        select.disabled = false;
        if (currentValue) {
            select.value = currentValue;
        }
    } catch (error) {
        console.error('Failed to load existing agents for AgentAssistant config:', error);
        select.innerHTML = '<option value="">加载失败</option>';
        select.disabled = true;
    }
}

function addAgentCard(agent) {
    const cardsContainer = document.getElementById('aa-agent-cards-container');
    if (!cardsContainer) return;

    // 如果之前是“暂无”提示，先清空
    if (cardsContainer.children.length === 1 && cardsContainer.firstElementChild.tagName === 'P') {
        cardsContainer.innerHTML = '';
    }

    const card = document.createElement('div');
    card.className = 'aa-agent-card';
    card.dataset.baseName = agent.baseName || '';

    const header = document.createElement('div');
    header.className = 'aa-agent-card-header';

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'aa-agent-name-input';
    titleInput.placeholder = '助手名称（例如：小娜、ResearchBot）';
    titleInput.value = agent.chineseName || '';

    const subtitle = document.createElement('span');
    subtitle.className = 'aa-agent-subtitle';
    const updateSubtitle = () => {
        const name = titleInput.value.trim() || '未命名助手';
        subtitle.textContent = `在工具调用中使用：agent_name="${name}"`;
    };
    updateSubtitle();
    titleInput.addEventListener('input', updateSubtitle);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'aa-agent-delete-btn';
    deleteButton.textContent = '删除';
    deleteButton.addEventListener('click', () => {
        if (confirm(`确定要删除助手 "${titleInput.value || '未命名助手'}" 吗？`)) {
            card.remove();
            if (!cardsContainer.children.length) {
                cardsContainer.innerHTML = '<p>当前还没有配置任何 Agent 助手，可以通过上方按钮创建。</p>';
            }
        }
    });

    header.appendChild(titleInput);
    header.appendChild(subtitle);
    header.appendChild(deleteButton);

    const body = document.createElement('div');
    body.className = 'aa-agent-card-body';

    // 模型与描述
    const row1 = document.createElement('div');
    row1.className = 'aa-row';

    const modelGroup = document.createElement('div');
    modelGroup.className = 'aa-field-group';
    const modelLabel = document.createElement('label');
    modelLabel.textContent = '模型 ID';
    const modelInput = document.createElement('input');
    modelInput.type = 'text';
    modelInput.className = 'aa-agent-model-input';
    modelInput.placeholder = '例如：gemini-2.5-flash-preview-05-20';
    modelInput.value = agent.modelId || '';
    const modelHint = document.createElement('p');
    modelHint.className = 'aa-hint';
    modelHint.textContent = '必须填写一个后端已配置的模型 ID。';
    modelGroup.appendChild(modelLabel);
    modelGroup.appendChild(modelInput);
    modelGroup.appendChild(modelHint);

    const descGroup = document.createElement('div');
    descGroup.className = 'aa-field-group';
    const descLabel = document.createElement('label');
    descLabel.textContent = '角色说明（给使用 AgentAssistant 插件的 AI 看的描述）';
    const descInput = document.createElement('textarea');
    descInput.className = 'aa-agent-desc-input';
    descInput.rows = 2;
    descInput.placeholder = '例如：擅长检索与汇总多来源信息的研究助手，适合处理复杂背景调查和资料分析类请求。';
    descInput.value = agent.description || '';
    descGroup.appendChild(descLabel);
    descGroup.appendChild(descInput);

    row1.appendChild(modelGroup);
    row1.appendChild(descGroup);

    // 系统提示词
    const promptGroup = document.createElement('div');
    promptGroup.className = 'aa-field-group aa-field-group-full';
    const promptLabel = document.createElement('label');
    promptLabel.textContent = '系统提示词（决定这个助手的性格和能力）';
    const promptTextarea = document.createElement('textarea');
    promptTextarea.className = 'aa-agent-system-input';
    promptTextarea.rows = 4;
    promptTextarea.placeholder = '可以简单写，也可以详细写。可使用 {{MaidName}}、{{Date}}、{{Time}} 等占位符。';
    promptTextarea.value = agent.systemPrompt || '';
    const promptHint = document.createElement('p');
    promptHint.className = 'aa-hint';
    promptHint.textContent = '如果你只想引用某个 Agent.txt 的内容，可以直接写 {{Nova}} 这样的占位符。';
    promptGroup.appendChild(promptLabel);
    promptGroup.appendChild(promptTextarea);
    promptGroup.appendChild(promptHint);

    // 高级参数
    const row2 = document.createElement('div');
    row2.className = 'aa-row';

    const tokensGroup = document.createElement('div');
    tokensGroup.className = 'aa-field-group';
    const tokensLabel = document.createElement('label');
    tokensLabel.textContent = '最大输出 Token 数';
    const tokensInput = document.createElement('input');
    tokensInput.type = 'number';
    tokensInput.className = 'aa-agent-max-tokens-input';
    tokensInput.min = '1';
    tokensInput.step = '1';
    tokensInput.placeholder = '例如：8000';
    tokensInput.value = agent.maxOutputTokens != null ? agent.maxOutputTokens : 8000;
    const tokensHint = document.createElement('p');
    tokensHint.className = 'aa-hint';
    tokensHint.textContent = '控制单次回答的最长长度，一般保持默认即可。';
    tokensGroup.appendChild(tokensLabel);
    tokensGroup.appendChild(tokensInput);
    tokensGroup.appendChild(tokensHint);

    const tempGroup = document.createElement('div');
    tempGroup.className = 'aa-field-group';
    const tempLabel = document.createElement('label');
    tempLabel.textContent = '温度（Temperature）';
    const tempInput = document.createElement('input');
    tempInput.type = 'number';
    tempInput.className = 'aa-agent-temp-input';
    tempInput.step = '0.1';
    tempInput.min = '0';
    tempInput.max = '2';
    tempInput.placeholder = '例如：0.7';
    tempInput.value =
        typeof agent.temperature === 'number' && !Number.isNaN(agent.temperature)
            ? agent.temperature
            : 0.7;
    const tempHint = document.createElement('p');
    tempHint.className = 'aa-hint';
    tempHint.textContent = '数值越低越稳健严谨，越高则越有创意。';
    tempGroup.appendChild(tempLabel);
    tempGroup.appendChild(tempInput);
    tempGroup.appendChild(tempHint);

    row2.appendChild(tokensGroup);
    row2.appendChild(tempGroup);

    body.appendChild(row1);
    body.appendChild(promptGroup);
    body.appendChild(row2);

    card.appendChild(header);
    card.appendChild(body);

    cardsContainer.appendChild(card);
}

function handleAddFromExisting() {
    const select = document.getElementById('aa-existing-agent-select');
    const cardsContainer = document.getElementById('aa-agent-cards-container');
    if (!select || !cardsContainer) return;

    const alias = select.value;
    if (!alias) {
        showMessage('请先在下拉框中选择一个已注册的 Agent。', 'info');
        return;
    }

    // 检查是否已存在同名助手
    const existingNames = Array.from(
        cardsContainer.querySelectorAll('.aa-agent-name-input')
    ).map(input => input.value.trim());

    if (existingNames.includes(alias)) {
        showMessage(`已经存在名为 "${alias}" 的助手，无需重复添加。`, 'info');
        return;
    }

    addAgentCard({
        baseName: '',
        chineseName: alias,
        modelId: '',
        // 默认把系统提示词设置成 {{Alias}}，方便与 Agent 文本联动
        systemPrompt: `{{${alias}}}`,
        maxOutputTokens: 8000,
        temperature: 0.7,
        description: `基于已注册 Agent "${alias}" 创建的助手，请补充模型 ID 和更详细的说明。`
    });

    showMessage(`已为 "${alias}" 创建一个新的 Agent 助手卡片。`, 'success');
}

async function saveAgentAssistantConfig() {
    const statusSpan = document.getElementById('aa-status');
    const cardsContainer = document.getElementById('aa-agent-cards-container');
    const maxHistoryInput = document.getElementById('aa-max-history');
    const contextTtlInput = document.getElementById('aa-context-ttl');
    const globalSystemPromptInput = document.getElementById('aa-global-system-prompt');

    if (!cardsContainer || !maxHistoryInput || !contextTtlInput) return;

    const cards = Array.from(cardsContainer.querySelectorAll('.aa-agent-card'));

    const maxHistoryRounds = parseInt(maxHistoryInput.value, 10);
    const contextTtlHours = parseInt(contextTtlInput.value, 10);
    const globalSystemPrompt = globalSystemPromptInput ? globalSystemPromptInput.value : '';

    const agents = [];
    const usedNames = new Set();

    for (const card of cards) {
        const baseName = card.dataset.baseName || '';
        const nameInput = card.querySelector('.aa-agent-name-input');
        const modelInput = card.querySelector('.aa-agent-model-input');
        const systemTextarea = card.querySelector('.aa-agent-system-input');
        const tokensInput = card.querySelector('.aa-agent-max-tokens-input');
        const tempInput = card.querySelector('.aa-agent-temp-input');
        const descInput = card.querySelector('.aa-agent-desc-input');

        const chineseName = nameInput ? nameInput.value.trim() : '';
        const modelId = modelInput ? modelInput.value.trim() : '';

        // 允许空卡存在，但保存时会忽略没有填写名称或模型ID的卡
        if (!chineseName && !modelId) {
            continue;
        }

        if (!chineseName) {
            showMessage('有助手未填写名称，请补充后再保存。', 'error');
            nameInput && nameInput.focus();
            return;
        }

        if (!modelId) {
            showMessage(`助手 "${chineseName}" 未填写模型 ID，请补充后再保存。`, 'error');
            modelInput && modelInput.focus();
            return;
        }

        if (usedNames.has(chineseName)) {
            showMessage(`助手名称 "${chineseName}" 重复，请修改后再保存。`, 'error');
            nameInput && nameInput.focus();
            return;
        }
        usedNames.add(chineseName);

        const maxOutputTokens = parseInt(tokensInput && tokensInput.value, 10);
        const temperature = parseFloat(tempInput && tempInput.value);

        agents.push({
            baseName,
            chineseName,
            modelId,
            systemPrompt: systemTextarea ? systemTextarea.value : '',
            maxOutputTokens: Number.isNaN(maxOutputTokens) ? 8000 : maxOutputTokens,
            temperature: Number.isNaN(temperature) ? 0.7 : temperature,
            description: descInput ? descInput.value : ''
        });
    }

    if (statusSpan) {
        statusSpan.textContent = '正在保存配置...';
        statusSpan.className = 'status-message info';
    }

    try {
        await apiFetch(`${API_BASE_URL}/agent-assistant/config`, {
            method: 'POST',
            body: JSON.stringify({
                maxHistoryRounds,
                contextTtlHours,
                globalSystemPrompt,
                agents
            })
        });
        showMessage('AgentAssistant 配置已保存。', 'success');
        if (statusSpan) {
            statusSpan.textContent = '保存成功。';
            statusSpan.className = 'status-message success';
        }
        // 重新加载一次，确保界面与实际文件完全同步
        await loadAgentAssistantConfig();
    } catch (error) {
        if (statusSpan) {
            statusSpan.textContent = `保存失败：${error.message}`;
            statusSpan.className = 'status-message error';
        }
    }
}


