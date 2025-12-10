// ==UserScript==
// @name           OpenWebUI VCP Tool Call Display Enhancer
// @version        3.9.8
// @description    同时支持（```VCPToolCall）代码块包裹的 ToolCall（完美）和裸露的 ToolCall（有 BUG），同时支持日记渲染。
// @author         B3000Kcn & FangTongtong
// @match          https://your.openwebui.url/*
// @run-at         document-idle
// @grant          GM_addStyle
// @require        https://cdn.jsdelivr.net/npm/marked@4.3.0/marked.min.js
// @license        MIT
// ==/UserScript==

(function() {
    'use strict';

    console.log('🚀 VCP Script v3.9.7 + 2.1.1 Fallback Injecting...');

    // ==========================================
    // 0. 共享常量 & 样式
    // ==========================================
    var CARD_CLASS      = "vcp-tool-card";
    var WRAPPER_CLASS   = "vcp-card-wrapper";
    var HIDDEN_CLASS    = "vcp-soft-hidden";      // 主引擎隐藏编辑器
    var JAILBREAK_CLASS = "vcp-jailbroken";       // 主引擎越狱外层容器

    // 兜底引擎自己的隐藏类（避免和 HIDDEN_CLASS 混用造成歧义）
    var FB_HIDDEN_CLASS = "vcp-display-none";

    var BORDER_LIGHT = "#e5e7eb";
    var BORDER_DARK  = "#262626";

    var CSS_RULES = [
        /* --- 主引擎: 结构修正 --- */
        "." + HIDDEN_CLASS + " { position: absolute !important; top: 0; left: 0; width: 100%; height: 100px; opacity: 0.001; pointer-events: none; z-index: -1; clip-path: inset(0 0 100% 0); }",
        "." + JAILBREAK_CLASS + " { border: none !important; background: transparent !important; box-shadow: none !important; padding: 0 !important; margin: 8px 0 !important; min-height: auto !important; }",
        "." + JAILBREAK_CLASS + " .language-VCPToolCall, ." + JAILBREAK_CLASS + " .language-DailyNote { margin: 0 !important; border-radius: 4px; overflow: visible; background: transparent; border: none; padding: 0 !important; min-height: auto; }",
        "." + JAILBREAK_CLASS + " > *:not(.language-VCPToolCall):not(.language-DailyNote) { display: none !important; }",
        "." + JAILBREAK_CLASS + " .language-VCPToolCall > *:not(." + WRAPPER_CLASS + "):not(div[id^='code-textarea-']), ." + JAILBREAK_CLASS + " .language-DailyNote > *:not(." + WRAPPER_CLASS + "):not(div[id^='code-textarea-']) { display: none !important; }",
        "." + WRAPPER_CLASS + " { display: flex; flex-direction: column; gap: 8px; width: 100%; position: relative; z-index: 10; }",

        /* --- 兜底引擎隐藏原始文本 --- */
        "." + FB_HIDDEN_CLASS + " { display: none !important; }",

        /* --- 卡片通用样式（统一 UI，主 & 兜底共用） --- */
        "." + CARD_CLASS + " { all: initial; display: block; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; border: 1px solid " + BORDER_LIGHT + "; border-radius: 8px; margin: 8px 0 !important; overflow: hidden; background-color: #ffffff; box-shadow: 0 2px 4px rgba(0,0,0,0.04); width: 100%; box-sizing: border-box; position: relative; z-index: 1; }",
        ".dark ." + CARD_CLASS + " { background-color: #1a1a1a; border-color: " + BORDER_DARK + "; }",
        "." + CARD_CLASS + "[data-status='done'] { }",

        /* Header */
        "." + CARD_CLASS + " .vcp-header { display: flex; align-items: center; justify-content: space-between; padding: 0 12px !important; background-color: #f9fafb; border-bottom: 1px solid " + BORDER_LIGHT + "; height: 36px; min-height: 36px; box-sizing: border-box; }",
        ".dark ." + CARD_CLASS + " .vcp-header { background-color: #262626; border-bottom-color: " + BORDER_DARK + "; }",
        "." + CARD_CLASS + " .vcp-title { font-size: 0.85rem; font-weight: 400; color: #6b7280; display: flex; align-items: center; gap: 8px; }",
        ".dark ." + CARD_CLASS + " .vcp-title { color: #9ca3af; }",
        "." + CARD_CLASS + " .vcp-name-text { font-weight: 700; color: #1f2937; }",
        ".dark ." + CARD_CLASS + " .vcp-name-text { color: #e5e7eb; }",

        /* Button */
        "." + CARD_CLASS + " .vcp-btn { padding: 1px 8px; font-size: 0.75rem; border-radius: 4px; border: 1px solid #d1d5db; background: white; cursor: pointer; color: #4b5563; transition: all 0.2s; }",
        ".dark ." + CARD_CLASS + " .vcp-btn { background: #000; border-color: #444; color: #aaa; }",
        "." + CARD_CLASS + " .vcp-btn:hover { background: #f3f4f6; color: #000; }",
        ".dark ." + CARD_CLASS + " .vcp-btn:hover { background: #333; color: #fff; }",

        /* Body & Grid */
        "." + CARD_CLASS + " .vcp-body { display: block; padding: 0 !important; margin: 0 !important; background-color: #fff; }",
        ".dark ." + CARD_CLASS + " .vcp-body { background-color: #0d0d0d; }",

        /* Grid 4.0: 4列布局（主引擎） */
        "." + CARD_CLASS + " .vcp-table-grid { display: grid; grid-template-columns: max-content 1fr max-content 1fr; width: 100%; font-family: 'Menlo', 'Monaco', 'Consolas', monospace !important; font-size: 0.85rem !important; line-height: 1.5 !important; color: #374151; gap: 0 !important; }",
        ".dark ." + CARD_CLASS + " .vcp-table-grid { color: #d1d5db; }",

        /* Cells */
        "." + CARD_CLASS + " .vcp-key { text-align: right; font-weight: 700; color: #4b5563; padding: 8px 12px; border-bottom: 1px solid " + BORDER_LIGHT + "; border-right: 1px solid " + BORDER_LIGHT + "; white-space: nowrap; background-color: #fafafa; vertical-align: top; }",
        ".dark ." + CARD_CLASS + " .vcp-key { color: #9ca3af; background-color: #141414; border-bottom-color: " + BORDER_DARK + "; border-right-color: " + BORDER_DARK + "; }",

        "." + CARD_CLASS + " .vcp-val { text-align: left; padding: 8px 12px; border-bottom: 1px solid " + BORDER_LIGHT + "; color: #111827; min-width: 0; }",
        ".dark ." + CARD_CLASS + " .vcp-val { color: #e5e7eb; border-bottom-color: " + BORDER_DARK + "; }",

        /* 跨列 */
        ".vcp-val-full { grid-column: 2 / -1; }",

        /* ★ 补丁: 中间竖线 ★ */
        ".vcp-border-r { border-right: 1px solid " + BORDER_LIGHT + " !important; }",
        ".dark .vcp-border-r { border-right-color: " + BORDER_DARK + " !important; }",

        /* 去除最后一行边框 */
        "." + CARD_CLASS + " .vcp-key:nth-last-child(-n+2), ." + CARD_CLASS + " .vcp-val:nth-last-child(-n+2) { border-bottom: none !important; }",

        /* Tag Pill */
        ".vcp-tag-pill { display: inline-block; padding: 2px 6px; margin: 2px 4px 2px 0; border-radius: 4px; background-color: rgba(175, 184, 193, 0.2); font-family: inherit; font-size: 0.9em; color: #4b5563; border: 1px solid transparent; }",
        ".dark .vcp-tag-pill { color: #d1d5db; background-color: rgba(110, 118, 129, 0.4); }",

        /* Markdown */
        "." + CARD_CLASS + " .vcp-val p { margin: 0 0 0.5em 0; }",
        "." + CARD_CLASS + " .vcp-val p:last-child { margin-bottom: 0; }",
        "." + CARD_CLASS + " .vcp-val pre { background: #f3f4f6; border-radius: 4px; padding: 8px; overflow-x: auto; margin: 4px 0; border: 1px solid " + BORDER_LIGHT + "; }",
        ".dark ." + CARD_CLASS + " .vcp-val pre { background: #1f2937; border-color: " + BORDER_DARK + "; }",
        "." + CARD_CLASS + " .vcp-val code:not(.vcp-tag-pill) { font-family: inherit; background: rgba(175, 184, 193, 0.2); border-radius: 3px; padding: 0.2em 0.4em; font-size: 85%; }",
        "." + CARD_CLASS + " .vcp-val pre code { background: transparent; padding: 0; border-radius: 0; font-size: 100%; }",
        "." + CARD_CLASS + " .vcp-val ul, ." + CARD_CLASS + " .vcp-val ol { margin: 4px 0; padding-left: 20px; }",

        /* Status */
        "." + CARD_CLASS + " .vcp-status-running { grid-column: 1 / -1; padding: 12px; font-style: italic; color: #9ca3af; display: flex; align-items: center; gap: 8px; }",
        "." + CARD_CLASS + " .vcp-spinner { width: 12px; height: 12px; border: 2px solid #9ca3af; border-radius: 50%; border-top-color: transparent; animation: vcp-spin 1s linear infinite; }",
        "@keyframes vcp-spin { to { transform: rotate(360deg); } }"
    ].join("\n");

    function addStyle(css) {
        if (typeof GM_addStyle !== 'undefined') GM_addStyle(css);
        else { var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }
    }

    // ==========================================
    // 1. 主引擎（v3.9.7）—— 代码块渲染
    // ==========================================
    var processedMap = new WeakMap();

    function cleanValue(rawVal) {
        if (!rawVal) return "";
        var val = rawVal.trim();
        if (val.endsWith(',')) val = val.substring(0, val.length - 1).trim();
        val = val.replace(/^「始」/, "").replace(/「末」$/, "").trim();
        return val;
    }

    function renderMarkdown(el, text) {
        try {
            if (typeof marked !== 'undefined') el.innerHTML = marked.parse(text);
            else el.textContent = text;
        } catch(e) { el.textContent = text; }
    }

    function createCardDOM_Main(type) {
        var container = document.createElement('div');
        container.className = CARD_CLASS;
        container.setAttribute('data-status', 'running');

        var icon  = type === 'DailyNote' ? '📔' : '⚙️';
        var title = type === 'DailyNote' ? 'Daily Note' : 'VCP Tool Call';

        container.innerHTML = [
            '<div class="vcp-header">',
            '    <div class="vcp-title">',
            '        <span style="font-size:1.1em; line-height:1; margin-right:6px;">' + icon + '</span>',
            '        <span>' + title + ': </span>',
            '        <span class="vcp-name-text" style="margin-left: 4px;">Processing...</span>',
            '    </div>',
            '    <div><button class="vcp-btn copy-btn" style="display:none">Copy</button></div>',
            '</div>',
            '<div class="vcp-body">',
            '    <div class="vcp-table-grid">',
            '        <div class="vcp-status-running">',
            '            <span class="vcp-spinner"></span>',
            '            <span>Streaming...</span>',
            '        </div>',
            '    </div>',
            '</div>'
        ].join('');

        return {
            container:     container,
            titleText:     container.querySelector('.vcp-name-text'),
            gridContainer: container.querySelector('.vcp-table-grid'),
            copyBtn:       container.querySelector('.copy-btn')
        };
    }

    function createNormalRow(key, valHtmlOrText, grid, isHtml) {
        var keyDiv = document.createElement('div');
        keyDiv.className = 'vcp-key';
        keyDiv.textContent = key;
        var valDiv = document.createElement('div');
        valDiv.className = 'vcp-val vcp-val-full';
        if (isHtml) valDiv.innerHTML = valHtmlOrText;
        else valDiv.textContent = valHtmlOrText;
        grid.appendChild(keyDiv);
        grid.appendChild(valDiv);
    }

    function createMarkdownRow(key, val, grid) {
        var keyDiv = document.createElement('div');
        keyDiv.className = 'vcp-key';
        keyDiv.textContent = key;
        var valDiv = document.createElement('div');
        valDiv.className = 'vcp-val vcp-val-full';
        renderMarkdown(valDiv, val);
        grid.appendChild(keyDiv);
        grid.appendChild(valDiv);
    }

    function createHeaderRow(key1, val1, key2, val2Html, grid) {
        var k1 = document.createElement('div'); k1.className = 'vcp-key'; k1.textContent = key1;
        var v1 = document.createElement('div'); v1.className = 'vcp-val vcp-border-r'; v1.textContent = val1;
        var k2 = document.createElement('div'); k2.className = 'vcp-key'; k2.textContent = key2;
        var v2 = document.createElement('div'); v2.className = 'vcp-val'; v2.innerHTML = val2Html;
        grid.appendChild(k1); grid.appendChild(v1); grid.appendChild(k2); grid.appendChild(v2);
    }

    function getWeekDay(dateStr) {
        var parts = dateStr.split('.');
        if(parts.length < 3) return "";
        var d = new Date(parts[0], parseInt(parts[1])-1, parts[2]);
        var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        return days[d.getDay()] || "";
    }

    function formatTags(rawTags) {
        if(!rawTags) return "";
        var clean = rawTags.replace(/^[\((]/, '').replace(/[\))]$/, '');
        var tags = clean.split(/[,,]/);
        return tags.map(function(t) {
            var txt = t.trim();
            if(!txt) return "";
            return '<code class="vcp-tag-pill">' + txt + '</code>';
        }).join('');
    }

    function renderToolCall(ui, cleanText) {
        var nameMatch = cleanText.match(/tool_name:\s*[「"'](?:始」)?(.*?)(?:「末)?['"」]/) || cleanText.match(/tool_name:\s*([^,\n\r]+)/);
        if (nameMatch) ui.titleText.textContent = cleanValue(nameMatch[1]);
        cleanText = cleanText.replace(/^\s*tool_name:.*(\n|$)/im, "");

        var lines   = cleanText.split('\n');
        var entries = [];
        var currentEntry = null;

        lines.forEach(function(line) {
            var l = line.trimEnd();
            if (!l) return;
            var regex = /^(\s*)([^:"']+?)(:\s*)(.*)$/;
            var match = l.match(regex);
            if (match && !match[2].includes("<<<")) {
                currentEntry = { key: match[2].trim(), rawVal: match[4] };
                entries.push(currentEntry);
            } else if (currentEntry && !l.includes("<<<")) {
                currentEntry.rawVal += '\n' + l;
            }
        });

        ui.gridContainer.innerHTML = '';
        if (entries.length === 0) return false;
        entries.forEach(function(e) { createMarkdownRow(e.key, cleanValue(e.rawVal), ui.gridContainer); });
        return true;
    }

    function renderDailyNote(ui, cleanText) {
        var lines = cleanText.split('\n');
        var data  = { maid: "", date: "", content: "", tag: "" };
        var currentKey = null;

        lines.forEach(function(line) {
            var l = line.trimEnd();
            if (!l || l.includes("<<<")) return;
            if (l.startsWith("Maid:"))    { currentKey = "maid";    data.maid    = l.substring(5).trim(); }
            else if (l.startsWith("Date:"))    { currentKey = "date";    data.date    = l.substring(5).trim(); }
            else if (l.startsWith("Content:")) { currentKey = "content"; data.content = l.substring(8).trim(); }
            else if (l.startsWith("Tag:"))     { currentKey = "tag";     data.tag     = l.substring(4).trim(); }
            else if (currentKey) { data[currentKey] += '\n' + l; }
        });

        if (!data.maid && !data.date) return false;

        var rawMaid     = data.maid;
        var displayMaid = rawMaid;
        var notebookName = rawMaid;
        var nbMatch = rawMaid.match(/^\[(.*?)\](.*)$/);
        if (nbMatch) {
            notebookName = nbMatch[1];
            displayMaid  = nbMatch[2].trim();
        }
        if (notebookName === "代码") ui.titleText.textContent = "代码日记本";
        else if (notebookName.endsWith("日记本")) ui.titleText.textContent = notebookName;
        else ui.titleText.textContent = notebookName + "日记本";

        var dateStr = data.date;
        var timeStr = "";
        var contentBody = data.content;

        var timeMatch = contentBody.match(/^\[(\d{2}:\d{2}:\d{2})\]/);
        if (timeMatch) {
            timeStr     = timeMatch[1];
            contentBody = contentBody.substring(timeMatch[0].length).trim();
        }

        var subjectVal = "Normal";
        var subjMatch  = contentBody.match(/^[\(\uff08](.*?)[\)\uff09]/);
        if (subjMatch) {
            subjectVal  = subjMatch[1];
            contentBody = contentBody.substring(subjMatch[0].length).trim();
        }

        var weekDay = getWeekDay(dateStr);
        var dateHtml = '<b>' + dateStr + '</b> ' +
                       '<span style="color:#6b7280; font-size:0.9em; margin:0 4px;">' + weekDay + '</span> ' +
                       '<i>' + timeStr + '</i>';

        var tagHtml = formatTags(data.tag);

        ui.gridContainer.innerHTML = '';
        createHeaderRow("Maid", displayMaid, "Date", dateHtml, ui.gridContainer);
        createNormalRow("Subject", subjectVal, ui.gridContainer, false);
        createMarkdownRow("Content", contentBody, ui.gridContainer);
        if (tagHtml) createNormalRow("Tag", tagHtml, ui.gridContainer, true);

        return true;
    }

    function updateCard(ui, fragmentText, type) {
        var isComplete = fragmentText.includes(type === 'DailyNote' ? '<<<DailyNoteEnd>>>' : '<<<[END_TOOL_REQUEST]>>>');
        if (isComplete) { ui.container.setAttribute('data-status', 'done'); ui.copyBtn.style.display = 'inline-flex'; }

        var cleanText = fragmentText;
        var marker    = type === 'DailyNote' ? '<<<DailyNoteEnd>>>' : '<<<[END_TOOL_REQUEST]>>>';
        var eIdx = cleanText.lastIndexOf(marker);
        if (eIdx !== -1) cleanText = cleanText.substring(0, eIdx);

        (type === 'DailyNote' ? renderDailyNote : renderToolCall)(ui, cleanText);

        ui.copyBtn.onclick = function() {
            var s = type === 'DailyNote' ? '<<<DailyNoteStart>>>' : '<<<[TOOL_REQUEST]>>>';
            var e = type === 'DailyNote' ? '<<<DailyNoteEnd>>>'   : '<<<[END_TOOL_REQUEST]>>>';
            navigator.clipboard.writeText(s + '\n' + cleanText.trim() + '\n' + e);
            var o = ui.copyBtn.textContent; ui.copyBtn.textContent = 'Copied!';
            setTimeout(function() { if (ui.copyBtn.isConnected) ui.copyBtn.textContent = o; }, 2000);
        };
    }

    function getCodeMirrorText(node) {
        var lines = node.querySelectorAll('.cm-line');
        if (lines.length > 0) return Array.from(lines).map(l => l.textContent).join('\n');
        return node.textContent || "";
    }

    function mount(contentNode, parent, type) {
        if (processedMap.has(parent)) return;

        // ★ 标记：本容器已被主引擎接管，兜底引擎看到要绕道
        parent.dataset.vcpPrimaryMounted = '1';

        var p = parent.parentElement;
        if (p && !p.classList.contains(JAILBREAK_CLASS)) {
            p.classList.add(JAILBREAK_CLASS);
            p.style.setProperty('display', 'block', 'important');
        }

        var wrapper = document.createElement('div');
        wrapper.className = WRAPPER_CLASS;
        parent.appendChild(wrapper);

        var editor = parent.querySelector('div[id^="code-textarea-"]');
        if (editor) editor.classList.add(HIDDEN_CLASS);
        else {
            var t = contentNode.closest('div[id^="code-textarea-"]');
            if (t) t.classList.add(HIDDEN_CLASS);
        }

        var state = { wrapper: wrapper, cards: [], lastText: '' };
        processedMap.set(parent, state);

        var startMarker = type === 'DailyNote' ? '<<<DailyNoteStart>>>' : '<<<[TOOL_REQUEST]>>>';

        var update = function() {
            if (!contentNode.isConnected) return;
            var text = getCodeMirrorText(contentNode);
            if (!text || text === state.lastText) return;
            state.lastText = text;

            var segs = text.split(startMarker);
            for (var i = 1; i < segs.length; i++) {
                if (!state.cards[i-1]) {
                    var ui = createCardDOM_Main(type);
                    state.wrapper.appendChild(ui.container);
                    state.cards[i-1] = { ui: ui };
                }
                updateCard(state.cards[i-1].ui, segs[i], type);
            }
        };

        update();
        new MutationObserver(update).observe(contentNode, {
            characterData: true,
            subtree: true,
            childList: true
        });
    }

    function scan() {
        document.querySelectorAll('.language-VCPToolCall').forEach(function(el) {
            if (!processedMap.has(el)) {
                var cm = el.querySelector('.cm-content');
                if (cm) mount(cm, el, 'VCPToolCall');
            }
        });
        document.querySelectorAll('.language-DailyNote').forEach(function(el) {
            if (!processedMap.has(el)) {
                var cm = el.querySelector('.cm-content');
                if (cm) mount(cm, el, 'DailyNote');
            }
        });
    }

    // ==========================================
    // 2. 兜底引擎（2.1.1 核心）—— 裸 toolcall DOM 扫描
    // ==========================================
    var START_MARKER = "<<<[TOOL_REQUEST]>>>";
    var END_MARKER   = "<<<[END_TOOL_REQUEST]>>>";

    var pendingStates    = new Set();
    var processedElements = new WeakMap();

    function extractTextFromHTML(html) {
        var temp = document.createElement('div');
        temp.innerHTML = html;
        var brs = temp.querySelectorAll('br');
        brs.forEach(function(br) { br.replaceWith('\n'); });
        var blocks = temp.querySelectorAll('div, p, tr, li');
        blocks.forEach(function(blk) {
            blk.after(document.createTextNode('\n'));
        });
        return temp.textContent;
    }

    function parseToolName(text) {
        var match = text.match(/tool_name:\s*「始」(.*?)「末」/);
        return match ? match[1].trim() : "Processing...";
    }

    // [CRASH FIX]：检测是否处于代码块或高亮容器中
    function isInsideCodeBlock(element) {
        var el = element;
        while (el && el !== document.body) {
            var tag = el.tagName;
            if (tag === 'PRE' || tag === 'CODE' || tag === 'XMP') return true;
            if (el.classList) {
                if (el.classList.contains('hljs') ||
                    el.classList.contains('prism') ||
                    el.classList.contains('code-block')) return true;
                for (var i = 0; i < el.classList.length; i++) {
                    if (el.classList[i].startsWith('language-')) return true;
                }
            }
            el = el.parentElement;
        }
        return false;
    }

    function createCardDOM_Fallback() {
        var container = document.createElement('div');
        container.className = CARD_CLASS;
        container.innerHTML = [
            '<div class="vcp-header">',
            '  <div class="vcp-title">',
            '    <span style="font-size:1.1em; line-height:1; margin-right:6px;">⚙️</span>',
            '    <span>VCP Tool Call: </span>',
            '    <span class="vcp-name-text" style="margin-left: 4px;"></span>',
            '  </div>',
            '  <div><button class="vcp-btn copy-btn" style="display:none">Copy</button></div>',
            '</div>',
            '<div class="vcp-body">',
            '  <div class="vcp-table-grid vcp-status-running">Running...</div>',
            '</div>'
        ].join('');
        return {
            container:     container,
            titleText:     container.querySelector('.vcp-name-text'),
            gridContainer: container.querySelector('.vcp-table-grid'),
            copyBtn:       container.querySelector('.copy-btn')
        };
    }

    function renderTable(container, text) {
        container.innerHTML = '';
        container.classList.remove('vcp-status-running');

        var lines = text.split('\n');
        lines.forEach(function(line) {
            if (!line.trim()) return;
            var match = line.match(/^(\s*)([^:]+?)(:\s+)(.*)$/);
            if (match) {
                var keyDiv = document.createElement('div');
                keyDiv.className   = 'vcp-key';
                keyDiv.textContent = match[2];
                var valDiv = document.createElement('div');
                valDiv.className   = 'vcp-val vcp-val-full';
                valDiv.textContent = match[4];
                container.appendChild(keyDiv);
                container.appendChild(valDiv);
            } else {
                var fullDiv = document.createElement('div');
                fullDiv.className  = 'vcp-val vcp-val-full';
                fullDiv.textContent = line;
                container.appendChild(fullDiv);
            }
        });
    }

    function checkAndRenderState(state) {
        if (!state.targetParent.isConnected) return false;

        var rawTextContent = state.targetParent.textContent || "";
        if (!rawTextContent.includes(END_MARKER)) return false;

        var rawHTML            = state.targetParent.innerHTML;
        var fullFormattedText  = extractTextFromHTML(rawHTML);
        var cleanContent       = fullFormattedText;

        var sIdx = fullFormattedText.indexOf(START_MARKER);
        var eIdx = fullFormattedText.lastIndexOf(END_MARKER);
        if (sIdx !== -1 && eIdx !== -1 && eIdx > sIdx) {
            cleanContent = fullFormattedText.substring(sIdx + START_MARKER.length, eIdx);
        }

        cleanContent = cleanContent.replace(
            /^\s*tool_name:\s*「始」[\s\S]*?「末」\s*,?\s*(\n|$)/i,
            ""
        );
        cleanContent = cleanContent.split('\n').map(function(line) {
            var l = line.replace("「始」", " ");
            var lastEndIndex = l.lastIndexOf("「末」");
            if (lastEndIndex !== -1) {
                l = l.substring(0, lastEndIndex);
            }
            return l;
        }).join('\n');

        cleanContent = cleanContent.trim();
        var toolName = parseToolName(fullFormattedText);
        state.dom.titleText.textContent = toolName;

        renderTable(state.dom.gridContainer, cleanContent);

        state.dom.copyBtn.style.display = 'inline-flex';
        state.dom.copyBtn.onclick = function(e) {
            e.stopPropagation();
            navigator.clipboard.writeText(cleanContent).then(function() {
                var originalText = state.dom.copyBtn.textContent;
                state.dom.copyBtn.textContent = 'Copied';
                state.dom.copyBtn.disabled    = true;
                setTimeout(function() {
                    if (state.dom.copyBtn.isConnected) {
                        state.dom.copyBtn.textContent = originalText;
                        state.dom.copyBtn.disabled    = false;
                    }
                }, 2000);
            }).catch(function(){});
        };

        return true;
    }

    function processTarget(parent) {
        if (!parent || !parent.isConnected) return;
        if (processedElements.has(parent)) return;

        // 避开输入、脚本等
        var tag = parent.tagName;
        if (['TEXTAREA', 'INPUT', 'SCRIPT', 'STYLE'].includes(tag)) return;

        // 避开我们自己的卡片
        if (parent.classList.contains(CARD_CLASS)) return;
        if (parent.closest && parent.closest('.' + CARD_CLASS)) return;

        // ★ 避开主引擎接管的区域（代码块 + primary 标记）
        if (parent.closest && parent.closest('.language-VCPToolCall, .language-DailyNote')) return;
        if (parent.closest && parent.closest('[data-vcp-primary-mounted="1"]')) return;

        // 经典代码块防护
        if (isInsideCodeBlock(parent)) return;

        // 避开明显的块级组合（保持原 2.1.1 逻辑）
        var hasBlockChildren = Array.from(parent.children).some(function(child) {
            if (child.classList.contains(CARD_CLASS)) return false;
            return ['DIV', 'P', 'PRE', 'BLOCKQUOTE', 'UL', 'OL', 'TABLE'].includes(child.tagName);
        });
        if (hasBlockChildren) return;

        if (!parent.textContent.includes(START_MARKER)) return;

        // 构建卡片
        var dom = createCardDOM_Fallback();

        // 插入前再检查一次是否变成代码块
        if (isInsideCodeBlock(parent)) return;

        if (!parent.parentNode) return;
        parent.parentNode.insertBefore(dom.container, parent);
        parent.classList.add(FB_HIDDEN_CLASS);

        var state = { dom: dom, targetParent: parent };
        processedElements.set(parent, state);
        pendingStates.add(state);

        if (checkAndRenderState(state)) {
            pendingStates.delete(state);
        }
    }

    function initFallback() {
        console.log('✅ VCP Fallback (2.1.1 core) Activated');

        var observer = new MutationObserver(function(mutations) {
            // 先处理已挂起状态
            if (pendingStates.size > 0) {
                pendingStates.forEach(function(state) {
                    if (!state.targetParent.isConnected) {
                        pendingStates.delete(state);
                        return;
                    }
                    if (checkAndRenderState(state)) {
                        pendingStates.delete(state);
                    }
                });
            }

            var parentsToCheck = new Set();

            mutations.forEach(function(m) {
                if (m.target.classList && m.target.classList.contains(CARD_CLASS)) return;
                if (m.target.closest && m.target.closest('.' + CARD_CLASS)) return;

                if (m.type === 'characterData') {
                    if (m.target.parentNode) parentsToCheck.add(m.target.parentNode);
                } else if (m.type === 'childList') {
                    if (isInsideCodeBlock(m.target)) return;

                    parentsToCheck.add(m.target);
                    m.addedNodes.forEach(function(n) {
                        if (n.nodeType === Node.ELEMENT_NODE && isInsideCodeBlock(n)) return;

                        if (n.nodeType === Node.TEXT_NODE && n.nodeValue.includes(START_MARKER)) {
                            if (n.parentNode) parentsToCheck.add(n.parentNode);
                        } else if (n.nodeType === Node.ELEMENT_NODE) {
                            if (n.textContent && n.textContent.includes(START_MARKER)) {
                                var walker = document.createTreeWalker(n, NodeFilter.SHOW_TEXT, null, false);
                                var tn;
                                while (tn = walker.nextNode()) {
                                    if (tn.nodeValue.includes(START_MARKER) && tn.parentNode) {
                                        parentsToCheck.add(tn.parentNode);
                                    }
                                }
                            }
                        }
                    });
                }
            });

            parentsToCheck.forEach(function(p) {
                if (p && p.nodeType === Node.ELEMENT_NODE) processTarget(p);
            });
        });

        observer.observe(document.body, { childList: true, subtree: true, characterData: true });

        // 初始扫描
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        var tn;
        while (tn = walker.nextNode()) {
            if (tn.nodeValue.includes(START_MARKER) && tn.parentNode) {
                processTarget(tn.parentNode);
            }
        }
    }

    // ==========================================
    // 3. 初始化
    // ==========================================
    function init() {
        console.log('✅ VCP v3.9.7 + Fallback Activated');
        addStyle(CSS_RULES);

        // 主引擎（代码块）
        scan();
        new MutationObserver(function(ms) {
            var needScan = false;
            for (var i = 0; i < ms.length; i++) {
                var m = ms[i];
                if (m.type === 'childList' && m.addedNodes.length > 0) {
                    needScan = true;
                    break;
                }
            }
            if (needScan) scan();
        }).observe(document.body, { childList: true, subtree: true });

        // 兜底引擎（裸 toolcall）
        initFallback();
    }

    if (document.readyState === 'complete') init();
    else window.addEventListener('load', init, { once: true });

})();
