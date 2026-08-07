# ToolCallParser 协议解析层审计报告

## 证据部分

### 代码段 1: 协议标记和分隔符

**文件:** `/h/github/VCP/VCPToolBox/modules/vcpLoop/toolCallParser.js`
**行号:** 1-6

```javascript
class ToolCallParser {
  static MARKERS = {
    START: '<<<[TOOL_REQUEST]>>>',
    END: '<<<[END_TOOL_REQUEST]>>>'
  };
```

**关键观察:**
- 使用旧协议标记: `<<<[TOOL_REQUEST]>>>` 和 `<<<[END_TOOL_REQUEST]>>>`
- 这些标记是协议层的一部分，不应出现在执行层

### 代码段 2: 参数分隔符处理

**文件:** `/h/github/VCP/VCPToolBox/modules/vcpLoop/toolCallParser.js`
**行号:** 51-78

```javascript
static _parseBlock(blockContent) {
  const paramRegex = /([\w_]+)\s*:\s*「始」([\s\S]*?)「末」\s*(?:,)?/g;
  const args = {};
  let toolName = null;
  let isArchery = false;
  let markHistory = false;
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
```

**关键观察:**
- 使用旧协议分隔符: `「始」` 和 `「末」`
- 解析 `tool_name` 字段（旧协议关键词）
- 将旧协议转换为规范化对象: `{ name, args, river, vref }`

### 代码段 3: 思维链过滤

**文件:** `/h/github/VCP/VCPToolBox/modules/vcpLoop/toolCallParser.js`
**行号:** 13-20

```javascript
static parse(content) {
  if (!content || typeof content !== 'string') return [];

  // 移除 <think> 标签及其内容，防止解析思维链中的工具调用
  const contentWithoutThink = content.replace(/<think>[\s\S]*?<\/think>/g, '');

  const toolCalls = [];
  content = contentWithoutThink;
  let searchOffset = 0;
```

**关键观察:**
- 在解析前移除思维链内容
- 防止思维链中的旧协议标记被误解析

## 发现部分

### 发现 1: 协议解析完全集中在 ToolCallParser

**状态:** ✓ 符合架构

所有旧协议处理（`TOOL_REQUEST`、`「始」「末」`、`tool_name`）都集中在 ToolCallParser 中。

**证据:**
- ToolCallParser 是唯一处理旧协议标记的模块
- 返回规范化的 `{ name, args, river, vref }` 对象
- 执行层（ToolExecutor）不包含任何协议解析逻辑

### 发现 2: 旧协议关键词的完整处理

**状态:** ✓ 符合架构

ToolCallParser 完整处理了所有旧协议关键词：
- `tool_name` → 转换为 `name`
- `archery` → 保留为 `archery` 标志
- `ink` → 转换为 `markHistory` 标志
- `river` → 保留为 `river` 参数
- `vref` → 保留为 `vref` 参数

**证据:**
- 第 65-74 行: 明确的关键词映射逻辑
- 所有旧协议字段都被转换或规范化

### 发现 3: 思维链隔离

**状态:** ✓ 符合架构

在解析前移除思维链，防止思维链中的协议标记被误解析。

**证据:**
- 第 17 行: `content.replace(/<think>[\s\S]*?<\/think>/g, '')`
- 在任何协议解析前执行

### 发现 4: 协议标记的一致性

**状态:** ✓ 符合架构

协议标记在整个系统中保持一致：
- 开始标记: `<<<[TOOL_REQUEST]>>>`
- 结束标记: `<<<[END_TOOL_REQUEST]>>>`
- 参数分隔符: `「始」` 和 `「末」`

**证据:**
- 第 3-6 行: 标记定义
- 第 52 行: 参数分隔符定义

