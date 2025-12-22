/**
 * AnomalyDetector - 异常检测引擎
 *
 * 支持三种规则类型：
 * - regex: 正则表达式匹配
 * - keyword: 关键词匹配
 * - threshold: 阈值检测（从日志中提取数值）
 *
 * 特性：
 * - 冷却机制（避免告警风暴）
 * - 规则优先级
 * - 任务级别规则隔离
 *
 * @version 1.1.0
 */

class AnomalyDetector {
    constructor() {
        // 全局规则（所有任务共享）
        this.globalRules = new Map();
        
        // 任务级别规则 Map<taskId, Map<ruleName, rule>>
        this.taskRules = new Map();
        
        // 冷却状态 Map<ruleKey, lastTriggerTime>
        this.cooldownState = new Map();
        
        // 自定义规则（用于持久化）
        this.customRules = [];
    }
    
    /**
     * 添加规则
     * @param {Object} rule - 规则配置
     * @param {string} rule.name - 规则名称
     * @param {string} rule.type - 规则类型 (regex|keyword|threshold)
     * @param {string} rule.pattern - 匹配模式
     * @param {string} rule.severity - 严重级别 (info|warning|critical)
     * @param {number} rule.cooldown - 冷却时间（毫秒）
     * @param {string} rule.operator - 阈值操作符 (>|>=|<|<=|==|!=)
     * @param {number} rule.threshold - 阈值
     * @param {string} taskId - 任务 ID（可选，不提供则为全局规则）
     * @returns {Object} 添加的规则
     */
    addRule(rule, taskId = null) {
        // 验证规则
        this._validateRule(rule);
        
        // 编译规则
        const compiledRule = this._compileRule(rule);
        
        if (taskId) {
            // 任务级别规则
            if (!this.taskRules.has(taskId)) {
                this.taskRules.set(taskId, new Map());
            }
            this.taskRules.get(taskId).set(rule.name, compiledRule);
        } else {
            // 全局规则
            this.globalRules.set(rule.name, compiledRule);
            
            // 如果不是默认规则，添加到自定义规则列表
            if (!rule.isDefault) {
                this.customRules.push(rule);
            }
        }
        
        return compiledRule;
    }
    
    /**
     * 移除任务级别规则
     * @param {string} taskId
     */
    removeTaskRules(taskId) {
        this.taskRules.delete(taskId);
        
        // 清理相关冷却状态
        for (const key of this.cooldownState.keys()) {
            if (key.startsWith(`${taskId}:`)) {
                this.cooldownState.delete(key);
            }
        }
    }
    
    /**
     * 检测日志行中的异常
     * @param {string} line - 日志行
     * @param {string} taskId - 任务 ID
     * @returns {Array} 检测到的异常列表
     */
    detect(line, taskId) {
        const anomalies = [];
        const now = Date.now();
        
        // 获取适用的规则
        const rules = this._getRulesForTask(taskId);
        
        for (const rule of rules) {
            // 检查冷却
            const cooldownKey = `${taskId}:${rule.name}`;
            const lastTrigger = this.cooldownState.get(cooldownKey);
            
            if (lastTrigger && (now - lastTrigger) < rule.cooldown) {
                continue; // 仍在冷却中
            }
            
            // 执行检测
            const result = this._matchRule(rule, line);
            
            if (result.matched) {
                // 更新冷却状态
                this.cooldownState.set(cooldownKey, now);
                
                anomalies.push({
                    rule: rule.name,
                    type: rule.type,
                    severity: rule.severity,
                    description: rule.description || `匹配规则: ${rule.name}`,
                    extractedValue: result.extractedValue,
                    matchedText: result.matchedText
                });
            }
        }
        
        return anomalies;
    }
    
    /**
     * 列出所有规则
     * @returns {Object}
     */
    listRules() {
        const global = [];
        const byTask = {};
        
        for (const [name, rule] of this.globalRules) {
            global.push({
                name,
                type: rule.type,
                pattern: rule.originalPattern,
                severity: rule.severity,
                cooldown: rule.cooldown,
                description: rule.description
            });
        }
        
        for (const [taskId, rules] of this.taskRules) {
            byTask[taskId] = [];
            for (const [name, rule] of rules) {
                byTask[taskId].push({
                    name,
                    type: rule.type,
                    pattern: rule.originalPattern,
                    severity: rule.severity,
                    cooldown: rule.cooldown,
                    description: rule.description
                });
            }
        }
        
        return { global, byTask };
    }
    
    /**
     * 获取规则数量
     * @returns {Object}
     */
    getRulesCount() {
        let taskRulesCount = 0;
        for (const rules of this.taskRules.values()) {
            taskRulesCount += rules.size;
        }
        
        return {
            global: this.globalRules.size,
            task: taskRulesCount,
            total: this.globalRules.size + taskRulesCount
        };
    }
    
    /**
     * 获取自定义规则
     * @returns {Array}
     */
    getCustomRules() {
        return [...this.customRules];
    }
    
    // ==================== 私有方法 ====================
    
    /**
     * 验证规则
     */
    _validateRule(rule) {
        if (!rule.name) {
            throw new Error('规则缺少 name 字段');
        }
        
        if (!rule.type) {
            throw new Error('规则缺少 type 字段');
        }
        
        if (!['regex', 'keyword', 'threshold'].includes(rule.type)) {
            throw new Error(`不支持的规则类型: ${rule.type}`);
        }
        
        if (!rule.pattern) {
            throw new Error('规则缺少 pattern 字段');
        }
        
        if (rule.type === 'threshold') {
            if (!rule.operator) {
                throw new Error('threshold 类型规则需要 operator 字段');
            }
            if (rule.threshold === undefined) {
                throw new Error('threshold 类型规则需要 threshold 字段');
            }
        }
    }
    
    /**
     * 编译规则
     */
    _compileRule(rule) {
        const compiled = {
            name: rule.name,
            type: rule.type,
            originalPattern: rule.pattern,
            severity: rule.severity || 'warning',
            cooldown: rule.cooldown || 60000,
            description: rule.description || '',
            operator: rule.operator,
            threshold: rule.threshold
        };
        
        // 编译正则表达式
        switch (rule.type) {
            case 'regex':
                try {
                    compiled.compiledPattern = new RegExp(rule.pattern, 'i');
                } catch (error) {
                    throw new Error(`无效的正则表达式: ${rule.pattern}`);
                }
                break;
                
            case 'keyword':
                // 关键词转换为正则（转义特殊字符）
                const escaped = rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                compiled.compiledPattern = new RegExp(escaped, 'i');
                break;
                
            case 'threshold':
                // threshold 类型的 pattern 是用于提取数值的正则
                try {
                    compiled.compiledPattern = new RegExp(rule.pattern, 'i');
                } catch (error) {
                    throw new Error(`无效的正则表达式: ${rule.pattern}`);
                }
                break;
        }
        
        return compiled;
    }
    
    /**
     * 获取任务适用的规则
     */
    _getRulesForTask(taskId) {
        const rules = [];
        
        // 添加全局规则
        for (const rule of this.globalRules.values()) {
            rules.push(rule);
        }
        
        // 添加任务级别规则
        if (this.taskRules.has(taskId)) {
            for (const rule of this.taskRules.get(taskId).values()) {
                rules.push(rule);
            }
        }
        
        return rules;
    }
    
    /**
     * 匹配规则
     */
    _matchRule(rule, line) {
        switch (rule.type) {
            case 'regex':
            case 'keyword':
                const match = rule.compiledPattern.exec(line);
                if (match) {
                    return {
                        matched: true,
                        matchedText: match[0]
                    };
                }
                return { matched: false };
                
            case 'threshold':
                const thresholdMatch = rule.compiledPattern.exec(line);
                if (thresholdMatch && thresholdMatch[1]) {
                    const value = parseFloat(thresholdMatch[1]);
                    if (!isNaN(value)) {
                        const matched = this._evaluateThreshold(value, rule.operator, rule.threshold);
                        if (matched) {
                            return {
                                matched: true,
                                extractedValue: value,
                                matchedText: thresholdMatch[0]
                            };
                        }
                    }
                }
                return { matched: false };
                
            default:
                return { matched: false };
        }
    }
    
    /**
     * 评估阈值条件
     */
    _evaluateThreshold(value, operator, threshold) {
        switch (operator) {
            case '>':
                return value > threshold;
            case '>=':
                return value >= threshold;
            case '<':
                return value < threshold;
            case '<=':
                return value <= threshold;
            case '==':
                return value === threshold;
            case '!=':
                return value !== threshold;
            default:
                return false;
        }
    }
}

module.exports = AnomalyDetector;