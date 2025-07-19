// modules/messageRenderer.js

// --- Enhanced Rendering Constants ---
const ENHANCED_RENDER_DEBOUNCE_DELAY = 400; // ms, for general blocks during streaming
const DIARY_RENDER_DEBOUNCE_DELAY = 1000; // ms, potentially longer for diary if complex
const enhancedRenderDebounceTimers = new WeakMap(); // For debouncing prettify calls



import { avatarColorCache, getDominantAvatarColor } from './renderer/colorUtils.js';
import { initializeImageHandler, setContentAndProcessImages, clearImageState, clearAllImageStates } from './renderer/imageHandler.js';
import { createMessageSkeleton } from './renderer/domBuilder.js';
import * as streamManager from './renderer/streamManager.js';


import * as contentProcessor from './renderer/contentProcessor.js';
import * as contextMenu from './renderer/messageContextMenu.js';


// --- Enhanced Rendering Styles (from UserScript) ---
function injectEnhancedStyles() {
   try {
       const existingStyleElement = document.getElementById('vcp-enhanced-ui-styles');
       if (existingStyleElement) {
           // Style element already exists, no need to recreate
           return;
       }

       // Create link element to load external CSS
       const linkElement = document.createElement('link');
       linkElement.id = 'vcp-enhanced-ui-styles';
       linkElement.rel = 'stylesheet';
       linkElement.type = 'text/css';
       linkElement.href = 'styles/messageRenderer.css';
       document.head.appendChild(linkElement);

       // console.log('VCPSub Enhanced UI: External styles loaded.'); // Reduced logging
   } catch (error) {
       console.error('VCPSub Enhanced UI: Failed to load external styles:', error);
   }
}




// --- Core Logic ---

/**
 * Wraps raw tool calls in markdown code fences if they aren't already.
 * This makes the rendering of tool calls more robust by ensuring they are treated as code blocks.
 * @param {string} text The text content.
 * @returns {string} The processed text.
 */
function ensureToolCallFenced(text) {
    const toolRequestStart = '<<<[TOOL_REQUEST]>>>';
    const toolRequestEnd = '<<<[END_TOOL_REQUEST]>>>';

    // Quick exit if no tool call is present.
    if (!text.includes(toolRequestStart)) {
        return text;
    }

    let result = '';
    let lastIndex = 0;
    while (true) {
        const startIndex = text.indexOf(toolRequestStart, lastIndex);

        // Append the segment of text before the current tool block.
        // If no more blocks are found, this appends the rest of the string.
        const textSegment = text.substring(lastIndex, startIndex === -1 ? text.length : startIndex);
        result += textSegment;

        if (startIndex === -1) {
            break; // Exit loop if no more start markers are found.
        }

        const endIndex = text.indexOf(toolRequestEnd, startIndex + toolRequestStart.length);
        if (endIndex === -1) {
            // Malformed tool call (no end tag), append the rest of the string and stop.
            result += text.substring(startIndex);
            break;
        }

        const block = text.substring(startIndex, endIndex + toolRequestEnd.length);
        
        // Check if we are currently inside an open code block by counting fences in the processed result.
        const fencesInResult = (result.match(/```/g) || []).length;

        if (fencesInResult % 2 === 0) {
            // Even number of fences means we are outside a code block.
            // Wrap the tool call in new fences.
            result += `\n\`\`\`\n${block}\n\`\`\`\n`;
        } else {
            // Odd number of fences means we are inside a code block.
            // Append the tool call as is.
            result += block;
        }

        // Move past the current tool block.
        lastIndex = endIndex + toolRequestEnd.length;
    }

    return result;
}

/**
 * Wraps raw HTML documents in markdown code fences if they aren't already.
 * An HTML document is identified by the `<!DOCTYPE html>` declaration.
 * @param {string} text The text content.
 * @returns {string} The processed text.
 */
function ensureHtmlFenced(text) {
    const doctypeTag = '<!DOCTYPE html>';
    const htmlCloseTag = '</html>';

    // Quick exit if no doctype is present.
    if (!text.toLowerCase().includes(doctypeTag.toLowerCase())) {
        return text;
    }

    let result = '';
    let lastIndex = 0;
    while (true) {
        const startIndex = text.toLowerCase().indexOf(doctypeTag.toLowerCase(), lastIndex);

        // Append the segment of text before the current HTML block.
        const textSegment = text.substring(lastIndex, startIndex === -1 ? text.length : startIndex);
        result += textSegment;

        if (startIndex === -1) {
            break; // Exit loop if no more doctype markers are found.
        }

        // Find the corresponding </html> tag.
        const endIndex = text.toLowerCase().indexOf(htmlCloseTag.toLowerCase(), startIndex + doctypeTag.length);
        if (endIndex === -1) {
            // Malformed HTML (no closing tag), append the rest of the string and stop.
            result += text.substring(startIndex);
            break;
        }

        const block = text.substring(startIndex, endIndex + htmlCloseTag.length);
        
        // Check if we are currently inside an open code block by counting fences in the processed result.
        const fencesInResult = (result.match(/```/g) || []).length;

        if (fencesInResult % 2 === 0) {
            // Even number of fences means we are outside a code block.
            // Wrap the HTML block in new fences.
            result += `\n\`\`\`html\n${block}\n\`\`\`\n`;
        } else {
            // Odd number of fences means we are inside a code block.
            // Append the HTML block as is.
            result += block;
        }

        // Move past the current HTML block.
        lastIndex = endIndex + htmlCloseTag.length;
    }

    return result;
}

/**
 * A helper function to preprocess the full message content string before parsing.
 * @param {string} text The raw text content.
 * @returns {string} The processed text.
 */
function preprocessFullContent(text) {
   let processed = text;
   processed = ensureToolCallFenced(processed);
   processed = ensureHtmlFenced(processed);
   processed = contentProcessor.ensureNewlineAfterCodeBlock(processed);
   processed = contentProcessor.ensureSpaceAfterTilde(processed);
   processed = contentProcessor.removeIndentationFromCodeBlockMarkers(processed);
   processed = contentProcessor.removeSpeakerTags(processed);
   processed = contentProcessor.ensureSeparatorBetweenImgAndCode(processed);
   return processed;
}

/**
 * @typedef {Object} Message
 * @property {'user'|'assistant'|'system'} role
 * @property {string} content
 * @property {number} timestamp
 * @property {string} [id] 
 * @property {boolean} [isThinking]
 * @property {Array<{type: string, src: string, name: string}>} [attachments]
 * @property {string} [finishReason] 
 * @property {boolean} [isGroupMessage] // New: Indicates if it's a group message
 * @property {string} [agentId] // New: ID of the speaking agent in a group
 * @property {string} [name] // New: Name of the speaking agent in a group (can override default role name)
 * @property {string} [avatarUrl] // New: Specific avatar for this message (e.g. group member)
 * @property {string} [avatarColor] // New: Specific avatar color for this message
 */


/**
 * @typedef {Object} CurrentSelectedItem
 * @property {string|null} id - Can be agentId or groupId
 * @property {'agent'|'group'|null} type 
 * @property {string|null} name
 * @property {string|null} avatarUrl
 * @property {object|null} config - Full config of the selected item
 */


let mainRendererReferences = {
    currentChatHistoryRef: { get: () => [], set: () => {} }, // Ref to array
    currentSelectedItemRef: { get: () => ({ id: null, type: null, name: null, avatarUrl: null, config: null }), set: () => {} }, // Ref to object
    currentTopicIdRef: { get: () => null, set: () => {} }, // Ref to string/null
    globalSettingsRef: { get: () => ({ userName: '用户', userAvatarUrl: 'assets/default_user_avatar.png', userAvatarCalculatedColor: null }), set: () => {} }, // Ref to object

    chatMessagesDiv: null,
    electronAPI: null,
    markedInstance: null,
    uiHelper: {
        scrollToBottom: () => {},
        openModal: () => {},
        autoResizeTextarea: () => {},
        // ... other uiHelper functions ...
    },
    summarizeTopicFromMessages: async () => "",
    handleCreateBranch: () => {},
    // activeStreamingMessageId: null, // ID of the message currently being streamed - REMOVED
};

function removeMessageById(messageId, saveHistory = false) {
    const item = mainRendererReferences.chatMessagesDiv.querySelector(`.message-item[data-message-id="${messageId}"]`);
    if (item) item.remove();
    
    const currentChatHistoryArray = mainRendererReferences.currentChatHistoryRef.get();
    const index = currentChatHistoryArray.findIndex(m => m.id === messageId);
    
    if (index > -1) {
        currentChatHistoryArray.splice(index, 1);
        mainRendererReferences.currentChatHistoryRef.set([...currentChatHistoryArray]);
        
        if (saveHistory) {
            const currentSelectedItemVal = mainRendererReferences.currentSelectedItemRef.get();
            const currentTopicIdVal = mainRendererReferences.currentTopicIdRef.get();
            if (currentSelectedItemVal.id && currentTopicIdVal) {
                if (currentSelectedItemVal.type === 'agent') {
                    mainRendererReferences.electronAPI.saveChatHistory(currentSelectedItemVal.id, currentTopicIdVal, currentChatHistoryArray);
                } else if (currentSelectedItemVal.type === 'group' && mainRendererReferences.electronAPI.saveGroupChatHistory) {
                    mainRendererReferences.electronAPI.saveGroupChatHistory(currentSelectedItemVal.id, currentTopicIdVal, currentChatHistoryArray);
                }
            }
        }
    }
    clearImageState(messageId); // Clean up image state for the deleted message
}

function clearChat() {
    if (mainRendererReferences.chatMessagesDiv) mainRendererReferences.chatMessagesDiv.innerHTML = '';
    mainRendererReferences.currentChatHistoryRef.set([]); // Clear the history array via its ref
    clearAllImageStates(); // Clear all image loading states
}


function initializeMessageRenderer(refs) {
   Object.assign(mainRendererReferences, refs);

   initializeImageHandler({
       electronAPI: mainRendererReferences.electronAPI,
       uiHelper: mainRendererReferences.uiHelper,
       chatMessagesDiv: mainRendererReferences.chatMessagesDiv,
   });

   contentProcessor.initializeContentProcessor(mainRendererReferences);

   contextMenu.initializeContextMenu(mainRendererReferences, {
       // Pass functions that the context menu needs to call back into the main renderer
       removeMessageById: removeMessageById,
       finalizeStreamedMessage: finalizeStreamedMessage,
       renderMessage: renderMessage,
       startStreamingMessage: startStreamingMessage,
       setContentAndProcessImages: setContentAndProcessImages,
       processRenderedContent: contentProcessor.processRenderedContent,
       preprocessFullContent: preprocessFullContent,
       renderAttachments: renderAttachments,
   });

   streamManager.initStreamManager({
       // Core Refs
       globalSettingsRef: mainRendererReferences.globalSettingsRef,
       currentChatHistoryRef: mainRendererReferences.currentChatHistoryRef,
       currentSelectedItemRef: mainRendererReferences.currentSelectedItemRef,
       currentTopicIdRef: mainRendererReferences.currentTopicIdRef,
       
       // DOM & API Refs
       chatMessagesDiv: mainRendererReferences.chatMessagesDiv,
       markedInstance: mainRendererReferences.markedInstance,
       electronAPI: mainRendererReferences.electronAPI,
       uiHelper: mainRendererReferences.uiHelper,

       // Rendering & Utility Functions
       renderMessage: renderMessage,
       showContextMenu: contextMenu.showContextMenu,
       setContentAndProcessImages: setContentAndProcessImages,
       processRenderedContent: contentProcessor.processRenderedContent,
       preprocessFullContent: preprocessFullContent,
       // Pass individual processors needed by streamManager
       removeSpeakerTags: contentProcessor.removeSpeakerTags,
       ensureNewlineAfterCodeBlock: contentProcessor.ensureNewlineAfterCodeBlock,
       ensureSpaceAfterTilde: contentProcessor.ensureSpaceAfterTilde,
       removeIndentationFromCodeBlockMarkers: contentProcessor.removeIndentationFromCodeBlockMarkers,
       ensureSeparatorBetweenImgAndCode: contentProcessor.ensureSeparatorBetweenImgAndCode,

       // Pass the main processor function
       processRenderedContent: contentProcessor.processRenderedContent,

       // Debouncing and Timers
       enhancedRenderDebounceTimers: enhancedRenderDebounceTimers,
       ENHANCED_RENDER_DEBOUNCE_DELAY: ENHANCED_RENDER_DEBOUNCE_DELAY,
       DIARY_RENDER_DEBOUNCE_DELAY: DIARY_RENDER_DEBOUNCE_DELAY,
   });


   injectEnhancedStyles();
   console.log("[MessageRenderer] Initialized. Current selected item type on init:", mainRendererReferences.currentSelectedItemRef.get()?.type);
}


function setCurrentSelectedItem(item) {
    // This function is mainly for renderer.js to update the shared state.
    // messageRenderer will read from currentSelectedItemRef.get() when rendering.
    // console.log("[MessageRenderer] setCurrentSelectedItem called with:", item);
}

function setCurrentTopicId(topicId) {
    // console.log("[MessageRenderer] setCurrentTopicId called with:", topicId);
}

// These are for specific avatar of the current *context* (agent or user), not for individual group member messages
function setCurrentItemAvatar(avatarUrl) { // Renamed from setCurrentAgentAvatar
    // This updates the avatar for the main selected agent/group, not individual group members in a message.
    // The currentSelectedItemRef should hold the correct avatar for the overall context.
}

function setUserAvatar(avatarUrl) { // For the user's global avatar
    const globalSettings = mainRendererReferences.globalSettingsRef.get();
    const oldUrl = globalSettings.userAvatarUrl;
    if (oldUrl && oldUrl !== (avatarUrl || 'assets/default_user_avatar.png')) {
        avatarColorCache.delete(oldUrl.split('?')[0]);
    }
    mainRendererReferences.globalSettingsRef.set({...globalSettings, userAvatarUrl: avatarUrl || 'assets/default_user_avatar.png' });
}

function setCurrentItemAvatarColor(color) { // Renamed from setCurrentAgentAvatarColor
    // For the main selected agent/group
}

function setUserAvatarColor(color) { // For the user's global avatar
    const globalSettings = mainRendererReferences.globalSettingsRef.get();
    mainRendererReferences.globalSettingsRef.set({...globalSettings, userAvatarCalculatedColor: color });
}


async function renderAttachments(message, contentDiv) {
    const { electronAPI } = mainRendererReferences;
    if (message.attachments && message.attachments.length > 0) {
        const attachmentsContainer = document.createElement('div');
        attachmentsContainer.classList.add('message-attachments');
        message.attachments.forEach(att => {
            let attachmentElement;
            if (att.type.startsWith('image/')) {
                attachmentElement = document.createElement('img');
                attachmentElement.src = att.src; // This src should be usable (e.g., file:// or data:)
                attachmentElement.alt = `附件图片: ${att.name}`;
                attachmentElement.title = `点击在新窗口预览: ${att.name}`;
                attachmentElement.classList.add('message-attachment-image-thumbnail');
                attachmentElement.onclick = (e) => {
                    e.stopPropagation();
                    const currentTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
                    electronAPI.openImageInNewWindow(att.src, att.name, currentTheme);
                };
                 attachmentElement.addEventListener('contextmenu', (e) => { // Use attachmentElement here
                    e.preventDefault(); e.stopPropagation();
                    electronAPI.showImageContextMenu(att.src);
                });
            } else if (att.type.startsWith('audio/')) {
                attachmentElement = document.createElement('audio');
                attachmentElement.src = att.src;
                attachmentElement.controls = true;
            } else if (att.type.startsWith('video/')) {
                attachmentElement = document.createElement('video');
                attachmentElement.src = att.src;
                attachmentElement.controls = true;
                attachmentElement.style.maxWidth = '300px';
            } else { // Generic file
                attachmentElement = document.createElement('a');
                attachmentElement.href = att.src;
                attachmentElement.textContent = `📄 ${att.name}`;
                attachmentElement.title = `点击打开文件: ${att.name}`;
                attachmentElement.onclick = (e) => {
                    e.preventDefault();
                    if (electronAPI.sendOpenExternalLink && att.src.startsWith('file://')) {
                         electronAPI.sendOpenExternalLink(att.src);
                    } else {
                        console.warn("Cannot open local file attachment, API missing or path not a file URI:", att.src);
                    }
                };
            }
            if (attachmentElement) attachmentsContainer.appendChild(attachmentElement);
        });
        contentDiv.appendChild(attachmentsContainer);
    }
}

async function renderMessage(message, isInitialLoad = false) {
    console.log('[MessageRenderer renderMessage] Received message:', JSON.parse(JSON.stringify(message))); // Log incoming message
    const { chatMessagesDiv, electronAPI, markedInstance, uiHelper } = mainRendererReferences;
    const globalSettings = mainRendererReferences.globalSettingsRef.get();
    const currentSelectedItem = mainRendererReferences.currentSelectedItemRef.get();
    const currentChatHistory = mainRendererReferences.currentChatHistoryRef.get();


    if (!chatMessagesDiv || !electronAPI || !markedInstance) {
        console.error("MessageRenderer: Missing critical references for rendering.");
        return null;
    }

    if (!message.id) {
        message.id = `msg_${message.timestamp}_${Math.random().toString(36).substring(2, 9)}`;
    }

    const { messageItem, contentDiv, avatarImg, senderNameDiv } = createMessageSkeleton(message, globalSettings, currentSelectedItem);

    if (message.role !== 'system' && !message.isThinking) {
       messageItem.addEventListener('contextmenu', (e) => {
           e.preventDefault();
           contextMenu.showContextMenu(e, messageItem, message);
       });
   }

    // Determine avatar color and URL to use
    let avatarColorToUse;
    let avatarUrlToUse; // This was the missing variable
    if (message.role === 'user') {
        avatarColorToUse = globalSettings.userAvatarCalculatedColor;
        avatarUrlToUse = globalSettings.userAvatarUrl;
    } else if (message.role === 'assistant') {
        if (message.isGroupMessage) {
            avatarColorToUse = message.avatarColor;
            avatarUrlToUse = message.avatarUrl;
        } else if (currentSelectedItem) {
            avatarColorToUse = currentSelectedItem.config?.avatarCalculatedColor;
            avatarUrlToUse = currentSelectedItem.avatarUrl;
        }
    }

    chatMessagesDiv.appendChild(messageItem);

    if (message.isThinking) {
        contentDiv.innerHTML = `<span class="thinking-indicator">${message.content || '思考中'}<span class="thinking-indicator-dots">...</span></span>`;
        messageItem.classList.add('thinking');
    } else {
        let textToRender = "";
        if (typeof message.content === 'string') {
            textToRender = message.content;
        } else if (message.content && typeof message.content.text === 'string') {
            // This case handles objects like { text: "..." }, common for group messages before history saving
            textToRender = message.content.text;
        } else if (message.content === null || message.content === undefined) {
            textToRender = ""; // Handle null or undefined content gracefully
             console.warn('[MessageRenderer] message.content is null or undefined for message ID:', message.id);
        } else {
            // Fallback for other unexpected object structures, log and use a placeholder
            console.warn('[MessageRenderer] Unexpected message.content type. Message ID:', message.id, 'Content:', JSON.stringify(message.content));
            textToRender = "[消息内容格式异常]";
        }
        
       const processedContent = preprocessFullContent(textToRender);
       const rawHtml = markedInstance.parse(processedContent);
       setContentAndProcessImages(contentDiv, rawHtml, message.id);
       contentProcessor.processRenderedContent(contentDiv);
   }
    
    // Avatar Color Application (after messageItem is in DOM)
    if ((message.role === 'user' || message.role === 'assistant') && avatarImg && senderNameDiv) {
        const applyColorToElements = (colorStr) => {
            if (colorStr && messageItem.isConnected) { // Check if still in DOM
                senderNameDiv.style.color = colorStr;
                avatarImg.style.borderColor = colorStr;
            }
        };

        if (avatarColorToUse) { // If a specific color was passed (e.g. for group member or persisted user/agent color)
            applyColorToElements(avatarColorToUse);
        } else if (avatarUrlToUse && !avatarUrlToUse.includes('default_')) { // No persisted color, try to extract
            const dominantColor = await getDominantAvatarColor(avatarUrlToUse);
            applyColorToElements(dominantColor);
            if (dominantColor && messageItem.isConnected) { // If extracted and still in DOM, try to persist
                let typeToSave, idToSaveFor;
                if (message.role === 'user') {
                    typeToSave = 'user'; idToSaveFor = 'user_global';
                } else if (message.isGroupMessage && message.agentId) {
                    typeToSave = 'agent'; idToSaveFor = message.agentId; // Save for the specific group member
                } else if (currentSelectedItem && currentSelectedItem.type === 'agent') {
                    typeToSave = 'agent'; idToSaveFor = currentSelectedItem.id; // Current agent
                }

                if (typeToSave && idToSaveFor) {
                    electronAPI.saveAvatarColor({ type: typeToSave, id: idToSaveFor, color: dominantColor })
                        .then(result => {
                            if (result.success) {
                                if (typeToSave === 'user') {
                                     mainRendererReferences.globalSettingsRef.set({...globalSettings, userAvatarCalculatedColor: dominantColor });
                                } else if (typeToSave === 'agent' && idToSaveFor === currentSelectedItem.id && currentSelectedItem.config) {
                                    // Update currentSelectedItem.config if it's the active agent
                                    currentSelectedItem.config.avatarCalculatedColor = dominantColor;
                                }
                                // For group messages, the individual agent's config isn't directly held in currentSelectedItem.config
                                // The color is applied directly to the message. If persistence is needed for each group member,
                                // it should happen when their main config is loaded/saved.
                            }
                        });
                }
            }
        } else { // Default avatar or no URL, reset to theme defaults
            senderNameDiv.style.color = message.role === 'user' ? 'var(--secondary-text)' : 'var(--highlight-text)';
            avatarImg.style.borderColor = 'transparent';
        }
    }


    // Render attachments using the new helper function
    renderAttachments(message, contentDiv);
    
   if (!message.isThinking) {
       contentProcessor.processRenderedContent(contentDiv);
   }
   
   if (!isInitialLoad && !message.isThinking) {
        const currentChatHistoryArray = mainRendererReferences.currentChatHistoryRef.get();
        currentChatHistoryArray.push(message);
        mainRendererReferences.currentChatHistoryRef.set(currentChatHistoryArray); // Update the ref

        if (currentSelectedItem.id && mainRendererReferences.currentTopicIdRef.get()) {
             if (currentSelectedItem.type === 'agent') {
                electronAPI.saveChatHistory(currentSelectedItem.id, mainRendererReferences.currentTopicIdRef.get(), currentChatHistoryArray);
             } else if (currentSelectedItem.type === 'group') {
                // Group history is usually saved by groupchat.js in main process after AI response
                // If we need to save user's message immediately for groups too, add IPC for it.
                // For now, this saveChatHistory call is agent-specific.
             }
        }
    } else if (isInitialLoad && message.isThinking) {
        // This case should ideally not happen if thinking messages aren't persisted.
        // If it does, remove the transient thinking message.
        const currentChatHistoryArray = mainRendererReferences.currentChatHistoryRef.get();
        const thinkingMsgIndex = currentChatHistoryArray.findIndex(m => m.id === message.id && m.isThinking);
        if (thinkingMsgIndex > -1) {
            currentChatHistoryArray.splice(thinkingMsgIndex, 1);
            mainRendererReferences.currentChatHistoryRef.set(currentChatHistoryArray);
        }
        messageItem.remove();
        return null;
    }

   // Highlighting is now part of processRenderedContent
   
   uiHelper.scrollToBottom();
   return messageItem;
}

function startStreamingMessage(message) {
    return streamManager.startStreamingMessage(message);
}


function appendStreamChunk(messageId, chunkData, agentNameForGroup, agentIdForGroup) {
    streamManager.appendStreamChunk(messageId, chunkData, agentNameForGroup, agentIdForGroup);
}

async function finalizeStreamedMessage(messageId, finishReason, agentNameForGroup, agentIdForGroup) { // <--- fullResponseText 参数已被移除
    // 责任完全在 streamManager 内部，它应该使用自己拼接好的文本。
    // 我们现在只传递必要的元数据。
    await streamManager.finalizeStreamedMessage(messageId, finishReason, agentNameForGroup, agentIdForGroup);
}

/**
 * Renders a full, non-streamed message, replacing a 'thinking' placeholder.
 * @param {string} messageId - The ID of the message to update.
 * @param {string} fullContent - The full HTML or text content of the message.
 * @param {string} agentName - The name of the agent sending the message.
 * @param {string} agentId - The ID of the agent sending the message.
 */
async function renderFullMessage(messageId, fullContent, agentName, agentId) {
    console.log(`[MessageRenderer renderFullMessage] Rendering full message for ID: ${messageId}`);
    const { chatMessagesDiv, electronAPI, uiHelper, markedInstance } = mainRendererReferences;
    const currentChatHistoryArray = mainRendererReferences.currentChatHistoryRef.get();
    const currentSelectedItem = mainRendererReferences.currentSelectedItemRef.get();
    const currentTopicIdVal = mainRendererReferences.currentTopicIdRef.get();

    const messageItem = chatMessagesDiv.querySelector(`.message-item[data-message-id="${messageId}"]`);
    if (!messageItem) {
        console.error(`[renderFullMessage] Could not find message item with ID ${messageId} to render full content.`);
        // As a fallback, we could try to render it as a new message, but it might appear out of order.
        // For now, we'll log the error and return.
        return;
    }

    messageItem.classList.remove('thinking', 'streaming');

    const contentDiv = messageItem.querySelector('.md-content');
    if (!contentDiv) {
        console.error(`[renderFullMessage] Could not find .md-content div for message ID ${messageId}.`);
        return;
    }

    // --- Update History ---
    const messageIndex = currentChatHistoryArray.findIndex(msg => msg.id === messageId);
    if (messageIndex > -1) {
        const message = currentChatHistoryArray[messageIndex];
        message.content = fullContent;
        message.isThinking = false;
        message.finishReason = 'completed_non_streamed';
        message.name = agentName || message.name;
        message.agentId = agentId || message.agentId;
        
        // Update timestamp display if it was missing
        const nameTimeBlock = messageItem.querySelector('.name-time-block');
        if (nameTimeBlock && !nameTimeBlock.querySelector('.message-timestamp')) {
            const timestampDiv = document.createElement('div');
            timestampDiv.classList.add('message-timestamp');
            timestampDiv.textContent = new Date(message.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            nameTimeBlock.appendChild(timestampDiv);
        }
        
        mainRendererReferences.currentChatHistoryRef.set([...currentChatHistoryArray]);

        // Save history
        if (currentSelectedItem && currentSelectedItem.id && currentTopicIdVal && currentSelectedItem.type === 'group') {
            if (electronAPI.saveGroupChatHistory) {
                try {
                    await electronAPI.saveGroupChatHistory(currentSelectedItem.id, currentTopicIdVal, currentChatHistoryArray.filter(m => !m.isThinking));
                } catch (error) {
                    console.error(`[MR renderFullMessage] FAILED to save GROUP history for ${currentSelectedItem.id}, topic ${currentTopicIdVal}:`, error);
                }
            }
        }
    } else {
        console.warn(`[renderFullMessage] Message ID ${messageId} not found in history. UI will be updated, but history may be inconsistent.`);
    }

    // --- Update DOM ---
   const processedFinalText = preprocessFullContent(fullContent);
   const rawHtml = markedInstance.parse(processedFinalText);
   setContentAndProcessImages(contentDiv, rawHtml, messageId);

   // Apply post-processing
   contentProcessor.processRenderedContent(contentDiv);

   uiHelper.scrollToBottom();
}

// Expose methods to renderer.js
window.messageRenderer = {
    initializeMessageRenderer,
    setCurrentSelectedItem, // Keep for renderer.js to call
    setCurrentTopicId,      // Keep for renderer.js to call
    setCurrentItemAvatar,   // Renamed for clarity
    setUserAvatar,
    setCurrentItemAvatarColor, // Renamed
    setUserAvatarColor,
    renderMessage,
    startStreamingMessage,
    appendStreamChunk,
    finalizeStreamedMessage,
    renderFullMessage,
    clearChat,
    removeMessageById,
    summarizeTopicFromMessages: async (history, agentName) => { // Example: Keep this if it's generic enough
        // This function was passed in, so it's likely defined in renderer.js or another module.
        // If it's meant to be internal to messageRenderer, its logic would go here.
        // For now, assume it's an external utility.
        if (mainRendererReferences.summarizeTopicFromMessages) {
            return mainRendererReferences.summarizeTopicFromMessages(history, agentName);
        }
        return null;
    }
};
