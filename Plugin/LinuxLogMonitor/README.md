# LinuxLogMonitor v1.3.0

事件驱动的 Linux 日志监控系统，支持实时异常检测和 Agent 回调。

## 功能特性

- 🔄 **实时日志流监控** - 基于 SSH shell 模式的 `tail -f` 实现
- 🔍 **多规则异常检测** - 支持 regex/keyword/threshold 三种规则类型
- 📡 **Agent 回调通知** - 检测到异常时自动回调 VCP
- 💾 **状态持久化** - 支持任务恢复和失败回调重试
- 🔗 **共享 SSHManager** - 与 LinuxShellExecutor 共享 SSH 连接池
- 🛡️ **高健壮性** - 无限重连、Watchdog、日志去重、状态可观测
- 🔧 **可配置去重** (v1.3.0) - 支持 permanent/time-window/disabled 三种去重模式
- 🔎 **主动查询命令** (v1.3.0) - searchLog/lastErrors/logStats 主动搜索日志
- 📋 **异常上下文增强** (v1.3.0) - 回调包含 before/after 上下文

## 目录结构

```
LinuxLogMonitor/
├── LinuxLogMonitor.js      # 主入口
├── plugin-manifest.json    # 插件清单
├── config.env              # 配置文件
├── README.md               # 本文档
├── core/
│   ├── MonitorManager.js   # 监控任务管理器
│   ├── MonitorTask.js      # 单任务实例
│   ├── AnomalyDetector.js  # 异常检测引擎
│   └── CallbackTrigger.js  # 回调触发器
├── rules/
│   ├── default-rules.json  # 预置规则（自动生成）
│   └── custom-rules.json   # 自定义规则
└── state/
    ├── active-monitors.json    # 运行时状态
    └── failed_callbacks.jsonl  # 失败回调记录
```

## 快速开始

### 1. 启动监控任务

```json
{
    "command": "start",
    "hostId": "DE-server",
    "logPath": "/var/log/syslog",
    "contextLines": 10,
    "afterContextLines": 5,
    "dedupeMode": "time-window",
    "dedupeWindow": 60
}
```

### 2. 停止监控任务

```json
{
    "command": "stop",
    "taskId": "monitor-DE-server-abc12345"
}
```

### 3. 查询状态

```json
{
    "command": "status"
}
```

### 4. 列出规则

```json
{
    "command": "list_rules"
}
```

### 5. 添加自定义规则

```json
{
    "command": "add_rule",
    "name": "cpu_high",
    "type": "threshold",
    "pattern": "CPU usage:\\s*([\\d.]+)%",
    "operator": ">",
    "threshold": 90,
    "severity": "warning",
    "cooldown": 60000
}
```

## 主动查询命令 (v1.3.0)

### searchLog - 搜索日志

使用 grep 在指定日志文件中搜索匹配的内容。

```json
{
    "command": "searchLog",
    "hostId": "DB1",
    "logPath": "/var/log/nginx/error.log",
    "pattern": "error|failed|timeout",
    "lines": 100,
    "since": "1h",
    "context": 3
}
```

参数说明：
- `pattern`: grep 正则表达式
- `lines`: 最多返回行数（默认 100）
- `since`: 时间范围，如 `1h`(1小时)、`30m`(30分钟)、`1d`(1天)
- `context`: 上下文行数（grep -C 参数）

### lastErrors - 获取最近错误

快速查看指定日志文件中最近的错误记录。

```json
{
    "command": "lastErrors",
    "hostId": "DB1",
    "logPath": "/var/log/syslog",
    "count": 20,
    "levels": ["ERROR", "FATAL", "CRIT"]
}
```

参数说明：
- `count`: 返回的错误条数（默认 20）
- `levels`: 要匹配的错误级别（默认 `["ERROR", "FATAL", "CRIT"]`）

### logStats - 日志统计分析

对日志进行分组统计，如按状态码、IP、路径等分组。

```json
{
    "command": "logStats",
    "hostId": "DB1",
    "logPath": "/var/log/nginx/access.log",
    "since": "1h",
    "groupBy": "status_code",
    "top": 10
}
```

参数说明：
- `since`: 时间范围（默认 `1h`）
- `groupBy`: 分组字段，可选 `level`(日志级别)、`status_code`(HTTP状态码)、`ip`(IP地址)、`hour`(按小时)
- `top`: 返回前 N 条统计结果（默认 10）

## 去重策略配置 (v1.3.0)

启动监控时可配置去重策略，避免重复日志触发多次告警。

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| `permanent` | 永久去重，相同内容永远只触发一次 | 生产环境，避免重复告警 |
| `time-window` | 时间窗口去重，N秒内相同内容只触发一次 | **默认模式**，平衡去重和时效性 |
| `disabled` | 禁用去重，每行都触发检测 | 测试环境，调试规则 |

配置示例：

```json
{
    "command": "start",
    "hostId": "prod-server",
    "logPath": "/var/log/syslog",
    "dedupeMode": "time-window",
    "dedupeWindow": 30
}
```

## 规则类型

### regex - 正则表达式匹配

```json
{
    "name": "error_keyword",
    "type": "regex",
    "pattern": "\\b(ERROR|FATAL|CRITICAL)\\b",
    "severity": "critical",
    "cooldown": 30000
}
```

### keyword - 关键词匹配

```json
{
    "name": "oom_killer",
    "type": "keyword",
    "pattern": "Out of memory",
    "severity": "critical",
    "cooldown": 60000
}
```

### threshold - 阈值检测

从日志中提取数值并与阈值比较。pattern 中的第一个捕获组 `([\\d.]+)` 用于提取数值。

```json
{
    "name": "cpu_high",
    "type": "threshold",
    "pattern": "CPU usage:\\s*([\\d.]+)%",
    "operator": ">",
    "threshold": 90,
    "severity": "warning",
    "cooldown": 60000
}
```

支持的操作符：`>`, `>=`, `<`, `<=`, `==`, `!=`

## 回调数据格式 (v1.3.0 增强)

当检测到异常时，插件会向 VCP 发送回调：

```
POST /plugin-callback/LinuxLogMonitor/{taskId}
```

回调数据（v1.3.0 增强版）：

```json
{
    "pluginName": "LinuxLogMonitor",
    "requestId": "monitor-DE-server-abc12345",
    "status": "anomaly_detected",
    "taskId": "monitor-DE-server-abc12345",
    "hostId": "DE-server",
    "logPath": "/var/log/nginx/error.log",
    "anomaly": {
        "line": "2025/12/21 15:30:00 [error] connect() failed",
        "matchedRule": "nginx-upstream-error",
        "severity": "critical",
        "timestamp": "2025-12-21T15:30:00+08:00",
        "ruleDetails": {
            "type": "regex",
            "pattern": "\\[error\\].*connect\\(\\).*failed"
        }
    },
    "context": {
        "before": [
            "2025/12/21 15:29:58 [info] client connected",
            "2025/12/21 15:29:59 [info] processing request"
        ],
        "after": [
            "2025/12/21 15:30:01 [info] retrying connection",
            "2025/12/21 15:30:02 [info] connection restored"
        ]
    }
}
```

### 上下文字段说明

| 字段 | 说明 |
|------|------|
| `context.before` | 异常行之前的 N 行日志（数组格式） |
| `context.after` | 异常行之后的 N 行日志（数组格式） |

上下文行数通过 `contextLines`（before）和 `afterContextLines`（after）参数配置。

## 预置规则

| 规则名 | 类型 | 匹配模式 | 严重级别 |
|--------|------|----------|----------|
| error_keyword | regex | ERROR\|FATAL\|CRITICAL | critical |
| warning_keyword | regex | WARN\|WARNING | warning |
| oom_killer | keyword | Out of memory | critical |
| disk_full | keyword | No space left on device | critical |
| connection_error | regex | Connection refused\|timed out\|reset | warning |
| permission_denied | keyword | Permission denied | warning |
| segfault | keyword | segfault | critical |
| kernel_panic | keyword | Kernel panic | critical |

## 重试机制

回调失败时采用指数退避重试：

- 最大重试次数：3
- 基础延迟：1秒
- 最大延迟：30秒
- 退避倍数：2

重试序列：1s → 2s → 4s

失败的回调会记录到 `state/failed_callbacks.jsonl`，可通过 API 手动重试。

## 状态持久化

- 活跃任务状态保存在 `state/active-monitors.json`
- 插件重启时自动恢复之前的监控任务
- 使用原子写入（临时文件 + rename）防止数据损坏
- 扩展字段：state, lastMessage, reconnectAttempts, lastDataTime, dedupeConfig

## 健壮性特性

### 无限重连机制
- 移除最大重试次数限制
- 指数退避：1s → 1.5s → 2.25s → ... → 5min (上限)
- 任务永不放弃，持续尝试恢复连接

### TaskState 状态机
6种状态精确追踪任务生命周期：
- `IDLE` - 空闲
- `CONNECTING` - 连接中
- `CONNECTED` - 已连接
- `RECONNECTING` - 重连中
- `DISCONNECTED` - 已断开
- `ERROR` - 错误

### Watchdog 看门狗
- 30分钟无数据自动触发 `process.exit(1)`
- 防止进程僵死，配合进程管理器实现自动重启

### Bypass Probe 旁路探测
- 每60秒发送 `echo keepalive` 命令
- 主动检测连接健康状态
- 比等待 TCP 超时更快发现问题

### 日志去重 (v1.3.0 增强)
- MD5 哈希去重，防止重连后日志重复
- **可配置去重模式**：permanent / time-window / disabled
- **时间窗口去重**：默认60秒内相同内容只触发一次
- LRU 淘汰策略，最大保留 10000 条哈希
- 重连时使用 `tail -n 50` 获取历史日志

### 启动时自动重试失败回调
- 插件启动时自动检查 `failed_callbacks.jsonl`
- 自动重试之前失败的回调请求

## 依赖

- 共享模块：`modules/SSHManager`
- Node.js 内置模块：fs, path, crypto

## 与 LinuxShellExecutor 的关系

| 特性 | LinuxShellExecutor | LinuxLogMonitor |
|------|-------------------|-----------------|
| 插件类型 | 同步 | 异步 |
| 执行模式 | 一次性命令 | 持续流式监控 |
| SSH 模式 | exec | shell |
| 安全防护 | 六层安全架构 | 规则白名单 |
| 共享资源 | SSHManager | SSHManager |

## 版本历史

### v1.3.0 (2025-12-21)
- **可配置去重策略** - 支持 permanent/time-window/disabled 三种模式
- **主动查询命令** - 新增 searchLog、lastErrors、logStats 命令
- **异常上下文增强** - 回调 payload 包含 context.before[] 和 context.after[]
- **afterContextLines 参数** - 可独立配置 after 上下文行数
- **pendingAnomalies 队列** - 异步收集 after 上下文，确保完整性

### v1.1.0 (2025-12-21)
- **MEU-1.1**: 无限重连机制 - 移除最大重试限制，指数退避上限5分钟
- **MEU-1.2**: TaskState 状态枚举 - 6种状态精确追踪任务生命周期
- **MEU-1.4**: 状态变更回调 - 实时通知 MonitorManager 状态变化
- **MEU-2.1**: 扩展状态持久化 - 保存 state/lastMessage/reconnectAttempts/lastDataTime
- **MEU-2.2**: Watchdog 机制 - 30分钟无数据自动触发 process.exit(1)
- **MEU-3.1**: Bypass Probe - 60秒 SSH keepalive 防止连接假死
- **MEU-4.1**: 日志去重 - MD5 哈希 + LRU 淘汰（10000条上限）
- **MEU-4.2**: 重连带历史 - 重连时使用 tail -n 50 获取历史日志
- **MEU-5.1**: 启动时自动重试失败回调
- 健壮性评分从 45/100 提升至 85/100

### v0.2.0 (2025-12-16)
- 初始版本
- 实现 SSHManager 共享模块
- 实现流式日志监控（tail -f）
- 实现三种规则类型的异常检测
- 实现指数退避回调重试
- 实现状态持久化与恢复

## License

MIT