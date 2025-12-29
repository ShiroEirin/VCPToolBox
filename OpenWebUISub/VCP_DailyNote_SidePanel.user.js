// ==UserScript==
// @name         VCP DailyNote SidePanel
// @namespace    http://tampermonkey.net/
// @version      0.2.1
// @description  在侧边栏嵌入 VCP 日记面板，并将原网页内容向左“顶开”
// @author       B3000Kcn & DBL1F7E5
// @match        http(s)://your.openwebui.url:port/*
// @connect      your.vcptoolbox.url（不含端口）
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// ==/UserScript==

(function() {
    'use strict';

    // ================= 配置区域 =================
    // ★ 关键修复：末尾手动加上斜杠 '/'，防止 301 重定向丢参数
    const PANEL_URL = "http(s)://your.vcptoolbox.url:port/AdminPanel/DailyNotePanel/";

    // 侧边栏物理宽度
    const PANEL_WIDTH = "260px";

    // ★ 新增：全局缩放比例 (0.1 ~ 2.0)
    // 建议设置 0.8 ~ 0.9，可以让内容显示更紧凑，显示更多文字
    const PANEL_ZOOM = 0.8;

    // ★ 新增：要切掉的侧边栏宽度 (根据截图目测约 64px)
    const SIDEBAR_WIDTH = "51px";

    // ★ 新增: 按钮距离底部的距离 (防止遮挡宿主网页的发送键/工具栏)
    // 默认 20px，若遮挡其他内容可适当抬高
    const BUTTON_BOTTOM = "20px";

    // ★ 补齐：默认进入的视图 ('stream' | '' | '文件夹名')
    const DEFAULT_VIEW = "stream";

    // 鉴权信息（与 AdminPanel 相同）
    const AUTH_USER = "xxxxxxx";
    const AUTH_PASS = "xxxxxxxxxxxxxxxxxx";
    // ===========================================

    let isPanelOpen = GM_getValue('vcp_panel_open', false);
    let isInnerSidebarHidden = GM_getValue('vcp_inner_sidebar_hidden', true);

    // --- 核心修复：代理注入逻辑 ---

    async function startProxyInjection() {
        if (!AUTH_USER || !AUTH_PASS || AUTH_USER === "xxxxxxx") {
            console.error("VCP SidePanel: 请配置账号密码！");
            initUI("<h1>请在脚本中配置 VCP 账号密码</h1>");
            return;
        }

        try {
            // 1. 【修复关键点】挂载跨域代理通道到 unsafeWindow
            // 这样 Iframe 里的 window.parent 才能访问到它
            const targetWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

            targetWindow.__VCP_FETCH_PROXY__ = async (url, options) => {
                return new Promise((resolve, reject) => {
                    // 自动补全绝对路径
                    if (url.startsWith("/")) {
                        try {
                            const urlObj = new URL(PANEL_URL);
                            url = urlObj.origin + url;
                        } catch(e) { console.error("URL Parse Error", e); }
                    }

                    GM_xmlhttpRequest({
                        method: options.method || "GET",
                        url: url,
                        headers: {
                            ...(options.headers || {}),
                            "Authorization": "Basic " + btoa(AUTH_USER + ":" + AUTH_PASS),
                            "Content-Type": "application/json"
                        },
                        data: options.body,
                        onload: (res) => {
                            resolve({
                                ok: res.status >= 200 && res.status < 300,
                                status: res.status,
                                statusText: res.statusText,
                                json: () => Promise.resolve(JSON.parse(res.responseText)),
                                text: () => Promise.resolve(res.responseText)
                            });
                        },
                        onerror: (err) => {
                            console.error("VCP Proxy Error:", err);
                            reject(err);
                        }
                    });
                });
            };

            // 2. 并行下载静态资源
            const authHeader = { "Authorization": "Basic " + btoa(AUTH_USER + ":" + AUTH_PASS) };
            const download = (url) => new Promise((resolve, reject) => {
                GM_xmlhttpRequest({ method: "GET", url, headers: authHeader, onload: r => resolve(r.responseText), onerror: reject });
            });

            // 构造带参数的 URL
            let targetUrl = PANEL_URL;
            // 注意：DailyNotePanel 的 script.js 会读取 URL 参数，但 srcdoc 中 window.location.search 是空的
            // 我们稍后在注入 JS 时手动 patch 这个问题

            let html = await download(targetUrl);

            // 如果 PANEL_URL 是目录，去掉末尾斜杠找父级
            const baseUrl = PANEL_URL.endsWith('/') ? PANEL_URL : PANEL_URL + '/';

            let cssContent = "";
            let jsContent = "";

            try { cssContent = await download(baseUrl + "style.css"); } catch(e) { console.warn("CSS download failed", e); }
            try { jsContent = await download(baseUrl + "script.js"); } catch(e) { console.warn("JS download failed", e); }

            // 3. 【新增】清洗原 HTML，防止 404
            // 移除原本的 <link rel="stylesheet"> 和 <script src="...">
            // 只保留 body 内容
            let bodyContent = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] || "<h1>Loading Error</h1>";
            // 移除原有的外部 script 引用 (避免 script.js 404)
            bodyContent = bodyContent.replace(/<script[^>]+src=["'][^"']*script\.js["'][^>]*><\/script>/gi, "");
            // 移除原有的外部 css 引用 (避免 style.css 404)
            bodyContent = bodyContent.replace(/<link[^>]+href=["'][^"']*style\.css["'][^>]*>/gi, "");


            // 4. 组装“特洛伊木马” HTML
            const finalHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>VCP Panel</title>
                    <style>
                        /* 注入下载好的 CSS */
                        ${cssContent}

                        /* 强制覆盖滚动条样式，防止出现双滚动条 */
                        body { overflow-y: auto; background-color: #1e1e1e; }
                        ::-webkit-scrollbar { width: 6px; }
                        ::-webkit-scrollbar-track { background: transparent; }
                        ::-webkit-scrollbar-thumb { background: rgba(100, 100, 100, 0.4); border-radius: 3px; }
                    </style>
                </head>
                <body>
                    ${bodyContent}

                    <!-- 注入核心劫持逻辑 -->
                    <script>
                        // A. 劫持 fetch
                        // 这样 script.js 里的 fetch('/dailynote_api/...') 就会被转发
                        window.fetch = async (input, init) => {
                            // 检查父窗口代理是否存在
                            if (window.parent && window.parent.__VCP_FETCH_PROXY__) {
                                return window.parent.__VCP_FETCH_PROXY__(input, init || {});
                            } else {
                                console.error("VCP Proxy Bridge Broken!");
                                throw new Error("Proxy Bridge Broken");
                            }
                        };

                        // B. 手动模拟 URL 参数 (Patch)
                        // 因为 srcdoc 的 URL 是 about:srcdoc，没有 search 参数
                        // 我们直接修改 history 状态或者拦截 URLSearchParams (更简单的是直接定义全局变量供修改后的 script.js 读取，
                        // 但为了不改动 script.js，我们尝试 pushState)
                        try {
                           window.history.replaceState({}, '', '?notebook=${DEFAULT_VIEW}');
                        } catch(e) { console.log("State patch skipped"); }

                        // C. 禁用 Service Worker (避免 sw.js 404)
                        if ('serviceWorker' in navigator) {
                            navigator.serviceWorker.register = () => Promise.reject("SW Disabled in Proxy Mode");
                        }

                        // D. 执行下载好的业务逻辑
                        ${jsContent}
                    </script>
                </body>
                </html>
            `;

            // 5. 初始化 UI
            initUI(finalHtml);

        } catch (e) {
            console.error("VCP SidePanel Init Failed:", e);
            initUI(`<h3>Load Failed</h3><pre>${e.message}</pre>`);
        }
    }

    // --- UI 初始化与交互逻辑 (保持不变) ---

    function initUI(srcdocContent) {
        if (document.getElementById('vcp-side-panel-container')) return;

        GM_addStyle(`
            body, html { transition: margin-right 0.3s ease-in-out; }
            #vcp-side-panel-container {
                position: fixed; top: 0; right: 0;
                width: ${PANEL_WIDTH}; height: 100vh;
                background: #1e1e1e; z-index: 2147483647;
                box-shadow: -5px 0 20px rgba(0,0,0,0.15);
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                transform: translateX(100%);
                overflow: hidden;
            }
            #vcp-side-panel-container.active { transform: translateX(0); }

            #vcp-iframe {
                border: none; transform-origin: top left;
                transform: scale(${PANEL_ZOOM});
                height: calc(100% / ${PANEL_ZOOM});
                transition: margin-left 0.3s ease, width 0.3s ease;
                display: block;
                width: 100%;
            }

            #vcp-toggle-btn {
                position: fixed;
                bottom: ${BUTTON_BOTTOM};
                right: 20px;
                width: 44px; height: 44px;
                background: #333333; color: white; border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                cursor: pointer; z-index: 2147483648;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s;
                font-size: 22px; user-select: none;
            }
            #vcp-toggle-btn:hover {
                transform: scale(1.1);
                background: #ffb46e;
                box-shadow: 0 4px 8px rgba(0,0,0,0.3);
            }
            #vcp-toggle-btn.panel-open { right: calc(${PANEL_WIDTH} + 20px); }

            #vcp-sidebar-toggle-btn {
                position: absolute; bottom: 0; left: 0;
                width: 24px; height: 40px;
                background: rgba(0,0,0,0.2); color: #fff;
                display: flex; align-items: center; justify-content: center;
                cursor: pointer; z-index: 2147483649;
                font-size: 14px; border-top-right-radius: 8px;
                backdrop-filter: blur(4px);
                transition: background 0.2s, width 0.2s;
            }
            #vcp-sidebar-toggle-btn:hover { background: rgba(37, 99, 235, 0.9); width: 32px; }
        `);

        const container = document.createElement('div');
        container.id = 'vcp-side-panel-container';

        const iframe = document.createElement('iframe');
        iframe.id = 'vcp-iframe';
        // 使用 srcdoc
        iframe.srcdoc = srcdocContent;
        container.appendChild(iframe);

        const sidebarToggleBtn = document.createElement('div');
        sidebarToggleBtn.id = 'vcp-sidebar-toggle-btn';
        sidebarToggleBtn.innerHTML = '≡';
        sidebarToggleBtn.title = '切换侧边栏';
        sidebarToggleBtn.onclick = toggleInnerSidebar;
        container.appendChild(sidebarToggleBtn);

        document.body.appendChild(container);

        const btn = document.createElement('div');
        btn.id = 'vcp-toggle-btn';
        btn.innerHTML = '📓';
        btn.onclick = togglePanel;
        document.body.appendChild(btn);

        updateInnerSidebarState();

        if (isPanelOpen) openPanel();
        GM_registerMenuCommand("切换日记面板", togglePanel);
    }

    function togglePanel() {
        if (isPanelOpen) closePanel(); else openPanel();
    }

    function openPanel() {
        const container = document.getElementById('vcp-side-panel-container');
        const btn = document.getElementById('vcp-toggle-btn');
        if(container && btn) {
            container.classList.add('active');
            btn.classList.add('panel-open');
            document.body.style.marginRight = PANEL_WIDTH;
            isPanelOpen = true;
            GM_setValue('vcp_panel_open', true);
        }
    }

    function closePanel() {
        const container = document.getElementById('vcp-side-panel-container');
        const btn = document.getElementById('vcp-toggle-btn');
        if(container && btn) {
            container.classList.remove('active');
            btn.classList.remove('panel-open');
            document.body.style.marginRight = '0';
            isPanelOpen = false;
            GM_setValue('vcp_panel_open', false);
        }
    }

    function toggleInnerSidebar() {
        isInnerSidebarHidden = !isInnerSidebarHidden;
        updateInnerSidebarState();
        GM_setValue('vcp_inner_sidebar_hidden', isInnerSidebarHidden);
    }

    function updateInnerSidebarState() {
        const iframe = document.getElementById('vcp-iframe');
        const toggleBtn = document.getElementById('vcp-sidebar-toggle-btn');
        if (!iframe) return;

        if (isInnerSidebarHidden) {
            iframe.style.marginLeft = `-${SIDEBAR_WIDTH}`;
            iframe.style.width = `calc((100% + ${SIDEBAR_WIDTH}) / ${PANEL_ZOOM})`;
            toggleBtn.innerHTML = '≡';
        } else {
            iframe.style.marginLeft = '0';
            iframe.style.width = `calc(100% / ${PANEL_ZOOM})`;
            toggleBtn.innerHTML = '✕';
        }
    }

    startProxyInjection();
})();
