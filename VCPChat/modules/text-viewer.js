document.addEventListener('DOMContentLoaded', async () => {
    // --- Theme Management ---
    function applyTheme(theme) {
        const currentTheme = theme || 'dark';
        document.body.classList.toggle('light-theme', currentTheme === 'light');
        const highlightThemeStyle = document.getElementById('highlight-theme-style');
        if (highlightThemeStyle) {
            highlightThemeStyle.href = currentTheme === 'light'
                ? "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-light.min.css"
                : "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css";
        }
    }

    if (window.electronAPI) {
        try {
            const initialTheme = await window.electronAPI.getCurrentTheme();
            applyTheme(initialTheme);
        } catch (e) {
            console.error("Failed to get initial theme for text viewer", e);
            applyTheme('dark'); // Fallback
        }
        window.electronAPI.onThemeUpdated((theme) => {
            console.log(`Theme update received in text viewer: ${theme}`);
            applyTheme(theme);
        });
    } else {
        applyTheme('dark'); // Fallback for non-electron env
    }

    mermaid.initialize({ startOnLoad: false }); // 初始化 Mermaid，但不自动渲染

    // --- Dual-Mode Python Execution ---
    let pyodide = null;
    let isPyodideLoading = false;

    async function initializePyodide(statusElement) {
        if (pyodide) return pyodide;
        if (isPyodideLoading) {
            statusElement.textContent = 'Pyodide is already loading, please wait...';
            return null;
        }
        isPyodideLoading = true;
        try {
            statusElement.textContent = 'Loading Pyodide script...';
            if (!window.loadPyodide) {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js';
                document.head.appendChild(script);
                await new Promise((resolve, reject) => {
                    script.onload = resolve;
                    script.onerror = reject;
                });
            }
            statusElement.textContent = 'Initializing Pyodide core... (this may take a moment)';
            pyodide = await window.loadPyodide();
            console.log("Pyodide initialized successfully.");
            return pyodide;
        } catch (error) {
            console.error("Pyodide initialization failed:", error);
            statusElement.textContent = `Pyodide initialization failed: ${error}`;
            return null;
        } finally {
            isPyodideLoading = false;
        }
    }

    async function runPythonInSandbox(code, outputContainer) {
        outputContainer.textContent = 'Preparing Python sandbox environment...';
        const pyodideInstance = await initializePyodide(outputContainer);
        if (!pyodideInstance) return;

        try {
            const packageRegex = /^#\s*requires:\s*([a-zA-Z0-9_,\s-]+)/gm;
            const packages = new Set();
            let match;
            while ((match = packageRegex.exec(code)) !== null) {
                match[1].split(',').forEach(p => {
                    const pkg = p.trim();
                    if (pkg) packages.add(pkg);
                });
            }

            if (packages.size > 0) {
                const packageList = Array.from(packages);
                outputContainer.textContent = `Installing required packages: ${packageList.join(', ')}...`;
                await pyodideInstance.loadPackage("micropip");
                const micropip = pyodideInstance.pyimport("micropip");
                await micropip.install(packageList);
                outputContainer.textContent = 'Packages installed. Executing code...';
            } else {
                outputContainer.textContent = 'Executing code in sandbox...';
            }

            let stdout = '';
            let stderr = '';
            pyodideInstance.setStdout({ batched: (s) => { stdout += s + '\n'; } });
            pyodideInstance.setStderr({ batched: (s) => { stderr += s + '\n'; } });
            await pyodideInstance.runPythonAsync(code);

            let result = '';
            if (stdout) result += stdout;
            if (stderr) result += `\n--- ERRORS ---\n${stderr}`;
            outputContainer.textContent = result.trim() || 'Execution finished with no output.';
        } catch (error) {
            console.error("Sandbox Python execution error:", error);
            outputContainer.textContent = `Sandbox Execution Error:\n${error.toString()}`;
        }
    }

    async function runPythonLocally(code, outputContainer) {
        console.log('[text-viewer] Entering runPythonLocally.');
        outputContainer.textContent = 'Executing with local Python...';
        if (window.electronAPI && window.electronAPI.executePythonCode) {
            try {
                console.log('[text-viewer] Calling electronAPI.executePythonCode...');
                const { stdout, stderr } = await window.electronAPI.executePythonCode(code);
                console.log('[text-viewer] electronAPI.executePythonCode returned.');
                console.log('[text-viewer] Python stdout (from renderer):', stdout);
                console.log('[text-viewer] Python stderr (from renderer):', stderr);

                let result = '';
                // Strip ANSI escape codes before displaying
                const cleanedStdout = stripAnsi(stdout);
                const cleanedStderr = stripAnsi(stderr);

                if (cleanedStdout) result += `--- Output ---\n${cleanedStdout}`;
                if (cleanedStderr) result += `\n--- Errors ---\n${cleanedStderr}`;
                outputContainer.textContent = result.trim() || 'Execution finished with no output.';
            } catch (error) {
                console.error("[text-viewer] Local Python execution error (in renderer):", error);
                outputContainer.textContent = `Local Execution Error:\n${error.toString()}`;
            }
        } else {
            outputContainer.textContent = 'Error: electronAPI.executePythonCode is not available.';
            console.error('[text-viewer] electronAPI.executePythonCode is not available.');
        }
        console.log('[text-viewer] Exiting runPythonLocally.');
    }

    async function runPythonCode(code, outputContainer) {
        outputContainer.style.display = 'block';
        const isSandboxMode = document.getElementById('sandbox-toggle').checked;

        if (isSandboxMode) {
            await runPythonInSandbox(code, outputContainer);
        } else {
            await runPythonLocally(code, outputContainer);
        }
    }
    // --- End Dual-Mode Python Execution ---

    // Function to strip ANSI escape codes
    function stripAnsi(str) {
        // eslint-disable-next-line no-control-regex
        return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-PRZcf-nqry=><]/g, '');
    }

    function removeBoldMarkersAroundQuotes(text) {
        if (typeof text !== 'string') return text;
        // Replace **" with " and **“ with “
        let processedText = text.replace(/\*\*(["“])/g, '$1');
        // Replace "** with " and ”** with ”
        processedText = processedText.replace(/(["”])\*\*/g, '$1');
        return processedText;
    }

    function renderQuotedText(text, currentTheme) {
        const className = currentTheme === 'light' ? 'custom-quote-light' : 'custom-quote-dark';
        // This regex uses alternation. It first tries to match a whole code block.
        // If it matches, the code block is returned unmodified.
        // Otherwise, it tries to match a quoted string and wraps it.
        // This is much more robust than splitting the string.
        return text.replace(/(```[\s\S]*?```)|("([^"]*?)"|“([^”]*?)”)/g, (match, codeBlock, fullQuote) => {
            // If a code block is matched (group 1), return it as is.
            if (codeBlock) {
                return codeBlock;
            }
            // If a quote is matched (group 2), wrap it in a span.
            if (fullQuote) {
                return `<span class="${className}">${fullQuote}</span>`;
            }
            // Fallback, should not happen with this regex structure
            return match;
        });
    }

    function decodeHtmlEntities(text) {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = text;
        return textarea.value;
    }

    const params = new URLSearchParams(window.location.search);
    const textContent = params.get('text');
    const windowTitle = params.get('title') || '文本阅读模式';
    const encoding = params.get('encoding');

    document.title = decodeURIComponent(windowTitle);
    const contentDiv = document.getElementById('textContent');
    const editAllButton = document.getElementById('editAllButton'); // Get the new button
    const shareToNotesButton = document.getElementById('shareToNotesButton');

    // Global edit button logic
    if (editAllButton && contentDiv) {
        // Store references to the button's icon and text elements
        let currentEditAllButtonIcon = editAllButton.querySelector('svg');
        const editAllButtonText = editAllButton.querySelector('span');

        const globalEditIconSVGString = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`;
        const globalDoneIconSVGString = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>`;

        editAllButton.addEventListener('click', () => {
            const isEditing = contentDiv.isContentEditable;
            contentDiv.contentEditable = !isEditing;

            // Re-query the icon element in case it was replaced
            currentEditAllButtonIcon = editAllButton.querySelector('svg');

            if (!isEditing) { // Entering edit mode
                contentDiv.focus();
                if(currentEditAllButtonIcon) currentEditAllButtonIcon.outerHTML = globalDoneIconSVGString;
                if(editAllButtonText) editAllButtonText.textContent = '完成编辑';
                editAllButton.setAttribute('title', '完成编辑');
                contentDiv.classList.add('editing-all');
            } else { // Exiting edit mode
                if(currentEditAllButtonIcon) currentEditAllButtonIcon.outerHTML = globalEditIconSVGString;
                if(editAllButtonText) editAllButtonText.textContent = '编辑全文';
                editAllButton.setAttribute('title', '编辑全文');
                contentDiv.classList.remove('editing-all');
                // Note: The content is now raw HTML. If Markdown re-rendering is desired,
                // it would need to be implemented here (e.g., by taking contentDiv.innerText,
                // re-parsing with marked, and re-applying syntax highlighting).
            }
        });
    }

    if (shareToNotesButton && contentDiv) {
        shareToNotesButton.addEventListener('click', () => {
            const currentText = contentDiv.innerText; // 获取纯文本内容
            const noteTitle = document.title || '来自阅读模式的分享'; // 使用页面标题或默认标题
            
            // 尝试通过 electronAPI 打开新窗口或通知主进程处理
            if (window.electronAPI && window.electronAPI.openNotesWithContent) {
                console.log('[text-viewer] Attempting to share via electronAPI.openNotesWithContent');
                window.electronAPI.openNotesWithContent({
                    title: noteTitle,
                    content: currentText,
                }).catch(err => {
                    console.error('[text-viewer] Error calling electronAPI.openNotesWithContent:', err);
                    // 如果API调用失败，可以在这里给用户一些提示
                    alert('分享到笔记失败，请检查控制台获取更多信息。');
                });
            } else {
                console.error('[text-viewer] electronAPI.openNotesWithContent is not available.');
                alert('分享功能不可用，无法连接到主进程。');
            }
        });
    }

    if (textContent) {
        try {
            let decodedText;
            if (encoding === 'base64') {
                // Decode Base64 and then decode the UTF-8 characters
                const rawDecoded = atob(textContent);
                decodedText = decodeURIComponent(rawDecoded.split('').map(function(c) {
                    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                }).join(''));
            } else {
                decodedText = decodeURIComponent(textContent); // Fallback for old method
            }

            // Pre-process to add a newline after a code block fence if it's followed by a Chinese character.
            const codeBlockRegex = /(```)([\u4e00-\u9fa5])/g;
            decodedText = decodedText.replace(codeBlockRegex, '$1\n$2');

            // Isolate HTML code blocks to prevent quote rendering from corrupting them.
            const htmlBlocks = [];
            let processedText = decodedText.replace(/(```\s*html\n[\s\S]*?```)/gi, (match) => {
                htmlBlocks.push(match);
                return `__HTML_BLOCK_PLACEHOLDER_${htmlBlocks.length - 1}__`;
            });

            // Apply custom quote rendering only to non-HTML-block content
            processedText = removeBoldMarkersAroundQuotes(processedText);
            processedText = renderQuotedText(processedText, document.body.classList.contains('light-theme') ? 'light' : 'dark');

            // Restore the HTML blocks
            processedText = processedText.replace(/__HTML_BLOCK_PLACEHOLDER_(\d+)__/g, (match, index) => {
                return htmlBlocks[parseInt(index, 10)];
            });

            // Render Markdown
            if (window.marked) {
                marked.setOptions({
                    gfm: true, // Enable GFM (GitHub Flavored Markdown)
                    tables: true, // Enable GFM tables
                    breaks: false, // Do not interpret carriage returns as <br>
                    pedantic: false,
                    sanitize: false, // IMPORTANT: If you allow user-generated content, ensure proper sanitization.
                    smartLists: true,
                    smartypants: false
                });
                contentDiv.innerHTML = marked.parse(processedText);

                // Apply syntax highlighting after Markdown is rendered
                if (window.hljs) {
                    hljs.highlightAll();
                    // Add copy buttons to code blocks (excluding mermaid blocks)
                    document.querySelectorAll('pre code.hljs').forEach((block) => {
                        const preElement = block.parentElement;
                        // Ensure we are not adding buttons to pre elements that might wrap mermaid divs
                        if (preElement.querySelector('.mermaid')) {
                            return;
                        }
                        preElement.style.position = 'relative'; // Needed for absolute positioning of the button

                        const codeContent = decodeHtmlEntities(block.innerText);
                        // More robust check: Only identify as HTML if explicitly marked with ```html
                        const isHtml = Array.from(block.classList).some(cls => /^language-html$/i.test(cls));
                        const isPython = Array.from(block.classList).some(cls => /^language-python$/i.test(cls));

                        // Create Play Button for HTML content
                        if (isHtml) {
                            const playButton = document.createElement('button');
                            const playIconSVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
                            const codeIconSVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>`;

                            playButton.innerHTML = playIconSVG;
                            playButton.className = 'play-button';
                            playButton.setAttribute('title', '预览HTML');
                            preElement.appendChild(playButton);

                            playButton.addEventListener('click', (e) => {
                                e.stopPropagation();
                                
                                const existingPreview = preElement.nextElementSibling;
                                if (existingPreview && existingPreview.classList.contains('html-preview-container')) {
                                    existingPreview.remove();
                                    preElement.style.display = 'block';
                                    return;
                                }

                                preElement.style.display = 'none';

                                const previewContainer = document.createElement('div');
                                previewContainer.className = 'html-preview-container';

                                const iframe = document.createElement('iframe');
                                iframe.sandbox = 'allow-scripts allow-same-origin';

                                const exitButton = document.createElement('button');
                                exitButton.innerHTML = codeIconSVG + ' 返回代码';
                                exitButton.className = 'exit-preview-button';
                                exitButton.title = '返回代码视图';

                                exitButton.addEventListener('click', () => {
                                    previewContainer.remove();
                                    preElement.style.display = 'block';
                                });

                                // Append elements to the DOM first
                                previewContainer.appendChild(iframe);
                                previewContainer.appendChild(exitButton);
                                preElement.parentNode.insertBefore(previewContainer, preElement.nextSibling);

                                // Then write content to the iframe. This is more robust for scripts.
                                const iframeDoc = iframe.contentWindow.document;
                                iframeDoc.open();
                                
                                let finalHtml = codeContent;
                                const trimmedCode = codeContent.trim().toLowerCase();
                                // 如果代码片段不是一个完整的HTML文档，就为其包裹一个基本的HTML结构。
                                // 这样可以确保浏览器正确处理片段中的脚本和样式。
                                if (!trimmedCode.startsWith('<!doctype') && !trimmedCode.startsWith('<html>')) {
                                    const bodyStyles = document.body.classList.contains('light-theme')
                                        ? 'color: #2c3e50; background-color: #ffffff;'
                                        : 'color: #abb2bf; background-color: #282c34;';
                                    
                                    finalHtml = `
                                        <!DOCTYPE html>
                                        <html>
                                        <head>
                                            <meta charset="UTF-8">
                                            <title>HTML Preview</title>
                                            <style>
                                                body {
                                                    font-family: sans-serif;
                                                    padding: 15px;
                                                    margin: 0;
                                                    ${bodyStyles}
                                                }
                                            </style>
                                        </head>
                                        <body>
                                            ${codeContent}
                                        </body>
                                        </html>
                                    `;
                                }
                                
                                iframeDoc.write(finalHtml);
                                iframeDoc.close();
                            });
                        } else if (isPython) {
                           const pyPlayButton = document.createElement('button');
                           const playIconSVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
                           pyPlayButton.innerHTML = playIconSVG;
                           pyPlayButton.className = 'play-button'; // Reuses existing style for play button
                           pyPlayButton.setAttribute('title', 'Run Python Code');
                           preElement.appendChild(pyPlayButton);

                           const outputContainer = document.createElement('div');
                           outputContainer.className = 'python-output-container';
                           preElement.parentNode.insertBefore(outputContainer, preElement.nextSibling);

                           pyPlayButton.addEventListener('click', (e) => {
                               e.stopPropagation();
                               if (outputContainer.style.display === 'block') {
                                   outputContainer.style.display = 'none';
                               } else {
                                   const codeToRun = decodeHtmlEntities(block.innerText);
                                   runPythonCode(codeToRun, outputContainer);
                               }
                           });
                        }

                        // Create Edit Button
                        const editButton = document.createElement('button');
                        const editIconSVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`;
                        const doneIconSVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>`;

                        editButton.innerHTML = editIconSVG;
                        editButton.className = 'edit-button';
                        editButton.setAttribute('title', '编辑');

                        editButton.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const isEditing = block.isContentEditable;
                            block.contentEditable = !isEditing; // Toggle contentEditable on the code block itself
                            if (!isEditing) {
                                block.focus(); // Focus the block for editing
                                editButton.innerHTML = doneIconSVG;
                                editButton.setAttribute('title', '完成编辑');
                            } else {
                                editButton.innerHTML = editIconSVG;
                                editButton.setAttribute('title', '编辑');
                                // After editing, syntax highlighting might be lost or incorrect.
                                // Re-highlight the block if hljs is available.
                                if (window.hljs && typeof hljs.highlightElement === 'function') {
                                    hljs.highlightElement(block);
                                }
                            }
                        });
                        preElement.appendChild(editButton);

                        // Create Copy Button (renamed 'button' to 'copyButton')
                        const copyButton = document.createElement('button');
                        copyButton.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`;
                        copyButton.className = 'copy-button';
                        copyButton.setAttribute('title', '复制');

                        copyButton.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const codeToCopy = block.innerText;
                            navigator.clipboard.writeText(codeToCopy).then(() => {
                                copyButton.style.borderColor = 'var(--success-color, #4CAF50)'; // Visual feedback
                                setTimeout(() => {
                                    copyButton.style.borderColor = 'var(--button-border-color, #4f535c)';
                                }, 1500);
                            }).catch(err => {
                                console.error('无法复制到剪贴板:', err);
                                copyButton.style.borderColor = 'var(--error-color, #F44336)'; // Visual feedback
                                setTimeout(() => {
                                    copyButton.style.borderColor = 'var(--button-border-color, #4f535c)';
                                }, 1500);
                            });
                        });
                        preElement.appendChild(copyButton);
                    });
                }
                // After markdown rendering and syntax highlighting, specifically handle Mermaid blocks
                document.querySelectorAll('pre code.language-mermaid').forEach((block) => {
                    const preElement = block.parentElement;
                    const mermaidContent = block.textContent || block.innerText;
                    const diagramId = `mermaid-diagram-${Math.random().toString(36).substring(2, 15)}`;
                    
                    const mermaidContainer = document.createElement('div');
                    mermaidContainer.className = 'mermaid';
                    mermaidContainer.id = diagramId;
                    mermaidContainer.textContent = decodeHtmlEntities(mermaidContent);
                    
                    preElement.parentNode.replaceChild(mermaidContainer, preElement);
                });

                // Render Mermaid diagrams
                if (window.mermaid) {
                    try {
                        mermaid.run({
                            nodes: document.querySelectorAll('.mermaid')
                        });
                    } catch (e) {
                        console.error("Mermaid rendering error:", e);
                    }
                }

            } else {
                // Fallback if marked is not loaded
                const pre = document.createElement('pre');
                pre.textContent = processedText; // Use processedText
                contentDiv.appendChild(pre);
                 // In fallback mode, advanced rendering like Mermaid is not supported
                 // as the structure is just a single <pre> block.
            }

            // Render LaTeX if KaTeX is available
            if (window.renderMathInElement) {
                try {
                    renderMathInElement(contentDiv, {
                        delimiters: [
                            {left: "$$", right: "$$", display: true},
                            {left: "$", right: "$", display: false},
                            {left: "\\(", right: "\\)", display: false},
                            {left: "\\[", right: "\\]", display: true}
                        ],
                        throwOnError: false
                    });
                } catch (e) {
                    console.error("KaTeX rendering error:", e);
                }
            }
        } catch (error) {
            console.error("Error rendering content:", error);
            contentDiv.innerHTML = `
                <h3 style="color: #e06c75;">内容渲染失败</h3>
                <p>在处理文本时发生错误，这可能是由于文本包含了格式不正确的编码字符。</p>
                <p><strong>错误详情:</strong></p>
                <pre style="white-space: pre-wrap; word-wrap: break-word;">${error.toString()}</pre>
                <p><strong>原始文本内容:</strong></p>
                <pre style="white-space: pre-wrap; word-wrap: break-word;">${textContent}</pre>
            `;
        }
    } else {
        contentDiv.textContent = '没有提供文本内容。';
    }

    // Custom Context Menu Logic
    const contextMenu = document.getElementById('customContextMenu');
    const contextMenuCopyButton = document.getElementById('contextMenuCopy');
    const contextMenuCutButton = document.getElementById('contextMenuCut');
    const contextMenuDeleteButton = document.getElementById('contextMenuDelete');
    const contextMenuEditAllButton = document.getElementById('contextMenuEditAll');
    const contextMenuCopyAllButton = document.getElementById('contextMenuCopyAll');
    const mainContentDiv = document.getElementById('textContent'); // Renamed for clarity from previous contentDiv

    if (contextMenu && contextMenuCopyButton && contextMenuCutButton && contextMenuDeleteButton && contextMenuEditAllButton && contextMenuCopyAllButton && mainContentDiv) {
        document.addEventListener('contextmenu', (event) => {
            const selection = window.getSelection();
            const selectedText = selection.toString().trim();

            event.preventDefault(); // Always prevent default to show custom menu

            contextMenu.style.top = `${event.pageY}px`;
            contextMenu.style.left = `${event.pageX}px`;
            contextMenu.style.display = 'block';

            if (selectedText) {
                // Show standard copy, cut, delete if text is selected
                contextMenuCopyButton.style.display = 'block';
                contextMenuCutButton.style.display = 'block';
                contextMenuDeleteButton.style.display = 'block';
                contextMenuEditAllButton.style.display = 'none';
                contextMenuCopyAllButton.style.display = 'none';
            } else {
                // Show "Edit All" and "Copy All" if no text is selected
                contextMenuCopyButton.style.display = 'none';
                contextMenuCutButton.style.display = 'none';
                contextMenuDeleteButton.style.display = 'none';
                contextMenuEditAllButton.style.display = 'block';
                contextMenuCopyAllButton.style.display = 'block';
            }

            // Determine if Cut and Delete should be shown (based on editability)
            let isAnyEditableContext = mainContentDiv.isContentEditable; // Check global edit mode
            const targetElement = event.target;
            const closestCodeBlock = targetElement.closest('code.hljs');

            if (!isAnyEditableContext && closestCodeBlock && closestCodeBlock.isContentEditable) {
                isAnyEditableContext = true;
            }

            // If text is selected, adjust cut/delete visibility based on editability
            if (selectedText) {
                contextMenuCutButton.style.display = isAnyEditableContext ? 'block' : 'none';
                contextMenuDeleteButton.style.display = isAnyEditableContext ? 'block' : 'none';
            }
        });

        document.addEventListener('click', (event) => {
            if (contextMenu.style.display === 'block' && !contextMenu.contains(event.target)) {
                contextMenu.style.display = 'none';
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                contextMenu.style.display = 'none';
            }
        });

        contextMenuCopyButton.addEventListener('click', () => {
            const selectedText = window.getSelection().toString();
            if (selectedText) {
                navigator.clipboard.writeText(selectedText).then(() => {
                    console.log('文本已复制到剪贴板');
                }).catch(err => {
                    console.error('无法复制文本: ', err);
                });
            }
            contextMenu.style.display = 'none';
        });

        contextMenuCutButton.addEventListener('click', () => {
            const selection = window.getSelection();
            const selectedText = selection.toString();
            
            let canPerformEdit = mainContentDiv.isContentEditable;
            const activeCodeBlock = document.activeElement && document.activeElement.closest('code.hljs') && document.activeElement.isContentEditable;
            if(!canPerformEdit && activeCodeBlock){
                canPerformEdit = true;
            }

            if (selectedText && canPerformEdit) {
                navigator.clipboard.writeText(selectedText).then(() => {
                    document.execCommand('delete', false, null);
                    console.log('文本已剪切到剪贴板');
                }).catch(err => {
                    console.error('无法剪切文本: ', err);
                });
            }
            contextMenu.style.display = 'none';
        });

        contextMenuDeleteButton.addEventListener('click', () => {
            const selection = window.getSelection();
            let canPerformEdit = mainContentDiv.isContentEditable;
            const activeCodeBlock = document.activeElement && document.activeElement.closest('code.hljs') && document.activeElement.isContentEditable;
             if(!canPerformEdit && activeCodeBlock){
                canPerformEdit = true;
            }

            if (selection.toString() && canPerformEdit) {
                document.execCommand('delete', false, null);
                console.log('选中文本已删除');
            }
            contextMenu.style.display = 'none';
        });
        contextMenuEditAllButton.addEventListener('click', () => {
            editAllButton.click(); // Trigger the global edit button's click event
            contextMenu.style.display = 'none';
        });

        contextMenuCopyAllButton.addEventListener('click', () => {
            const fullText = mainContentDiv.innerText;
            navigator.clipboard.writeText(fullText).then(() => {
                console.log('全文已复制到剪贴板');
            }).catch(err => {
                console.error('无法复制全文: ', err);
            });
            contextMenu.style.display = 'none';
        });
    }
    
    // Add keyboard listener for Escape key to close the window
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            window.close();
        }
    });
});
