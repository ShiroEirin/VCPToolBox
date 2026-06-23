# Snow CLI 集成审计报告

## 执行摘要

VCPToolBox 中的 Snow CLI 集成采用**最小触碰原则**，仅在 SnowBridge 插件层实现了薄型识别和协议转换。核心消息处理模块（messageProcessor.js、chatCompletionHandler.js）**不存在** Snow 专属的识别逻辑或 prompt 语义清洗。

**关键发现**：
- ✅ 无 `x-snow-client`、`x-snow-protocol` 请求头识别
- ✅ 无条件禁用 VCP 工具协议注入的逻辑
- ✅ 无超出"条件禁用"范围的 prompt 语义清洗
- ✅ 变量扩展逻辑中无 Snow 专属处理
- ⚠️ SnowBridge 仅做文本归一化，不做模型面协议清洗

---

## 证据部分

### 1. messageProcessor.js 分析

**文件**: `H:\github\VCP\VCPToolBox\modules\messageProcessor.js`

#### 代码段 1.1：变量扩展入口

```javascript
// 第 35-146 行
async function resolveAllVariables(text, model, role, context, processingStack = new Set()) {
    if (text == null) return '';
    let processedText = String(text);

    // 🔒 安全防护：Agent 和 Toolbox 占位符仅在特权角色中展开
    const isPrivilegedRole = (role === 'system') || (role === 'user' && (processedText.startsWith('[系统提示:]') || processedText.startsWith('[系统邀请指令:]')));

    // 通用正则表达式，匹配所有 {{...}} 格式的占位符
    const placeholderRegex = /\{\{([a-zA-Z0-9_:\u2e80-\u2fff\u3040-\u9fff]+)\}\}/g;
    // ... 处理 Agent 和 Toolbox 占位符
}
```

**关键观察**：
- 无任何 Snow 请求识别逻辑
- 无条件禁用 VCP 工具协议注入的代码
- 变量扩展基于 `role` 和消息前缀，与 Snow 无关

#### 代码段 1.2：其他变量替换

```javascript
// 第 299-499 行
async function replaceOtherVariables(text, model, role, context) {
    const { pluginManager, cachedEmojiLists, detectors, superDetectors, DEBUG_MODE } = context;
    if (text == null) return '';
    let processedText = String(text);

    // SarModel 高级预设注入，对 system 角色或 VCPTavern 注入的 user 角色生效
    if (role === 'system' || (role === 'user' && (processedText.startsWith('[系统提示:]') || processedText.startsWith('[系统邀请指令:]')))) {
        // ... 处理 SarPrompt 占位符
    }
    // ... 处理其他变量
}
```

**关键观察**：
- 无 Snow 专属的条件判断
- 无 prompt 语义清洗逻辑
- 所有处理基于标准的角色和前缀机制

---

### 2. chatCompletionHandler.js 分析

**文件**: `H:\github\VCP\VCPToolBox\modules\chatCompletionHandler.js`

#### 代码段 2.1：请求头处理

```javascript
// 第 630-637 行
const firstAiAPIResponse = await fetchWithRetry(
    `${apiUrl}/v1/chat/completions`,
    {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            ...(req.headers['user-agent'] && { 'User-Agent': req.headers['user-agent'] }),
            Accept: willStreamResponse ? 'text/event-stream' : req.headers['accept'] || 'application/json',
        },
        body: JSON.stringify({ ...originalBody, stream: willStreamResponse }),
        signal: abortController.signal,
    },
    // ...
);
```

**关键观察**：
- 无 `x-snow-client` 或 `x-snow-protocol` 请求头识别
- 无条件禁用 VCP 工具协议注入的逻辑
- 请求头处理完全通用，无 Snow 专属处理

#### 代码段 2.2：消息处理流程

```javascript
// 第 482-621 行
// --- VCPTavern 优先处理 ---
let tavernProcessedMessages = originalBody.messages;
if (pluginManager.messagePreprocessors.has('VCPTavern')) {
    // ... VCPTavern 处理
}

// --- 统一处理所有变量替换 ---
const processingContext = {
    pluginManager,
    cachedEmojiLists: this.config.cachedEmojiLists,
    detectors: this.config.detectors,
    superDetectors: this.config.superDetectors,
    DEBUG_MODE,
    messages: tavernProcessedMessages,
    expandedAgentName: null,
    expandedToolboxes: new Set()
};

// 🔒 顺序处理消息（非并发）
let processedMessages = [];
for (const msg of tavernProcessedMessages) {
    const newMessage = JSON.parse(JSON.stringify(msg));
    if (newMessage.content && typeof newMessage.content === 'string') {
        newMessage.content = await messageProcessor.replaceAgentVariables(
            newMessage.content,
            originalBody.model,
            msg.role,
            processingContext,
        );
    }
    // ...
}
```

**关键观察**：
- 无 Snow 请求识别
- 无条件禁用 VCP 工具协议注入
- 消息处理流程完全通用

---

### 3. SnowBridge 插件分析

**文件**: `H:\github\VCP\VCPToolBox\Plugin\SnowBridge\index.js`

#### 代码段 3.1：Manifest 导出逻辑

```javascript
// 第 682-707 行
buildExportablePlugin(plugin, pluginName) {
    const bridgeCommands = (plugin.capabilities?.invocationCommands || [])
        .map(normalizeInvocationCommand)
        .filter(Boolean);

    if (bridgeCommands.length === 0) {
        return null;
    }

    const bridgeCapabilities = this.getBridgeCapabilities();

    return {
        name: plugin.name || pluginName,
        publicName: plugin.name || pluginName,
        originName: pluginName,
        pluginType: plugin.pluginType,
        toolId: buildBridgeToolId(pluginName),
        displayName: plugin.displayName || plugin.name || pluginName,
        description: normalizeBridgeText(plugin.description),  // ← 仅做文本归一化
        capabilityTags: buildCapabilityTags(bridgeCommands, bridgeCapabilities),
        capabilities: {
            invocationCommands: plugin.capabilities?.invocationCommands || [],
        },
        bridgeCommands,
    };
}
```

#### 代码段 3.2：文本归一化函数

```javascript
// 第 147-155 行
function normalizeBridgeText(description) {
    return String(description || '')
        .replace(/\r\n?/g, '\n')           // 换行符归一化
        .split('\n')
        .map(line => line.trimEnd())       // 行尾空格移除
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')        // 多余空行压缩
        .trim();
}
```

**关键观察**：
- ✅ 仅做**文本格式归一化**（换行符、空格、空行）
- ✅ **不做** prompt 语义清洗
- ✅ **不做** 模型面协议清洗
- ✅ 符合"最小触碰"原则

#### 代码段 3.3：工具执行协议

```javascript
// 第 854-956 行
async handleExecuteTool(serverId, message, pluginManager) {
    const data = (message && message.data) || {};
    const requestId = data.requestId;
    const invocationId = data.invocationId || requestId;
    const toolName = data.originName || data.toolName;
    const toolId = data.toolId || buildBridgeToolId(toolName || '');
    const publicName = data.publicName || data.toolName || toolName;
    const toolArgs = data.toolArgs && typeof data.toolArgs === 'object'
        ? {...data.toolArgs}
        : {};

    try {
        this.assertBridgeAccess(serverId, data);

        if (!requestId || !invocationId || !toolName) {
            throw buildError(
                'bridge_invalid_request',
                'requestId, invocationId and toolName are required.',
            );
        }

        if (!this.isToolAllowed(toolName)) {
            throw buildError(
                'bridge_tool_forbidden',
                `Tool "${toolName}" is not allowed by SnowBridge.`,
            );
        }

        const context = this.createInvocationContext(
            serverId,
            requestId,
            invocationId,
            toolName,
            { toolId, publicName },
        );
        this.activeInvocations.set(invocationId, context);

        const result = await pluginManager.processToolCall(toolName, toolArgs);
        // ... 处理结果
    }
}
```

**关键观察**：
- ✅ 协议完整：`requestId`、`invocationId`、`toolName`、`toolArgs`
- ✅ 无协议转换或清洗
- ✅ 直接调用 `pluginManager.processToolCall()`

#### 代码段 3.4：取消协议

```javascript
// 第 958-1016 行
async handleCancelTool(serverId, message) {
    const data = (message && message.data) || {};
    const requestId = data.requestId;
    const invocationId = data.invocationId || requestId;

    try {
        this.assertBridgeAccess(serverId, data);

        if (!invocationId) {
            throw buildError(
                'bridge_invalid_cancel',
                'requestId or invocationId is required for cancellation.',
            );
        }

        const context = this.activeInvocations.get(invocationId);
        if (!context) {
            this.sendToServer(serverId, {
                type: 'vcp_tool_cancel_ack',
                data: {
                    requestId,
                    invocationId,
                    accepted: false,
                    mode: 'unsupported',
                    error: buildError(
                        'bridge_invocation_not_found',
                        `Invocation "${invocationId}" was not found.`,
                    ),
                },
            });
            return;
        }

        context.cancelled = true;
        context.cancelledAt = Date.now();
        this.scheduleCancelledInvocationCleanup(invocationId);

        this.sendToServer(serverId, {
            type: 'vcp_tool_cancel_ack',
            data: {
                requestId,
                invocationId,
                accepted: true,
                mode: context.taskId ? 'ignored' : 'cancelled',
            },
        });
    }
}
```

**关键观察**：
- ✅ 取消协议完整
- ✅ 无协议转换

---

### 4. 全局搜索结果

**搜索范围**: `H:\github\VCP\VCPToolBox` (排除 node_modules)

**搜索关键词**:
- `x-snow-client` → 未找到
- `x-snow-protocol` → 未找到
- `isSnowFunctionCallingRequest` → 未找到
- `snow-cli` → 仅在 SnowBridge 配置文件中出现

**搜索结果**:
```
Plugin\SnowBridge\config.env.example:27  Allowed_Clients=snow-cli
Plugin\SnowBridge\plugin-manifest.json:39 "description": "允许访问桥接器的客户端标识白名单（建议填写 snow-cli，按 clientInfo.clientId 或 clientInfo.clientName 匹配）"
```

**结论**: 无 Snow 专属的请求识别逻辑在核心模块中。

---

## 发现部分

### 发现 1：核心模块完全无 Snow 识别逻辑

**结论**: messageProcessor.js 和 chatCompletionHandler.js 中**不存在**任何 Snow 请求识别逻辑。

**证据**:
- 无 `x-snow-client` 或 `x-snow-protocol` 请求头检查
- 无条件禁用 VCP 工具协议注入的代码
- 无 Snow 专属的消息处理分支

**符合性**: ✅ 符合"最小触碰"原则

---

### 发现 2：变量扩展逻辑无 Snow 专属处理

**结论**: `resolveAllVariables()` 和 `replaceOtherVariables()` 函数中无 Snow 专属的变量处理。

**证据**:
- 变量扩展基于标准的 `role` 和消息前缀机制
- 无条件判断 Snow 请求
- 无 prompt 语义清洗

**符合性**: ✅ 符合"最小触碰"原则

---

### 发现 3：SnowBridge 仅做文本格式归一化

**结论**: SnowBridge 插件的 `normalizeBridgeText()` 函数**仅做文本格式归一化**，不做 prompt 语义清洗。

**证据**:
```javascript
function normalizeBridgeText(description) {
    return String(description || '')
        .replace(/\r\n?/g, '\n')           // 换行符归一化
        .split('\n')
        .map(line => line.trimEnd())       // 行尾空格移除
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')        // 多余空行压缩
        .trim();
}
```

**操作范围**:
- ✅ 换行符标准化
- ✅ 行尾空格移除
- ✅ 多余空行压缩
- ❌ 无语义清洗（如移除特定关键词、修改指令含义等）

**符合性**: ✅ 符合"最小触碰"原则

---

### 发现 4：SnowBridge 协议完整且无转换

**结论**: SnowBridge 的 execute/cancel/status 协议完整，无协议转换逻辑。

**证据**:
- `handleExecuteTool()` 直接调用 `pluginManager.processToolCall(toolName, toolArgs)`
- `handleCancelTool()` 直接标记 `context.cancelled = true`
- 无中间协议转换或清洗

**协议完整性**:
- ✅ `requestId` 保留
- ✅ `invocationId` 保留
- ✅ `toolName` 保留
- ✅ `toolArgs` 保留
- ✅ `taskId` 保留
- ✅ 异步回调完整

**符合性**: ✅ 符合"最小触碰"原则

---

### 发现 5：无条件禁用 VCP 工具协议注入的逻辑

**结论**: VCPToolBox 中**不存在**条件禁用 VCP 工具协议注入的逻辑。

**证据**:
- messageProcessor.js 无条件判断
- chatCompletionHandler.js 无条件判断
- SnowBridge 无条件判断

**含义**: VCP 工具协议注入对所有请求（包括 Snow CLI）都是**无条件启用**的。

**符合性**: ⚠️ 需要确认这是否为设计意图

---

## 总体评估

| 审计项 | 状态 | 说明 |
|--------|------|------|
| Snow 请求识别逻辑 | ✅ 无 | 核心模块无识别逻辑 |
| 条件禁用 VCP 注入 | ✅ 无 | 无条件禁用逻辑 |
| Prompt 语义清洗 | ✅ 无 | 仅做文本格式归一化 |
| 变量扩展 Snow 处理 | ✅ 无 | 无 Snow 专属处理 |
| SnowBridge 协议完整性 | ✅ 完整 | execute/cancel/status 完整 |
| 最小触碰原则 | ✅ 符合 | VCPToolBox 保留最薄识别层 |

---

## 结论

VCPToolBox 中的 Snow CLI 集成**严格遵循"最小触碰"原则**：

1. **核心模块无 Snow 识别**: messageProcessor.js 和 chatCompletionHandler.js 完全无 Snow 专属逻辑
2. **SnowBridge 仅做格式归一化**: 不做 prompt 语义清洗或协议转换
3. **协议完整且无转换**: execute/cancel/status 协议完整保留
4. **无条件禁用机制**: VCP 工具协议注入对所有请求无条件启用

**建议**: 如需对 Snow CLI 请求进行特殊处理（如条件禁用 VCP 注入），应在 chatCompletionHandler.js 中添加显式的 Snow 请求识别逻辑，而非在 SnowBridge 中实现。
