/**
 * MonitorManager - 监控任务管理器
 *
 * 负责：
 * - 管理所有监控任务的生命周期
 * - 任务状态持久化与恢复
 * - 规则管理
 * - 统计信息
 * - 主动日志查询（searchLog、lastErrors、logStats）
 *
 * @version 1.2.0
 *
 * v1.2.0 更新：
 * - 新增 searchLog() 方法：搜索日志文件
 * - 新增 lastErrors() 方法：获取最近错误
 * - 新增 logStats() 方法：日志统计分析
 *
 * v1.1.0 更新：
 * - MEU-2.1: 扩展状态持久化，增加 state、lastMessage、reconnectAttempts、lastDataTime 字段
 * - MEU-2.1: 新增 updateTaskState() 方法，接收 MonitorTask 状态变更回调
 * - MEU-2.1: startMonitor() 传递 onStatusChange 回调
 * - MEU-5.1: init() 启动时自动重试失败的回调
 */

const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const { MonitorTask } = require('./MonitorTask');
const AnomalyDetector = require('./AnomalyDetector');
const CallbackTrigger = require('./CallbackTrigger');

// SSHManager 用于主动查询命令
const SSHManager = require('../../LinuxShellExecutor/ssh/SSHManager');

// 默认规则文件路径
const DEFAULT_RULES_PATH = path.join(__dirname, '..', 'rules', 'default-rules.json');
const CUSTOM_RULES_PATH = path.join(__dirname, '..', 'rules', 'custom-rules.json');
const STATE_FILE_PATH = path.join(__dirname, '..', 'state', 'active-monitors.json');
const PID_FILE_PATH = path.join(__dirname, '..', 'state', 'monitor.pid');
const STOP_SIGNAL_PATH = path.join(__dirname, '..', 'state', 'stop-requests.json');

class MonitorManager {
    /**
     * @param {Object} options
     * @param {string} options.callbackBaseUrl - VCP 回调基础 URL
     * @param {string} options.pluginName - 插件名称
     * @param {boolean} options.debug - 调试模式
     */
    constructor(options = {}) {
        this.callbackBaseUrl = options.callbackBaseUrl || 'http://localhost:5000';
        this.pluginName = options.pluginName || 'LinuxLogMonitor';
        this.debug = options.debug || false;
        
        // 活跃任务 Map<taskId, MonitorTask>
        this.tasks = new Map();
        
        // 异常检测器
        this.anomalyDetector = new AnomalyDetector();
        
        // 回调触发器
        this.callbackTrigger = new CallbackTrigger({
            baseUrl: this.callbackBaseUrl,
            pluginName: this.pluginName,
            debug: this.debug
        });
        
        // 统计信息
        this.stats = {
            totalAnomalies: 0,
            totalCallbacks: 0,
            startTime: new Date().toISOString()
        };
    }
    
    /**
     * 初始化管理器
     * @param {Object} options
     * @param {string} options.mode - 初始化模式: 'full' | 'readonly' | 'signal'
     *   - 'full': 完整初始化，恢复任务（用于 start 命令）
     *   - 'readonly': 只读模式，不恢复任务（用于 status/list_rules 命令）
     *   - 'signal': 信号模式，用于发送停止信号（用于 stop 命令）
     */
    async init(options = {}) {
        const mode = options.mode || 'full';
        this._log(`初始化监控管理器 (模式: ${mode})...`);
        
        // 确保目录存在
        await this._ensureDirectories();
        
        // 加载规则（所有模式都需要）
        await this._loadRules();
        
        if (mode === 'full') {
            // 完整模式：恢复之前的任务
            await this._recoverTasks();
            
            // 写入 PID 文件
            await this._writePidFile();
            
            // 启动停止信号监听
            this._startStopSignalWatcher();
            
            // MEU-5.1: 启动时重试失败的回调
            const retryResult = await this.callbackTrigger.retryFailedCallbacks();
            if (retryResult.total > 0) {
                this._log(`重试了 ${retryResult.total} 个失败回调，成功 ${retryResult.success}，失败 ${retryResult.failed}`);
            }
        }
        
        this._log('监控管理器初始化完成');
    }
    
    /**
     * 启动监控任务
     * @param {Object} config
     * @param {string} config.hostId - 目标主机 ID
     * @param {string} config.logPath - 日志文件路径
     * @param {Array} config.rules - 自定义规则（可选）
     * @param {number} config.contextLines - 上下文行数
     * @returns {string} taskId
     */
    async startMonitor(config) {
        const { hostId, logPath, rules, contextLines } = config;
        
        // 生成任务 ID
        const taskId = this._generateTaskId(hostId, logPath);
        
        // 检查是否已存在相同任务
        if (this.tasks.has(taskId)) {
            throw new Error(`监控任务已存在: ${taskId}`);
        }
        
        this._log(`启动监控任务: ${taskId}`);
        
        // 创建任务实例
        // MEU-2.1: 传递 onStatusChange 回调
        const task = new MonitorTask({
            taskId,
            hostId,
            logPath,
            contextLines: contextLines || 10,
            debug: this.debug,
            onData: (line) => this._handleLogLine(taskId, line),
            onError: (error) => this._handleTaskError(taskId, error),
            onClose: () => this._handleTaskClose(taskId),
            onStatusChange: (statusInfo) => this._handleTaskStatusChange(taskId, statusInfo)
        });
        
        // 如果有自定义规则，添加到检测器
        if (rules && rules.length > 0) {
            for (const rule of rules) {
                this.anomalyDetector.addRule(rule, taskId);
            }
        }
        
        // 启动任务
        await task.start();
        
        // 保存任务
        this.tasks.set(taskId, task);
        
        // 持久化状态
        await this._saveState();
        
        return taskId;
    }
    
    /**
     * 停止监控任务
     * @param {string} taskId
     * @returns {Object} 任务统计信息
     */
    async stopMonitor(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error(`任务不存在: ${taskId}`);
        }
        
        this._log(`停止监控任务: ${taskId}`);
        
        // 停止任务
        const stats = await task.stop();
        
        // 移除任务
        this.tasks.delete(taskId);
        
        // 清理任务相关的自定义规则
        this.anomalyDetector.removeTaskRules(taskId);
        
        // 持久化状态
        await this._saveState();
        
        return stats;
    }
    
    /**
     * 停止所有任务
     */
    async stopAll() {
        this._log('停止所有监控任务...');
        
        const taskIds = Array.from(this.tasks.keys());
        
        for (const taskId of taskIds) {
            try {
                await this.stopMonitor(taskId);
            } catch (error) {
                this._log(`停止任务 ${taskId} 失败: ${error.message}`);
            }
        }
    }
    
    /**
     * 获取状态
     * @returns {Object}
     */
    getStatus() {
        const activeTasks = [];
        for (const [taskId, task] of this.tasks) {
            activeTasks.push({
                taskId,
                ...task.getStatus()
            });
        }
        return {
            activeTasks,
            taskCount: this.tasks.size,
            stats: this.stats,
            rulesCount: this.anomalyDetector.getRulesCount()
        };
    }
    
    /**
     * 列出所有规则
     * @returns {Object}
     */
    listRules() {
        return this.anomalyDetector.listRules();
    }
    
    /**
     * 添加规则
     * @param {Object} rule
     * @returns {Object} 添加的规则
     */
    async addRule(rule) {
        const addedRule = this.anomalyDetector.addRule(rule);
        
        // 保存到自定义规则文件
        await this._saveCustomRules();
        
        return addedRule;
    }
    
    // ==================== 主动查询命令 (v1.2.0) ====================
    /**
     * 获取 SSHManager 实例（延迟初始化）
     * @returns {SSHManager}
     */
    async _getSSHManager() {
        if (!this.sshManager) {
            // 加载 hosts 配置
            const hostsPath = path.join(__dirname, '..', '..', 'LinuxShellExecutor', 'hosts.json');
            try {
                const hostsContent = await fs.readFile(hostsPath, 'utf-8');
                const hostsConfig = JSON.parse(hostsContent);
                this.sshManager = new SSHManager(hostsConfig);
                this._log('SSHManager 初始化成功');
            } catch (error) {
                throw new Error(`无法加载 hosts 配置: ${error.message}`);
            }
        }
        return this.sshManager;
    }
    
    /**
     * 搜索日志文件
     * @param {Object} params
     * @param {string} params.hostId - 目标主机 ID
     * @param {string} params.logPath - 日志文件路径
     * @param {string} params.pattern - grep 正则表达式
     * @param {number} params.lines - 最多返回行数（默认 100）
     * @param {string} params.since - 时间范围：1h, 30m, 1d（可选）
     * @param {number} params.context - 上下文行数（默认 0）
     * @returns {Object} 搜索结果
     */
    async searchLog(params) {
        const { hostId, logPath, pattern, lines = 100, since, context = 0 } = params;
        
        if (!hostId) throw new Error('缺少必需参数: hostId');
        if (!logPath) throw new Error('缺少必需参数: logPath');
        if (!pattern) throw new Error('缺少必需参数: pattern');
        
        this._log(`searchLog: hostId=${hostId}, logPath=${logPath}, pattern=${pattern}`);
        
        const sshManager = await this._getSSHManager();
        
        // 构建命令
        let command;
        
        if (since) {
            // 使用时间范围过滤
            // 将 since 转换为分钟数
            const minutes = this._parseSinceToMinutes(since);
            // 使用 find + xargs + grep 或 awk 过滤时间
            // 简化实现：使用 tail + grep
            const tailLines = Math.min(lines * 10, 10000); // 预取更多行以便过滤
            command = `tail -n ${tailLines} ${this._escapeShellArg(logPath)} | grep -E ${this._escapeShellArg(pattern)}`;
            if (context > 0) {
                command = `tail -n ${tailLines} ${this._escapeShellArg(logPath)} | grep -E -C ${context} ${this._escapeShellArg(pattern)}`;
            }
            command += ` | tail -n ${lines}`;
        } else {
            // 不使用时间范围
            if (context > 0) {
                command = `grep -E -C ${context} ${this._escapeShellArg(pattern)} ${this._escapeShellArg(logPath)} | tail -n ${lines}`;
            } else {
                command = `grep -E ${this._escapeShellArg(pattern)} ${this._escapeShellArg(logPath)} | tail -n ${lines}`;
            }
        }
        
        this._log(`执行命令: ${command}`);
        
        try {
            const result = await sshManager.execute(hostId, command, { timeout: 30000 });
            
            const outputLines = result.stdout.trim().split('\n').filter(line => line.length > 0);
            
            return {
                success: true,
                hostId,
                logPath,
                pattern,
                matchCount: outputLines.length,
                lines: outputLines,
                command,
                executionTime: new Date().toISOString()
            };
        } catch (error) {
            // grep 没有匹配时返回 exit code 1，这不是错误
            if (error.message.includes('exit code 1') || error.message.includes('code: 1')) {
                return {
                    success: true,
                    hostId,
                    logPath,
                    pattern,
                    matchCount: 0,
                    lines: [],
                    command,
                    executionTime: new Date().toISOString(),
                    note: '没有匹配的日志行'
                };
            }
            throw error;
        }
    }
    
    /**
     * 获取最近的错误日志
     * @param {Object} params
     * @param {string} params.hostId - 目标主机 ID
     * @param {string} params.logPath - 日志文件路径
     * @param {number} params.count - 最近 N 条（默认 20）
     * @param {Array} params.levels - 错误级别（默认 ['ERROR', 'FATAL', 'CRIT']）
     * @returns {Object} 错误日志
     */
    async lastErrors(params) {
        const { hostId, logPath, count = 20, levels = ['ERROR', 'FATAL', 'CRIT', 'CRITICAL'] } = params;
        
        if (!hostId) throw new Error('缺少必需参数: hostId');
        if (!logPath) throw new Error('缺少必需参数: logPath');
        
        this._log(`lastErrors: hostId=${hostId}, logPath=${logPath}, count=${count}`);
        
        const sshManager = await this._getSSHManager();
        
        // 修复: 如果 levels 是 JSON 字符串，先解析为数组
        const levelsArray = typeof levels === 'string' ? JSON.parse(levels) : levels;
        
        // 构建 grep 模式
        const pattern = levelsArray.join('|');
        // 使用 grep + tail 获取最近的错误
        const command = `grep -E '\\b(${pattern})\\b' ${this._escapeShellArg(logPath)} | tail -n ${count}`;
        
        this._log(`执行命令: ${command}`);
        
        try {
            const result = await sshManager.execute(hostId, command, { timeout: 30000 });
            
            const outputLines = result.stdout.trim().split('\n').filter(line => line.length > 0);
            
            // 解析每行，提取时间戳和级别
            const errors = outputLines.map(line => {
                // 尝试解析常见的日志格式
                const parsed = this._parseLogLine(line);
                return {
                    raw: line,
                    ...parsed
                };
            });
            
            return {
                success: true,
                hostId,
                logPath,
                levels,
                errorCount: errors.length,
                errors,
                command,
                executionTime: new Date().toISOString()
            };
        } catch (error) {
            if (error.message.includes('exit code 1') || error.message.includes('code: 1')) {
                return {
                    success: true,
                    hostId,
                    logPath,
                    levels,
                    errorCount: 0,
                    errors: [],
                    command,
                    executionTime: new Date().toISOString(),
                    note: '没有找到错误日志'
                };
            }
            throw error;
        }
    }
    
    /**
     * 日志统计分析
     * @param {Object} params
     * @param {string} params.hostId - 目标主机 ID
     * @param {string} params.logPath - 日志文件路径
     * @param {string} params.since - 时间范围：1h, 30m, 1d（可选）
     * @param {string} params.groupBy - 分组方式：level, hour, status_code, ip（默认 level）
     * @returns {Object} 统计结果
     */
    async logStats(params) {
        const { hostId, logPath, since, groupBy = 'level' } = params;
        
        if (!hostId) throw new Error('缺少必需参数: hostId');
        if (!logPath) throw new Error('缺少必需参数: logPath');
        
        this._log(`logStats: hostId=${hostId}, logPath=${logPath}, groupBy=${groupBy}`);
        
        const sshManager = await this._getSSHManager();
        
        let command;
        
        switch (groupBy) {
            case 'level':
                // 按日志级别统计
                command = `cat ${this._escapeShellArg(logPath)} | grep -oE '\\b(DEBUG|INFO|WARN|WARNING|ERROR|FATAL|CRIT|CRITICAL)\\b' | sort | uniq -c | sort -rn`;
                break;
                
            case 'hour':
                // 按小时统计（假设日志格式包含时间戳）
                command = `cat ${this._escapeShellArg(logPath)} | grep -oE '[0-9]{2}:[0-9]{2}' | cut -d: -f1 | sort | uniq -c | sort -k2`;
                break;
                
            case 'status_code':
                // 按 HTTP 状态码统计（适用于 access log）
                command = `awk '{print $9}' ${this._escapeShellArg(logPath)} | grep -E '^[0-9]{3}$' | sort | uniq -c | sort -rn`;
                break;
                
            case 'ip':
                // 按 IP 地址统计（适用于 access log）
                command = `awk '{print $1}' ${this._escapeShellArg(logPath)} | sort | uniq -c | sort -rn | head -20`;
                break;
                
            default:
                throw new Error(`不支持的 groupBy 类型: ${groupBy}`);
        }
        
        // 如果指定了时间范围，使用 tail 限制行数
        if (since) {
            const tailLines = this._parseSinceToLines(since);
            command = `tail -n ${tailLines} ${this._escapeShellArg(logPath)} | ` + command.replace(`cat ${this._escapeShellArg(logPath)} | `, '').replace(` ${this._escapeShellArg(logPath)}`, '');
        }
        
        this._log(`执行命令: ${command}`);
        
        try {
            const result = await sshManager.execute(hostId, command, { timeout: 60000 });
            
            // 解析统计结果
            const stats = this._parseStatsOutput(result.stdout, groupBy);
            
            return {
                success: true,
                hostId,
                logPath,
                groupBy,
                since: since || 'all',
                stats,
                totalEntries: stats.reduce((sum, s) => sum + s.count, 0),
                command,
                executionTime: new Date().toISOString()
            };
        } catch (error) {
            throw error;
        }
    }
    
    /**
     * 解析 since 参数为分钟数
     * @param {string} since - 如 '1h', '30m', '1d'
     * @returns {number} 分钟数
     */
    _parseSinceToMinutes(since) {
        const match = since.match(/^(\d+)([mhd])$/);
        if (!match) {
            throw new Error(`无效的 since 格式: ${since}，支持格式: 30m, 1h, 1d`);
        }
        
        const value = parseInt(match[1], 10);
        const unit = match[2];
        
        switch (unit) {
            case 'm': return value;
            case 'h': return value * 60;
            case 'd': return value * 60 * 24;
            default: return value;
        }
    }
    
    /**
     * 解析 since 参数为预估行数
     * @param {string} since - 如 '1h', '30m', '1d'
     * @returns {number} 预估行数
     */
    _parseSinceToLines(since) {
        const minutes = this._parseSinceToMinutes(since);
        // 假设每分钟约 100 行日志
        return Math.min(minutes * 100, 100000);
    }
    
    /**
     * 转义 shell 参数
     * @param {string} arg
     * @returns {string}
     */
    _escapeShellArg(arg) {
        // 使用单引号包裹，并转义内部的单引号
        return "'" + arg.replace(/'/g, "'\\''") + "'";
    }
    
    /**
     * 解析日志行
     * @param {string} line
     * @returns {Object}
     */
    _parseLogLine(line) {
        const result = {
            timestamp: null,
            level: null,
            message: line
        };
        
        // 尝试匹配常见的时间戳格式
        // 格式1: 2025-12-21 10:30:45
        // 格式2: Dec 21 10:30:45
        // 格式3: [2025-12-21T10:30:45.123Z]
        
        const timestampPatterns = [
            /(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/,
            /([A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})/,
            /\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\]]*)\]/
        ];
        
        for (const pattern of timestampPatterns) {
            const match = line.match(pattern);
            if (match) {
                result.timestamp = match[1];
                break;
            }
        }
        
        // 尝试匹配日志级别
        const levelMatch = line.match(/\b(DEBUG|INFO|WARN|WARNING|ERROR|FATAL|CRIT|CRITICAL)\b/i);
        if (levelMatch) {
            result.level = levelMatch[1].toUpperCase();
        }
        
        return result;
    }
    
    /**
     * 解析统计输出
     * @param {string} output
     * @param {string} groupBy
     * @returns {Array}
     */
    _parseStatsOutput(output, groupBy) {
        const lines = output.trim().split('\n').filter(line => line.length > 0);
        const stats = [];
        
        for (const line of lines) {
            // 格式: "  123 ERROR" 或 "123 ERROR"
            const match = line.trim().match(/^\s*(\d+)\s+(.+)$/);
            if (match) {
                stats.push({
                    count: parseInt(match[1], 10),
                    key: match[2].trim()
                });
            }
        }
        
        return stats;
    }
    
    /**
     * MEU-2.1: 更新任务状态
     * 由 MonitorTask 的 onStatusChange 回调触发
     * @param {string} taskId - 任务 ID
     * @param {Object} stateUpdate - 状态更新信息
     */
    async updateTaskState(taskId, stateUpdate) {
        const task = this.tasks.get(taskId);
        if (!task) {
            this._log(`updateTaskState: 任务不存在 ${taskId}`);
            return;
        }
        
        this._log(`任务 ${taskId} 状态更新: ${stateUpdate.oldState} → ${stateUpdate.newState} ${stateUpdate.message || ''}`);
        
        // 立即持久化状态
        await this._saveState();
    }
    
    // ==================== 私有方法 ====================
    
    /**
     * 生成任务 ID
     * 重要：使用确定性哈希，相同的 hostId + logPath 总是生成相同的 taskId
     * 这样从文件恢复任务时能正确匹配原始任务
     */
    _generateTaskId(hostId, logPath) {
        const hash = crypto.createHash('md5')
            .update(`${hostId}:${logPath}`)  // 移除 Date.now()，使用确定性哈希
            .digest('hex')
            .substring(0, 8);
        return `monitor-${hostId}-${hash}`;
    }
    
    /**
     * MEU-2.1: 处理任务状态变更
     * @param {string} taskId - 任务 ID
     * @param {Object} statusInfo - 状态信息
     */
    async _handleTaskStatusChange(taskId, statusInfo) {
        await this.updateTaskState(taskId, statusInfo);
    }
    
    /**
     * 处理日志行
     */
    async _handleLogLine(taskId, line) {
        const task = this.tasks.get(taskId);
        if (!task) return;
        
        // 检测异常
        const anomalies = this.anomalyDetector.detect(line, taskId);
        
        if (anomalies.length > 0) {
            this.stats.totalAnomalies += anomalies.length;
            
            for (const anomaly of anomalies) {
                // 获取上下文
                const context = task.getContext();
                
                // 触发回调
                await this._triggerCallback(taskId, {
                    ...anomaly,
                    logLine: line,
                    hostId: task.hostId,
                    logPath: task.logPath,
                    context,
                    timestamp: new Date().toISOString()
                });
            }
        }
        
        // 更新任务上下文
        task.addToContext(line);
    }
    
    /**
     * 处理任务错误
     */
    async _handleTaskError(taskId, error) {
        this._log(`任务 ${taskId} 错误: ${error.message}`);
        
        // 触发错误回调
        await this._triggerCallback(taskId, {
            type: 'task_error',
            severity: 'critical',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
    
    /**
     * 处理任务关闭
     */
    async _handleTaskClose(taskId) {
        this._log(`任务 ${taskId} 已关闭`);
        
        // 从任务列表中移除
        this.tasks.delete(taskId);
        
        // 持久化状态
        await this._saveState();
    }
    
    /**
     * 触发回调
     */
    async _triggerCallback(taskId, anomaly) {
        this.stats.totalCallbacks++;
        
        await this.callbackTrigger.trigger(taskId, {
            pluginName: this.pluginName,
            requestId: taskId,
            status: 'anomaly_detected',
            anomaly
        });
    }
    
    /**
     * 确保目录存在
     */
    async _ensureDirectories() {
        const dirs = [
            path.join(__dirname, '..', 'rules'),
            path.join(__dirname, '..', 'state')
        ];
        
        for (const dir of dirs) {
            try {
                await fs.mkdir(dir, { recursive: true });
            } catch (error) {
                // 忽略已存在的目录
            }
        }
    }
    
    /**
     * 加载规则
     */
    async _loadRules() {
        // 加载默认规则
        try {
            const defaultRulesContent = await fs.readFile(DEFAULT_RULES_PATH, 'utf-8');
            const defaultRules = JSON.parse(defaultRulesContent);
            
            for (const rule of defaultRules.rules || []) {
                this.anomalyDetector.addRule(rule);
            }
            
            this._log(`加载了 ${(defaultRules.rules || []).length} 条默认规则`);
        } catch (error) {
            this._log(`加载默认规则失败: ${error.message}，将创建默认规则文件`);
            await this._createDefaultRules();
        }
        
        // 加载自定义规则
        try {
            const customRulesContent = await fs.readFile(CUSTOM_RULES_PATH, 'utf-8');
            const customRules = JSON.parse(customRulesContent);
            
            for (const rule of customRules.rules || []) {
                this.anomalyDetector.addRule(rule);
            }
            
            this._log(`加载了 ${(customRules.rules || []).length} 条自定义规则`);
        } catch (error) {
            // 自定义规则文件不存在是正常的
            this._log('无自定义规则文件');
        }
    }
    
    /**
     * 创建默认规则文件
     */
    async _createDefaultRules() {
        const defaultRules = {
            version: '1.0.0',
            description: 'LinuxLogMonitor 默认检测规则',
            rules: [
                {
                    name: 'error_keyword',
                    type: 'regex',
                    pattern: '\\b(ERROR|FATAL|CRITICAL)\\b',
                    severity: 'critical',
                    cooldown: 30000,
                    description: '检测 ERROR/FATAL/CRITICAL 关键词'
                },
                {
                    name: 'warning_keyword',
                    type: 'regex',
                    pattern: '\\b(WARN|WARNING)\\b',
                    severity: 'warning',
                    cooldown: 60000,
                    description: '检测 WARN/WARNING 关键词'
                },
                {
                    name: 'oom_killer',
                    type: 'keyword',
                    pattern: 'Out of memory',
                    severity: 'critical',
                    cooldown: 60000,
                    description: '检测内存不足'
                },
                {
                    name: 'disk_full',
                    type: 'keyword',
                    pattern: 'No space left on device',
                    severity: 'critical',
                    cooldown: 300000,
                    description: '检测磁盘空间不足'
                },
                {
                    name: 'connection_error',
                    type: 'regex',
                    pattern: 'Connection refused|Connection timed out|Connection reset',
                    severity: 'warning',
                    cooldown: 60000,
                    description: '检测连接错误'
                },
                {
                    name: 'permission_denied',
                    type: 'keyword',
                    pattern: 'Permission denied',
                    severity: 'warning',
                    cooldown: 60000,
                    description: '检测权限拒绝'
                },
                {
                    name: 'segfault',
                    type: 'keyword',
                    pattern: 'segfault',
                    severity: 'critical',
                    cooldown: 30000,
                    description: '检测段错误'
                },
                {
                    name: 'kernel_panic',
                    type: 'keyword',
                    pattern: 'Kernel panic',
                    severity: 'critical',
                    cooldown: 0,
                    description: '检测内核崩溃'
                }
            ]
        };
        
        await fs.writeFile(DEFAULT_RULES_PATH, JSON.stringify(defaultRules, null, 4), 'utf-8');
        
        // 重新加载
        for (const rule of defaultRules.rules) {
            this.anomalyDetector.addRule(rule);
        }
        
        this._log(`创建了 ${defaultRules.rules.length} 条默认规则`);
    }
    
    /**
     * 保存自定义规则
     */
    async _saveCustomRules() {
        const customRules = this.anomalyDetector.getCustomRules();
        
        await this._atomicWrite(CUSTOM_RULES_PATH, JSON.stringify({
            version: '1.0.0',
            description: '用户自定义检测规则',
            rules: customRules
        }, null, 4));
    }
    
    /**
     * MEU-2.1: 保存状态（扩展版）
     * 增加 state、lastMessage、reconnectAttempts、lastDataTime 字段
     */
    async _saveState() {
        const state = {
            tasks: [],
            lastUpdated: new Date().toISOString()
        };
        
        for (const [taskId, task] of this.tasks) {
            state.tasks.push({
                taskId,
                hostId: task.hostId,
                logPath: task.logPath,
                contextLines: task.contextLines,
                startTime: task.startTime,
                // MEU-2.1: 新增字段
                status: task.state || 'UNKNOWN',
                lastMessage: task.lastMessage || '',
                reconnectAttempts: task.reconnectAttempts || 0,
                lastDataTime: task.lastDataTime || null
            });
        }
        
        await this._atomicWrite(STATE_FILE_PATH, JSON.stringify(state, null, 4));
    }
    
    /**
     * 恢复任务
     */
    async _recoverTasks() {
        try {
            const stateContent = await fs.readFile(STATE_FILE_PATH, 'utf-8');
            const state = JSON.parse(stateContent);
            
            if (state.tasks && state.tasks.length > 0) {
                this._log(`发现 ${state.tasks.length} 个待恢复的任务`);
                
                for (const taskConfig of state.tasks) {
                    try {
                        await this.startMonitor({
                            hostId: taskConfig.hostId,
                            logPath: taskConfig.logPath,
                            contextLines: taskConfig.contextLines
                        });
                        this._log(`任务 ${taskConfig.taskId} 恢复成功`);
                    } catch (error) {
                        this._log(`任务 ${taskConfig.taskId} 恢复失败: ${error.message}`);
                    }
                }
            }
        } catch (error) {
            // 状态文件不存在是正常的
            this._log('无待恢复的任务');
        }
    }
    
    /**
     * 原子写入文件
     */
    async _atomicWrite(filePath, content) {
        const tempPath = filePath + '.tmp';
        try {
            await fs.writeFile(tempPath, content, 'utf-8');
            await fs.rename(tempPath, filePath);
        } catch (error) {
            // 清理临时文件
            try {
                await fs.unlink(tempPath);
            } catch (e) {
                // 忽略
            }
            throw error;
        }
    }
    
    /**
     * 写入 PID 文件
     */
    async _writePidFile() {
        await this._atomicWrite(PID_FILE_PATH, process.pid.toString());
        this._log(`PID 文件已写入: ${process.pid}`);
    }
    
    /**
     * 清理 PID 文件
     */
    async _cleanupPidFile() {
        try {
            await fs.unlink(PID_FILE_PATH);} catch (e) {
            // 忽略
        }
    }
    
    /**
     * 检查进程是否在运行
     */
    _isProcessRunning(pid) {
        try {
            process.kill(pid, 0);
            return true;
        } catch (e) {
            return false;
        }
    }
    
    /**
     * 启动停止信号监听器
     */
    _startStopSignalWatcher() {
        // 每秒检查一次停止信号
        this._stopSignalInterval = setInterval(async () => {
            await this._checkStopSignals();
        }, 1000);
        // 进程退出时清理
        process.on('exit', async () => {
            if (this._stopSignalInterval) {
                clearInterval(this._stopSignalInterval);
            }
            await this._cleanupPidFile();
        });
    }
    
    /**
     * 检查停止信号
     */
    async _checkStopSignals() {
        try {
            const content = await fs.readFile(STOP_SIGNAL_PATH, 'utf-8');
            const stopRequests = JSON.parse(content);
            
            if (stopRequests.length === 0) return;
            
            // 处理停止请求
            const remainingRequests = [];
            for (const request of stopRequests) {
                if (this.tasks.has(request.taskId)) {
                    this._log(`收到停止信号，停止任务: ${request.taskId}`);
                    try {
                        await this.stopMonitor(request.taskId);} catch (error) {
                        this._log(`停止任务失败: ${error.message}`);
                    }
                } else {
                    // 任务不存在，可能是其他进程的请求，保留
                    // 但如果请求太旧（超过 30 秒），则丢弃
                    const requestAge = Date.now() - new Date(request.requestTime).getTime();
                    if (requestAge < 30000) {
                        remainingRequests.push(request);
                    }
                }
            }
            
            // 更新停止请求文件
            await this._atomicWrite(STOP_SIGNAL_PATH, JSON.stringify(remainingRequests, null, 4));
        } catch (error) {
            // 文件不存在或解析失败，忽略
        }
    }
    
    /**
     * 等待任务停止
     */
    async _waitForTaskStop(taskId, timeout) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // 检查任务是否还在状态文件中
            try {
                const stateContent = await fs.readFile(STATE_FILE_PATH, 'utf-8');
                const state = JSON.parse(stateContent);
                const taskExists = (state.tasks || []).some(t => t.taskId === taskId);
                if (!taskExists) {
                    return true;
                }
            } catch (e) {
                // 文件不存在，任务已停止
                return true;
            }
        }
        return false;
    }
    
    /**
     * 从状态文件读取状态（用于 status 命令，不启动任务）
     * @returns {Object} 状态信息
     */
    async getStatusFromFile() {
        try {
            const stateContent = await fs.readFile(STATE_FILE_PATH, 'utf-8');
            const state = JSON.parse(stateContent);
            
            // 检查监控进程是否在运行
            let monitorProcessRunning = false;
            try {
                const pidContent = await fs.readFile(PID_FILE_PATH, 'utf-8');
                const pid = parseInt(pidContent.trim(), 10);
                monitorProcessRunning = this._isProcessRunning(pid);
            } catch (e) {
                // PID 文件不存在
            }
            
            return {
                activeTasks: state.tasks || [],
                taskCount: (state.tasks || []).length,
                lastUpdated: state.lastUpdated,
                monitorProcessRunning,
                stats: this.stats,
                rulesCount: this.anomalyDetector.getRulesCount()
            };
        } catch (error) {
            // 状态文件不存在
            return {
                activeTasks: [],
                taskCount: 0,
                lastUpdated: null,
                monitorProcessRunning: false,
                stats: this.stats,
                rulesCount: this.anomalyDetector.getRulesCount()
            };
        }
    }
    
    /**
     * 发送停止信号（用于 stop 命令，通过文件信号通知运行中的进程）
     * @param {string} taskId - 要停止的任务 ID
     * @param {Object} options
     * @param {number} options.timeout - 等待超时时间（毫秒）
     * @returns {Object} 停止结果
     */
    async sendStopSignal(taskId, options = {}) {
        const timeout = options.timeout || 10000;
        
        // 检查任务是否存在于状态文件中
        let taskExists = false;
        try {
            const stateContent = await fs.readFile(STATE_FILE_PATH, 'utf-8');
            const state = JSON.parse(stateContent);
            taskExists = (state.tasks || []).some(t => t.taskId === taskId);
        } catch (e) {
            // 状态文件不存在
        }
        
        if (!taskExists) {
            throw new Error(`任务不存在: ${taskId}`);
        }
        
        // 检查监控进程是否在运行
        let monitorProcessRunning = false;
        try {
            const pidContent = await fs.readFile(PID_FILE_PATH, 'utf-8');
            const pid = parseInt(pidContent.trim(), 10);
            monitorProcessRunning = this._isProcessRunning(pid);
        } catch (e) {
            // PID 文件不存在
        }
        
        if (!monitorProcessRunning) {
            // 监控进程不在运行，直接清理状态文件
            this._log('监控进程未运行，直接清理状态文件');
            try {
                const stateContent = await fs.readFile(STATE_FILE_PATH, 'utf-8');
                const state = JSON.parse(stateContent);
                state.tasks = (state.tasks || []).filter(t => t.taskId !== taskId);
                state.lastUpdated = new Date().toISOString();
                await this._atomicWrite(STATE_FILE_PATH, JSON.stringify(state, null, 4));
                return { success: true, method: 'direct_cleanup' };
            } catch (e) {
                throw new Error(`清理状态文件失败: ${e.message}`);
            }
        }
        
        // 监控进程在运行，发送停止信号
        this._log(`发送停止信号: ${taskId}`);
        
        // 读取现有的停止请求
        let stopRequests = [];
        try {
            const content = await fs.readFile(STOP_SIGNAL_PATH, 'utf-8');
            stopRequests = JSON.parse(content);
        } catch (e) {
            // 文件不存在
        }
        
        // 添加新的停止请求
        stopRequests.push({
            taskId,
            requestTime: new Date().toISOString()
        });
        
        await this._atomicWrite(STOP_SIGNAL_PATH, JSON.stringify(stopRequests, null, 4));
        
        // 等待任务停止
        const stopped = await this._waitForTaskStop(taskId, timeout);
        
        if (stopped) {
            return { success: true, method: 'signal' };
        } else {
            return { success: false, method: 'signal', error: '等待超时，任务可能仍在运行' };
        }
    }
    
    /**
     * 日志输出
     */
    _log(msg, ...args) {
        console.error(`[MonitorManager] ${msg}`, ...args);  
    }  
}  
  
module.exports = MonitorManager; 
