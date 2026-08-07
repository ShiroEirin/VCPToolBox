# api-routes

## 职责

负责 Express 路由层，包括管理面板接口、特殊模型路由、认证入口和相关后端控制接口。核心目录为 `routes/`，其中 `routes/adminPanelRoutes.js` 与 `routes/specialModelRouter.js` 是重点文件。

## 接口定义

### 公共 API
| 函数/方法 | 参数 | 返回值 | 说明 |
|----------|------|--------|------|
| `router` | Express 请求对象 | HTTP 响应 | 提供特殊模型请求接管与转发 |
| `adminPanelRoutes` | 管理面板请求 | HTTP 响应 | 提供配置、系统控制与管理接口 |

## 行为规范

### 路由挂载
**条件**: 主服务初始化路由层。  
**行为**: 将 API 子路由挂到 Express 应用。  
**结果**: 不同请求进入各自处理器。

### 管理接口访问
**条件**: 访问管理类接口。  
**行为**: 根据路由逻辑进行认证、配置读写或系统控制。  
**结果**: 返回管理操作结果。

## 依赖关系

```yaml
依赖:
  - plugin-system
  - memory-rag
被依赖:
  - runtime-core
  - admin-panel
  - 外部 HTTP 客户端
```
