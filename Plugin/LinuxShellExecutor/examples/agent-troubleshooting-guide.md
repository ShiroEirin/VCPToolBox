# LinuxShellExecutor Agent 故障排查指南

## 概述

本指南帮助 AI Agent 使用 LinuxShellExecutor 进行服务器故障排查。当用户报告服务器问题时，Agent 可以按照本指南的排查流程进行诊断。

---

## 排查流程框架

```
用户报告问题
    ↓
1. 问题分类（服务/网络/资源/日志）
    ↓
2. 信息收集（执行诊断命令）
    ↓
3. 数据分析（解读输出结果）
    ↓
4. 定位原因（关联多个线索）
    ↓
5. 给出建议（解决方案或进一步排查）
```

---

## 场景 1：服务无响应 / API 返回错误

### 排查步骤

#### Step 1: 检查服务进程是否存在
```json
{
    "command": "ps aux | grep -E 'nginx|node|java|python|php' | grep -v grep",
    "hostId": "HK-server"
}
```

**分析要点**：
- 进程是否存在？
- CPU/内存占用是否异常？
- 进程启动时间是否正常？

#### Step 2: 检查服务状态（systemd 服务）
```json
{
    "command": "systemctl status nginx --no-pager",
    "hostId": "HK-server"
}
```

**分析要点**：
- Active 状态是 `active (running)` 还是 `failed`？
- 最近的日志显示什么？

#### Step 3: 检查端口监听
```json
{
    "command": "ss -tlnp | grep -E ':80|:443|:3000|:8080'",
    "hostId": "HK-server"
}
```

**分析要点**：
- 端口是否在监听？
- 监听的是 0.0.0.0 还是 127.0.0.1？

#### Step 4: 查看错误日志
```json
{
    "command": "tail -100 /var/log/nginx/error.log | grep -i error",
    "hostId": "HK-server"
}
```

或使用 journalctl：
```json
{
    "command": "journalctl -u nginx -n 50 --no-pager",
    "hostId": "HK-server"
}
```

---

## 场景 2：服务器响应慢

### 排查步骤

#### Step 1: 检查系统负载
```json
{
    "command": "uptime",
    "hostId": "HK-server"
}
```

**分析要点**：
- load average 三个值分别代表 1/5/15 分钟平均负载
- 负载值超过 CPU 核心数表示过载

#### Step 2: 检查 CPU 使用情况
```json
{
    "command": "top -b -n 1 | head -20",
    "hostId": "HK-server"
}
```

或：
```json
{
    "command": "ps aux --sort=-%cpu | head -10",
    "hostId": "HK-server"
}
```

**分析要点**：
- 哪个进程占用 CPU 最高？
- %wa (iowait) 是否过高？

#### Step 3: 检查内存使用
```json
{
    "command": "free -h",
    "hostId": "HK-server"
}
```

**分析要点**：
- available 内存是否充足？
- swap 使用量是否过高？

#### Step 4: 检查磁盘 IO
```json
{
    "command": "iostat -x 1 3",
    "hostId": "HK-server"
}
```

**分析要点**：
- %util 接近 100% 表示磁盘繁忙
- await 过高表示 IO 延迟大

#### Step 5: 检查磁盘空间
```json
{
    "command": "df -h",
    "hostId": "HK-server"
}
```

**分析要点**：
- 是否有分区使用率超过 90%？
- /var/log 是否满了？

---

## 场景 3：网络连接问题

### 排查步骤

#### Step 1: 检查网络连通性
```json
{
    "command": "ping -c 4 8.8.8.8",
    "hostId": "HK-server"
}
```

#### Step 2: 检查 DNS 解析
```json
{
    "command": "dig google.com +short",
    "hostId": "HK-server"
}
```

#### Step 3: 检查路由
```json
{
    "command": "traceroute -n -m 15 8.8.8.8",
    "hostId": "HK-server"
}
```

#### Step 4: 检查当前连接状态
```json
{
    "command": "ss -s",
    "hostId": "HK-server"
}
```

**分析要点**：
- TIME-WAIT 连接数是否过多？
- ESTABLISHED 连接数是否正常？

#### Step 5: 检查特定端口连接
```json
{
    "command": "ss -tnp | grep :3306 | wc -l",
    "hostId": "HK-server"
}
```

---

## 场景 4：Docker 容器问题

### 排查步骤

#### Step 1: 列出所有容器
```json
{
    "command": "docker ps -a",
    "hostId": "HK-server"
}
```

**分析要点**：
- 容器状态是 Up 还是 Exited？
- 重启次数是否异常？

#### Step 2: 查看容器日志
```json
{
    "command": "docker logs --tail 100 container_name",
    "hostId": "HK-server"
}
```

#### Step 3: 检查容器资源使用
```json
{
    "command": "docker stats --no-stream",
    "hostId": "HK-server"
}
```

#### Step 4: 检查容器详情
```json
{
    "command": "docker inspect container_name | head -50",
    "hostId": "HK-server"
}
```

---

## 场景 5：数据库问题

### MySQL 排查

#### 检查 MySQL 进程
```json
{
    "command": "ps aux | grep mysql",
    "hostId": "HK-server"
}
```

#### 检查 MySQL 连接数
```json
{
    "command": "ss -tnp | grep :3306 | wc -l",
    "hostId": "HK-server"
}
```

### Redis 排查

#### 检查 Redis 进程
```json
{
    "command": "ps aux | grep redis",
    "hostId": "HK-server"
}
```

#### 检查 Redis 连接
```json
{
    "command": "ss -tnp | grep :6379 | wc -l",
    "hostId": "HK-server"
}
```

---

## 场景 6：安全事件排查

### 检查登录历史
```json
{
    "command": "last -n 20",
    "hostId": "HK-server"
}
```

### 检查当前登录用户
```json
{
    "command": "w",
    "hostId": "HK-server"
}
```

### 检查失败登录
```json
{
    "command": "journalctl -u sshd -n 50 --no-pager | grep -i failed",
    "hostId": "HK-server"
}
```

---

## 常用诊断命令速查表

| 问题类型 | 命令 | 说明 |
|---------|------|------|
| **进程** | `ps aux \| grep xxx` | 查找特定进程 |
| **进程** | `ps aux --sort=-%cpu \| head` | CPU 占用 TOP |
| **进程** | `ps aux --sort=-%mem \| head` | 内存占用 TOP |
| **服务** | `systemctl status xxx` | 服务状态 |
| **服务** | `systemctl list-units --state=failed` | 失败的服务 |
| **日志** | `journalctl -u xxx -n 100` | 服务日志 |
| **日志** | `tail -f /var/log/xxx` | 实时日志 |
| **日志** | `dmesg -T \| tail` | 内核日志 |
| **网络** | `ss -tlnp` | 监听端口 |
| **网络** | `ss -s` | 连接统计 |
| **网络** | `netstat -an \| grep ESTABLISHED \| wc -l` | 连接数 |
| **磁盘** | `df -h` | 磁盘空间 |
| **磁盘** | `du -sh /var/log/*` | 目录大小 |
| **磁盘** | `iostat -x` | IO 统计 |
| **内存** | `free -h` | 内存使用 |
| **内存** | `vmstat -s` | 内存统计 |
| **CPU** | `uptime` | 系统负载 |
| **CPU** | `lscpu` | CPU 信息 |
| **Docker** | `docker ps -a` | 容器列表 |
| **Docker** | `docker logs xxx` | 容器日志 |
| **Docker** | `docker stats` | 容器资源 |

---

## Agent 排查模板

当用户报告问题时，Agent 可以按以下模板进行排查：

```
## 问题描述
[用户报告的问题]

## 排查步骤

### 1. 初步诊断
- 执行命令: [命令]
- 输出结果: [结果]
- 分析: [分析]

### 2. 深入排查
- 执行命令: [命令]
- 输出结果: [结果]
- 分析: [分析]

### 3. 根因定位
基于以上信息，问题原因是: [原因]

## 建议方案
1. [方案1]
2. [方案2]

## 后续监控
建议关注: [监控项]
```

---

## 安全注意事项

1. **只读操作**：当前白名单仅允许查询操作，不允许修改/重启服务
2. **路径限制**：日志查看限制在 `/var/log`、`/home`、`/tmp` 目录
3. **敏感文件**：禁止访问 `/etc/shadow`、`/etc/passwd`、`/root` 等
4. **资源限制**：命令执行有 CPU、内存、时间限制

如需执行修复操作（如重启服务），请提示用户手动执行或通过其他授权渠道。