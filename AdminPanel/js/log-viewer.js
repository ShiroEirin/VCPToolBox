// AdminPanel/js/log-viewer.js
import { apiFetch, showMessage } from './utils.js';

const API_BASE_URL = '/admin_api';

/**
 * 增量日志查看器类
 */
class IncrementalLogViewer {
    constructor() {
        this.lastOffset = 0;           // 上次读取的文件位置
        this.logLines = [];             // 所有日志行缓存
        this.maxLines = 5000;           // 最大保留行数（防内存溢出）
        this.intervalId = null;
        this.isLoading = false;
        this.currentFilter = '';
        this.userScrolling = false;     // 用户是否在滚动中
        this.scrollTimeout = null;
        
        // DOM 元素缓存
        this.elements = {};
    }

    /**
     * 初始化查看器
     */
    async initialize() {
        console.log('Initializing Incremental Log Viewer...');
        this.stop(); // 清理旧的定时器
        this.cacheElements();
        this.setupEventListeners();
        this.reset();
        
        this.showStatus('正在加载日志...', 'info');
        await this.loadFull(); // 首次完整加载
        this.startAutoRefresh();
    }

    /**
     * 缓存 DOM 元素引用
     */
    cacheElements() {
        this.elements = {
            content: document.getElementById('server-log-content'),
            status: document.getElementById('server-log-status'),
            path: document.getElementById('server-log-path-display'),
            filter: document.getElementById('server-log-filter'),
            copyBtn: document.getElementById('copy-server-log-button'),
            lineCount: document.getElementById('server-log-line-count'),
        };
    }

    /**
     * 重置状态
     */
    reset() {
        this.lastOffset = 0;
        this.logLines = [];
        this.currentFilter = '';
        
        if (this.elements.content) {
            this.elements.content.textContent = '';
        }
        if (this.elements.filter) {
            this.elements.filter.value = '';
        }
    }

    /**
     * 设置事件监听器
     */
    setupEventListeners() {
        const { content, filter, copyBtn } = this.elements;

        // 复制按钮
        if (copyBtn && !copyBtn.dataset.listenerAttached) {
            copyBtn.addEventListener('click', () => this.copyToClipboard());
            copyBtn.dataset.listenerAttached = 'true';
        }

        // 过滤输入（防抖）
        if (filter && !filter.dataset.listenerAttached) {
            let debounceTimer;
            filter.addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    this.currentFilter = e.target.value.trim().toLowerCase();
                    this.applyFilter();
                }, 150);
            });
            filter.dataset.listenerAttached = 'true';
        }

        // 监听用户滚动行为
        if (content && !content.dataset.scrollListenerAttached) {
            content.addEventListener('scroll', () => {
                this.userScrolling = true;
                clearTimeout(this.scrollTimeout);
                this.scrollTimeout = setTimeout(() => {
                    this.userScrolling = false;
                }, 1000);
            });
            content.dataset.scrollListenerAttached = 'true';
        }
    }

    /**
     * 完整加载日志（首次或重置时）
     */
    async loadFull() {
        if (this.isLoading) return;
        this.isLoading = true;

        try {
            const data = await apiFetch(`${API_BASE_URL}/server-log`);
            const content = data.content || '';
            
            this.lastOffset = data.offset || content.length;
            this.logLines = content.split('\n');
            
            // 限制行数
            if (this.logLines.length > this.maxLines) {
                this.logLines = this.logLines.slice(-this.maxLines);
            }

            this.updatePathDisplay(data.path);
            this.renderLog();
            this.showStatus('日志已加载', 'success');
            this.scrollToBottomIfNeeded(true); // 首次加载强制滚动到底部

        } catch (error) {
            this.showStatus(`加载失败: ${error.message}`, 'error');
            if (this.elements.content) {
                this.elements.content.textContent = `加载日志失败: ${error.message}`;
            }
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * 增量加载日志
     */
    async loadIncremental() {
        if (this.isLoading) return;
        this.isLoading = true;

        try {
            const data = await apiFetch(
                `${API_BASE_URL}/server-log?offset=${this.lastOffset}&incremental=true`
            );

            // 检查是否需要完整重新加载（日志轮转等情况）
            if (data.needFullReload) {
                console.log('Log file rotated, performing full reload...');
                this.isLoading = false;
                return this.loadFull();
            }

            const newContent = data.content || '';
            if (newContent.length === 0) {
                // 无新内容，只更新状态
                this.showStatus('日志已是最新', 'success');
                return;
            }

            // 有新内容，追加到日志
            this.lastOffset = data.offset || (this.lastOffset + newContent.length);
            const newLines = newContent.split('\n').filter(line => line.length > 0);
            
            if (newLines.length > 0) {
                this.appendLines(newLines);
                this.showStatus(`已追加 ${newLines.length} 行新日志`, 'success');
            }

        } catch (error) {
            console.error('Incremental load failed:', error);
            // 增量失败不显示错误，下次重试
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * 追加新日志行（核心优化：增量 DOM 更新）
     */
    appendLines(newLines) {
        const { content } = this.elements;
        if (!content) return;

        // 更新内部缓存
        this.logLines.push(...newLines);
        
        // 超过最大行数时裁剪
        if (this.logLines.length > this.maxLines) {
            const removeCount = this.logLines.length - this.maxLines;
            this.logLines.splice(0, removeCount);
            // 需要重新渲染整个内容
            this.renderLog();
            return;
        }

        // 增量 DOM 更新（无闪烁核心）
        if (this.currentFilter) {
            // 有过滤条件时，只追加匹配的行
            this.appendFilteredLines(newLines);
        } else {
            // 无过滤条件，直接追加
            this.appendToDOM(newLines);
        }

        this.updateLineCount();
        this.scrollToBottomIfNeeded();
    }

    /**
     * 直接追加内容到 DOM（使用 DocumentFragment 减少重排）
     */
    appendToDOM(lines) {
        const { content } = this.elements;
        if (!content || lines.length === 0) return;

        // 使用 requestAnimationFrame 确保在下一帧渲染
        requestAnimationFrame(() => {
            const fragment = document.createDocumentFragment();
            
            // 如果已有内容，先添加换行
            if (content.textContent.length > 0) {
                fragment.appendChild(document.createTextNode('\n'));
            }
            
            fragment.appendChild(document.createTextNode(lines.join('\n')));
            content.appendChild(fragment);
        });
    }

    /**
     * 追加过滤后的行
     */
    appendFilteredLines(newLines) {
        const { content } = this.elements;
        if (!content) return;

        const matchedLines = newLines.filter(line => 
            line.toLowerCase().includes(this.currentFilter)
        );

        if (matchedLines.length === 0) return;

        requestAnimationFrame(() => {
            const fragment = document.createDocumentFragment();
            
            if (content.innerHTML.length > 0) {
                fragment.appendChild(document.createTextNode('\n'));
            }

            matchedLines.forEach((line, index) => {
                if (index > 0) {
                    fragment.appendChild(document.createTextNode('\n'));
                }
                fragment.appendChild(this.createHighlightedLine(line));
            });

            content.appendChild(fragment);
        });
    }

    /**
     * 创建高亮的行元素
     */
    createHighlightedLine(line) {
        const span = document.createElement('span');
        const escapedFilter = this.currentFilter.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(${escapedFilter})`, 'gi');
        
        span.innerHTML = line.replace(regex, (match) => `<mark class="highlight">${match}</mark>`);
        return span;
    }

    /**
     * 完整渲染日志（首次加载或过滤变化时）
     */
    renderLog() {
        const { content } = this.elements;
        if (!content) return;

        requestAnimationFrame(() => {
            if (this.currentFilter) {
                this.renderFilteredLog();
            } else {
                // 直接使用 textContent，比 innerHTML 快且安全
                content.textContent = this.logLines.join('\n');
            }
            this.updateLineCount();
        });
    }

    /**
     * 渲染过滤后的日志
     */
    renderFilteredLog() {
        const { content, filter } = this.elements;
        if (!content) return;

        const matchedLines = [];
        const escapedFilter = this.currentFilter.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(escapedFilter, 'gi');

        for (const line of this.logLines) {
            if (line.toLowerCase().includes(this.currentFilter)) {
                matchedLines.push(
                    line.replace(regex, (match) => `<mark class="highlight">${match}</mark>`)
                );
            }
        }

        if (matchedLines.length > 0) {
            content.innerHTML = matchedLines.join('\n');
        } else {
            content.textContent = `未找到包含 "${filter.value}" 的日志`;
        }
    }

    /**
     * 应用过滤器
     */
    applyFilter() {
        this.renderLog();
        // 过滤后不自动滚动，让用户看到结果开头
    }

    /**
     * 智能滚动到底部
     */
    scrollToBottomIfNeeded(force = false) {
        const { content } = this.elements;
        if (!content) return;

        // 如果用户正在滚动查看历史，不要打断
        if (this.userScrolling && !force) return;

        // 检查是否已经接近底部
        const isNearBottom = content.scrollHeight - content.scrollTop - content.clientHeight < 100;
        
        if (force || isNearBottom) {
            requestAnimationFrame(() => {
                content.scrollTop = content.scrollHeight;
            });
        }
    }

    /**
     * 显示状态信息
     */
    showStatus(message, type) {
        const { status } = this.elements;
        if (!status) return;
        
        status.textContent = message;
        status.className = `status-message ${type}`;
    }

    /**
     * 更新路径显示
     */
    updatePathDisplay(path) {
        const { path: pathEl } = this.elements;
        if (pathEl) {
            pathEl.textContent = `当前日志文件: ${path || '未知'}`;
        }
    }

    /**
     * 更新行数显示
     */
    updateLineCount() {
        const { lineCount } = this.elements;
        if (!lineCount) return;

        const total = this.logLines.length;
        if (this.currentFilter) {
            const filtered = this.logLines.filter(line => 
                line.toLowerCase().includes(this.currentFilter)
            ).length;
            lineCount.textContent = `${filtered} / ${total} 行`;
        } else {
            lineCount.textContent = `${total} 行`;
        }
    }

    /**
     * 开始自动刷新
     */
    startAutoRefresh() {
        if (this.intervalId) return;
        
        this.intervalId = setInterval(() => {
            this.loadIncremental();
        }, 2000);
        
        console.log('Started incremental log refresh.');
    }

    /**
     * 停止自动刷新
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('Log viewer stopped.');
        }
    }

    /**
     * 获取原始日志内容
     */
    getFullContent() {
        return this.logLines.join('\n');
    }

    /**
     * 复制日志到剪贴板
     */
    async copyToClipboard() {
        const content = this.currentFilter 
            ? this.logLines.filter(l => l.toLowerCase().includes(this.currentFilter)).join('\n')
            : this.getFullContent();

        if (!content) {
            showMessage('没有可复制的内容', 'info');
            return;
        }

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(content);
            } else {
                // Fallback
                const textarea = document.createElement('textarea');
                textarea.value = content;
                textarea.style.cssText = 'position:fixed;opacity:0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            
            showMessage('日志已复制到剪贴板', 'success');
            this.showStatus('已复制!', 'success');
            setTimeout(() => this.showStatus('日志已是最新', 'success'), 2000);
            
        } catch (err) {
            console.error('复制失败:', err);
            showMessage('复制失败，请手动选择复制', 'error');
        }
    }
}

// 单例实例
const logViewer = new IncrementalLogViewer();

/**
 * 导出的初始化函数
 */
export async function initializeServerLogViewer() {
    await logViewer.initialize();
}

/**
 * 导出的停止函数
 */
export function stopServerLogUpdates() {
    logViewer.stop();
}