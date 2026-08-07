# 消息处理层与协议边界审计报告

## 证据部分

### 代码段 1: messageProcessor 变量替换流程

**文件:** `/h/github/VCP/VCPToolBox/messageProcessor.js`
**行号:** 14-52

```javascript
async function resolveAllVariables(text, model, role, context, processingStack = new Set()) {
    if (text == null) return '';
    let processedText = String(text);

    // 通用正则表达式，匹配所有 {{...}} 格式的占位符
    const placeholderRegex = /\{\{([a-zA-Z0-9_:]+)\}\}/g;
    const matches = [...processedText.matchAll(placeholderRegex)];

    // 提取所有潜在的别名（去除 "agent:" 前缀）
    const allAliases = new Set(matches.map(match => match[1].replace(/^agent:/, '')));

    for (const alias of allAliases) {
        // 关键：使用 agentManager 来判断这是否是一个真正的Agent
        if (agentManager.isAgent(alias)) {
            if (processingStack.has(alias)) {
                console.error(`[AgentManager] Circular dependency detected!`);
                const errorMessage = `[Error: Circular agent reference detected for '${alias}']`;
                processedText = processedText.replaceAll(`{{${alias}}}`, errorMessage);
                continue;
            }

            const agentContent = await agentManager.getAgentPrompt(alias);

            processingStack.add(alias);
            const resolvedAgentContent = await resolveAllVariables(agentContent, model, role, context, processingStack);
            processingStack.delete(alias);

            processedText = processedText.replaceAll(`{{${alias}}}`, resolvedAgentContent);
            processedText = processedText.replaceAll(`{{agent:${alias}}}`, resolvedAgentContent);
        }
    }

    // 在所有Agent都被递归展开后，处理剩余的非Agent占位符
    processedText = await replacePriorityVariables(processedText, context, role);
    processedText = await replaceOtherVariables(processedText, model, role, context);

    return processedText;
}
```

**关键观察:**
- 处理 `{{...}}` 格式的占位符（变量系统）
- 不处理旧协议标记 `<<<[TOOL_REQUEST]>>>`
- 不处理旧协议分隔符 `「始」「末」`
- 不处理 `tool_name` 等旧协议关键词

### 代码段 2: 系统变量替换

**文件:** `/h/github/VCP/VCPToolBox/messageProcessor.js`
**行号:** 59-79

```javascript
if (role === 'system') {
    for (const envKey in process.env) {
        if (envKey.startsWith('Tar') || envKey.startsWith('Var')) {
            const placeholder = `{{${envKey}}}`;
            if (processedText.includes(placeholder)) {
                const value = process.env[envKey];
                if (value && typeof value === 'string' && value.toLowerCase().endsWith('.txt')) {
                    const fileContent = await tvsManager.getContent(value);
                    // 检查内容是否表示错误
                    if (fileContent.startsWith('[变量文件') || fileContent.startsWith('[处理变量文件')) {
                        processedText = processedText.replaceAll(placeholder, fileContent);
                    } else {
                        const resolvedContent = await replaceOtherVariables(fileContent, model, role, context);
                        processedText = processedText.replaceAll(placeholder, resolvedContent);
                    }
                } else {
                    processedText = processedText.replaceAll(placeholder, value || `[未配置 ${envKey}]`);
                }
            }
        }
    }
}
```

**关键观察:**
- 处理 `{{Tar*}}` 和 `{{Var*}}` 变量
- 不涉及协议处理
- 完全独立于工具调用协议

## 发现部分

### 发现 1: 消息处理层不处理协议

**状态:** ✓ 符合架构

messageProcessor 完全处理变量替换，不涉及任何协议解析。

**证据:**
- 处理 `{{...}}` 格式的占位符
- 不包含任何 `TOOL_REQUEST`、`tool_name`、`「始」「末」` 的处理
- 变量替换与协议解析完全分离

### 发现 2: 变量系统与协议系统的清晰分离

**状态:** ✓ 符合架构

- 变量系统: `{{Var*}}`、`{{Tar*}}`、`{{Sar*}}`、`{{VCP*}}`
- 协议系统: `<<<[TOOL_REQUEST]>>>`、`「始」「末」`、`tool_name`

两个系统完全独立，无交叉。

**证据:**
- messageProcessor 只处理 `{{...}}` 格式
- ToolCallParser 只处理 `<<<[TOOL_REQUEST]>>>` 和 `「始」「末」`

### 发现 3: 消息处理的职责清晰

**状态:** ✓ 符合架构

messageProcessor 的职责：
1. Agent 变量展开
2. 系统变量替换
3. 模型特定变量处理
4. 异步结果占位符处理

不包括：
- 协议解析
- 工具调用执行
- 路由决策

