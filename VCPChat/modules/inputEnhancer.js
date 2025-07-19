// modules/inputEnhancer.js
console.log('[InputEnhancer] Module loaded.');

const LONG_TEXT_THRESHOLD = 2000; // Characters

// Removed: let electronAPI; - It will be assigned from refs and use the global window.electronAPI
let attachedFilesRef; // Reference to renderer.js's attachedFiles array
let updateAttachmentPreviewRef; // Reference to renderer.js's updateAttachmentPreview function
let currentAgentIdRef; // Function to get currentAgentId
let currentTopicIdRef; // Function to get currentTopicId

/**
 * Initializes the input enhancer module.
 * @param {object} refs - References to functions and variables from renderer.js
 * @param {HTMLTextAreaElement} refs.messageInput - The message input textarea element.
 * @param {object} refs.electronAPI - The exposed electron API from preload.js.
 * @param {Array} refs.attachedFiles - Reference to the array holding files to be attached.
 * @param {Function} refs.updateAttachmentPreview - Function to update the attachment preview UI.
 * @param {Function} refs.getCurrentAgentId - Function that returns the current agent ID.
 * @param {Function} refs.getCurrentTopicId - Function that returns the current topic ID.
 */
function initializeInputEnhancer(refs) {
    if (!refs.messageInput || !refs.electronAPI || !refs.attachedFiles || !refs.updateAttachmentPreview || !refs.getCurrentAgentId || !refs.getCurrentTopicId) {
        console.error('[InputEnhancer] Initialization failed: Missing required references.');
        return;
    }
    // Assign electronAPI from refs to the module-scoped variable (which is no longer declared with let/const at the top)
    // This assumes electronAPI is available in the scope where initializeInputEnhancer is called (e.g. window.electronAPI)
    // and is correctly passed in through refs.
    const localElectronAPI = refs.electronAPI; // Use a local const to avoid confusion if needed, or directly use refs.electronAPI
    console.log('[InputEnhancer] Initializing with localElectronAPI:', localElectronAPI); // Log the API object
    attachedFilesRef = refs.attachedFiles;
    updateAttachmentPreviewRef = refs.updateAttachmentPreview;
    currentAgentIdRef = refs.getCurrentAgentId;
    currentTopicIdRef = refs.getCurrentTopicId;

    const messageInput = refs.messageInput;

    // 1. Drag and Drop functionality
    messageInput.addEventListener('dragenter', (event) => {
        event.preventDefault();
        event.stopPropagation();
        console.log('[InputEnhancer] dragenter event');
        messageInput.classList.add('drag-over');
    });

    messageInput.addEventListener('dragover', (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
        if (!messageInput.classList.contains('drag-over')) {
            messageInput.classList.add('drag-over');
        }
    });

    messageInput.addEventListener('dragleave', (event) => {
        event.preventDefault();
        event.stopPropagation();
        console.log('[InputEnhancer] dragleave event');
        messageInput.classList.remove('drag-over');
    });

    messageInput.addEventListener('drop', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        console.log('[InputEnhancer] drop event triggered.');
        messageInput.classList.remove('drag-over');

        const agentId = currentAgentIdRef();
        const topicId = currentTopicIdRef();
        console.log(`[InputEnhancer] Drop event - currentAgentId: ${agentId}, currentTopicId: ${topicId}`); // Added log

        if (!agentId || !topicId) {
            alert("请先选择一个Agent和话题才能拖拽文件。");
            console.warn('[InputEnhancer] Drop aborted: Agent ID or Topic ID missing.');
            return;
        }

        const files = event.dataTransfer.files;
        if (files && files.length > 0) {
            console.log(`[InputEnhancer] Dropped ${files.length} files.`);
            const filesToProcess = [];

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                // Always try to read the file as a Buffer/ArrayBuffer, regardless of 'path' property.
                // This is more robust for drag-and-drop in Electron.
                filesToProcess.push(new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const arrayBuffer = e.target.result;
                        // If arrayBuffer is null or empty, it means FileReader couldn't read it.
                        if (!arrayBuffer) {
                            console.warn(`[InputEnhancer] FileReader received null ArrayBuffer for ${file.name}. Original size: ${file.size}.`);
                            resolve({ name: file.name, error: `无法读取文件内容` });
                            return;
                        }
                        const fileBuffer = new Uint8Array(arrayBuffer);
                        console.log(`[InputEnhancer] FileReader finished for ${file.name}. Size: ${file.size}, Buffer length: ${fileBuffer.length}, Type: ${file.type}`);
                        
                        // If fileBuffer is empty but original file size is not 0, it's still an issue.
                        // However, for very small files (e.g., 0-byte files), fileBuffer.length will be 0.
                        // We should allow 0-byte files to pass through if file.size is also 0.
                        // Removed the strict check for fileBuffer.length === 0 && file.size > 0 here,
                        // as it might be overly aggressive for certain file types or empty files.
                        // The main process's fileManager.storeFile will handle empty buffers.

                        resolve({
                            name: file.name,
                            type: file.type || 'application/octet-stream',
                            data: fileBuffer, // Send the buffer data
                            size: file.size
                        });
                    };
                    reader.onerror = (err) => {
                        console.error(`[InputEnhancer] FileReader error for ${file.name}:`, err);
                        resolve({ name: file.name, error: `无法读取文件: ${err.message}` });
                    };
                    reader.readAsArrayBuffer(file);
                }));
            }

            const droppedFilesData = await Promise.all(filesToProcess);
            const successfulFiles = droppedFilesData.filter(f => !f.error);
            const failedFiles = droppedFilesData.filter(f => f.error);

            if (failedFiles.length > 0) {
                failedFiles.forEach(f => {
                    alert(`处理拖拽的文件 ${f.name} 失败: ${f.error}`);
                    console.error(`[InputEnhancer] Failed to process dropped file ${f.name}: ${f.error}`);
                });
            }

            if (successfulFiles.length === 0) {
                console.warn('[InputEnhancer] No processable files found in drop event after reading attempts.');
                return;
            }

            try {
                console.log('[InputEnhancer] Calling localElectronAPI.handleFileDrop with:', agentId, topicId, successfulFiles.map(f => ({ name: f.name, type: f.type, size: f.size, data: f.data ? `[Buffer, length: ${f.data.length}]` : 'N/A' })));
                // Pass the actual buffers to main process
                const results = await localElectronAPI.handleFileDrop(agentId, topicId, successfulFiles);
                console.log('[InputEnhancer] Results from handleFileDrop:', results);
                if (results && results.length > 0) {
                    results.forEach(result => {
                        if (result.success && result.attachment) {
                            const att = result.attachment;
                            const currentFiles = attachedFilesRef.get();
                            currentFiles.push({
                                file: { name: att.name, type: att.type, size: att.size },
                                localPath: att.internalPath,
                                originalName: att.name,
                                _fileManagerData: att
                            });
                            attachedFilesRef.set(currentFiles);
                            console.log(`[InputEnhancer] Successfully attached dropped file: ${att.name}`);
                        } else if (result.error) {
                            console.error(`[InputEnhancer] Error processing dropped file ${result.name || 'unknown'}: ${result.error}`);
                            alert(`处理拖拽的文件 ${result.name || '未知文件'} 失败: ${result.error}`);
                        }
                    });
                    updateAttachmentPreviewRef();
                }
            } catch (err) {
                console.error('[InputEnhancer] Error calling localElectronAPI.handleFileDrop IPC:', err);
                alert('处理拖拽的文件时发生意外错误。');
            }
        } else {
            console.log('[InputEnhancer] Drop event occurred but no files found in dataTransfer.');
        }
    });

    // 2. Enhanced Paste functionality
    messageInput.addEventListener('paste', async (event) => {
        console.log('[InputEnhancer] paste event triggered.');
        // It's often better to prevent default early if we plan to handle any complex paste type.
        // We can conditionally allow default later if no custom handling applies.
        // For now, let's prevent default if there's anything other than simple text.
        
        const agentId = currentAgentIdRef();
        const topicId = currentTopicIdRef();
        console.log(`[InputEnhancer] Paste event - currentAgentId: ${agentId}, currentTopicId: ${topicId}`); // Added log

        const clipboardData = event.clipboardData || window.clipboardData;
        if (!clipboardData) {
            console.warn('[InputEnhancer] Clipboard data not available.');
            return;
        }
        const items = clipboardData.items;
        let handled = false; // Flag to track if we've handled the paste

        // Attempt to handle file items first
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file) {
                    event.preventDefault(); // We are handling this
                    handled = true;
                    console.log(`[InputEnhancer] Pasted file: Name: ${file.name}, Type: ${file.type}, Size: ${file.size}`);

                    if (!agentId || !topicId) {
                        alert("请先选择一个Agent和话题才能粘贴文件。");
                        console.warn('[InputEnhancer] File paste aborted: Agent ID or Topic ID missing.');
                        return; // Stop further processing for this paste event
                    }

                    const reader = new FileReader();
                    reader.onload = async (e_reader) => {
                        const arrayBuffer = e_reader.target.result;
                        const fileBuffer = new Uint8Array(arrayBuffer);
                        console.log(`[InputEnhancer] FileReader loaded for pasted file ${file.name}. Buffer length: ${fileBuffer.length}`);

                        if (fileBuffer.length > 0 || file.size === 0) {
                            try {
                                // Use handleFileDrop IPC as it expects an array of file-like objects with a 'data' (buffer) property
                                const results = await localElectronAPI.handleFileDrop(agentId, topicId, [{
                                    name: file.name,
                                    type: file.type || 'application/octet-stream',
                                    data: fileBuffer,
                                    size: file.size
                                }]);

                                if (results && results.length > 0 && results[0].success && results[0].attachment) {
                                    const att = results[0].attachment;
                                    const currentFiles = attachedFilesRef.get();
                                    currentFiles.push({
                                        file: { name: att.name, type: att.type, size: att.size },
                                        localPath: att.internalPath,
                                        originalName: att.name,
                                        _fileManagerData: att
                                    });
                                    attachedFilesRef.set(currentFiles);
                                    updateAttachmentPreviewRef();
                                    console.log(`[InputEnhancer] Successfully attached pasted file: ${att.name}`);
                                } else {
                                    const errorMsg = results && results.length > 0 && results[0].error ? results[0].error : '未知错误';
                                    alert(`粘贴文件 "${file.name}" 失败: ${errorMsg}`);
                                    console.error(`[InputEnhancer] Failed to process pasted file ${file.name}:`, errorMsg);
                                }
                            } catch (err_ipc) {
                                console.error('[InputEnhancer] Error sending pasted file buffer to main via handleFileDrop IPC:', err_ipc);
                                alert(`粘贴文件 "${file.name}" 时发生 IPC 错误。`);
                            }
                        } else {
                            alert(`无法读取粘贴的文件 "${file.name}" 的内容。`);
                            console.warn(`[InputEnhancer] FileReader read empty buffer for ${file.name} but size was ${file.size}`);
                        }
                    };
                    reader.onerror = (err_reader) => {
                        console.error(`[InputEnhancer] FileReader error for pasted file ${file.name}:`, err_reader);
                        alert(`读取粘贴的文件 "${file.name}" 失败。`);
                    };
                    reader.readAsArrayBuffer(file);
                }
                return; // Stop after handling the first file item
            }
        }

        // If no file was handled, try to read image data directly from clipboard (for screenshots)
        if (!handled) {
            try {
                const imageData = await localElectronAPI.readImageFromClipboard();
                console.log("[InputEnhancer] Image data from clipboard (direct read attempt):", imageData ? 'Exists' : 'null', imageData);
                if (imageData && imageData.data) {
                    event.preventDefault(); // We are handling this
                    handled = true;

                    if (!agentId || !topicId) {
                        alert("请先选择一个Agent和话题才能粘贴图片。");
                        console.warn('[InputEnhancer] Image data paste aborted: Agent ID or Topic ID missing.');
                        return;
                    }

                    const result = await localElectronAPI.handleFilePaste(agentId, topicId, {
                        type: 'base64',
                        data: imageData.data,
                        extension: imageData.extension || 'png'
                    });
                    if (result.success && result.attachment) {
                        const att = result.attachment;
                        const currentFiles = attachedFilesRef.get();
                        currentFiles.push({
                            file: { name: att.name, type: att.type, size: att.size },
                            localPath: att.internalPath,
                            originalName: att.name,
                            _fileManagerData: att
                        });
                        attachedFilesRef.set(currentFiles);
                        updateAttachmentPreviewRef();
                    } else {
                        alert(`无法从剪贴板粘贴图片: ${result.error || '截图处理失败'}`);
                    }
                    return; // Stop after handling screenshot
                } else if (imageData && imageData.error) {
                    // This means clipboard.readImage() failed, which is expected if it's not image data.
                    // We don't alert here as it might just be a text paste.
                    console.log("[InputEnhancer] readImageFromClipboard failed:", imageData.error);
                }
            } catch (e) {
                console.error("[InputEnhancer] Error during readImageFromClipboard:", e);
            }
        }

        // If not handled as a file or direct image data, process as text
        if (!handled) {
            const pastedText = clipboardData.getData('text/plain');
            if (pastedText) {
                if (!agentId || !topicId) {
                    // Allow default text paste if no agent/topic selected
                    console.warn('[InputEnhancer] Agent/Topic not selected, allowing default text paste.');
                    return;
                }
                // If we are here, it means it's not a file or screenshot we explicitly handled.
                // So, we can prevent default for text to handle long text.
                event.preventDefault();
                handled = true;

                if (pastedText.length > LONG_TEXT_THRESHOLD) {
                    console.log(`[InputEnhancer] Pasted long text (${pastedText.length} chars). Converting to .txt file.`);
                    try {
                        const result = await localElectronAPI.handleTextPasteAsFile(agentId, topicId, pastedText);
                        if (result.success && result.attachment) {
                            // ... (add to attachedFilesRef and update preview) ...
                            const att = result.attachment;
                            const currentFiles = attachedFilesRef.get();
                            currentFiles.push({
                                file: { name: att.name, type: att.type, size: att.size },
                                localPath: att.internalPath,
                                originalName: att.name,
                                _fileManagerData: att
                            });
                            attachedFilesRef.set(currentFiles);
                            updateAttachmentPreviewRef();
                        } else {
                            alert(`长文本转存为 .txt 文件失败: ${result.error || '未知错误'}`);
                        }
                    } catch (err) {
                        alert('长文本转存时发生意外错误。');
                    }
                } else {
                    // Insert short text normally
                    document.execCommand('insertText', false, pastedText);
                }
            }
        }

        if (handled) {
            console.log('[InputEnhancer] Paste event custom handling completed.');
        } else {
            console.log('[InputEnhancer] Paste event not handled by custom logic, allowing default.');
            return;
        }
    });

    console.log('[InputEnhancer] Event listeners attached to message input.');

    // --- @note Mention Functionality ---
    let noteSuggestionPopup = null;
    let activeSuggestionIndex = -1;

    messageInput.addEventListener('input', async () => {
        const text = messageInput.value;
        const cursorPos = messageInput.selectionStart;
        const atMatch = text.substring(0, cursorPos).match(/@([\w\u4e00-\u9fa5]*)$/);

        if (atMatch) {
            const query = atMatch[1];
            const notes = await localElectronAPI.searchNotes(query);
            if (notes.length > 0) {
                showNoteSuggestions(notes, query);
            } else {
                hideNoteSuggestions();
            }
        } else {
            hideNoteSuggestions();
        }
    });

    messageInput.addEventListener('keydown', (e) => {
        if (noteSuggestionPopup && noteSuggestionPopup.style.display === 'block') {
            const items = noteSuggestionPopup.querySelectorAll('.suggestion-item');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                activeSuggestionIndex = (activeSuggestionIndex + 1) % items.length;
                updateSuggestionHighlight();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                activeSuggestionIndex = (activeSuggestionIndex - 1 + items.length) % items.length;
                updateSuggestionHighlight();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (activeSuggestionIndex > -1) {
                    items[activeSuggestionIndex].click();
                }
            } else if (e.key === 'Escape') {
                hideNoteSuggestions();
            }
        }
    });

    function showNoteSuggestions(notes, query) {
        if (!noteSuggestionPopup) {
            noteSuggestionPopup = document.createElement('div');
            noteSuggestionPopup.id = 'note-suggestion-popup';
            document.body.appendChild(noteSuggestionPopup);
        }

        noteSuggestionPopup.innerHTML = '';
        notes.forEach((note, index) => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.textContent = note.name;
            item.dataset.filePath = note.path;
            item.addEventListener('click', () => selectNoteSuggestion(note));
            noteSuggestionPopup.appendChild(item);
        });

        const rect = messageInput.getBoundingClientRect();
        noteSuggestionPopup.style.left = `${rect.left}px`;
        noteSuggestionPopup.style.bottom = `${window.innerHeight - rect.top}px`;
        noteSuggestionPopup.style.display = 'block';
        activeSuggestionIndex = 0;
        updateSuggestionHighlight();
    }

    function hideNoteSuggestions() {
        if (noteSuggestionPopup) {
            noteSuggestionPopup.style.display = 'none';
        }
        activeSuggestionIndex = -1;
    }

    function updateSuggestionHighlight() {
        const items = noteSuggestionPopup.querySelectorAll('.suggestion-item');
        items.forEach((item, index) => {
            item.classList.toggle('active', index === activeSuggestionIndex);
        });
    }

    async function selectNoteSuggestion(note) {
        const agentId = currentAgentIdRef();
        const topicId = currentTopicIdRef();
        if (!agentId || !topicId) {
            alert("请先选择一个Agent和话题才能附加笔记。");
            return;
        }

        // Replace the @mention text
        const text = messageInput.value;
        const cursorPos = messageInput.selectionStart;
        const textBeforeCursor = text.substring(0, cursorPos);
        const atMatch = textBeforeCursor.match(/@([\w\u4e00-\u9fa5]*)$/);
        if (atMatch) {
            const mentionLength = atMatch[0].length;
            const newText = text.substring(0, cursorPos - mentionLength) + text.substring(cursorPos);
            messageInput.value = newText;
        }

        hideNoteSuggestions();

        // Attach the file using existing logic
        try {
            const results = await localElectronAPI.handleFileDrop(agentId, topicId, [{
                path: note.path, // Pass the full path
                name: note.name
                // No need to specify type or data, main process will handle it
            }]);

            if (results && results.length > 0 && results[0].success && results[0].attachment) {
                const att = results[0].attachment;
                const currentFiles = attachedFilesRef.get();
                currentFiles.push({
                    file: { name: att.name, type: att.type, size: att.size },
                    localPath: att.internalPath,
                    originalName: att.name,
                    _fileManagerData: att
                });
                attachedFilesRef.set(currentFiles);
                updateAttachmentPreviewRef();
                console.log(`[InputEnhancer] Successfully attached note: ${att.name}`);
            } else {
                const errorMsg = results && results.length > 0 && results[0].error ? results[0].error : '未知错误';
                alert(`附加笔记 "${note.name}" 失败: ${errorMsg}`);
            }
        } catch (err) {
            console.error('[InputEnhancer] Error attaching note file:', err);
            alert(`附加笔记 "${note.name}" 时发生意外错误。`);
        }
    }
}

window.inputEnhancer = {
    initializeInputEnhancer
};