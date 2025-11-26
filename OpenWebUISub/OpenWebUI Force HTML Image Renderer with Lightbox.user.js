// ==UserScript==
// @name           OpenWebUI Force HTML Image Renderer
// @version        6.0.0
// @description    Render fragmented HTML images + Auto-complete Secure VCP URL + Advanced Lightbox + Link Management.
// @author         B3000Kcn (Modified)
// @match          https://your.openwebui.url/*
// @run-at         document-idle
// @license        MIT
// ==/UserScript==

(function () {
  'use strict';

  if (document.__OWUI_IMG_RENDERER_INIT__) return;
  document.__OWUI_IMG_RENDERER_INIT__ = true;

  // ==========================================
  // 0. VCP 安全配置区域 (请在此处填写)
  // ==========================================
  const VCP_CONFIG = {
    // 填写你的域名，包含协议，末尾不要带斜杠。例如: https://aaa.bbb.ccc
    BASE_URL: "https://aaa.bbb.ccc",

    // 填写你的访问密钥
    KEY: "xxxxxxxxxxxxxxxxxxxxxxxxx"
  };

  /**
   * 核心替换函数：
   * 无论AI在 /images/ 前面填了什么，统统替换为标准格式
   */
  function fixVcpUrl(originalSrc) {
    if (!originalSrc) return originalSrc;

    // 锚点路径，这是判断是否为VCP图片的关键特征
    const anchor = "/images/";
    const index = originalSrc.indexOf(anchor);

    // 如果链接中不包含 /images/，则原样返回（可能是外链头像等）
    if (index === -1) return originalSrc;

    // 截取 /images/ 及之后的所有路径部分
    const pathPart = originalSrc.substring(index);

    // 处理 BaseURL，防止用户手误多写了斜杠
    let cleanBase = VCP_CONFIG.BASE_URL.replace(/\/+$/, "");

    // 拼接最终链接: host + /pw=key + /images/path...
    return `${cleanBase}/pw=${VCP_CONFIG.KEY}${pathPart}`;
  }

  // ==========================================
  // 1. 高级灯箱逻辑 (Zoom, Pan, Pinch)
  // ==========================================
  const LIGHTBOX_CSS = `
    .gm-lightbox-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,.9);
      display: flex; justify-content: center; align-items: center;
      z-index: 99999; opacity: 0; animation: gm-fadein .2s forwards;
      overflow: hidden; touch-action: none;
    }
    .gm-lightbox-image-container {
      width: 100%; height: 100%; display: flex;
      justify-content: center; align-items: center;
      pointer-events: none;
    }
    .gm-lightbox-image {
      max-width: 90vw; max-height: 90vh; display: block;
      box-shadow: 0 8px 30px rgba(0,0,0,.5); border-radius: 4px;
      user-select: none; -webkit-user-drag: none;
      cursor: grab; pointer-events: auto;
      transform-origin: center center;
      transition: transform 0.1s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      will-change: transform;
    }
    .gm-lightbox-image:active { cursor: grabbing; }
    @keyframes gm-fadein { from{opacity:0} to{opacity:1} }
  `;
  const style = document.createElement('style'); style.textContent = LIGHTBOX_CSS; document.head.appendChild(style);

  let overlay = null;

  function openLightbox(src) {
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.className = 'gm-lightbox-overlay';

    const container = document.createElement('div');
    container.className = 'gm-lightbox-image-container';

    const img = document.createElement('img');
    // 灯箱里的图片也确保经过URL修复（双重保险）
    img.src = fixVcpUrl(src);
    img.className = 'gm-lightbox-image';

    img.ondragstart = (e) => e.preventDefault();

    container.appendChild(img);
    overlay.appendChild(container);
    document.body.appendChild(overlay);

    initZoomAndPan(img, overlay);
  }

  function initZoomAndPan(img, container) {
    let state = { scale: 1, x: 0, y: 0 };
    let isDragging = false;
    let start = { x: 0, y: 0 };
    let initialPinchDistance = 0;
    let initialScale = 1;
    let didMove = false;

    const updateTransform = (noAnim = false) => {
      if(noAnim) img.style.transition = 'none';
      else img.style.transition = 'transform 0.1s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      img.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
    };

    container.addEventListener('click', (e) => {
      if (e.target === container || (e.target === img && !didMove)) {
        container.remove();
        overlay = null;
      }
    });

    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.min(Math.max(0.5, state.scale * delta), 10);
      state.scale = newScale;
      updateTransform();
    }, { passive: false });

    img.addEventListener('dblclick', (e) => {
      e.preventDefault();
      state = { scale: 1, x: 0, y: 0 };
      updateTransform();
    });

    img.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' && !e.isPrimary) return;
      isDragging = true;
      didMove = false;
      start = { x: e.clientX - state.x, y: e.clientY - state.y };
      img.setPointerCapture(e.pointerId);
      img.style.transition = 'none';
    });

    img.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const newX = e.clientX - start.x;
      const newY = e.clientY - start.y;
      if (Math.abs(newX - state.x) > 2 || Math.abs(newY - state.y) > 2) didMove = true;
      state.x = newX;
      state.y = newY;
      img.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
    });

    img.addEventListener('pointerup', (e) => {
      isDragging = false;
      img.releasePointerCapture(e.pointerId);
      img.style.transition = '';
    });

    const getDist = (touches) => {
      return Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY
      );
    };

    container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        isDragging = false;
        initialPinchDistance = getDist(e.touches);
        initialScale = state.scale;
      }
    }, { passive: false });

    container.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const currentDist = getDist(e.touches);
        const ratio = currentDist / initialPinchDistance;
        state.scale = Math.min(Math.max(0.5, initialScale * ratio), 10);
        img.style.transition = 'none';
        img.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
      }
    }, { passive: false });
  }

  // ==========================================
  // 2. 渲染器逻辑 (Chain Consumer)
  // ==========================================
  const IGNORE_SELECTOR = [
    'pre', 'code', 'textarea', 'input',
    '[contenteditable="true"]', '.katex', 'svg',
    '[data-force-rendered]'
  ].join(',');

  function decodeHTML(str) {
    return str.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
  }

  function getAttr(tagStr, name) {
    const decoded = decodeHTML(tagStr);
    let regex = new RegExp(`${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i');
    let m = decoded.match(regex);
    if (m) return m[2];
    regex = new RegExp(`${name}\\s*=\\s*([^\\s>]+)`, 'i');
    m = decoded.match(regex);
    return m ? m[1] : null;
  }

  function createImgFragment(src, w, h, alt) {
    const wrapper = document.createElement('div');
    wrapper.className = 'gm-force-img';
    wrapper.style.cssText = 'display: block; margin: 4px 0; width: 100%;';

    const img = document.createElement('img');

    // [修改点]: 这里调用 URL 修复逻辑
    // 无论原始 src 是什么，只要包含 /images/，就会被重写为 Config 中的 BaseUrl + Key
    img.src = fixVcpUrl(src);

    img.setAttribute('data-force-rendered', 'true');
    img.style.cssText = "max-width: 100%; display: block; cursor: zoom-in; border-radius: 4px;";
    if (w) img.style.width = w.replace(/px$/i, '') + 'px';
    if (alt) img.alt = alt;

    wrapper.appendChild(img);
    return wrapper;
  }

  function processNode(startNode) {
    if (!startNode.parentNode || !startNode.isConnected) return;
    if (startNode.parentNode.closest(IGNORE_SELECTOR)) return;

    const text = startNode.nodeValue;
    if (!/(?:&lt;|<)img/i.test(text)) return;

    if (/(?:>|&gt;)/.test(text) && /(?:&lt;|<)img[\s\S]*?(?:>|&gt;)/i.test(text)) {
      replaceRange([startNode], text);
      return;
    }

    const chain = [startNode];
    let combinedText = text;
    let currentNode = startNode;
    let foundEnd = false;
    const MAX_LOOKAHEAD = 50;

    for (let i = 0; i < MAX_LOOKAHEAD; i++) {
      const next = currentNode.nextSibling;
      if (!next || next.nodeType !== Node.TEXT_NODE) break;
      currentNode = next;
      chain.push(currentNode);
      combinedText += currentNode.nodeValue;

      if (/(?:>|&gt;)/.test(currentNode.nodeValue)) {
        if (/(?:&lt;|<)img[\s\S]*?(?:>|&gt;)/i.test(combinedText)) {
          foundEnd = true;
          break;
        }
      }
    }

    if (foundEnd) replaceRange(chain, combinedText);
  }

  function replaceRange(nodes, fullText) {
    const parent = nodes[0].parentNode;
    if (!parent) return;

    const regex = /(?:&lt;|<)img\s+[\s\S]*?(?:>|&gt;)/gi;
    let lastIndex = 0;
    let match;
    const frag = document.createDocumentFragment();
    let hasReplacement = false;

    while ((match = regex.exec(fullText)) !== null) {
      hasReplacement = true;
      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(fullText.slice(lastIndex, match.index)));
      }
      const tagStr = match[0];
      const src = getAttr(tagStr, 'src');
      const w = getAttr(tagStr, 'width');
      const h = getAttr(tagStr, 'height');
      const alt = getAttr(tagStr, 'alt');

      if (src) frag.appendChild(createImgFragment(src, w, h, alt));
      else frag.appendChild(document.createTextNode(tagStr));
      lastIndex = regex.lastIndex;
    }

    if (!hasReplacement) return;
    if (lastIndex < fullText.length) frag.appendChild(document.createTextNode(fullText.slice(lastIndex)));
    parent.insertBefore(frag, nodes[0]);
    nodes.forEach(n => parent.removeChild(n));
  }

  // ==========================================
  // 3. 启动部分
  // ==========================================
  document.addEventListener('click', e => {
    if (e.target.matches('img[data-force-rendered="true"]')) {
      e.preventDefault();
      e.stopPropagation();
      openLightbox(e.target.src);
    }
  }, true);

  const observer = new MutationObserver(mutations => {
    const todoNodes = new Set();
    for (const m of mutations) {
      if (m.type === 'characterData') todoNodes.add(m.target);
      else if (m.type === 'childList') {
        m.addedNodes.forEach(n => {
          if (n.nodeType === Node.TEXT_NODE) todoNodes.add(n);
          else if (n.nodeType === Node.ELEMENT_NODE) {
             if (n.closest && n.closest(IGNORE_SELECTOR)) return;
             const walker = document.createTreeWalker(n, NodeFilter.SHOW_TEXT, null, false);
             let tn;
             while (tn = walker.nextNode()) todoNodes.add(tn);
          }
        });
      }
    }
    todoNodes.forEach(n => processNode(n));
  });

  const config = { childList: true, subtree: true, characterData: true };
  function start() {
    observer.observe(document.body, config);
    const origAttach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function(init) {
      const s = origAttach.call(this, init);
      observer.observe(s, config);
      return s;
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let tn;
    while (tn = walker.nextNode()) processNode(tn);
  }

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', start);
  else start();

  console.log('OpenWebUI VCP-Renderer v5.1 Active');
})();
