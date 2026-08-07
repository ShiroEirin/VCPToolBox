# rust-vector-engine

## 职责

描述 `rust-vexus-lite/` 子项目，它为主 Node.js 服务提供 Rust N-API 向量索引能力，是高性能语义检索链路的底层组件。

## 关键文件

- `rust-vexus-lite/index.js`：Node 侧桥接与 `VexusIndex` 暴露入口。
- `rust-vexus-lite/src/`：Rust 向量索引实现。
- `rust-vexus-lite/package.json` / Cargo 配置：构建与产物描述。

## 接口定义

| 接口 | 返回 | 说明 |
|------|------|------|
| `VexusIndex` | N-API 对象 | 为 JS 侧提供向量索引、写入和检索能力 |
| 构建产物 | 原生模块 | 被 `memory-rag` 与上层检索管线调用 |

## 行为规范

### 构建
**条件**: 部署或本地需要构建向量引擎。  
**行为**: 进入 `rust-vexus-lite/` 执行对应构建命令。  
**结果**: 生成供 Node.js 调用的原生模块。

### 检索支撑
**条件**: 记忆系统执行向量索引或召回。  
**行为**: 暴露高性能索引与检索能力给上层 JS 模块。  
**结果**: 提升向量检索效率。

### 构建约束
**条件**: 调整 Rust 侧实现或重新构建原生模块。  
**行为**: 同步检查 Node 侧桥接文件、N-API 暴露名与 `memory-rag` 调用约定。  
**结果**: 避免 Rust 产物与 JS 调用链失配。

## 依赖关系

```yaml
依赖:
  - Rust toolchain
  - Node.js N-API
被依赖:
  - memory-rag
```
