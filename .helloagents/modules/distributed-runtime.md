# distributed-runtime

## 职责

负责分布式节点注册、远程工具桥接、跨节点文件获取和相关通信流程。关键文件包括 `WebSocketServer.js` 与 `FileFetcherServer.js`。

## 接口定义

### 公共 API
| 函数/方法 | 参数 | 返回值 | 说明 |
|----------|------|--------|------|
| `initialize` | 节点配置、通信上下文 | 初始化结果 | 启动分布式 WebSocket 桥 |
| `fetchFile` | 文件标识与节点信息 | 文件内容或回退结果 | 在远程节点不可直达时尝试取回文件 |
| `SnowBridge transport` | Snow 请求元数据、manifest / execute 请求 | bridge 响应 | 为 `Plugin/SnowBridge` 提供跨节点与远端工具传输能力 |

## 行为规范

### 节点协同
**条件**: 启用分布式能力。  
**行为**: 注册节点、维护连接、同步可用工具信息。  
**结果**: 主节点可调度远程能力。

### 文件回退
**条件**: 本地缺失目标文件或需跨节点读取。  
**行为**: 按节点关系尝试取回文件内容。  
**结果**: 为工具执行链提供回退支持。

### Bridge 传输
**条件**: `snow-cli` 通过 `Plugin/SnowBridge` 请求远端 manifest 或工具执行。  
**行为**: 复用 WebSocket 节点协同、工具桥接和文件回退能力，为桥插件提供传输层支撑。  
**结果**: `snow-cli` 能通过受控插件接口访问 VCP 原生工具。

## 依赖关系

```yaml
依赖:
  - WebSocketServer.js
  - FileFetcherServer.js
被依赖:
  - plugin-system
  - runtime-core
```
