# ToolExecutor 边界审计报告

## 证据部分

### 代码段 1: ToolExecutor 执行层入口

**文件:** `/h/github/VCP/VCPToolBox/modules/vcpLoop/toolExecutor.js`
**行号:** 187-338

```javascript
async execute(toolCall, clientIp, contextMessages = []) {
  const { name, args, river, vref } = toolCall;

  // river 上下文注入
  if (river === 'full') {
    args.river_context = JSON.parse(JSON.stringify(contextMessages));
  } else if (river === 'text') {
    args.river_context = contextMessages.map(msg => extractTextFromMessage(msg));
  }
  // ... semantic:N 模式处理

  // vref 虚拟引用解析
  if (vref) {
    args.vref_files = await this._resolveVRefFiles(vref, contextMessages);
  }

  // 验证码校验
  if (this.vcpToolCode) {
    const authResult = await this._verifyAuth(args);
    if (!authResult.valid) {
      return this._createErrorResult(name, authResult.message);
    }
  }

  // 检查插件是否存在
  if (!this.pluginManager.getPlugin(name)) {
    return this._createErrorResult(name, `未找到名为 "${name}" 的插件`);
  }

  // 执行插件
  try {
    const result = await this.pluginManager.processToolCall(name, args, clientIp);
    return this._processResult(name, result);
  } catch (error) {
    return this._createErrorResult(name, `执行错误: ${error.message}`);
  }
}
```

**关键观察:**
- 直接消费 `toolCall` 对象（包含 name, args, river, vref）
- 不进行协议解析或转换
- 直接调用 `pluginManager.processToolCall()`
- 不涉及旧协议关键词处理

### 代码段 2: ToolCallParser 协议解析

**文件:** `/h/github/VCP/VCPToolBox/modules/vcpLoop/toolCallParser.js`
**行号:** 1-94

```javascript
class ToolCallParser {
  static MARKERS = {
    START: '<<<[TOOL_REQUEST]>>>',
    END: '<<<[END_TOOL_REQUEST]>>>'
  };

  static parse(content) {
    // 移除 <think> 标签
    const contentWithoutThink = content.replace(/<think>[\s\S]*?<\/think>/g, '');

    const toolCalls = [];
    let searchOffset = 0;

    while (searchOffset < content.length) {
      const startIndex = content.indexOf(this.MARKERS.START, searchOffset);
      if (startIndex === -1) break;

      const endIndex = content.indexOf(this.MARKERS.END, startIndex + this.MARKERS.START.length);
      if (endIndex === -1) {
        searchOffset = startIndex + this.MARKERS.START.length;
        continue;
      }

      const blockContent = content.substring(startIndex + this.MARKERS.START.length, endIndex).trim();
      const parsed = this._parseBlock(blockContent);
      if (parsed) {
        toolCalls.push(parsed);
      }

      searchOffset = endIndex + this.MARKERS.END.length;
    }

    return toolCalls;
  }

  static _parseBlock(blockContent) {
    const paramRegex = /([\w_]+)\s*:\s*「始」([\s\S]*?)「末」\s*(?:,)?/g;
    const args = {};
    let toolName = null;
    let isArchery = false;
    let river = null;
    let vref = null;
    let match;

    while ((match = paramRegex.exec(blockContent)) !== null) {
      const [, key, value] = match;
      const trimmedValue = value.trim();

      if (key === 'tool_name') {
        toolName = trimmedValue;
      } else if (key === 'archery') {
        isArchery = trimmedValue === 'true' || trimmedValue === 'no_reply';
      } else if (key === 'ink') {
        markHistory = trimmedValue === 'mark_history';
      } else if (key === 'river') {
        river = trimmedValue;
      } else if (key === 'vref') {
        vref = trimmedValue;
      } else {
        args[key] = trimmedValue;
      }
    }

    return toolName ? { name: toolName, args, archery: isArchery, markHistory, river, vref } : null;
  }
}
```

**关键观察:**
- 使用旧协议标记: `<<<[TOOL_REQUEST]>>>` 和 `<<<[END_TOOL_REQUEST]>>>`
- 使用旧协议分隔符: `「始」` 和 `「末」`
- 解析 `tool_name` 字段（旧协议）
- 返回规范化的 `{ name, args, river, vref }` 对象

## 发现部分

### 发现 1: 协议解析与执行层的清晰分离

**状态:** ✓ 符合架构

ToolCallParser 负责将旧协议字符串转换为规范化对象，ToolExecutor 仅消费规范化对象。两层之间的边界清晰。

**证据:**
- ToolCallParser 处理所有 `「始」「末」` 分隔符
- ToolExecutor 不包含任何协议解析逻辑
- ToolExecutor 的 `execute()` 方法接收已解析的 `toolCall` 对象

### 发现 2: 执行层不进行路由判断

**状态:** ✓ 符合架构

ToolExecutor 不包含任何路由决策逻辑。它直接调用 `pluginManager.processToolCall()`，由插件管理器负责路由。

**证据:**
- 第 326 行: 仅检查插件是否存在
- 第 333 行: 直接调用 `pluginManager.processToolCall()`
- 无条件分支判断工具类型或目标

### 发现 3: 上下文注入机制完整

**状态:** ✓ 符合架构

river 和 vref 参数的处理完全在 ToolExecutor 中进行，不涉及协议层。

**证据:**
- river 模式处理: full, text, last:N, semantic:N
- vref 文件解析通过 `_resolveVRefFiles()` 方法
- 两者都作为 args 的扩展字段注入

### 发现 4: 验证码验证位置正确

**状态:** ✓ 符合架构

验证码验证在执行前进行，不涉及协议转换。

**证据:**
- 第 318-323 行: 在插件执行前进行验证
- 验证失败直接返回错误，不进行协议转换

