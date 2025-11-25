// ==UserScript==
// @name           OpenWebUI VCP Tool Call Display Enhancer
// @version        2.1.1
// @description    Uses a global "Pending Set" to track unfinished tool calls. Any stream update anywhere on the page triggers a check on pending items, ensuring previous blocks render immediately upon completion.
// @author         B3000Kcn
// @match          https://your.openwebui.url/*
// @run-at         document-idle
// @grant          GM_addStyle
// @license        MIT
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // 1. 样式配置 (零间隙版)
    // ==========================================
    function addStyle(css) {
        if (typeof GM_addStyle !== 'undefined') {
            GM_addStyle(css);
        } else {
            const style = document.createElement('style');
            style.textContent = css;
            document.head.appendChild(style);
        }
    }

    const CARD_CLASS = "vcp-tool-card";
    const HIDDEN_CLASS = "vcp-display-none";

    const CSS_RULES = `
        .${HIDDEN_CLASS} {
            display: none !important;
        }
        .${CARD_CLASS} {
            all: initial;
            display: block;
            font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            margin: 8px 0 !important;
            overflow: hidden;
            background-color: #ffffff;
            box-shadow: 0 2px 4px rgba(0,0,0,0.04);
            width: 100%;
            box-sizing: border-box;
            position: relative;
            z-index: 1;
        }
        .dark .${CARD_CLASS} {
            background-color: #1a1a1a;
            border-color: #333;
        }

        /* Header */
        .${CARD_CLASS} .vcp-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 12px !important;
            background-color: #f9fafb;
            border-bottom: 1px solid #e5e7eb;
            height: 36px;
            min-height: 36px;
            box-sizing: border-box;
        }
        .dark .${CARD_CLASS} .vcp-header {
            background-color: #262626;
            border-color: #333;
        }
        .${CARD_CLASS} .vcp-title {
            font-size: 0.85rem;
            font-weight: 400;
            color: #6b7280;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .dark .${CARD_CLASS} .vcp-title { color: #9ca3af; }
        .${CARD_CLASS} .vcp-name-text {
            font-weight: 700;
            color: #1f2937;
        }
        .dark .${CARD_CLASS} .vcp-name-text { color: #e5e7eb; }

        /* Button */
        .${CARD_CLASS} .vcp-btn {
            padding: 1px 8px;
            font-size: 0.75rem;
            border-radius: 4px;
            border: 1px solid #d1d5db;
            background: white;
            cursor: pointer;
            color: #4b5563;
            transition: all 0.2s;
        }
        .dark .${CARD_CLASS} .vcp-btn {
            background: #000;
            border-color: #444;
            color: #aaa;
        }
        .${CARD_CLASS} .vcp-btn:hover { background: #f3f4f6; color: #000; }
        .dark .${CARD_CLASS} .vcp-btn:hover { background: #333; color: #fff; }

        /* Body */
        .${CARD_CLASS} .vcp-body {
            display: block;
            padding: 0 !important;
            margin: 0 !important;
            background-color: #fff;
        }
        .dark .${CARD_CLASS} .vcp-body {
            background-color: #0d0d0d;
        }

        /* === Flush Table Layout === */
        .${CARD_CLASS} .vcp-table-grid {
            display: grid;
            grid-template-columns: max-content 1fr;
            width: 100%;
            font-family: "Menlo", "Monaco", "Consolas", monospace !important;
            font-size: 0.85rem !important;
            line-height: 1.45 !important;
            color: #374151;
            gap: 0 !important;
            padding: 0 !important;
        }
        .dark .${CARD_CLASS} .vcp-table-grid { color: #d1d5db; }

        /* Key Cell */
        .${CARD_CLASS} .vcp-key {
            text-align: right;
            font-weight: 700;
            color: #4b5563;
            padding: 4px 12px;
            border-bottom: 1px solid #f3f4f6;
            border-right: 1px solid #f3f4f6;
            white-space: nowrap;
            background-color: #fafafa;
        }
        .dark .${CARD_CLASS} .vcp-key {
            color: #9ca3af;
            background-color: #141414;
            border-bottom-color: #262626;
            border-right-color: #262626;
        }

        /* Value Cell */
        .${CARD_CLASS} .vcp-val {
            text-align: left;
            padding: 4px 12px 4px 10px;
            border-bottom: 1px solid #f3f4f6;
            white-space: pre-wrap;
            word-break: break-word;
            color: #111827;
        }
        .dark .${CARD_CLASS} .vcp-val {
            color: #e5e7eb;
            border-bottom-color: #262626;
        }

        .${CARD_CLASS} .vcp-key:last-of-type,
        .${CARD_CLASS} .vcp-val:last-of-type {
            border-bottom: none !important;
        }

        /* Full Row */
        .${CARD_CLASS} .vcp-full {
            grid-column: 1 / -1;
            padding: 2px 12px;
            color: #9ca3af;
            font-size: 0.8em;
            border-bottom: 1px solid transparent;
        }

        /* Status */
        .${CARD_CLASS} .vcp-status-running {
            font-style: italic;
            color: #9ca3af;
            padding: 12px;
            font-family: monospace;
        }
    `;

    // ==========================================
    // 2. 常量
    // ==========================================
    const START_MARKER = "<<<[TOOL_REQUEST]>>>";
    const END_MARKER = "<<<[END_TOOL_REQUEST]>>>";

    const pendingStates = new Set();
    const processedElements = new WeakMap();

    // ==========================================
    // 3. 核心工具
    // ==========================================
    function extractTextFromHTML(html) {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const brs = temp.querySelectorAll('br');
        brs.forEach(br => br.replaceWith('\n'));
        const blocks = temp.querySelectorAll('div, p, tr, li');
        blocks.forEach(blk => {
            blk.after(document.createTextNode('\n'));
        });
        return temp.textContent;
    }

    function parseToolName(text) {
        const match = text.match(/tool_name:\s*「始」(.*?)「末」/);
        return match ? match[1].trim() : "Processing...";
    }

    /**
     * [CRASH FIX] 积极检测是否处于代码块或高亮容器中
     * 这种情况下绝对不能修改DOM，否则会引起框架无限渲染循环
     */
    function isInsideCodeBlock(element) {
        let el = element;
        while (el && el !== document.body) {
            const tag = el.tagName;
            // 1. 显式标签检查
            if (tag === 'PRE' || tag === 'CODE' || tag === 'XMP') return true;

            // 2. 常见高亮类名检查
            if (el.classList) {
                if (el.classList.contains('hljs') || el.classList.contains('prism') || el.classList.contains('code-block')) return true;
                // 检查 language-* 类
                for (let i = 0; i < el.classList.length; i++) {
                    if (el.classList[i].startsWith('language-')) return true;
                }
            }
            el = el.parentElement;
        }
        return false;
    }

    // ==========================================
    // 4. UI 构建
    // ==========================================
    function createCardDOM() {
        const container = document.createElement('div');
        container.className = CARD_CLASS;
        container.innerHTML = `
            <div class="vcp-header">
                <div class="vcp-title">
                    <span style="font-size:1.1em; line-height:1; margin-right:6px;">⚙️</span>
                    <span>VCP Tool Call: </span>
                    <span class="vcp-name-text" style="margin-left: 4px;"></span>
                </div>
                <div>
                    <button class="vcp-btn copy-btn" style="display:none">Copy</button>
                </div>
            </div>
            <div class="vcp-body">
                <div class="vcp-table-grid vcp-status-running">Running...</div>
            </div>
        `;
        return {
            container,
            titleText: container.querySelector('.vcp-name-text'),
            gridContainer: container.querySelector('.vcp-table-grid'),
            copyBtn: container.querySelector('.copy-btn')
        };
    }

    // ==========================================
    // 5. 渲染逻辑
    // ==========================================
    function renderTable(container, text) {
        container.innerHTML = '';
        container.classList.remove('vcp-status-running');

        const lines = text.split('\n');

        lines.forEach(line => {
            if (!line.trim()) return;
            const match = line.match(/^(\s*)([^:]+?)(:\s+)(.*)$/);
            if (match) {
                const [_, indent, key, sep, value] = match;
                const keyDiv = document.createElement('div');
                keyDiv.className = 'vcp-key';
                keyDiv.textContent = key;
                const valDiv = document.createElement('div');
                valDiv.className = 'vcp-val';
                valDiv.textContent = value;
                container.appendChild(keyDiv);
                container.appendChild(valDiv);
            } else {
                const fullDiv = document.createElement('div');
                fullDiv.className = 'vcp-full';
                fullDiv.textContent = line;
                container.appendChild(fullDiv);
            }
        });
    }

    function checkAndRenderState(state) {
        // 防止处理已断开的节点
        if (!state.targetParent.isConnected) return false;

        const rawTextContent = state.targetParent.textContent || "";
        if (!rawTextContent.includes(END_MARKER)) return false;

        const rawHTML = state.targetParent.innerHTML;
        const fullFormattedText = extractTextFromHTML(rawHTML);

        let cleanContent = fullFormattedText;
        const sIdx = fullFormattedText.indexOf(START_MARKER);
        const eIdx = fullFormattedText.lastIndexOf(END_MARKER);

        if (sIdx !== -1 && eIdx !== -1 && eIdx > sIdx) {
            cleanContent = fullFormattedText.substring(sIdx + START_MARKER.length, eIdx);
        }

        cleanContent = cleanContent.replace(/^\s*tool_name:\s*「始」[\s\S]*?「末」\s*,?\s*(\n|$)/i, "");
        cleanContent = cleanContent.split('\n').map(line => {
            let l = line.replace("「始」", " ");
            const lastEndIndex = l.lastIndexOf("「末」");
            if (lastEndIndex !== -1) {
                l = l.substring(0, lastEndIndex);
            }
            return l;
        }).join('\n');

        cleanContent = cleanContent.trim();
        const toolName = parseToolName(fullFormattedText);
        state.dom.titleText.textContent = toolName;
        renderTable(state.dom.gridContainer, cleanContent);

        state.dom.copyBtn.style.display = 'inline-flex';
        state.dom.copyBtn.onclick = async (e) => {
            e.stopPropagation();
            try {
                await navigator.clipboard.writeText(cleanContent);
                const originalText = state.dom.copyBtn.textContent;
                state.dom.copyBtn.textContent = 'Copied';
                state.dom.copyBtn.disabled = true;
                setTimeout(() => {
                    if (state.dom.copyBtn.isConnected) {
                        state.dom.copyBtn.textContent = originalText;
                        state.dom.copyBtn.disabled = false;
                    }
                }, 2000);
            } catch (err) {}
        };

        return true;
    }

    function processTarget(parent) {
        if (!parent.isConnected) return;
        if (processedElements.has(parent)) return;

        const tag = parent.tagName;
        if (['TEXTAREA', 'INPUT', 'SCRIPT', 'STYLE'].includes(tag)) return;
        if (parent.classList.contains(CARD_CLASS)) return;

        // ==========================================
        // [ULTRA CRASH FIX]
        // 1. 如果检测到任何代码块迹象，立刻放弃。
        // 2. 如果文本内容包含Markdown代码栅栏，也放弃（可能是尚未渲染的源码）。
        // ==========================================
        if (isInsideCodeBlock(parent)) return;

        // 额外的文本安全检查：如果包含 ``` 且我们还没确定它是代码块，最好也不要动
        // 因为它可能马上就会变成一个 <pre>
        // if (parent.textContent.includes('```')) return; // 可选，如果误杀太严重可注释掉

        const hasBlockChildren = Array.from(parent.children).some(child => {
            if (child.classList.contains(CARD_CLASS)) return false;
            return ['DIV', 'P', 'PRE', 'BLOCKQUOTE', 'UL', 'OL', 'TABLE'].includes(child.tagName);
        });
        if (hasBlockChildren) return;

        if (!parent.textContent.includes(START_MARKER)) return;

        // 执行DOM修改
        const dom = createCardDOM();

        // 双重检查：在插入前最后一刻，确认父级依然没有变成代码块
        if (isInsideCodeBlock(parent)) return;

        parent.parentNode.insertBefore(dom.container, parent);
        parent.classList.add(HIDDEN_CLASS);

        const state = {
            dom: dom,
            targetParent: parent
        };

        processedElements.set(parent, state);
        pendingStates.add(state);

        if (checkAndRenderState(state)) {
            pendingStates.delete(state);
        }
    }

    // ==========================================
    // 6. 全局监听
    // ==========================================
    function init() {
        console.log('OpenWebUI VCP Enhancer (v44.0.2 Ultra Crash Fix) Activated');
        addStyle(CSS_RULES);

        const observer = new MutationObserver(mutations => {
            // 处理挂起的渲染更新
            if (pendingStates.size > 0) {
                pendingStates.forEach(state => {
                    // 如果元素被移除了，停止处理
                    if (!state.targetParent.isConnected) {
                        pendingStates.delete(state);
                        return;
                    }
                    if (checkAndRenderState(state)) {
                        pendingStates.delete(state);
                    }
                });
            }

            const parentsToCheck = new Set();

            for (const m of mutations) {
                // 性能优化：忽略我们自己创建的卡片的变动
                if (m.target.classList && m.target.classList.contains(CARD_CLASS)) continue;
                if (m.target.closest && m.target.closest(`.${CARD_CLASS}`)) continue;

                if (m.type === 'characterData') {
                    if (m.target.parentNode) parentsToCheck.add(m.target.parentNode);
                }
                else if (m.type === 'childList') {
                    // 如果变动发生在代码块内部，直接忽略整个变动
                    if (isInsideCodeBlock(m.target)) continue;

                    parentsToCheck.add(m.target);
                    m.addedNodes.forEach(n => {
                        // 如果新增节点本身就是代码块，忽略
                        if (n.nodeType === Node.ELEMENT_NODE && isInsideCodeBlock(n)) return;

                        if (n.nodeType === Node.TEXT_NODE && n.nodeValue.includes(START_MARKER)) {
                            if (n.parentNode) parentsToCheck.add(n.parentNode);
                        }
                        else if (n.nodeType === Node.ELEMENT_NODE) {
                            // 深度检查前，先确认不是代码块
                            if (n.textContent.includes(START_MARKER)) {
                                const walker = document.createTreeWalker(n, NodeFilter.SHOW_TEXT, null, false);
                                let tn;
                                while (tn = walker.nextNode()) {
                                    if (tn.nodeValue.includes(START_MARKER)) {
                                        if (tn.parentNode) parentsToCheck.add(tn.parentNode);
                                    }
                                }
                            }
                        }
                    });
                }
            }

            parentsToCheck.forEach(p => {
                if (p && p.nodeType === Node.ELEMENT_NODE) processTarget(p);
            });
        });

        // 观察整个body
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });

        // 初始扫描
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let tn;
        while (tn = walker.nextNode()) {
            if (tn.nodeValue.includes(START_MARKER)) {
                if (tn.parentNode) processTarget(tn.parentNode);
            }
        }
    }

    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init, { once: true });
    }

})();
