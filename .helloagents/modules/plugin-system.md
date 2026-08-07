# plugin-system

## 职责

负责插件目录扫描、manifest 解析、配置合并、生命周期管理、同步与异步执行分发，以及静态插件占位符能力暴露。核心实现位于 `Plugin.js`，插件实体位于 `Plugin/`。

## 接口定义

### 公共 API
| 函数/方法 | 参数 | 返回值 | 说明 |
|----------|------|--------|------|
| `PluginManager` | 插件配置、运行时上下文 | 管理器实例 | 管理插件注册与执行 |
| `systemPromptPlaceholders` | 插件输出 | 占位符映射 | 将静态插件能力暴露给提示词系统 |

### 数据结构
| 字段 | 类型 | 说明 |
|------|------|------|
| `plugin-manifest.json` | JSON | 插件契约、类型、入口与配置描述 |
| `plugin-manifest.json.block` | 文件 | 表示插件处于禁用状态 |
| `Plugin/SnowBridge/` | 插件目录 | 为 `snow-cli` 导出 bridge manifest 与工具执行入口的正式跨仓桥插件 |

## 行为规范

### 插件装载
**条件**: 服务启动或插件系统刷新。  
**行为**: 扫描 `Plugin/` 目录，读取 manifest，跳过 `.block` 禁用插件。  
**结果**: 形成可执行插件清单。

### 执行分发
**条件**: 上层链路请求某类插件能力。  
**行为**: 按插件类型进入同步、异步、预处理或服务型执行链路。  
**结果**: 返回标准化执行结果并回传给主流程。

### 跨仓桥接
**条件**: `snow-cli` 通过 `SnowBridge` 请求 manifest、执行或取消 VCP 工具。  
**行为**: 由 `Plugin/SnowBridge/` 暴露受控桥接能力，并结合分布式运行时完成远端工具转发。  
**结果**: 为 `snow-cli` 提供面向 function-calling 的桥接入口。

## 依赖关系

```yaml
依赖:
  - distributed-runtime
  - memory-rag
被依赖:
  - runtime-core
  - api-routes
```
