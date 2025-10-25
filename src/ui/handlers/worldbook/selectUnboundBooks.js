import {
  appState,
  showToast,
  buildBookSelectionKey,
  safeGetLorebookEntries,
  errorCatched,
  emitAnalyticsEvent,
} from '../../../core.js';
import { resolveUnboundGlobalLorebooks } from '../../../dataLayer.js';
import { renderContent } from '../../render/index.js';
import { matchEntry } from '../../render/shared.js';

const getBookName = book => {
  if (!book && book !== 0) return '';
  if (typeof book === 'string') return book.trim();
  if (book && typeof book === 'object' && typeof book.name === 'string') return book.name.trim();
  return String(book ?? '').trim();
};

const nowMs = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

export const createSelectUnboundBooksHandler = () => {
  const handleSelectUnboundBooks = errorCatched(async event => {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (appState.activeView !== 'global-lore-list') {
      showToast('该操作仅在全局世界书列表视图可用', 'info');
      return;
    }

    if (appState.activeTab !== 'global-lore') {
      showToast('该操作仅在全局世界书列表可用', 'info');
      return;
    }

    const start = nowMs();
    const { totalBooks, unboundNames, statsByName } = resolveUnboundGlobalLorebooks();
    const books = Array.isArray(appState.allLorebooks) ? appState.allLorebooks : [];

    const searchTermRaw =
      typeof appState.globalSearch?.term === 'string' ? appState.globalSearch.term.trim() : '';
    const normalizedTerm = searchTermRaw.toLowerCase();
    const activeGlobalBookName = getBookName(appState.activeBookName);

    const hasSearchTerm = Boolean(normalizedTerm && normalizedTerm.length);
    const filteredBooks = hasSearchTerm
      ? books.filter(book => {
          const name = getBookName(book);
          if (!name) return false;
          const bookNameMatches = appState.searchFilters.bookName && name.toLowerCase().includes(normalizedTerm);
          if (bookNameMatches) {
            return true;
          }
          const entries = safeGetLorebookEntries(name);
          if (!Array.isArray(entries) || entries.length === 0) {
            return false;
          }
          return entries.some(entry => matchEntry(entry, normalizedTerm));
        })
      : books;

    const visibleBooksWithName = filteredBooks
      .map(book => {
        const name = getBookName(book);
        return { book, name };
      })
      .filter(({ name }) => typeof name === 'string' && name.length > 0);

    const visibleNames = visibleBooksWithName.map(({ name }) => name);

    const visibleUnboundNames = visibleBooksWithName
      .filter(({ book, name }) => {
        if (!name) return false;
        if (activeGlobalBookName && name === activeGlobalBookName) return false;
        if (book && book.enabled) return false;
        if (unboundNames.has(name)) return true;
        const stats = statsByName.get(name);
        return stats ? stats.bindingCount === 0 : false;
      })
      .map(({ name }) => name);

    if (visibleUnboundNames.length === 0) {
      showToast('没有未绑定的世界书', 'info');
      emitAnalyticsEvent({
        category: 'lorebook',
        action: 'select_unbound',
        value: 0,
        label: 'global_unbound_select',
        feature: 'select_unbound_lorebooks',
        view: appState.activeView,
        meta: {
          searchTerm: searchTermRaw,
          visibleBookCount: visibleNames.length,
          totalBookCount: totalBooks,
          unboundTotal: unboundNames.size,
        },
      });
      return;
    }

    appState.multiSelectMode = true;
    appState.multiSelectTarget = 'book';
    appState.selectedItems.clear();
    visibleUnboundNames.forEach(name => {
      const key = buildBookSelectionKey(name);
      if (key) {
        appState.selectedItems.add(key);
      }
    });

    const end = nowMs();
    const duration = Math.max(0, Math.round(end - start));

    renderContent();
    showToast(
      `已选中 ${visibleUnboundNames.length} 本未绑定的世界书，请确认这些世界书未在聊天中使用，避免误删聊天世界书。`,
      'success',
    );
    console.log(
      `[RegexLoreHub] 选择孤立世界书：匹配 ${visibleUnboundNames.length} / 可见 ${visibleNames.length} / 全量 ${totalBooks}，耗时 ${duration}ms。`,
    );

    emitAnalyticsEvent({
      category: 'lorebook',
      action: 'select_unbound',
      value: visibleUnboundNames.length,
      label: 'global_unbound_select',
      feature: 'select_unbound_lorebooks',
      view: appState.activeView,
      meta: {
        searchTerm: searchTermRaw,
        visibleBookCount: visibleNames.length,
        totalBookCount: totalBooks,
        unboundTotal: unboundNames.size,
        selectionCount: visibleUnboundNames.length,
        durationMs: duration,
      },
    });
  });

  return {
    handleSelectUnboundBooks,
  };
};
