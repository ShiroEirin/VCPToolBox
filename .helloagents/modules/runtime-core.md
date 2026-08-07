# runtime-core

## 职责

负责主服务入口、启动顺序、全局中间件装配、请求接入和核心编排。这个模块的关键入口主要集中在 `server.js`、`chatCompletionHandler.js`、`modules/agentManager.js` 等根层或 `modules/` 文件中。

## 接口定义

### 公共API
| 函数/方法 | 参数 | 返回值 | 说明 |
|----------|------|--------|------|
| `startServer` | 启动配置与运行时上下文 | HTTP 服务实例 | 启动主服务并挂载运行时能力 |
| `ChatCompletionHandler` | 请求上下文 | 对话处理结果 | 协调聊天请求、插件能力和响应生成 |
| `AgentManager` | agent 映射配置 | 映射结果与缓存状态 | 维护 `agent_map.json` 与热更新监听 |

## 行为规范

### 启动流程
**条件**: 进程启动且配置已读取。  
**行为**: 初始化基础配置、中间件、路由、插件与分布式相关能力。  
**结果**: 服务进入可接收请求状态。

### 对话处理
**条件**: 收到聊天或工具相关请求。  
**行为**: 调用主对话编排链，必要时分派到插件、记忆系统或特殊路由。  
**结果**: 返回模型响应或工具结果。

## 依赖关系

```yaml
依赖:
  - plugin-system
  - api-routes
  - memory-rag
  - distributed-runtime
被依赖:
  - 全局服务入口
```