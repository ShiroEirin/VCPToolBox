# LinuxShellExecutor v0.3.0 最佳实践案例

## 概述

本文档展示 LinuxShellExecutor 插件的最佳实践用法，涵盖安全配置、多主机管理、管道命令和资源限制等场景。

---

## 案例 1：基础命令执行

### 场景
查看远程服务器的磁盘使用情况。

### VCP 调用
```json
{
    "command": "df -h",
    "hostId": "HK-server",
    "securityLevel": "standard"
}
```

### 预期输出
```json
{
    "status": "success",
    "result": "Filesystem      Size  Used Avail Use% Mounted on\n/dev/vda1        40G   12G   26G  32% /\n...",
    "hostId": "HK-server",
    "securityLevel": "standard",
    "executionType": "ssh",
    "duration": 245
}
```

### 安全层级说明
- **blacklist**: 检查 `df` 不在禁止命令列表
- **whitelist**: 验证 `df` 在白名单，`-h` 是允许的参数
- **sandbox**: SSH 远程执行不使用本地沙箱

---

## 案例 2：管道命令（Pipeline）

### 场景
查找日志文件中的错误信息并统计数量。

### VCP 调用
```json
{
    "command": "grep -i error /var/log/syslog | wc -l",
    "hostId": "DE-server",
    "securityLevel": "high"
}
```

### 安全验证流程
1. **管道深度检查**: 2 段 ≤ maxPipelineDepth(3) ✓
2. **第一段验证**: 
   - `grep` 在白名单 ✓
   - `-i` 是允许的参数 ✓
   - `/var/log/syslog` 在允许路径 `/var/log` 下 ✓
3. **第二段验证**:
   - `wc` 在 `allowedPipeCommands` 中 ✓
   - `-l` 是允许的参数 ✓
4. **禁止命令检查**: `grep` 和 `wc` 都不在 `forbiddenInPipe` 中 ✓

### 预期输出
```json
{
    "status": "success",
    "result": "42\n",
    "hostId": "DE-server",
    "securityLevel": "high",
    "executionType": "ssh",
    "duration": 312
}
```

---

## 案例 3：复杂管道处理

### 场景
分析进程列表，找出内存占用最高的 5 个进程。

### VCP 调用
```json
{
    "command": "ps aux | sort -k4 -rn | head -5",
    "hostId": "HK-server",
    "securityLevel": "high"
}
```

### 管道验证详情
```
管道段 1: ps aux
  - 命令: ps ✓ (白名单)
  - 参数: aux ✓ (允许)

管道段 2: sort -k4 -rn
  - 命令: sort ✓ (allowedPipeCommands)
  - 参数: -k4, -rn ✓ (允许)

管道段 3: head -5
  - 命令: head ✓ (allowedPipeCommands)
  - 参数: -5 → -n 5 ✓ (允许)

管道深度: 3 ≤ 3 ✓
```

---

## 案例 4：资源限制（rlimit）

### 场景
执行可能消耗大量资源的命令，需要限制资源使用。

### 配置 (config.env)
```env
# 启用资源限制
ENABLE_RLIMIT=true

# 资源限制参数
RLIMIT_CPU=30          # CPU 时间限制 30 秒
RLIMIT_FSIZE=10485760  # 文件大小限制 10MB
RLIMIT_NPROC=10        # 最大进程数 10
RLIMIT_NOFILE=64       # 最大文件描述符 64
RLIMIT_AS=536870912    # 虚拟内存限制 512MB
```

### VCP 调用
```json
{
    "command": "find /home -name '*.log' -size +1M",
    "hostId": "local",
    "securityLevel": "maximum"
}
```

### 实际执行的命令（本地）
```bash
ulimit -t 30 -f 20480 -u 10 -n 64 -v 524288 2>/dev/null; find /home -name '*.log' -size +1M
```

### 沙箱执行（Firejail）
```bash
firejail --quiet --private --private-tmp --net=none \
    --rlimit-cpu=30 --rlimit-fsize=10485760 \
    --rlimit-nproc=10 --rlimit-nofile=64 --rlimit-as=536870912 \
    --timeout=30 /bin/bash -c "find /home -name '*.log' -size +1M"
```

---

## 案例 5：多主机批量执行

### 场景
检查多台服务器的系统状态。

### 方案 A：顺序执行
```javascript
// 伪代码示例
const hosts = ['DE-server', 'HK-server'];
const results = [];

for (const hostId of hosts) {
    const result = await vcpCall({
        command: "uptime && free -h && df -h /",
        hostId: hostId,
        securityLevel: "standard"
    });
    results.push({ hostId, ...result });
}
```

### 方案 B：使用连接池并发执行
```json
// 第一次调用
{
    "command": "uptime",
    "hostId": "DE-server"
}

// 第二次调用（连接池复用）
{
    "command": "uptime",
    "hostId": "HK-server"
}
```

### 连接池配置 (hosts.json)
```json
{
    "globalSettings": {
        "maxConcurrentConnections": 5,
        "connectionPoolSize": 10,
        "retryAttempts": 3,
        "retryDelay": 1000
    }
}
```

---

## 案例 6：跳板机访问内网

### 场景
通过跳板机访问内网服务器。

### 主机配置 (hosts.json)
```json
{
    "hosts": {
        "bastion": {
            "name": "跳板机",
            "type": "ssh",
            "enabled": true,
            "host": "bastion.example.com",
            "port": 22,
            "username": "jump",
            "authMethod": "key",
            "privateKeyPath": "~/.ssh/bastion_key"
        },
        "internal-db": {
            "name": "内网数据库服务器",
            "type": "ssh",
            "enabled": true,
            "host": "192.168.100.50",
            "port": 22,
            "username": "admin",
            "authMethod": "key",
            "privateKeyPath": "~/.ssh/internal_key",
            "jumpHost": "bastion"
        }
    }
}
```

### VCP 调用
```json
{
    "command": "ps aux | grep mysql",
    "hostId": "internal-db",
    "securityLevel": "maximum"
}
```

### 连接流程
```
VCP Server
    ↓ SSH
bastion.example.com (跳板机)
    ↓ TCP Forward
192.168.100.50:22 (内网服务器)
    ↓ Execute
ps aux | grep mysql
```

---

## 案例 7：安全级别对比

### 四种安全级别

| 级别 | 启用的安全层 | 适用场景 |
|------|-------------|---------|
| basic | blacklist | 快速执行，最小检查 |
| standard | blacklist, whitelist, sandbox | 日常运维 |
| high | blacklist, whitelist, ast, sandbox | 生产环境 |
| maximum | blacklist, whitelist, ast, sandbox, audit | 关键系统 |

### 示例：同一命令在不同级别下的处理

```json
// basic 级别 - 仅黑名单检查
{
    "command": "ls -la /home",
    "securityLevel": "basic"
}
// 检查: blacklist ✓

// standard 级别 - 黑名单 + 白名单 + 沙箱
{
    "command": "ls -la /home",
    "securityLevel": "standard"
}
// 检查: blacklist ✓ → whitelist ✓ → sandbox ✓

// high 级别 - 增加 AST 分析
{
    "command": "ls -la /home",
    "securityLevel": "high"
}
// 检查: blacklist ✓ → whitelist ✓ → ast ✓ → sandbox ✓

// maximum 级别 - 完整审计
{
    "command": "ls -la /home",
    "securityLevel": "maximum"
}
// 检查: blacklist ✓ → whitelist ✓ → ast ✓ → sandbox ✓ → audit ✓
```

---

## 案例 8：错误处理

### 场景 1：命令被黑名单拦截
```json
// 请求
{
    "command": "rm -rf /tmp/test",
    "hostId": "local"
}

// 响应
{
    "status": "error",
    "error": "[黑名单] 命令 \"rm\" 被完全禁止"
}
```

### 场景 2：参数不在白名单
```json
// 请求
{
    "command": "ls --color=always /home",
    "hostId": "local"
}

// 响应
{
    "status": "error",
    "error": "[白名单] 参数 \"--color=always\" 不被允许用于 \"ls\""
}
```

### 场景 3：管道命令被禁止
```json
// 请求
{
    "command": "cat /var/log/syslog | rm -rf /tmp",
    "hostId": "local"
}

// 响应
{
    "status": "error",
    "error": "[白名单] 命令 \"rm\" 禁止在管道中使用"
}
```

### 场景 4：AST 检测到危险模式
```json
// 请求
{
    "command": "echo $(cat /etc/passwd)",
    "hostId": "local",
    "securityLevel": "high"
}

// 响应
{
    "status": "error",
    "error": "[AST分析] 检测到命令注入尝试"
}
```

---

## 案例 9：连接测试与状态查询

### 测试单个主机连接
```json
{
    "action": "testConnection",
    "hostId": "HK-server"
}

// 响应
{
    "status": "success",
    "success": true,
    "hostId": "HK-server",
    "message": "连接成功",
    "serverInfo": {
        "hostname": "hk-prod-01",
        "kernel": "5.4.0-150-generic"
    }
}
```

### 列出所有主机
```json
{
    "action": "listHosts"
}

// 响应
{
    "status": "success",
    "hosts": [
        {
            "id": "local",
            "name": "本地执行",
            "type": "local",
            "enabled": true
        },
        {
            "id": "DE-server",
            "name": "德国服务器",
            "type": "ssh",
            "enabled": true
        },
        {
            "id": "HK-server",
            "name": "香港服务器",
            "type": "ssh",
            "enabled": true
        }
    ]
}
```

### 获取连接状态
```json
{
    "action": "getStatus"
}

// 响应
{
    "status": "success",
    "connections": {
        "local": {
            "name": "本地执行",
            "type": "local",
            "connectionStatus": "ready"
        },
        "DE-server": {
            "name": "德国服务器",
            "type": "ssh",
            "connectionStatus": "connected",
            "lastActivity": "2025-12-15T10:30:00Z"
        }
    }
}
```

---

## 案例 10：审计日志分析

### 审计日志格式
```json
{
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2025-12-15T10:30:00.000Z",
    "command": "df -h",
    "hostId": "HK-server",
    "securityLevel": "high",
    "status": "success",
    "duration": 245,
    "outputLength": 512,
    "layers": [
        { "name": "blacklist", "result": { "passed": true } },
        { "name": "whitelist", "result": { "passed": true } },
        { "name": "ast", "result": { "passed": true, "risks": [] } }
    ],
    "checksum": "a1b2c3d4e5f6g7h8"
}
```

### 日志文件位置
```
Plugin/LinuxShellExecutor/logs/audit/
├── 2025-12-14.jsonl
├── 2025-12-15.jsonl
└── ...
```

### 分析命令示例
```bash
# 统计今日执行次数
wc -l logs/audit/2025-12-15.jsonl

# 查找被拦截的命令
grep '"status":"blocked"' logs/audit/2025-12-15.jsonl | jq .

# 统计各主机执行次数
jq -r '.hostId' logs/audit/2025-12-15.jsonl | sort | uniq -c
```

---

## 配置建议

### 生产环境推荐配置

**config.env**
```env
# 安全配置
DEFAULT_SECURITY_LEVEL=high
SANDBOX_BACKEND=firejail
ENABLE_RLIMIT=true

# 资源限制
RLIMIT_CPU=30
RLIMIT_FSIZE=10485760
RLIMIT_NPROC=10
RLIMIT_NOFILE=64
RLIMIT_AS=536870912

# 超时设置
TIMEOUT_MS=30000

# 审计配置
AUDIT_LOG_DIR=./logs/audit
ALERT_WEBHOOK=https://your-webhook.example.com/alerts
ALERT_THRESHOLD=5
```

**hosts.json**
```json
{
    "globalSettings": {
        "maxConcurrentConnections": 5,
        "connectionPoolSize": 10,
        "defaultTimeout": 30000,
        "retryAttempts": 3,
        "retryDelay": 1000,
        "logConnections": true
    }
}
```

---

## 总结

LinuxShellExecutor v0.3.0 提供了完整的六层安全防护：

1. **黑名单过滤** - 快速拦截已知危险命令
2. **白名单验证** - 精确控制允许的命令和参数
3. **AST 语义分析** - 检测复杂攻击模式
4. **沙箱隔离** - Docker/Firejail/Bubblewrap 容器化执行
5. **资源限制** - rlimit/ulimit 防止资源滥用
6. **审计日志** - 完整的操作记录和告警

通过合理配置这些安全层，可以在保证功能性的同时最大化安全性。