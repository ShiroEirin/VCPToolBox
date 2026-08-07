# VCPToolBox 知识库

> 本文件是知识库的入口点。

## 快速导航

| 需要了解 | 读取文件 |
|---------|---------|
| 项目概况、技术栈、开发约定 | [context.md](context.md) |
| 模块索引 | [modules/_index.md](modules/_index.md) |
| 核心运行时 | [modules/runtime-core.md](modules/runtime-core.md) |
| 插件系统 | [modules/plugin-system.md](modules/plugin-system.md) |
| API 与管理路由 | [modules/api-routes.md](modules/api-routes.md) |
| 管理前端 | [modules/admin-panel.md](modules/admin-panel.md) |
| 记忆与 RAG | [modules/memory-rag.md](modules/memory-rag.md) |
| 分布式能力 | [modules/distributed-runtime.md](modules/distributed-runtime.md) |
| Rust 向量引擎 | [modules/rust-vector-engine.md](modules/rust-vector-engine.md) |
| 项目变更历史 | [CHANGELOG.md](CHANGELOG.md) |
| 历史方案索引 | [archive/_index.md](archive/_index.md) |
| 当前待执行方案 | [plan/](plan/) |

## 模块关键词索引

| 模块 | 关键词 | 摘要 |
|------|--------|------|
| runtime-core | server.js, Plugin.js, 启动流程, 中间层 | Node.js 主运行时、启动编排与请求主链路 |
| plugin-system | Plugin, manifest, 插件生命周期, 占位符 | 插件发现、配置合并、同步/异步执行与静态占位符注入 |
| api-routes | routes, Express, admin, specialModelRouter | HTTP 路由、管理接口与特殊模型转发 |
| admin-panel | AdminPanel, 静态资源, 管理面板 | 内嵌管理前端与后端管理接口协同 |
| memory-rag | KnowledgeBaseManager, TagMemo, 向量检索 | 记忆系统、RAG、标签与索引管理 |
| distributed-runtime | WebSocketServer, FileFetcherServer, 节点协同 | 分布式节点注册、远程工具与跨节点取文件 |
| rust-vector-engine | rust-vexus-lite, napi, HNSW | Rust N-API 向量索引与高性能检索 |

## 知识库状态

```yaml
kb_version: HelloAGENTS v3
最后更新: 2026-04-02 00:00
模块数量: 7
待执行方案: 0
```

## 读取指引

```yaml
启动任务:
  1. 读取本文件获取导航
  2. 读取 context.md 获取项目上下文
  3. 检查 plan/ 是否有进行中方案包

任务相关:
  - 涉及主入口或启动问题: 读取 modules/runtime-core.md
  - 涉及插件执行或 manifest: 读取 modules/plugin-system.md
  - 涉及 API、鉴权或管理面板接口: 读取 modules/api-routes.md
  - 涉及记忆、向量、RAG: 读取 modules/memory-rag.md 和 modules/rust-vector-engine.md
  - 涉及分布式节点或远程文件: 读取 modules/distributed-runtime.md
```