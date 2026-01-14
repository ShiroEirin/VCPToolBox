// modules/vcpLoop/toolExecutor.js
class ToolExecutor {
  constructor(options) {
    this.pluginManager = options.pluginManager;
    this.webSocketServer = options.webSocketServer;
    this.debugMode = options.debugMode;
    this.vcpToolCode = options.vcpToolCode;
    this.getRealAuthCode = options.getRealAuthCode;
  }

  /**
   * 执行单个工具调用
   * @returns {Promise<{success: boolean, content: Array, error?: string, raw?: any}>}
   */
  async execute(toolCall, clientIp) {
    const { name, args } = toolCall;

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

  /**
   * 批量执行工具调用
   */
  async executeAll(toolCalls, clientIp) {
    return Promise.all(
      toolCalls.map(tc => this.execute(tc, clientIp))
    );
  }

  _processResult(toolName, result) {
    const formatted = this._formatResult(result);
    
    // WebSocket广播
    this._broadcast(toolName, 'success', formatted.text);
    
    return {
      success: true,
      content: formatted.content,
      raw: result
    };
  }

  _formatResult(result) {
    if (result === undefined || result === null) {
      return { text: '(无返回内容)', content: [{ type: 'text', text: '(无返回内容)' }] };
    }

    // 检查是否为富内容格式
    if (typeof result === 'object') {
      const richContent = result.data?.content || result.content;
      if (Array.isArray(richContent)) {
        const textPart = richContent.find(p => p.type === 'text');
        return {
          text: textPart?.text || '[Rich Content]',
          content: richContent
        };
      }
    }

    const text = typeof result === 'object' 
      ? JSON.stringify(result, null, 2) 
      : String(result);
    
    return {
      text,
      content: [{ type: 'text', text }]
    };
  }

  _createErrorResult(toolName, message) {
    this._broadcast(toolName, 'error', message);
    return {
      success: false,
      error: message,
      content: [{ type: 'text', text: `[错误] ${message}` }]
    };
  }

  _broadcast(toolName, status, content) {
    this.webSocketServer.broadcast({
      type: 'vcp_log',
      data: { tool_name: toolName, status, content }
    }, 'VCPLog');
  }

  async _verifyAuth(args) {
    const realCode = await this.getRealAuthCode(this.debugMode);
    const provided = args.tool_password;
    delete args.tool_password;

    if (!realCode || provided !== realCode) {
      return { valid: false, message: 'tool_password 验证失败' };
    }
    return { valid: true };
  }
}

module.exports = ToolExecutor;