# 模块索引

> 通过此文件快速定位模块文档。

## 模块清单

| 模块 | 职责 | 状态 | 文档 |
|------|------|------|------|
| runtime-core | 主服务入口、启动编排、对话主链路 | ✅ | [runtime-core.md](./runtime-core.md) |
| plugin-system | 插件发现、装载、执行分发与占位符注入 | ✅ | [plugin-system.md](./plugin-system.md) |
| api-routes | Express 路由、管理接口、特殊模型转发 | ✅ | [api-routes.md](./api-routes.md) |
| admin-panel | 内嵌管理面板静态资源与后端配套关系 | ✅ | [admin-panel.md](./admin-panel.md) |
| memory-rag | 记忆系统、标签、向量、RAG 管线 | ✅ | [memory-rag.md](./memory-rag.md) |
| distributed-runtime | WebSocket 节点协同、远程文件回退与工具桥接 | ✅ | [distributed-runtime.md](./distributed-runtime.md) |
| rust-vector-engine | Rust N-API 向量索引子项目 | ✅ | [rust-vector-engine.md](./rust-vector-engine.md) |

## 模块依赖关系

```text
runtime-core -> plugin-system -> memory-rag
runtime-core -> api-routes -> admin-panel
runtime-core -> distributed-runtime
memory-rag -> rust-vector-engine
plugin-system -> distributed-runtime
```

## 状态说明
- ✅ 稳定
- 🚧 开发中
- 📝 规划中