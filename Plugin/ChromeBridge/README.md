# ChromeBridge - Chrome 浏览器桥接器

## 📋 概述

ChromeBridge 是一个**混合型插件**，结合了 ChromeObserver 和 ChromeControl 的所有功能：

- 🔍 **Service 模式**：作为常驻服务运行，实时监控浏览器页面内容
- 🎮 **Direct 模式**：支持直接调用命令，执行浏览器控制操作
- ⏳ **智能等待**：执行命令后自动等待页面刷新，返回最新内容
- 🔗 **无缝集成**：通过 WebSocket 与浏览器扩展保持长连接

## 🆚 与旧插件的区别

| 特性 | ChromeObserver | ChromeControl | **ChromeBridge** |
|-----|---------------|---------------|-----------------|
| 实时监控 | ✅ | ❌ | ✅ |
| 执行命令 | ❌ | ✅ | ✅ |
| 等待刷新 | N/A | ❌ (Bug) | ✅ |
| 返回页面内容 | 占位符 | ❌ | ✅ 直接返回 |
| 插件类型 | Service | Synchronous | **Hybrid** |

## 🚀 安装与配置

### 1. 启用插件

在管理面板中启用 ChromeBridge 插件。

### 2. 安装浏览器扩展

使用现有的 VCPChrome 浏览器扩展（无需修改）。

### 3. 配置（可选）

在插件配置中可以设置：

```env
# 是否启用调试模式
DebugMode=false
```

## 📖 使用方法

### 作为 Service（实时监控）

在系统提示词中使用占位符：

```
你可以看到用户的Chrome浏览器内容：
{{VCPChromePageInfo}}
```

### 作为 Direct（执行命令）

AI 可以直接调用以下命令：

#### 1. 打开网页

```
<<<[TOOL_REQUEST]>>>
tool_name: 「始」ChromeBridge「末」,
command: 「始」open_url「末」,
url: 「始」https://www.baidu.com「末」
<<<[END_TOOL_REQUEST]>>>
```

**返回示例：**
```json
{
  "success": true,
  "message": "成功打开URL: https://www.baidu.com",
  "page_info": "# 百度一下\nURL: https://www.baidu.com\n\n[输入框: 搜索框](vcp-id-1)\n[按钮: 百度一下](vcp-id-2)\n..."
}
```

#### 2. 点击元素

```
<<<[TOOL_REQUEST]>>>
tool_name: 「始」ChromeBridge「末」,
command: 「始」click「末」,
target: 「始」登录「末」
<<<[END_TOOL_REQUEST]>>>
```

#### 3. 输入文本

```
<<<[TOOL_REQUEST]>>>
tool_name: 「始」ChromeBridge「末」,
command: 「始」type「末」,
target: 「始」搜索框「末」,
text: 「始」VCP工具箱「末」
<<<[END_TOOL_REQUEST]>>>
```

## 🔧 工作原理

```
┌─────────────────────────────────────────────────────────┐
│                    ChromeBridge 插件                      │
│  ┌──────────────┐              ┌──────────────┐         │
│  │ Service 模式  │              │ Direct 模式   │         │
│  │              │              │              │         │
│  │ • 实时监控    │◄────────────►│ • 执行命令    │         │
│  │ • 更新占位符  │   共享连接    │ • 等待刷新    │         │
│  │ • WebSocket  │              │ • 返回结果    │         │
│  └──────────────┘              └──────────────┘         │
│         ▲                             │                  │
│         │                             ▼                  │
│    pageInfoUpdate               command + wait          │
└─────────┼─────────────────────────────┼─────────────────┘
          │                             │
          │    WebSocket 长连接          │
          │                             │
┌─────────┴─────────────────────────────┴─────────────────┐
│              VCPChrome 浏览器扩展                         │
│  • background.js: 管理连接和命令                         │
│  • content_script.js: 抓取页面内容                       │
└─────────────────────────────────────────────────────────┘
```

### 关键优势

1. **常驻连接**：作为 Service 插件，ChromeBridge 始终保持与浏览器的 WebSocket 连接
2. **内部等待**：命令执行后，在插件内部等待页面刷新，不需要临时 WebSocket 连接
3. **无竞态条件**：使用 `pendingCommands` Map 管理等待状态，避免消息丢失
4. **自动清理**：超时后自动清理待处理命令，防止内存泄漏

## ⚠️ 注意事项

1. **替代旧插件**：ChromeBridge 完全替代 ChromeObserver 和 ChromeControl，可以禁用旧插件
2. **浏览器连接**：确保 VCPChrome 扩展已连接（扩展图标显示绿色 "On"）
3. **页面刷新等待**：命令执行可能需要几秒钟等待页面加载完成
4. **超时设置**：默认超时 30 秒，如果页面加载很慢可能超时

## 🐛 故障排除

### 问题：提示"没有连接的Chrome浏览器"

**解决方案：**
1. 检查浏览器扩展是否已安装
2. 点击扩展图标，确认显示 "On"（绿色）
3. 检查 WebSocket 连接是否正常

### 问题：命令执行超时

**解决方案：**
1. 检查网络连接
2. 确认目标元素存在
3. 查看浏览器控制台是否有错误

### 问题：返回的页面内容不完整

**解决方案：**
1. 页面可能还在加载，稍等几秒后再次查看占位符
2. 检查 content_script.js 是否正确注入
3. 某些动态内容可能需要更长时间加载

## 📝 开发日志

- **v2.0.0** (2025-11-14)
  - ✨ 创建混合插件，整合 Observer 和 Control 功能
  - 🐛 修复页面刷新后无法获取内容的问题
  - ⚡ 优化等待逻辑，提高响应速度
  - 📚 添加完整文档

## 📄 许可证

与 VCP 项目相同