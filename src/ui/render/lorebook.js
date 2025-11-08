import {
  appState,
  safeGetLorebookEntries,
  escapeHtml,
  get$,
  getParentDoc,
  getParentWin,
  CHARACTER_BOOK_SWITCH_ID,
} from '../../core.js';
import { loadLorebookEntriesIfNeeded } from '../../dataLayer.js';
import { renderContent } from './index.js';
import {
  createItemElement,
  createGlobalLorebookElement,
  getActiveSortMode,
  getActiveCollapseState,
  matchEntry,
  initializeLoreEntrySortable,
} from './shared.js';

const GLOBAL_LIST_CHUNK_SIZE = 6;
let globalListRenderHandle = null;
let globalListProgressEl = null;

const cancelPendingGlobalListRender = () => {
  if (!globalListRenderHandle && !globalListProgressEl) return;
  const parentWin = getParentWin();
  if (globalListRenderHandle) {
    const { type, id } = globalListRenderHandle;
    if (type === 'idle' && parentWin?.cancelIdleCallback) {
      parentWin.cancelIdleCallback(id);
    } else if (type === 'raf' && parentWin?.cancelAnimationFrame) {
      parentWin.cancelAnimationFrame(id);
    } else if (type === 'timeout') {
      const clearFn = parentWin?.clearTimeout ?? (typeof clearTimeout === 'function' ? clearTimeout : null);
      if (clearFn) clearFn(id);
    }
    globalListRenderHandle = null;
  }
  if (globalListProgressEl) {
    globalListProgressEl.remove();
    globalListProgressEl = null;
  }
};

const sortLoreEntries = (entries, sortMode) => {
  const list = Array.isArray(entries) ? [...entries] : [];
  if (sortMode === 'status') {
    return list.sort((a, b) => {
      const diff = Number(b.enabled) - Number(a.enabled);
      if (diff !== 0) return diff;
      return (a.name || '').localeCompare(b.name || '', 'zh');
    });
  }
  return list.sort((a, b) => (a.name || '无标题条目').localeCompare(b.name || '无标题条目', 'zh'));
};

export const getGlobalLorebookMatches = (searchTerm, caseSensitive = false, options = {}) => {
  const matches = [];
  const booksMatchedByNameOnly = [];
  const stats = { bookName: 0, entryName: 0, keywords: 0, content: 0 };

  const normalizedSearchTerm = typeof searchTerm === 'string' ? searchTerm : '';
  if (!normalizedSearchTerm) {
    return { matches, stats, booksMatchedByNameOnly };
  }

  const { bookNames } = options;
  const targetNames = Array.isArray(bookNames)
    ? [...new Set(
        bookNames
          .map(name => (typeof name === 'string' ? name.trim() : ''))
          .filter(name => Boolean(name)),
      )]
    : [];

  const allBooks = Array.isArray(appState.allLorebooks) ? appState.allLorebooks : [];
  const books = targetNames.length
    ? allBooks.filter(book => targetNames.includes(book.name))
    : allBooks.slice();

  if (targetNames.length) {
    const knownNames = new Set(books.map(book => book.name));
    targetNames.forEach(name => {
      if (!knownNames.has(name)) {
        books.push({ name });
      }
    });
  }

  const flags = caseSensitive ? '' : 'i';
  const searchRegex = new RegExp(normalizedSearchTerm.replace(/[.*+?^${}()|[\/\\]/g, '\\$&'), flags);

  const matchedBooksForName = new Set();
  const matchedEntriesForName = new Set();
  const matchedEntriesForKeywords = new Set();
  const matchedEntriesForContent = new Set();
  const addedEntries = new Set();

  for (const book of books) {
    const name = book?.name ?? '';
    if (!name) continue;

    const entries = safeGetLorebookEntries(name);
    const isBookNameMatch = searchRegex.test(name);
    let bookHasEntryMatches = false;

    if (isBookNameMatch) {
      matchedBooksForName.add(name);
    }

    for (const entry of entries) {
      const currentMatch = {
        bookName: false,
        entryName: false,
        keywords: 0,
        content: false,
      };
      let entryHasMatch = false;

      if (searchRegex.test(entry.name || '')) {
        matchedEntriesForName.add(entry.uid);
        currentMatch.entryName = true;
        entryHasMatch = true;
      }

      if (Array.isArray(entry.keys)) {
        const matchedKeywordsCount = entry.keys.filter(k => searchRegex.test(k)).length;
        if (matchedKeywordsCount > 0) {
          currentMatch.keywords = matchedKeywordsCount;
          matchedEntriesForKeywords.add(entry.uid);
          entryHasMatch = true;
        }
      }

      if (searchRegex.test(entry.content || '')) {
        matchedEntriesForContent.add(entry.uid);
        currentMatch.content = true;
        entryHasMatch = true;
      }

      if (entryHasMatch) {
        bookHasEntryMatches = true;
        if (!addedEntries.has(entry.uid)) {
          matches.push({ bookName: name, entry, matchedFields: currentMatch });
          addedEntries.add(entry.uid);
        }
      }
    }

    if (isBookNameMatch && !bookHasEntryMatches) {
      booksMatchedByNameOnly.push(name);
    }
  }

  stats.bookName = matchedBooksForName.size;
  stats.entryName = matchedEntriesForName.size;
  stats.keywords = matchedEntriesForKeywords.size;
  stats.content = matchedEntriesForContent.size;

  return { matches, stats, booksMatchedByNameOnly };
};

export const renderGlobalLoreTabView = (context, searchTerm, $container) => {
  if (context.view === 'global-lore-detail') {
    renderGlobalLoreDetailView(context, searchTerm, $container);
  } else {
    renderGlobalLoreListView(context, searchTerm, $container);
  }
};

const renderGlobalLoreListView = (context, searchTerm, $container) => {
  cancelPendingGlobalListRender();

  const $ = get$();
  const parentDoc = getParentDoc();
  const parentWin = getParentWin();

  const normalizedTerm = typeof searchTerm === 'string' ? searchTerm : '';
  const sortMode = getActiveSortMode(context);
  const books = [...appState.allLorebooks];

  if (sortMode === 'status') {
    books.sort((a, b) => {
      const diff = Number(b.enabled) - Number(a.enabled);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name, 'zh');
    });
  } else {
    books.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  }

  if (!books.length) {
    const emptyHtml = `
      <div class="rlh-empty-state">
        <div class="rlh-empty-icon"><i class="fa-solid fa-book-bookmark"></i></div>
        <h4>没有世界书</h4>
        <p>点击右上角的“<i class="fa-solid fa-plus"></i>”按钮来创建你的第一个世界书吧！</p>
      </div>
    `;
    $container.html(emptyHtml);
    return;
  }

  const filteredBooks = normalizedTerm
    ? books.filter(book => {
        const bookNameMatches = appState.searchFilters.bookName && book.name.toLowerCase().includes(normalizedTerm);
        if (bookNameMatches) return true;

        const entries = safeGetLorebookEntries(book.name);
        return entries.some(entry => matchEntry(entry, normalizedTerm));
      })
    : books;

  if (!filteredBooks.length) {
    $container.html('<p class="rlh-info-text">未找到匹配的世界书。</p>');
    return;
  }

  $container.empty();

  const total = filteredBooks.length;
  const chunkSize =
    total <= GLOBAL_LIST_CHUNK_SIZE
      ? total
      : Math.min(GLOBAL_LIST_CHUNK_SIZE, Math.max(3, Math.ceil(total / 5)));
  let currentIndex = 0;

  globalListProgressEl =
    total > chunkSize
      ? $('<p class="rlh-info-text-small" aria-live="polite"></p>')
      : null;

  const updateProgress = () => {
    if (!globalListProgressEl) return;
    const completed = Math.min(currentIndex, total);
    globalListProgressEl
      .text(`正在加载世界书列表 (${completed}/${total})，请稍候...`)
      .appendTo($container);
  };

  const appendNodes = nodes => {
    if (!nodes.length) return;
    const fragment =
      parentDoc && typeof parentDoc.createDocumentFragment === 'function'
        ? parentDoc.createDocumentFragment()
        : null;
    if (fragment) {
      nodes.forEach(node => fragment.appendChild(node));
      $container.append(fragment);
    } else {
      nodes.forEach(node => $container.append(node));
    }
  };

  const renderChunk = () => {
    const end = Math.min(currentIndex + chunkSize, total);
    const nodes = [];
    for (let i = currentIndex; i < end; i++) {
      const element = createGlobalLorebookElement(filteredBooks[i], searchTerm, true, null);
      const domNode = element.get(0);
      if (domNode) nodes.push(domNode);
    }
    appendNodes(nodes);
    currentIndex = end;
    updateProgress();

    if (currentIndex >= total && globalListProgressEl) {
      const progressRef = globalListProgressEl;
      const clearFn = parentWin?.setTimeout ?? setTimeout;
      clearFn(() => {
        if (globalListProgressEl === progressRef) {
          progressRef.remove();
          globalListProgressEl = null;
        }
      }, 320);
    }
  };

  const scheduleNextChunk = () => {
    const callback = () => {
      globalListRenderHandle = null;
      renderChunk();
      if (currentIndex < total) {
        scheduleNextChunk();
      }
    };

    if (parentWin?.requestIdleCallback) {
      const id = parentWin.requestIdleCallback(callback, { timeout: 120 });
      globalListRenderHandle = { type: 'idle', id };
    } else if (parentWin?.requestAnimationFrame) {
      const id = parentWin.requestAnimationFrame(callback);
      globalListRenderHandle = { type: 'raf', id };
    } else {
      const scheduleFn = parentWin?.setTimeout ?? setTimeout;
      const id = scheduleFn(callback, 16);
      globalListRenderHandle = { type: 'timeout', id };
    }
  };

  renderChunk();

  if (currentIndex < total) {
    scheduleNextChunk();
  } else if (globalListProgressEl) {
    globalListProgressEl.remove();
    globalListProgressEl = null;
  }
};

const renderGlobalLoreDetailView = (context, searchTerm, $container) => {
  cancelPendingGlobalListRender();

  const $ = get$();
  const bookName = context?.activeBookName ?? appState.activeBookName;
  const book = appState.allLorebooks.find(b => b.name === bookName);
  if (!book) {
    $container.html(`<p class="rlh-info-text">错误：未找到名为 "${escapeHtml(bookName)}" 的世界书。</p>`);
    return;
  }

  if (appState.loadingBookName === bookName) {
    const loadingHtml = `
        <div class="rlh-detail-view" data-book-name="${escapeHtml(bookName)}">
          <header class="rlh-detail-header">
            <button class="rlh-action-btn-icon rlh-back-to-list-btn" title="返回世界书列表"><i class="fa-solid fa-arrow-left"></i></button>
            <h2>${escapeHtml(bookName)}</h2>
            <div class="rlh-item-controls">
              <button class="rlh-toolbar-btn rlh-rename-book-btn" title="重命名世界书">重命名</button>
              <button class="rlh-toolbar-btn rlh-btn-danger rlh-delete-book-btn" title="删除世界书">删除</button>
            </div>
          </header>
          <div class="rlh-detail-content">
            <p class="rlh-info-text">加载中...</p>
          </div>
        </div>
      `;
    $container.html(loadingHtml);
    return;
  }

  $container.append(`<div class="rlh-info-text-small">当前世界书：${escapeHtml(bookName)}</div>`);

  const sortMode = getActiveSortMode(context);
  const collapseState = getActiveCollapseState(context);
  const entries = sortLoreEntries(safeGetLorebookEntries(bookName), sortMode);
  const detailHtml = `
        <div class="rlh-detail-view" data-book-name="${escapeHtml(bookName)}">
          <header class="rlh-detail-header">
            <button class="rlh-action-btn-icon rlh-back-to-list-btn" title="返回世界书列表"><i class="fa-solid fa-arrow-left"></i></button>
            <h2>${escapeHtml(bookName)}</h2>
            <div class="rlh-item-controls">
              <button class="rlh-toolbar-btn rlh-rename-book-btn" title="重命名世界书">重命名</button>
              <button class="rlh-toolbar-btn rlh-btn-danger rlh-delete-book-btn" title="删除世界书">删除</button>
            </div>
          </header>
          <div class="rlh-detail-content">
          </div>
        </div>
      `;
  $container.html(detailHtml);

  const visibleEntries = searchTerm
    ? entries.filter(entry => matchEntry(entry, searchTerm))
    : entries;

  const $content = $container.find('.rlh-detail-content');

  if (!visibleEntries.length) {
    const message = entries.length
      ? '无匹配条目'
      : '这本书还没有条目，点击工具栏的“新建条目”按钮，为它添加内容。';
    $content.html(`<p class="rlh-info-text">${message}</p>`);
    return;
  }

  const entriesHtml = `
    <p class="rlh-info-text-small">共 ${entries.length} 个条目</p>
    <div class="rlh-entry-list-wrapper">
      ${visibleEntries
        .map(entry => createItemElement(entry, 'lore', bookName, searchTerm, { collapseState, enableDrag: false }).prop('outerHTML'))
        .join('')}
    </div>
  `;
  $content.html(entriesHtml);
};

export const renderCharacterLorebookView = (context, searchTerm, $container) => {
  const $ = get$();
  const linkedBooks = appState.lorebooks.character;
  const characterName = appState.characterContext.name ?? '';
  const hasActiveCharacter = appState.characterContext.id !== null;

  if (!hasActiveCharacter) {
    $container.html('<p class="rlh-info-text">请先加载一个角色以管理角色世界书。</p>');
    return;
  }

  if (linkedBooks.length === 0) {
    $container.html('<p class="rlh-info-text">当前角色没有绑定的世界书。点击同步按钮刷新。</p>');
    return;
  }

  let activeBookName = appState.activeCharacterBook;
  if (!activeBookName || !linkedBooks.includes(activeBookName)) {
    activeBookName = linkedBooks[0];
    appState.activeCharacterBook = activeBookName;
  }

  const sortMode = getActiveSortMode(context);
  const collapseState = getActiveCollapseState(context);

  if (linkedBooks.length > 1) {
    const optionsHtml = linkedBooks
      .map(name => `<option value="${escapeHtml(name)}"${name === activeBookName ? ' selected' : ''}>${escapeHtml(name)}</option>`)
      .join('');
    $container.append(`<div class="rlh-book-switcher"><label>当前角色名：${escapeHtml(characterName)}<select id="${CHARACTER_BOOK_SWITCH_ID}" class="rlh-input">${optionsHtml}</select></label></div>`);
  } else {
    $container.append(`<div class="rlh-info-text-small">当前角色名：${escapeHtml(characterName)}</div>`);
  }

  const renderBook = bookName => {
    const $bookContainer = $(
      `<div class="rlh-book-group" data-book-name="${escapeHtml(bookName)}">
        <div class="rlh-book-group-header">
          <h2 class="rlh-book-group-title">${escapeHtml(bookName)}</h2>
          <div class="rlh-item-controls">
            <button class="rlh-toolbar-btn rlh-rename-book-btn" title="重命名世界书">重命名</button>
            <button class="rlh-toolbar-btn rlh-btn-danger rlh-delete-book-btn" title="删除世界书">删除</button>
          </div>
        </div>
        <div class="rlh-entry-list-wrapper"></div>
      </div>`
    );

    const $listWrapper = $bookContainer.find('.rlh-entry-list-wrapper');
    const bookMeta = appState.allLorebooks.find(b => b.name === bookName);
    if (bookMeta && !bookMeta.entriesLoaded) {
      if (!bookMeta.loadingEntries) {
        bookMeta.loadingEntries = true;
        loadLorebookEntriesIfNeeded(bookName)
          .finally(() => {
            bookMeta.loadingEntries = false;
            renderContent();
          });
      }
      $listWrapper.append('<p class="rlh-info-text">加载中...</p>');
      return $bookContainer;
    }

    const baseEntries = [...safeGetLorebookEntries(bookName)].sort(
      (a, b) => ((a.display_index ?? Number.MAX_SAFE_INTEGER) - (b.display_index ?? Number.MAX_SAFE_INTEGER)),
    );
    const entries = sortLoreEntries(baseEntries, sortMode);

    const bookNameMatches =
      !searchTerm ||
      (appState.searchFilters.bookName && bookName.toLowerCase().includes(searchTerm));

    const matchingEntries = searchTerm
      ? entries.filter(entry => matchEntry(entry, searchTerm))
      : entries;

    const entriesToShow = bookNameMatches && !searchTerm ? entries : matchingEntries;
    const canReorder = false;

    if (!entriesToShow.length) {
      if (searchTerm) {
        $listWrapper.append('<p class="rlh-info-text-small">无匹配条目</p>');
      } else {
        $listWrapper.append('<p class="rlh-info-text-small">这本世界书暂时没有条目。</p>');
      }
    } else {
      entriesToShow.forEach(entry => {
        $listWrapper.append(
          createItemElement(entry, 'lore', bookName, searchTerm, { collapseState, enableDrag: canReorder }),
        );
      });
    }

    initializeLoreEntrySortable($listWrapper, bookName, { enabled: canReorder });

    return $bookContainer;
  };

  const $bookElement = renderBook(activeBookName);
  if ($bookElement) {
    $bookElement.attr('data-active', 'true');
    $container.append($bookElement);
  } else if (searchTerm) {
    $container.append('<p class="rlh-info-text">未找到匹配的条目。</p>');
  } else {
    $container.append('<p class="rlh-info-text">未能加载当前世界书，请尝试刷新数据。</p>');
  }
};

export const getChatLorebookMatches = searchTerm => {
  let matches = [];
  const bookName = appState.chatLorebook;
  const parentWin = getParentWin();
  const context = parentWin.SillyTavern?.getContext?.() || {};
  const hasActiveChat = context.chatId !== undefined && context.chatId !== null;

  if (!hasActiveChat || !bookName) {
    return matches;
  }

  const entries = [...safeGetLorebookEntries(bookName)].sort(
    (a, b) => ((a.display_index ?? Number.MAX_SAFE_INTEGER) - (b.display_index ?? Number.MAX_SAFE_INTEGER)),
  );

  if (!searchTerm) {
    entries.forEach(entry => {
      matches.push({ bookName, entry });
    });
  } else {
    entries.forEach(entry => {
      let entryNameMatches =
        appState.searchFilters.entryName && (entry.name || '').toLowerCase().includes(searchTerm.toLowerCase());
      let keywordsMatch =
        appState.searchFilters.keywords && entry.keys.join(' ').toLowerCase().includes(searchTerm.toLowerCase());
      let contentMatch =
        appState.searchFilters.content &&
        entry.content &&
        entry.content.toLowerCase().includes(searchTerm.toLowerCase());

      if (entryNameMatches || keywordsMatch || contentMatch) {
        matches.push({ bookName, entry });
      }
    });
  }

  return matches;
};

export const renderChatLorebookView = (context, searchTerm, $container) => {
  const $ = get$();
  const bookName = appState.chatLorebook;
  const parentWin = getParentWin();
  const characterName = appState.characterContext.name ?? '';
  const hasActiveChat = parentWin.SillyTavern?.getContext?.()?.chatId !== null;

  if (!hasActiveChat) {
    $container.html('<p class="rlh-info-text">请先打开一个聊天以管理聊天世界书。</p>');
    return;
  }

  if (!bookName) {
    $container.html(`
      <div class="rlh-chat-lore-empty">
        <p class="rlh-info-text">当前聊天没有绑定的世界书。</p>
        <button class="rlh-action-btn rlh-btn-primary" id="rlh-create-chat-lore-btn"><i class="fa-solid fa-plus"></i> 创建并绑定聊天世界书</button>
      </div>
    `);
    return;
  }

  $container.append(`<div class="rlh-info-text-small">当前聊天角色名：${escapeHtml(characterName)}</div>`);

  const sortMode = getActiveSortMode(context);
  const collapseState = getActiveCollapseState(context);

  const $bookContainer = $(
    `<div class="rlh-book-group" data-book-name="${escapeHtml(bookName)}">
      <div class="rlh-book-group-header">
        <h2 class="rlh-book-group-title">${escapeHtml(bookName)} (聊天专用)</h2>
        <div class="rlh-item-controls">
          <button class="rlh-toolbar-btn rlh-rename-book-btn" title="重命名世界书">重命名</button>
          <button class="rlh-toolbar-btn rlh-unlink-chat-lore-btn" title="解除绑定">解除绑定</button>
        </div>
      </div>
      <div class="rlh-entry-list-wrapper"></div>
    </div>`
  );
  const $listWrapper = $bookContainer.find('.rlh-entry-list-wrapper');
  const bookMeta = appState.allLorebooks.find(b => b.name === bookName);
  if (bookMeta && !bookMeta.entriesLoaded) {
    if (!bookMeta.loadingEntries) {
      bookMeta.loadingEntries = true;
      loadLorebookEntriesIfNeeded(bookName)
        .finally(() => {
          bookMeta.loadingEntries = false;
          renderContent();
        });
    }
    $listWrapper.append('<p class="rlh-info-text">加载中...</p>');
    $container.append($bookContainer);
    return;
  }

  const baseEntries = [...safeGetLorebookEntries(bookName)].sort(
    (a, b) => ((a.display_index ?? Number.MAX_SAFE_INTEGER) - (b.display_index ?? Number.MAX_SAFE_INTEGER)),
  );
  const entries = sortLoreEntries(baseEntries, sortMode);

  const matchingEntries = searchTerm
    ? entries.filter(entry => matchEntry(entry, searchTerm))
    : entries;
  const canReorder = false;

  if (!matchingEntries.length) {
    const message = entries.length ? '无匹配条目' : '这本书还没有条目。';
    $listWrapper.append(`<p class="rlh-info-text-small">${message}</p>`);
  } else {
    matchingEntries.forEach(entry => {
      $listWrapper.append(
        createItemElement(entry, 'lore', bookName, searchTerm, { collapseState, enableDrag: canReorder }),
      );
    });
  }

  initializeLoreEntrySortable($listWrapper, bookName, { enabled: canReorder });

  $container.append($bookContainer);
};
export const cancelGlobalLoreListRender = () => cancelPendingGlobalListRender();
