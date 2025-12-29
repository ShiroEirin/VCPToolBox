(function () {
  const API_BASE = '/AdminPanel/dailynote_api';

  // ------- 本地设置 -------

  const DEFAULT_SETTINGS = {
    blockedNotebooks: [],
    autoBlockClusters: false,
    themeMode: 'auto',          // auto | light | dark
    cardsColumns: 5,
    cardMaxLines: 5,
    pageSize: 100,
    sortMode: 'mtime-desc',     // mtime-desc | mtime-asc | name-asc | name-desc
    globalFontSize: 16          // 全局基础字体大小（px）
  };

  function loadSettings() {
    try {
      const raw = localStorage.getItem('DailyNotePanelSettings');
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch (e) {
      console.warn('[DailyNotePanel] Failed to load settings:', e);
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem('DailyNotePanelSettings', JSON.stringify(settings));
    } catch (e) {
      console.warn('[DailyNotePanel] Failed to save settings:', e);
    }
  }

  let settings = loadSettings();

  // ------- DOM 引用 -------

  const sidebar = document.getElementById('sidebar');
  const notebookList = document.getElementById('notebook-list');
  const notebookMiniList = document.getElementById('notebook-mini-list');
  const toggleSidebarBtn = document.getElementById('toggle-sidebar');
  const openSettingsBtn = document.getElementById('open-settings');

  const topBarDefault = document.getElementById('top-bar-default');
  const topBarEditor = document.getElementById('top-bar-editor');
  const topBarSettings = document.getElementById('top-bar-settings');

  const searchInput = document.getElementById('search-input');
  const bulkToggleButton = document.getElementById('bulk-toggle-button');

  const cardsView = document.getElementById('cards-view');
  const editorView = document.getElementById('editor-view');
  const settingsView = document.getElementById('settings-view');

  const cardsContainer = document.getElementById('cards-container');
  const cardsStatus = document.getElementById('cards-status');
  const prevPageBtn = document.getElementById('prev-page');
  const nextPageBtn = document.getElementById('next-page');
  const pageInfoSpan = document.getElementById('page-info');

  const deleteModalBackdrop = document.getElementById('delete-modal-backdrop');
  const deleteCountSpan = document.getElementById('delete-count');
  const deleteListContainer = document.getElementById('delete-list');
  const deleteCancelBtn = document.getElementById('delete-cancel');
  const deleteConfirmBtn = document.getElementById('delete-confirm');

  const backToCardsBtn = document.getElementById('back-to-cards');
  const editorFilenameSpan = document.getElementById('editor-filename');
  const editorModeToggle = document.getElementById('editor-mode-toggle');
  const saveNoteButton = document.getElementById('save-note-button');
  const editorTextarea = document.getElementById('editor-textarea');
  const editorPreview = document.getElementById('editor-preview');

  const backFromSettingsBtn = document.getElementById('back-from-settings');
  const blockedNotebooksContainer = document.getElementById('blocked-notebooks-container');
  const autoBlockClustersCheckbox = document.getElementById('auto-block-clusters');
  const themeModeSelect = document.getElementById('theme-mode-select');
  const cardsColumnsInput = document.getElementById('cards-columns');
  const cardMaxLinesInput = document.getElementById('card-max-lines');
  const pageSizeInput = document.getElementById('page-size');
  const sortModeSelect = document.getElementById('sort-mode');
  const globalFontSizeInput = document.getElementById('global-font-size');
  const settingsResetBtn = document.getElementById('settings-reset');
  const forceUpdateBtn = document.getElementById('force-update-btn');
  const settingsStatus = document.getElementById('settings-status');

  // ------- 运行时状态 -------

  const STREAM_NOTEBOOK = '__STREAM__';

  let notebooks = [];            // [{ name }]
  let currentNotebook = null;    // string | STREAM_NOTEBOOK
  let notes = [];                // 当前「源列表」（可能来自单本缓存或日记流聚合）
  let filteredNotes = [];        // 排序 + 过滤后的列表
  let bulkMode = false;          // 批量选择模式
  let selectedSet = new Set();   // `folder/name` 形式
  let currentPage = 1;           // 简单分页
  let editorState = {
    folder: null,
    file: null,
    mode: 'edit'                 // edit | preview
  };

  // 全局缓存：每个日记本自己的 notes 列表
  // key: folderName, value: notes[]
  let notebookCache = new Map();
  // 每个日记本的最新 mtime，用于侧边栏发光与日记流聚合
  // key: folderName, value: latestMtime(number)
  let notebookLatestMtime = new Map();

  // 指纹: 普通视图与日记流视图分开管理，避免模式切换时串扰
  let lastNotesFingerprint = null;
  let streamLastFingerprint = null;

  // 高亮定时器：key = `${folderName}/${note.name}`, value = { toYellow, clearAll }
  let highlightTimers = new Map();

  // 删除确认弹窗当前要删除的列表缓存
  let pendingDeleteFiles = [];

  // ------- 工具函数 -------

  async function apiGet(path) {
    const res = await fetch(API_BASE + path, {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
    return res.json();
  }

  async function apiPost(path, body) {
    const res = await fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body || {})
    });
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
    return res.json();
  }

  // 极简 Markdown 渲染（不引入外部依赖，够用版）
  function renderMarkdown(text) {
    if (!text) return '';
    let html = text;

    // 转义基础 HTML
    html = html
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>');

    // 代码块 ```...```
    html = html.replace(/```([\s\S]*?)```/g, function (_, code) {
      return '<pre><code>' + code.trim().replace(/\n/g, '<br/>') + '</code></pre>';
    });

    // 行内代码 `code`
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 标题行 # / ## / ###
    html = html.replace(/^###\s+(.*)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.*)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#\s+(.*)$/gm, '<h1>$1</h1>');

    // 无序列表行 - / * 开头
    html = html.replace(/^(?:\s*[-*]\s+.+\n?)+/gm, function (block) {
      const items = block
        .trim()
        .split(/\n/)
        .map(line => line.replace(/^\s*[-*]\s+/, '').trim())
        .filter(Boolean)
        .map(item => '<li>' + item + '</li>')
        .join('');
      return '<ul>' + items + '</ul>';
    });

    // 段落：简单按双换行切分
    html = html
      .split(/\n{2,}/)
      .map(chunk => {
        if (/^<h[1-6]>/.test(chunk) || /^<ul>/.test(chunk) || /^<pre>/.test(chunk)) return chunk;
        return '<p>' + chunk.replace(/\n/g, '<br/>') + '</p>';
      })
      .join('');

    return html;
  }

  function applyTheme() {
    const root = document.documentElement;
    const mode = settings.themeMode;
    if (mode === 'light') {
      root.setAttribute('data-theme', 'light');
    } else if (mode === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else {
      const prefersDark = window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }
  }

  function updateCardsGridColumns() {
    const cols = settings.cardsColumns;
    // 使用固定列数，而不是 auto-fill，让设置更直观
    cardsContainer.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  }

  // 这里不再尝试用 CSS 的 -webkit-line-clamp 做“视觉行数”控制，
  // 而是仅用它做一个“最多 N 行”的软约束。真正的“多 / 少”感受，交给文本本身长度。
  function clampTextLines(element, maxLines) {
    if (!element) return;
    const raw = element.textContent || '';
    if (!raw) return;

    const max = Number(maxLines) || 5;
    const approxCharsPerLine = 40;
    const hardLimit = max * approxCharsPerLine;

    let truncated = raw;
    if (raw.length > hardLimit) {
      truncated = raw.slice(0, hardLimit) + ' …';
    }

    // 彻底不用任何 layout 相关的 CSS 限制，让浏览器老实按内容自然排版
    element.textContent = truncated;
    element.style.display = '';
    element.style.webkitBoxOrient = '';
    element.style.webkitLineClamp = '';
    element.style.overflow = '';
  }

  function sortedNotes(source) {
    const arr = [...source];
    const mode = settings.sortMode;
    arr.sort((a, b) => {
      if (mode === 'mtime-desc') {
        return b.mtime - a.mtime;
      } else if (mode === 'mtime-asc') {
        return a.mtime - b.mtime;
      } else if (mode === 'name-asc') {
        return a.name.localeCompare(b.name, 'zh-CN');
      } else if (mode === 'name-desc') {
        return b.name.localeCompare(a.name, 'zh-CN');
      }
      return 0;
    });
    return arr;
  }

  function applyGlobalFontSize() {
    // 优先使用显式配置；如果没有，则写入默认值并持久化，保证后续变更能生效
    if (
      typeof settings.globalFontSize !== 'number' ||
      Number.isNaN(settings.globalFontSize)
    ) {
      settings.globalFontSize = DEFAULT_SETTINGS.globalFontSize;
      saveSettings(settings);
    }
    const size = settings.globalFontSize;
    document.documentElement.style.fontSize = size + 'px';
  }

  function notebookVisible(name) {
    if (settings.blockedNotebooks.includes(name)) return false;
    if (settings.autoBlockClusters && name.endsWith('簇')) return false;
    return true;
  }

  function isStreamNotebook(name) {
    return name === STREAM_NOTEBOOK;
  }

  function getVisibleNotebooks() {
    return notebooks.filter(n => notebookVisible(n.name));
  }

  // ------- 侧边栏渲染 -------

  function updateSidebarActiveState() {
    // 更新展开列表
    const items = notebookList.querySelectorAll('.notebook-item');
    items.forEach(item => {
      if (item.dataset.notebook === currentNotebook) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // 更新折叠列表
    const minis = notebookMiniList.querySelectorAll('.notebook-mini-item');
    minis.forEach(item => {
      if (item.dataset.notebook === currentNotebook) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  function updateSidebarGlow() {
    const now = Date.now();
    
    // 辅助函数：处理单个 DOM 元素的 glow 类
    const applyGlow = (el, mtime) => {
      if (!mtime) {
        el.classList.remove('glow-green-side', 'glow-yellow-side');
        return;
      }
      const diff = now - mtime;
      const diffMin = diff / 60000;
      
      el.classList.remove('glow-green-side', 'glow-yellow-side');
      if (diffMin <= 10) {
        el.classList.add('glow-green-side');
      } else if (diffMin <= 30) {
        el.classList.add('glow-yellow-side');
      }
    };

    // 1. 处理普通日记本
    notebookLatestMtime.forEach((mtime, name) => {
      // 展开列表
      const item = notebookList.querySelector(`.notebook-item[data-notebook="${name}"]`);
      if (item) applyGlow(item, mtime);
      // 折叠列表
      const mini = notebookMiniList.querySelector(`.notebook-mini-item[data-notebook="${name}"]`);
      if (mini) applyGlow(mini, mtime);
    });

    // 2. 处理日记流（取所有可见日记本中最新的 mtime）
    // 日记流不再参与发光逻辑，仅普通日记本发光
  }

  function renderNotebookLists() {
    notebookList.innerHTML = '';
    notebookMiniList.innerHTML = '';

    const visibleNotebooks = getVisibleNotebooks();
    const activeName = currentNotebook;

    // 顶部插入「日记流」条目
    // 展开模式
    const streamItem = document.createElement('div');
    streamItem.className = 'notebook-item stream-item';
    streamItem.dataset.notebook = STREAM_NOTEBOOK;
    if (isStreamNotebook(activeName)) streamItem.classList.add('active');

    const streamDot = document.createElement('div');
    streamDot.className = 'notebook-dot stream-dot';

    const streamNameSpan = document.createElement('span');
    streamNameSpan.className = 'notebook-name';
    streamNameSpan.textContent = '🔔 日记流';

    streamItem.appendChild(streamDot);
    streamItem.appendChild(streamNameSpan);
    streamItem.addEventListener('click', () => {
      // 无论当前是否已经在日记流、无论当前处于何种界面，都视为“主动切换并刷新”
      currentNotebook = STREAM_NOTEBOOK;
      localStorage.setItem('DailyNotePanel_LastNotebook', currentNotebook);
      selectedSet.clear();
      bulkMode = false;
      updateBulkModeUI();
      updateSidebarActiveState(); // 更新侧边栏高亮
      // 强制回到卡片视图，并立即根据缓存重建当前视图
      showCardsView();
      currentPage = 1;
      refreshCurrentViewFromCache();
      updateSearchUIForCurrentNotebook();
    });
    notebookList.appendChild(streamItem);

    // 折叠模式
    const miniStream = document.createElement('div');
    miniStream.className = 'notebook-mini-item stream-mini-item';
    miniStream.dataset.notebook = STREAM_NOTEBOOK;
    if (isStreamNotebook(activeName)) miniStream.classList.add('active');
    miniStream.textContent = '🔔';
    miniStream.addEventListener('click', () => {
      // 折叠态同样视为主动切换：无条件刷新并回到卡片视图
      currentNotebook = STREAM_NOTEBOOK;
      localStorage.setItem('DailyNotePanel_LastNotebook', currentNotebook);
      selectedSet.clear();
      bulkMode = false;
      updateBulkModeUI();
      updateSidebarActiveState(); // 更新侧边栏高亮
      showCardsView();
      currentPage = 1;
      refreshCurrentViewFromCache();
      updateSearchUIForCurrentNotebook();
    });
    notebookMiniList.appendChild(miniStream);

    // 普通日记本
    visibleNotebooks.forEach(nb => {
      const li = document.createElement('div');
      li.className = 'notebook-item';
      li.dataset.notebook = nb.name;
      if (nb.name === activeName) li.classList.add('active');

      const dot = document.createElement('div');
      dot.className = 'notebook-dot';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'notebook-name';
      nameSpan.textContent = nb.name;

      li.appendChild(dot);
      li.appendChild(nameSpan);

      li.addEventListener('click', () => {
        // 点击任意日记本标签都视为“主动切换并刷新”，包括当前正在查看的日记本
        currentNotebook = nb.name;
        localStorage.setItem('DailyNotePanel_LastNotebook', currentNotebook);
        selectedSet.clear();
        bulkMode = false;
        updateBulkModeUI();
        updateSidebarActiveState(); // 更新侧边栏高亮
        showCardsView();
        currentPage = 1;
        refreshCurrentViewFromCache();
        updateSearchUIForCurrentNotebook();
      });

      notebookList.appendChild(li);
    });

    visibleNotebooks.forEach(nb => {
      const mini = document.createElement('div');
      mini.className = 'notebook-mini-item';
      mini.dataset.notebook = nb.name;
      if (nb.name === activeName) mini.classList.add('active');

      const firstChar = (nb.name || '').trim().charAt(0) || '?';
      mini.textContent = firstChar;

      mini.addEventListener('click', () => {
        // 折叠态点击同样无条件刷新并回到卡片视图
        currentNotebook = nb.name;
        localStorage.setItem('DailyNotePanel_LastNotebook', currentNotebook);
        selectedSet.clear();
        bulkMode = false;
        updateBulkModeUI();
        updateSidebarActiveState(); // 更新侧边栏高亮
        showCardsView();
        currentPage = 1;
        refreshCurrentViewFromCache();
        updateSearchUIForCurrentNotebook();
      });

      notebookMiniList.appendChild(mini);
    });
  }

  // ------- 搜索 & 排序 -------

  async function refreshNotesUsingSearchIfNeeded() {
    if (!searchInput) {
      filteredNotes = sortedNotes(notes);
      return;
    }
    // 日记流中禁用搜索：直接使用当前 notes
    if (isStreamNotebook(currentNotebook)) {
      filteredNotes = sortedNotes(notes);
      return;
    }

    const q = (searchInput.value || '').trim();
    if (!q) {
      // 无搜索词时，notes 已由缓存或单本加载填充
      filteredNotes = sortedNotes(notes);
      return;
    }

    const params = new URLSearchParams();
    // 官方 API 使用 term 而不是 q
    params.set('term', q);
    if (currentNotebook) {
      params.set('folder', currentNotebook);
    }

    try {
      const data = await apiGet('/search?' + params.toString());
      // 官方 search 返回的 notes 带有 folderName/name/lastModified/preview
      notes = (data.notes || []).map(n => {
        const mtime =
          n.mtime != null
            ? n.mtime
            : n.lastModified
            ? new Date(n.lastModified).getTime()
            : 0;
        return {
          folderName: n.folderName || currentNotebook || '',
          name: n.name,
          mtime,
          size: n.size != null ? n.size : 0,
          preview: n.preview
        };
      });
      filteredNotes = sortedNotes(notes);
    } catch (e) {
      console.error('[DailyNotePanel] search error:', e);
      // 搜索失败时不改变原 notes，只前端退回空过滤
      filteredNotes = sortedNotes(notes);
    }
  }

  function computeFingerprint(list) {
    if (!list || list.length === 0) return '0:0';
    const total = list.length;
    const latest = list.reduce((max, n) => (n.mtime > max ? n.mtime : max), 0);
    return `${total}:${latest}`;
  }

  // ------- 卡片渲染 -------

  async function recomputeAndRenderCards() {
    // 如果有搜索词，使用 /search；否则使用当前 notes
    await refreshNotesUsingSearchIfNeeded();
    currentPage = 1;
    renderCards();
  }

  function renderCards() {
    // 渲染前先清理所有旧的高亮定时器，避免内存泄漏和重复切换
    highlightTimers.forEach(timerObj => {
      if (timerObj.toYellow) clearTimeout(timerObj.toYellow);
      if (timerObj.clearAll) clearTimeout(timerObj.clearAll);
    });
    highlightTimers.clear();

    cardsContainer.innerHTML = '';
    const total = filteredNotes.length;
    const pageSize = settings.pageSize;
    const maxPage = Math.max(1, Math.ceil(total / pageSize));
    if (currentPage > maxPage) currentPage = maxPage;

    const start = (currentPage - 1) * pageSize;
    const end = Math.min(total, start + pageSize);
    const slice = filteredNotes.slice(start, end);

    const currentFingerprint = computeFingerprint(filteredNotes);
    lastNotesFingerprint = currentFingerprint;

    const now = Date.now();

    slice.forEach(note => {
      const card = document.createElement('div');
      card.className = 'note-card';

      const folderName = note.folderName || currentNotebook || '';
      const noteId = `${folderName}/${note.name}`;

      // 基于修改时间添加发光高亮，且注册后续状态切换定时器：
      // - 10 分钟内：绿色
      // - 10–30 分钟内：黄色
      // - 超过 30 分钟：无高亮
      if (note.mtime && typeof note.mtime === 'number') {
        const diffMs = now - note.mtime;
        const diffMinutes = diffMs / 60000;

        let toYellowTimer = null;
        let clearAllTimer = null;

        if (diffMinutes <= 10) {
          card.classList.add('glow-green');

          // 距离 10 分钟还有多久，届时从绿变黄
          const msToYellow = Math.max(0, 10 * 60000 - diffMs);
          toYellowTimer = setTimeout(() => {
            card.classList.remove('glow-green');
            card.classList.add('glow-yellow');
          }, msToYellow);

          // 距离 30 分钟还有多久，届时移除所有高亮
          const msToClear = Math.max(0, 30 * 60000 - diffMs);
          clearAllTimer = setTimeout(() => {
            card.classList.remove('glow-green');
            card.classList.remove('glow-yellow');
          }, msToClear);
        } else if (diffMinutes > 10 && diffMinutes <= 30) {
          card.classList.add('glow-yellow');

          // 距离 30 分钟还有多久，届时移除黄色高亮
          const msToClear = Math.max(0, 30 * 60000 - diffMs);
          clearAllTimer = setTimeout(() => {
            card.classList.remove('glow-yellow');
          }, msToClear);
        }

        if (toYellowTimer || clearAllTimer) {
          highlightTimers.set(noteId, {
            toYellow: toYellowTimer,
            clearAll: clearAllTimer
          });
        }
      }

      if (selectedSet.has(noteId)) card.classList.add('selected');

      const header = document.createElement('div');
      header.className = 'note-card-header';

      let checkbox = null;
      if (bulkMode) {
        checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'note-checkbox';
        checkbox.checked = selectedSet.has(noteId);
        checkbox.addEventListener('click', e => {
          e.stopPropagation();
          if (checkbox.checked) {
            selectedSet.add(noteId);
          } else {
            selectedSet.delete(noteId);
          }
          renderCardsStatus();
        });
        header.appendChild(checkbox);
      }

      const title = document.createElement('h3');
      title.className = 'note-filename';
      if (isStreamNotebook(currentNotebook)) {
        // 格式：**日记本名日记本** - maid名
        // 样式：比全局字号大一号
        let maidName = folderName;
        if (folderName === '代码') maidName = '方彤彤';

        title.innerHTML = `<strong>${folderName}日记本</strong> - ${maidName}`;
        title.classList.add('stream-card-title');
        // 动态设置字号：全局字号 + 1px
        const baseSize = settings.globalFontSize || 16;
        title.style.fontSize = (baseSize + 1) + 'px';
      } else {
        title.textContent = note.name;
      }
      header.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'note-meta';
      const d = new Date(note.mtime);
      meta.textContent = `修改于：${d.toLocaleString()}`;

      const preview = document.createElement('div');
      preview.className = 'note-preview';
      // 卡片预览使用纯文本，避免轻量 Markdown 渲染带来的兼容性和样式不稳定问题
      preview.textContent = note.preview || '';
      clampTextLines(preview, settings.cardMaxLines);

      card.appendChild(header);
      card.appendChild(meta);
      card.appendChild(preview);

      card.addEventListener('click', () => {
        if (bulkMode) {
          const exist = selectedSet.has(noteId);
          if (exist) {
            selectedSet.delete(noteId);
          } else {
            selectedSet.add(noteId);
          }
          renderCards();
          renderCardsStatus();
          return;
        }
        openEditor(folderName, note.name);
      });

      cardsContainer.appendChild(card);
    });

    renderCardsStatus();
  }

  function renderCardsStatus() {
    const total = filteredNotes.length;
    const pageSize = settings.pageSize;
    const maxPage = Math.max(1, Math.ceil(total / pageSize));
    const selectionCount = selectedSet.size;

    cardsStatus.textContent =
      `共 ${total} 条日记` +
      (bulkMode ? ` | 已选中 ${selectionCount} 条` : '');

    if (pageInfoSpan) {
      pageInfoSpan.textContent = `第 ${currentPage}/${maxPage} 页`;
    }
    if (prevPageBtn) {
      prevPageBtn.disabled = currentPage <= 1;
    }
    if (nextPageBtn) {
      nextPageBtn.disabled = currentPage >= maxPage;
    }
  }

  // ------- 模式切换 -------

  function showCardsView() {
    cardsView.classList.remove('hidden');
    editorView.classList.add('hidden');
    settingsView.classList.add('hidden');

    topBarDefault.classList.remove('hidden');
    topBarEditor.classList.add('hidden');
    topBarSettings.classList.add('hidden');
  }

  function showEditorView() {
    cardsView.classList.add('hidden');
    editorView.classList.remove('hidden');
    settingsView.classList.add('hidden');

    topBarDefault.classList.add('hidden');
    topBarEditor.classList.remove('hidden');
    topBarSettings.classList.add('hidden');
  }

  function showSettingsView() {
    cardsView.classList.add('hidden');
    editorView.classList.add('hidden');
    settingsView.classList.remove('hidden');

    topBarDefault.classList.add('hidden');
    topBarEditor.classList.add('hidden');
    topBarSettings.classList.remove('hidden');
  }

  // ------- 事件绑定 -------

  function updateBulkModeUI() {
    if (bulkMode) {
      bulkToggleButton.classList.add('danger-active');
    } else {
      bulkToggleButton.classList.remove('danger-active');
      selectedSet.clear();
    }
    renderCards();
  }

  function bindEvents() {
    if (toggleSidebarBtn) {
      toggleSidebarBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
      });
    }

    if (prevPageBtn) {
      prevPageBtn.addEventListener('click', () => {
        const total = filteredNotes.length;
        const pageSize = settings.pageSize;
        const maxPage = Math.max(1, Math.ceil(total / pageSize));
        if (currentPage > 1) {
          currentPage -= 1;
          renderCards();
        }
      });
    }

    if (nextPageBtn) {
      nextPageBtn.addEventListener('click', () => {
        const total = filteredNotes.length;
        const pageSize = settings.pageSize;
        const maxPage = Math.max(1, Math.ceil(total / pageSize));
        if (currentPage < maxPage) {
          currentPage += 1;
          renderCards();
        }
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        if (isStreamNotebook(currentNotebook)) {
          // 日记流禁用搜索：清空输入并忽略
          searchInput.value = '';
          return;
        }
        recomputeAndRenderCards().catch(console.error);
      });
    }

    if (bulkToggleButton) {
      bulkToggleButton.addEventListener('click', () => {
        if (bulkMode && selectedSet.size > 0) {
          // 进入二次确认弹窗，而不是直接 confirm()
          const files = Array.from(selectedSet).map(id => {
            const [folder, file] = id.split('/');
            return { folder, file };
          });
          openDeleteModal(files);
        } else {
          bulkMode = !bulkMode;
          updateBulkModeUI();
        }
      });
    }

    if (backToCardsBtn) {
      backToCardsBtn.addEventListener('click', () => {
        showCardsView();
      });
    }

    if (editorModeToggle) {
      editorModeToggle.addEventListener('click', () => {
        if (editorState.mode === 'edit') {
          editorState.mode = 'preview';
          editorTextarea.classList.add('hidden');
          editorPreview.classList.remove('hidden');
          editorPreview.innerHTML = renderMarkdown(editorTextarea.value);
        } else {
          editorState.mode = 'edit';
          editorTextarea.classList.remove('hidden');
          editorPreview.classList.add('hidden');
        }
      });
    }

    if (saveNoteButton) {
      saveNoteButton.addEventListener('click', async () => {
        if (!editorState.folder || !editorState.file) return;
        try {
          await apiPost(
            `/note/${editorState.folder}/${editorState.file}`,
            { content: editorTextarea.value }
          );

          // 保存成功后，刷新对应日记本缓存，并基于缓存重建当前视图
          await refreshSingleNotebookCache(editorState.folder);

          if (isStreamNotebook(currentNotebook)) {
            // 当前是日记流：使用最新缓存重新聚合所有可见日记本
            const visibleNow = getVisibleNotebooks();
            const allNotes = [];
            visibleNow.forEach(nb => {
              const list = notebookCache.get(nb.name);
              if (!Array.isArray(list) || list.length === 0) return;
              list.forEach(note => {
                allNotes.push({
                  ...note,
                  folderName: note.folderName || nb.name
                });
              });
            });
            allNotes.sort((a, b) => b.mtime - a.mtime);
            notes = allNotes;
            filteredNotes = allNotes;
            currentPage = 1;
            renderCards();
          } else if (currentNotebook === editorState.folder) {
            // 当前就在被编辑的日记本：从缓存重建该本视图
            const list = notebookCache.get(editorState.folder) || [];
            notes = list.slice();
            filteredNotes = sortedNotes(notes);
            currentPage = 1;
            renderCards();
          }
          showCardsView();
        } catch (e) {
          console.error('[DailyNotePanel] save error:', e);
        }
      });
    }

    if (openSettingsBtn) {
      openSettingsBtn.addEventListener('click', () => {
        syncSettingsUI();
        showSettingsView();
      });
    }
    if (backFromSettingsBtn) {
      backFromSettingsBtn.addEventListener('click', () => {
        showCardsView();
      });
    }

    if (autoBlockClustersCheckbox) {
      autoBlockClustersCheckbox.addEventListener('change', () => {
        settings.autoBlockClusters = !!autoBlockClustersCheckbox.checked;
        saveSettings(settings);
        renderNotebookLists();
        recomputeAndRenderCards().catch(console.error);
      });
    }

    if (themeModeSelect) {
      themeModeSelect.addEventListener('change', () => {
        settings.themeMode = themeModeSelect.value;
        saveSettings(settings);
        applyTheme();
      });
    }

    if (cardsColumnsInput) {
      cardsColumnsInput.addEventListener('change', () => {
        const v = parseInt(cardsColumnsInput.value, 10);
        if (!isNaN(v) && v >= 1 && v <= 8) {
          settings.cardsColumns = v;
          saveSettings(settings);
          updateCardsGridColumns();
        }
      });
    }
    if (cardMaxLinesInput) {
      cardMaxLinesInput.addEventListener('change', () => {
        const v = parseInt(cardMaxLinesInput.value, 10);
        if (!isNaN(v) && v >= 1 && v <= 20) {
          settings.cardMaxLines = v;
          saveSettings(settings);
          renderCards();
        }
      });
    }
    if (pageSizeInput) {
      pageSizeInput.addEventListener('change', () => {
        const v = parseInt(pageSizeInput.value, 10);
        if (!isNaN(v) && v >= 10 && v <= 500) {
          settings.pageSize = v;
          saveSettings(settings);
          currentPage = 1;
          renderCards();
        }
      });
    }
    if (sortModeSelect) {
      sortModeSelect.addEventListener('change', () => {
        settings.sortMode = sortModeSelect.value;
        saveSettings(settings);
        filteredNotes = sortedNotes(filteredNotes);
        currentPage = 1;
        renderCards();
      });
    }
    if (globalFontSizeInput) {
      globalFontSizeInput.addEventListener('change', () => {
        const v = parseInt(globalFontSizeInput.value, 10);
        if (!isNaN(v) && v >= 10 && v <= 24) {
          settings.globalFontSize = v;
          saveSettings(settings);
          applyGlobalFontSize();
        } else {
          // 非法输入时，回退到当前有效值，避免出现“看起来改了但实际没效果”的错觉
          globalFontSizeInput.value =
            typeof settings.globalFontSize === 'number'
              ? settings.globalFontSize
              : DEFAULT_SETTINGS.globalFontSize;
        }
      });
    }

    if (settingsResetBtn) {
      settingsResetBtn.addEventListener('click', () => {
        settings = { ...DEFAULT_SETTINGS };
        saveSettings(settings);
        syncSettingsUI();
        applyTheme();
        updateCardsGridColumns();
        renderNotebookLists();
        applyGlobalFontSize();
        recomputeAndRenderCards().catch(console.error);
        settingsStatus.textContent = '已重置为默认设置';
        setTimeout(() => (settingsStatus.textContent = ''), 2000);
      });
    }

    if (forceUpdateBtn) {
      forceUpdateBtn.addEventListener('click', async () => {
        if (!confirm('确定要清除所有缓存并强制刷新吗？\n这将注销 Service Worker 并重新加载最新版本。')) return;

        try {
          if (settingsStatus) {
            settingsStatus.textContent = '正在清理缓存与 Service Worker...';
          }

          // 注销当前域名下所有 Service Worker
          if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
              await registration.unregister();
            }
          }

          // 清除 Cache Storage
          if ('caches' in window) {
            const keys = await caches.keys();
            for (const key of keys) {
              await caches.delete(key);
            }
          }

          // 最后强制刷新页面
          window.location.reload();
        } catch (e) {
          console.error('[DailyNotePanel] force update failed:', e);
          if (settingsStatus) {
            settingsStatus.textContent = '强制刷新失败，请尝试手动清理浏览器缓存';
            setTimeout(() => (settingsStatus.textContent = ''), 3000);
          }
        }
      });
    }

    // 删除确认弹窗事件
    if (deleteCancelBtn) {
      deleteCancelBtn.addEventListener('click', () => {
        closeDeleteModal();
      });
    }
    if (deleteConfirmBtn) {
      deleteConfirmBtn.addEventListener('click', async () => {
        if (!pendingDeleteFiles || pendingDeleteFiles.length === 0) {
          closeDeleteModal();
          return;
        }
        try {
          await apiPost('/delete-batch', { notesToDelete: pendingDeleteFiles });
        } catch (e) {
          console.error('[DailyNotePanel] delete error:', e);
        }

        // 删除后：刷新受影响日记本的缓存，再基于缓存重建当前视图
        const affectedFolders = new Set(
          pendingDeleteFiles.map(item => item.folder).filter(Boolean)
        );
        selectedSet.clear();
        pendingDeleteFiles = [];
        closeDeleteModal();

        for (const folder of affectedFolders) {
          await refreshSingleNotebookCache(folder);
        }

        if (isStreamNotebook(currentNotebook)) {
          const visibleNow = getVisibleNotebooks();
          const allNotes = [];
          visibleNow.forEach(nb => {
            const list = notebookCache.get(nb.name);
            if (!Array.isArray(list) || list.length === 0) return;
            list.forEach(note => {
              allNotes.push({
                ...note,
                folderName: note.folderName || nb.name
              });
            });
          });
          allNotes.sort((a, b) => b.mtime - a.mtime);
          notes = allNotes;
          filteredNotes = allNotes;
          currentPage = 1;
          renderCards();
        } else if (currentNotebook) {
          const list = notebookCache.get(currentNotebook) || [];
          notes = list.slice();
          filteredNotes = sortedNotes(notes);
          currentPage = 1;
          renderCards();
        }
      });
    }
  }

  // ------- 设置 UI 同步 -------

  function updateSearchUIForCurrentNotebook() {
    if (!searchInput) return;
    if (isStreamNotebook(currentNotebook)) {
      searchInput.disabled = true;
      searchInput.value = '';
      searchInput.placeholder = '日记流中不支持搜索，请在具体日记本中搜索';
    } else {
      searchInput.disabled = false;
      searchInput.placeholder = '搜索当前日记本 (支持多关键词 AND)';
    }
  }

  function syncSettingsUI() {
    autoBlockClustersCheckbox.checked = !!settings.autoBlockClusters;
    themeModeSelect.value = settings.themeMode;
    cardsColumnsInput.value = settings.cardsColumns;
    cardMaxLinesInput.value = settings.cardMaxLines;
    pageSizeInput.value = settings.pageSize;
    sortModeSelect.value = settings.sortMode;
    if (globalFontSizeInput) {
      globalFontSizeInput.value =
        typeof settings.globalFontSize === 'number'
          ? settings.globalFontSize
          : DEFAULT_SETTINGS.globalFontSize;
    }
 
    blockedNotebooksContainer.innerHTML = '';
    notebooks.forEach(nb => {
      const row = document.createElement('label');
      row.className = 'settings-row';

      const span = document.createElement('span');
      span.textContent = nb.name;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = settings.blockedNotebooks.includes(nb.name);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          if (!settings.blockedNotebooks.includes(nb.name)) {
            settings.blockedNotebooks.push(nb.name);
          }
        } else {
          settings.blockedNotebooks = settings.blockedNotebooks.filter(x => x !== nb.name);
        }
        saveSettings(settings);
        renderNotebookLists();
        recomputeAndRenderCards().catch(console.error);
      });

      row.appendChild(span);
      row.appendChild(checkbox);
      blockedNotebooksContainer.appendChild(row);
    });
  }

  // ------- 删除确认弹窗 -------
  
  function openDeleteModal(files) {
    pendingDeleteFiles = files || [];
    if (!deleteModalBackdrop) return;
    // 数量
    if (deleteCountSpan) {
      deleteCountSpan.textContent = String(pendingDeleteFiles.length);
    }
    // 列表
    if (deleteListContainer) {
      deleteListContainer.innerHTML = '';
      pendingDeleteFiles.forEach(item => {
        const div = document.createElement('div');
        div.className = 'modal-list-item';
        div.textContent = `${item.folder}/${item.file}`;
        deleteListContainer.appendChild(div);
      });
    }
    deleteModalBackdrop.classList.remove('hidden');
  }

  function closeDeleteModal() {
    if (!deleteModalBackdrop) return;
    deleteModalBackdrop.classList.add('hidden');
  }

  // ------- 数据加载 -------

  async function loadNotebooks() {
    try {
      const data = await apiGet('/folders');
      notebooks = (data.folders || []).map(name => ({ name }));

      // 1. 先解析 URL 参数中的 notebook 指令
      const params = new URLSearchParams(window.location.search || '');
      const urlNotebook = params.get('notebook');
      if (urlNotebook) {
        if (urlNotebook === 'stream') {
          currentNotebook = STREAM_NOTEBOOK;
        } else {
          // 对于指定的普通日记本名，暂时只记录下来，后面统一做有效性校验
          currentNotebook = urlNotebook;
        }
      }

      // 2. 若 URL 中未指定 notebook，再尝试从 localStorage 恢复
      if (!currentNotebook) {
        currentNotebook = localStorage.getItem('DailyNotePanel_LastNotebook');
      }

      // 3. 验证当前选中的日记本是否有效：
      //    - STREAM_NOTEBOOK 永远视为有效（即日记流模式）
      //    - 普通日记本需要“存在且可见”
      let hasValidCurrent = false;
      if (currentNotebook === STREAM_NOTEBOOK) {
        hasValidCurrent = true;
      } else if (currentNotebook) {
        hasValidCurrent =
          notebooks.some(n => n.name === currentNotebook && notebookVisible(n.name));
      }

      // 4. 如果当前 notebook 无效，则回退到：
      //    - 第一个可见日记本；若没有，则回退到 STREAM_NOTEBOOK
      if (!hasValidCurrent) {
        const firstVisible = notebooks.find(n => notebookVisible(n.name));
        currentNotebook = firstVisible ? firstVisible.name : STREAM_NOTEBOOK;
      }

      // 5. 确认为有效值后，更新 localStorage（防止存的是无效值）
      if (currentNotebook) {
        localStorage.setItem('DailyNotePanel_LastNotebook', currentNotebook);
      }

      renderNotebookLists();
      syncSettingsUI();
      applyGlobalFontSize();
      updateSearchUIForCurrentNotebook();
      // 初次渲染先基于空缓存构建视图，真正数据交给 autoRefreshLoop 填充
      renderCards();
    } catch (e) {
      console.error('[DailyNotePanel] loadNotebooks error:', e);
    }
  }

  async function refreshSingleNotebookCache(notebookName) {
    try {
      const data = await apiGet('/folder/' + notebookName);
      const list = (data.notes || []).map(n => {
        const mtime =
          n.mtime != null
            ? n.mtime
            : n.lastModified
            ? new Date(n.lastModified).getTime()
            : 0;
        return {
          folderName: notebookName,
          name: n.name,
          mtime,
          size: n.size != null ? n.size : 0,
          preview: n.preview
        };
      });
      notebookCache.set(notebookName, list);
      const latest = list.reduce(
        (max, n) => (n.mtime > max ? n.mtime : max),
        0
      );
      notebookLatestMtime.set(notebookName, latest);
    } catch (e) {
      console.error('[DailyNotePanel] refreshSingleNotebookCache error:', e);
    }
  }

  function refreshCurrentViewFromCache() {
    if (!currentNotebook) {
      notes = [];
      filteredNotes = [];
      renderCards();
      return;
    }

    if (isStreamNotebook(currentNotebook)) {
      const beforeFp = computeFingerprint(filteredNotes);
      const beforeStreamFp = streamLastFingerprint;

      const visibleNow = getVisibleNotebooks();
      const allNotes = [];
      visibleNow.forEach(nb => {
        const list = notebookCache.get(nb.name);
        if (!Array.isArray(list) || list.length === 0) return;
        list.forEach(note => {
          allNotes.push({
            ...note,
            folderName: note.folderName || nb.name
          });
        });
      });
      allNotes.sort((a, b) => b.mtime - a.mtime);
      notes = allNotes;
      filteredNotes = allNotes;
      
      const fp = computeFingerprint(filteredNotes);
      // 如果指纹变了，或者当前页面是空的（初始化状态），则刷新
      if (fp !== beforeStreamFp || fp !== beforeFp || cardsContainer.children.length === 0) {
        streamLastFingerprint = fp;
        // 只有当数据发生实质性变化时才重置页码，避免轮询打断用户翻页
        // 但如果是手动切换日记本导致的刷新，外部会重置 currentPage
        renderCards();
      }
    } else {
      const list = notebookCache.get(currentNotebook) || [];
      const fp = computeFingerprint(list);
      if (fp !== lastNotesFingerprint || cardsContainer.children.length === 0) {
        notes = list.slice();
        filteredNotes = sortedNotes(notes);
        renderCards();
      }
    }
  }

  // ------- 编辑 -------

  async function openEditor(folder, file) {
    try {
      // 同样移除 encodeURIComponent
      const data = await apiGet(
        '/note/' + folder + '/' + file
      );
      editorState.folder = folder;
      editorState.file = file;
      editorState.mode = 'edit';
      editorFilenameSpan.textContent = `${folder}/${file}`;
      editorTextarea.value = data.content || '';
      editorTextarea.classList.remove('hidden');
      editorPreview.classList.add('hidden');
      showEditorView();
    } catch (e) {
      console.error('[DailyNotePanel] openEditor error:', e);
    }
  }

  // ------- 自动刷新（全局轮询版） -------

  async function autoRefreshLoop() {
    const INTERVAL = 10000; // 10 秒
    while (true) {
      try {
        // 1. 视图隐藏时，短轮询检查
        if (cardsView.classList.contains('hidden')) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }

        // 2. 有搜索词时，暂停轮询（避免覆盖搜索结果），短轮询检查
        if (searchInput && (searchInput.value || '').trim()) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }

        const visible = getVisibleNotebooks();
        // 3. 如果还没有可见日记本（可能加载中），短轮询等待
        if (visible.length === 0) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }

        // 4. 并发刷新所有可见 notebook 的缓存
        await Promise.all(
          visible.map(nb => refreshSingleNotebookCache(nb.name))
        );

        updateSidebarGlow();

        // 5. 根据当前模式，从缓存重建视图
        refreshCurrentViewFromCache();

      } catch (e) {
        console.warn('[DailyNotePanel] autoRefreshLoop error:', e);
      }

      // 6. 执行完一轮后等待 INTERVAL，确保首次立即执行
      await new Promise(r => setTimeout(r, INTERVAL));
    }
  }

  // ------- 初始化 -------

  function init() {
    applyTheme();
    updateCardsGridColumns();
    bindEvents();
    // 默认折叠侧边栏（刷新后自动收起）
    if (sidebar) {
      sidebar.classList.add('collapsed');
    }
    // 确保 loadNotebooks 完成（notebooks 列表就绪）后再启动轮询
    loadNotebooks().then(() => {
      autoRefreshLoop();
    }).catch(console.error);

    showCardsView();
    applyGlobalFontSize();

    // 注册 Service Worker（PWA）
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/AdminPanel/DailyNotePanel/sw.js').catch(e => {
        console.warn('[DailyNotePanel] serviceWorker register failed:', e);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
