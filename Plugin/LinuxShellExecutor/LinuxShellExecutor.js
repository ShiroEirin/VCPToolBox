/**
 * LinuxShellExecutor - 六层安全防护的 Linux Shell 命令执行器
 * 
 * 功能特性：
 * - 多主机 SSH 远程执行
 * - 支持密钥和密码认证
 * - 跳板机（Jump Host）支持
 * - 六层安全防护架构
 * 
 * 安全层级：
 * 1. 黑名单过滤 - 快速拦截已知危险命令
 * 2. 白名单验证 - 只允许预定义的安全命令
 * 3. AST语义分析 - 检测复杂攻击模式
 * 4. 沙箱隔离 - Docker/Firejail/Bubblewrap（仅本地）
 * 5. 系统调用限制 - seccomp/rlimit（规划中）
 * 6. 审计日志 - 记录所有操作
 * 
 * @version 0.2.0
 * @author VCP Team
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

// 加载配置
require('dotenv').config({ path: path.join(__dirname, 'config.env') });

// 加载白名单配置
let whitelist;
try {
    whitelist = require('./whitelist.json');
} catch (e) {
    whitelist = { commands: {}, globalRestrictions: {} };
}

// 加载主机配置
let hostsConfig;
try {
    hostsConfig = require('./hosts.json');
} catch (e) {
    hostsConfig = { 
        hosts: { 
            local: { 
                name: '本地执行', 
                type: 'local', 
                enabled: true, 
                securityLevel: 'standard' 
            } 
        }, 
        defaultHost: 'local',
        globalSettings: {}
    };
}

// SSH 管理器（延迟加载，避免在没有 ssh2 模块时报错）
let SSHManager = null;
let sshManager = null;
let sshLoadError = null;

function getSSHManager() {
    if (sshLoadError) {
        return null;
    }
    if (!SSHManager) {
        try {
            SSHManager = require('./ssh/SSHManager');
            sshManager = new SSHManager(hostsConfig);
            console.error('[LinuxShellExecutor] SSH 模块加载成功');
        } catch (e) {
            sshLoadError = e.message;
            console.error('[LinuxShellExecutor] SSH 模块加载失败:', e.message);
            console.error('[LinuxShellExecutor] 请运行: cd Plugin/LinuxShellExecutor && npm install ssh2');
            return null;
        }
    }
    return sshManager;
}

function getSSHLoadError() {
    return sshLoadError;
}

// ============================================
// 第一层：黑名单过滤器
// ============================================
class BlacklistFilter {
    constructor() {
        this.forbiddenPatterns = (process.env.FORBIDDEN_PATTERNS || '')
            .split(',')
            .filter(Boolean)
            .map(p => {
                try {
                    return new RegExp(p, 'i');
                } catch (e) {
                    console.error(`无效的正则表达式: ${p}`);
                    return null;
                }
            })
            .filter(Boolean);
        
        this.forbiddenCommands = (process.env.FORBIDDEN_COMMANDS || '')
            .split(',')
            .filter(Boolean)
            .map(c => c.trim().toLowerCase());
    }
    
    check(command) {
        const lowerCmd = command.toLowerCase().trim();
        
        // 精确匹配检查
        for (const forbidden of this.forbiddenCommands) {
            if (lowerCmd === forbidden || lowerCmd.startsWith(forbidden + ' ')) {
                return {
                    passed: false,
                    reason: `命令 "${forbidden}" 被完全禁止`,
                    layer: 'blacklist',
                    severity: 'critical'
                };
            }
        }
        
        // 正则模式检查
        for (const pattern of this.forbiddenPatterns) {
            if (pattern.test(command)) {
                return {
                    passed: false,
                    reason: `命令匹配禁止模式: ${pattern.source}`,
                    layer: 'blacklist',
                    severity: 'critical'
                };
            }
        }
        
        return { passed: true };
    }
}

// ============================================
// 第二层：白名单验证器
// ============================================
class WhitelistValidator {
    constructor(whitelist) {
        this.commands = whitelist.commands || {};
        this.globalRestrictions = whitelist.globalRestrictions || {};
    }
    
    validate(command) {
        // 全局长度检查
        const maxLen = this.globalRestrictions.maxCommandLength || 1000;
        if (command.length > maxLen) {
            return {
                passed: false,
                reason: `命令长度超过限制 (${maxLen})`,
                layer: 'whitelist',
                severity: 'medium'
            };
        }
        
        // 禁止字符检查
        const forbiddenChars = this.globalRestrictions.forbiddenCharacters || [];
        for (const char of forbiddenChars) {
            if (command.includes(char)) {
                return {
                    passed: false,
                    reason: `命令包含禁止字符: "${char}"`,
                    layer: 'whitelist',
                    severity: 'high'
                };
            }
        }
        
        // 解析命令
        const parsed = this.parseCommand(command);
        
        // 检查命令是否在白名单中
        const cmdConfig = this.commands[parsed.command];
        if (!cmdConfig) {
            return {
                passed: false,
                reason: `命令 "${parsed.command}" 不在白名单中`,
                layer: 'whitelist',
                severity: 'medium'
            };
        }
        
        // 检查参数
        for (const arg of parsed.args) {
            if (arg.startsWith('-')) {
                const argName = arg.split(/[=\s]/)[0];
                if (!cmdConfig.allowedArgs.some(a => a === argName || arg.startsWith(a))) {
                    return {
                        passed: false,
                        reason: `参数 "${arg}" 不被允许用于 "${parsed.command}"`,
                        layer: 'whitelist',
                        severity: 'medium'
                    };
                }
            }
        }
        
        // 检查路径
        if (!cmdConfig.noPathRequired && parsed.paths.length > 0) {
            for (const p of parsed.paths) {
                const result = this.validatePath(p, cmdConfig.pathRestrictions);
                if (!result.passed) {
                    return result;
                }
            }
        }
        
        return { passed: true, parsedCommand: parsed };
    }
    
    parseCommand(command) {
        const parts = command.trim().split(/\s+/);
        const cmd = parts[0];
        const args = [];
        const paths = [];
        
        for (let i = 1; i < parts.length; i++) {
            const part = parts[i];
            if (part.startsWith('-')) {
                args.push(part);
            } else if (!part.startsWith('-') && part.length > 0) {
                paths.push(part);
            }
        }
        
        return { command: cmd, args, paths };
    }
    
    validatePath(inputPath, restrictions) {
        if (!restrictions) {
            return { passed: true };
        }
        
        const normalizedPath = path.normalize(inputPath);
        
        if (normalizedPath.includes('..')) {
            return {
                passed: false,
                reason: `路径包含目录遍历: "${inputPath}"`,
                layer: 'whitelist',
                severity: 'high'
            };
        }
        
        if (!inputPath.startsWith('/')) {
            return { passed: true };
        }
        
        if (restrictions.denied) {
            for (const denied of restrictions.denied) {
                if (inputPath.startsWith(denied) || inputPath === denied) {
                    return {
                        passed: false,
                        reason: `路径 "${inputPath}" 在拒绝列表中`,
                        layer: 'whitelist',
                        severity: 'high'
                    };
                }
            }
        }
        
        if (restrictions.allowed) {
            const isAllowed = restrictions.allowed.some(allowed => 
                inputPath.startsWith(allowed) || inputPath === allowed
            );
            if (!isAllowed) {
                return {
                    passed: false,
                    reason: `路径 "${inputPath}" 不在允许列表中`,
                    layer: 'whitelist',
                    severity: 'medium'
                };
            }
        }
        
        return { passed: true };
    }
}

// ============================================
// 第三层：AST 语义分析器
// ============================================
class ASTAnalyzer {
    constructor() {
        this.riskPatterns = [
            {
                name: 'command_injection',
                pattern: /\$\(.*\)|`.*`|\$\{.*\}/,
                severity: 'critical',
                description: '检测到命令注入尝试'
            },
            {
                name: 'path_traversal',
                pattern: /\.\.\/|\.\.\\|\.\.\%2f|\.\.\%5c/i,
                severity: 'high',
                description: '检测到路径遍历尝试'
            },
            {
                name: 'encoded_payload',
                pattern: /base64\s+-d|base64\s+--decode|\%[0-9a-f]{2}/i,
                severity: 'high',
                description: '检测到编码载荷'
            },
            {
                name: 'network_exfiltration',
                pattern: /curl.*\|.*sh|wget.*\|.*sh|nc\s+-e|bash\s+-i.*\/dev\/tcp/i,
                severity: 'critical',
                description: '检测到网络数据外泄尝试'
            },
            {
                name: 'privilege_escalation',
                pattern: /\bsudo\b|\bsu\s+-|\bpkexec\b|\bdoas\b/,
                severity: 'critical',
                description: '检测到提权尝试'
            },
            {
                name: 'file_descriptor_manipulation',
                pattern: /\/dev\/tcp|\/dev\/udp|\/proc\/self/,
                severity: 'high',
                description: '检测到文件描述符操作'
            },
            {
                name: 'environment_manipulation',
                pattern: /export\s+PATH|export\s+LD_PRELOAD|export\s+LD_LIBRARY_PATH/,
                severity: 'high',
                description: '检测到环境变量操作'
            },
            {
                name: 'shell_escape',
                pattern: /\\x[0-9a-f]{2}|\\u[0-9a-f]{4}|\\[0-7]{3}/i,
                severity: 'medium',
                description: '检测到 Shell 转义序列'
            }
        ];
    }
    
    analyze(command) {
        const risks = [];
        
        for (const pattern of this.riskPatterns) {
            if (pattern.pattern.test(command)) {
                risks.push({
                    type: pattern.name,
                    severity: pattern.severity,
                    description: pattern.description,
                    layer: 'ast'
                });
            }
        }
        
        const structuralRisks = this.analyzeStructure(command);
        risks.push(...structuralRisks);
        
        return {
            passed: risks.filter(r => r.severity === 'critical').length === 0,
            risks,
            layer: 'ast'
        };
    }
    
    analyzeStructure(command) {
        const risks = [];
        
        const nestingDepth = (command.match(/\(/g) || []).length;
        if (nestingDepth > 3) {
            risks.push({
                type: 'deep_nesting',
                severity: 'medium',
                description: `命令嵌套深度过高: ${nestingDepth}`,
                layer: 'ast'
            });
        }
        
        const pipeCount = (command.match(/\|/g) || []).length;
        if (pipeCount > 5) {
            risks.push({
                type: 'excessive_pipes',
                severity: 'medium',
                description: `管道数量过多: ${pipeCount}`,
                layer: 'ast'
            });
        }
        
        return risks;
    }
}

// ============================================
// 第四层：沙箱管理器（仅本地执行）
// ============================================
class SandboxManager {
    constructor() {
        this.backend = process.env.SANDBOX_BACKEND || 'none';
    }
    
    async execute(command, options = {}) {
        const timeout = options.timeout || parseInt(process.env.TIMEOUT_MS) || 30000;
        
        switch (this.backend) {
            case 'docker':
                return this.executeInDocker(command, { ...options, timeout });
            case 'firejail':
                return this.executeInFirejail(command, { ...options, timeout });
            case 'bubblewrap':
                return this.executeInBubblewrap(command, { ...options, timeout });
            case 'none':
            default:
                return this.executeDirectly(command, { ...options, timeout });
        }
    }
    
    async executeDirectly(command, options) {
        return this.spawnWithTimeout('/bin/bash', ['-c', command], options.timeout);
    }
    
    async executeInDocker(command, options) {
        const image = process.env.DOCKER_IMAGE || 'alpine:latest';
        const args = [
            'run', '--rm', '--network=none',
            '--memory=' + (options.memory || '256m'),
            '--cpus=' + (options.cpus || '0.5'),
            '--read-only', '--security-opt=no-new-privileges',
            '--cap-drop=ALL', '--user=65534:65534',
            image, '/bin/sh', '-c', command
        ];
        return this.spawnWithTimeout('docker', args, options.timeout);
    }
    
    async executeInFirejail(command, options) {
        const args = [
            '--quiet', '--private', '--private-tmp', '--net=none',
            '--no3d', '--nodvd', '--nosound', '--notv', '--nou2f', '--novideo',
            '--noroot', '--caps.drop=all', '--seccomp',
            '--rlimit-fsize=10m', '--rlimit-nproc=10',
            '--timeout=' + Math.ceil(options.timeout / 1000),
            '/bin/bash', '-c', command
        ];
        return this.spawnWithTimeout('firejail', args, options.timeout);
    }
    
    async executeInBubblewrap(command, options) {
        const args = [
            '--ro-bind', '/usr', '/usr',
            '--ro-bind', '/bin', '/bin',
            '--ro-bind', '/lib', '/lib',
            '--symlink', 'usr/lib', '/lib',
            '--proc', '/proc',
            '--dev', '/dev',
            '--tmpfs', '/tmp',
            '--tmpfs', '/run',
            '--unshare-all',
            '--die-with-parent',
            '--new-session',
            '/bin/sh', '-c', command
        ];
        
        try {
            await fs.access('/lib64');
            args.splice(6, 0, '--ro-bind', '/lib64', '/lib64');
        } catch (e) {}
        
        return this.spawnWithTimeout('bwrap', args, options.timeout);
    }
    
    spawnWithTimeout(cmd, args, timeout) {
        return new Promise((resolve, reject) => {
            let stdout = '';
            let stderr = '';
            
            const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
            
            const timeoutId = setTimeout(() => {
                child.kill('SIGKILL');
                reject(new Error(`命令执行超时 (${timeout}ms)`));
            }, timeout);
            
            child.stdout.on('data', data => { stdout += data.toString(); });
            child.stderr.on('data', data => { stderr += data.toString(); });
            
            child.on('close', code => {
                clearTimeout(timeoutId);
                if (code === 0) {
                    resolve({ stdout, stderr, code });
                } else {
                    reject(new Error(`命令执行失败 (code: ${code}): ${stderr || stdout}`));
                }
            });
            
            child.on('error', err => {
                clearTimeout(timeoutId);
                reject(new Error(`启动命令失败: ${err.message}`));
            });
        });
    }
}

// ============================================
// 第六层：审计日志记录器
// ============================================
class AuditLogger {
    constructor() {
        this.logDir = process.env.AUDIT_LOG_DIR || path.join(__dirname, 'logs', 'audit');
        this.alertWebhook = process.env.ALERT_WEBHOOK;
        this.alertThreshold = parseInt(process.env.ALERT_THRESHOLD) || 5;
        this.failureWindow = new Map();
    }
    
    async init() {
        try {
            await fs.mkdir(this.logDir, { recursive: true });
        } catch (e) {
            console.error(`创建审计日志目录失败: ${e.message}`);
        }
    }
    
    async log(entry) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            id: crypto.randomUUID(),
            timestamp,
            ...entry,
            checksum: this.calculateChecksum(entry)
        };
        
        try {
            const logFile = path.join(this.logDir, `${timestamp.split('T')[0]}.jsonl`);
            await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');
        } catch (e) {
            console.error(`写入审计日志失败: ${e.message}`);
        }
        
        if (entry.status === 'blocked' || entry.status === 'failed') {
            await this.checkAndAlert(entry);
        }
        
        return logEntry.id;
    }
    
    calculateChecksum(entry) {
        const content = JSON.stringify(entry);
        return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
    }
    
    async checkAndAlert(entry) {
        const now = Date.now();
        const windowStart = now - 5 * 60 * 1000;
        
        for (const [key, time] of this.failureWindow) {
            if (time < windowStart) {
                this.failureWindow.delete(key);
            }
        }
        
        this.failureWindow.set(entry.id || now, now);
        
        if (this.failureWindow.size >= this.alertThreshold && this.alertWebhook) {
            await this.sendAlert({
                type: 'threshold_exceeded',
                message: `5分钟内检测到 ${this.failureWindow.size} 次安全事件`,
                latestEvent: entry
            });
            this.failureWindow.clear();
        }
    }
    
    async sendAlert(alert) {
        if (!this.alertWebhook) {
            console.error('[ALERT]', JSON.stringify(alert));
            return;
        }
        
        try {
            const response = await fetch(this.alertWebhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    timestamp: new Date().toISOString(),
                    source: 'LinuxShellExecutor',
                    ...alert
                })
            });
            
            if (!response.ok) {
                console.error('告警发送失败:', response.status);
            }
        } catch (error) {
            console.error('告警发送错误:', error.message);
        }
    }
}

// ============================================
// 主执行器
// ============================================
class LinuxShellExecutor {
    constructor() {
        this.blacklistFilter = new BlacklistFilter();
        this.whitelistValidator = new WhitelistValidator(whitelist);
        this.astAnalyzer = new ASTAnalyzer();
        this.sandboxManager = new SandboxManager();
        this.auditLogger = new AuditLogger();
        
        this.securityLevels = {
            basic: ['blacklist'],
            standard: ['blacklist', 'whitelist', 'sandbox'],
            high: ['blacklist', 'whitelist', 'ast', 'sandbox'],
            maximum: ['blacklist', 'whitelist', 'ast', 'sandbox', 'audit']
        };
    }
    
    async init() {
        await this.auditLogger.init();
    }
    
    /**
     * 列出所有可用主机
     */
    listHosts() {
        const manager = getSSHManager();
        if (manager) {
            return manager.listHosts();
        }
        return [{
            id: 'local',
            name: '本地执行',
            type: 'local',
            enabled: true,
            securityLevel: 'standard'
        }];
    }
    
    /**
     * 测试主机连接
     */
    async testConnection(hostId) {
        const manager = getSSHManager();
        if (!manager) {
            if (hostId === 'local') {
                return { success: true, hostId: 'local', message: '本地执行模式' };
            }
            return { success: false, hostId, error: 'SSH 模块未加载' };
        }
        return manager.testConnection(hostId);
    }
    
    /**
     * 获取连接状态
     */
    getConnectionStatus() {
        const manager = getSSHManager();
        if (manager) {
            return manager.getStatus();
        }
        return { local: { name: '本地执行', enabled: true, type: 'local', connectionStatus: 'ready' } };
    }
    
    /**
     * 执行命令
     */
    async execute(command, options = {}) {
        const startTime = Date.now();
        const hostId = options.hostId || hostsConfig.defaultHost || 'local';
        const hostConfig = hostsConfig.hosts[hostId] || { type: 'local', securityLevel: 'standard' };
        const securityLevel = options.securityLevel || hostConfig.securityLevel || process.env.DEFAULT_SECURITY_LEVEL || 'standard';
        const enabledLayers = this.securityLevels[securityLevel] || this.securityLevels.standard;
        
        const auditEntry = {
            command,
            hostId,
            options,
            securityLevel,
            timestamp: new Date().toISOString(),
            status: 'pending',
            layers: []
        };
        
        try {
            // 第一层：黑名单过滤
            if (enabledLayers.includes('blacklist')) {
                const blacklistResult = this.blacklistFilter.check(command);
                auditEntry.layers.push({ name: 'blacklist', result: blacklistResult });
                if (!blacklistResult.passed) {
                    auditEntry.status = 'blocked';
                    auditEntry.reason = blacklistResult.reason;
                    auditEntry.layer = 'blacklist';
                    auditEntry.severity = blacklistResult.severity;
                    if (enabledLayers.includes('audit')) {
                        await this.auditLogger.log(auditEntry);
                    }
                    throw new Error(`[黑名单] ${blacklistResult.reason}`);
                }
            }
            
            // 第二层：白名单验证
            if (enabledLayers.includes('whitelist')) {
                const whitelistResult = this.whitelistValidator.validate(command);
                auditEntry.layers.push({ name: 'whitelist', result: whitelistResult });
                if (!whitelistResult.passed) {
                    auditEntry.status = 'blocked';
                    auditEntry.reason = whitelistResult.reason;
                    auditEntry.layer = 'whitelist';
                    auditEntry.severity = whitelistResult.severity;
                    if (enabledLayers.includes('audit')) {
                        await this.auditLogger.log(auditEntry);
                    }
                    throw new Error(`[白名单] ${whitelistResult.reason}`);
                }
            }
            
            // 第三层：AST 语义分析
            if (enabledLayers.includes('ast')) {
                const astResult = this.astAnalyzer.analyze(command);
                auditEntry.layers.push({ name: 'ast', result: astResult });
                if (!astResult.passed) {
                    auditEntry.status = 'blocked';
                    auditEntry.reason = astResult.risks.map(r => r.description).join('; ');
                    auditEntry.layer = 'ast';
                    auditEntry.severity = 'critical';
                    if (enabledLayers.includes('audit')) {
                        await this.auditLogger.log(auditEntry);
                    }
                    throw new Error(`[AST分析] ${auditEntry.reason}`);
                }
            }
            
            // 执行命令
            let execResult;
            const timeout = options.timeout || parseInt(process.env.TIMEOUT_MS) || 30000;
            
            if (hostConfig.type === 'ssh') {
                // SSH 远程执行
                const manager = getSSHManager();
                if (!manager) {
                    throw new Error('SSH 模块未加载，无法执行远程命令');
                }
                execResult = await manager.execute(hostId, command, { timeout });
            } else {
                // 本地执行（可选沙箱）
                if (enabledLayers.includes('sandbox')) {
                    execResult = await this.sandboxManager.execute(command, {
                        timeout,
                        memory: options.memory || '256m',
                        cpus: options.cpus || '0.5'
                    });
                } else {
                    execResult = await this.sandboxManager.executeDirectly(command, { timeout });
                }
            }
            
            auditEntry.status = 'success';
            auditEntry.duration = Date.now() - startTime;
            auditEntry.outputLength = execResult.stdout.length;
            
            if (enabledLayers.includes('audit')) {
                await this.auditLogger.log(auditEntry);
            }
            
            // 获取 SSH 调试日志
            const manager = getSSHManager();
            const debugLogs = manager ? manager.getAndClearDebugLogs() : [];
            
            return {
                status: 'success',
                result: execResult.stdout,
                stderr: execResult.stderr,
                code: execResult.code,
                duration: auditEntry.duration,
                hostId,
                securityLevel,
                executionType: hostConfig.type,
                debugLogs: debugLogs.length > 0 ? debugLogs : undefined
            };
            
        } catch (error) {
            if (auditEntry.status === 'pending') {
                auditEntry.status = 'failed';
                auditEntry.error = error.message;
                auditEntry.duration = Date.now() - startTime;
                if (enabledLayers.includes('audit')) {
                    await this.auditLogger.log(auditEntry);
                }
            }
            
            throw error;
        }
    }
    
    /**
     * 断开所有 SSH 连接
     */
    async disconnectAll() {
        const manager = getSSHManager();
        if (manager) {
            await manager.disconnectAll();
        }
    }
}

// ============================================
// 主入口
// ============================================
async function main() {
    console.error('[LinuxShellExecutor] 插件启动...');
    
    const executor = new LinuxShellExecutor();
    await executor.init();
    
    console.error('[LinuxShellExecutor] 等待输入...');
    
    let input = '';
    
    // 设置输入超时（5秒内没有输入则报错）
    const inputTimeout = setTimeout(() => {
        console.error('[LinuxShellExecutor] 输入超时，未收到任何数据');
        console.log(JSON.stringify({
            status: 'error',
            error: '插件输入超时，未收到参数数据'
        }));
        process.exit(1);
    }, 5000);
    
    process.stdin.on('data', chunk => {
        clearTimeout(inputTimeout);
        input += chunk;
        console.error(`[LinuxShellExecutor] 收到输入: ${input.substring(0, 100)}...`);
    });
    
    process.stdin.on('end', async () => {
        console.error('[LinuxShellExecutor] 输入结束，开始处理...');
        try {
            const args = JSON.parse(input);
            
            // 特殊命令处理
            if (args.action === 'listHosts') {
                console.log(JSON.stringify({ status: 'success', hosts: executor.listHosts() }));
                process.exit(0);
                return;
            }
            
            if (args.action === 'testConnection') {
                const result = await executor.testConnection(args.hostId || 'local');
                // 获取调试日志
                const manager = getSSHManager();
                const debugLogs = manager ? manager.getAndClearDebugLogs() : [];
                console.log(JSON.stringify({
                    status: 'success',
                    ...result,
                    debugLogs: debugLogs.length > 0 ? debugLogs : undefined
                }));
                // 断开连接并退出
                await executor.disconnectAll();
                process.exit(0);
                return;
            }
            
            if (args.action === 'getStatus') {
                console.log(JSON.stringify({ status: 'success', connections: executor.getConnectionStatus() }));
                process.exit(0);
                return;
            }
            
            // 执行命令
            if (!args.command) {
                throw new Error('缺少必需参数: command');
            }
            
            const result = await executor.execute(args.command, {
                hostId: args.hostId,
                timeout: args.timeout,
                securityLevel: args.securityLevel,
                memory: args.memory,
                cpus: args.cpus
            });
            
            console.log(JSON.stringify(result));
            
            // 清理连接并退出
            await executor.disconnectAll();
            process.exit(0);
            
        } catch (error) {
            // 获取调试日志（即使出错也要返回）
            const manager = getSSHManager();
            const debugLogs = manager ? manager.getAndClearDebugLogs() : [];
            
            // 重要：使用 console.log 而不是 console.error，因为 VCP 从 stdout 读取结果
            console.log(JSON.stringify({
                status: 'error',
                error: error.message,
                debugLogs: debugLogs.length > 0 ? debugLogs : undefined
            }));
            process.exit(1);
        }
    });
}

main();