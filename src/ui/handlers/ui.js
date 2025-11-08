import {
  buildSearchRegex,
  PANEL_ID,
  BUTTON_ID,
  SEARCH_INPUT_ID,
  REPLACE_INPUT_ID,
  CREATE_LOREBOOK_BTN_ID,
  TOGGLE_COLLAPSE_BTN_ID,
  appState,
  DOM_ID,
  safeGetLorebookEntries,
  safeSetLorebookEntries,
  safeDeleteLorebookEntries,
  errorCatched,
  showModal,
  showToast,
  showProgressToast,
  get$,
  getParentDoc,
  escapeHtml,
  SORT_MENU_ID,
  SORT_MENU_BUTTON_ID,
  POSITION_MENU_ID,
  POSITION_MENU_BUTTON_ID,
  UNIFIED_STATUS_MENU_ID,
  UNIFIED_STATUS_BUTTON_ID,
  WORLD_BOOK_STATUS_LIST,
  DEFAULT_WORLD_BOOK_STATUS,
  resolveWorldbookStatus,
  decodeSelectionPart,
  buildBookSelectionKey,
  buildLoreSelectionKey,
  buildLoreSelectionPrefix,
  buildRegexSelectionKey,
  THEME_MENU_WRAPPER_ID,
  THEME_MENU_ID,
  THEME_TOGGLE_BTN_ID,
  THEME_OPTION_CLASS,
  setActiveTheme,
  getActiveTheme,
} from '../../core.js';

import {
  TavernAPI,
  loadAllData,
  loadLorebookEntriesIfNeeded,
  saveAllChanges,
  syncContextWithAppState,
  refreshCharacterData,
  updateBookSummary,
  normalizeWorldbookEntry,
  updateWorldbookEntries,
  updateWorldbookEntriesStatus,
  updateRegexOrderMetadata,
  saveThemePreference,
} from '../../dataLayer.js';

import { renderContent, getViewContext, getContextInstanceKey } from '../render/index.js';
import { getGlobalLorebookMatches } from '../render/lorebook.js';
import { getRegexMatches } from '../render/regex.js';
import {
  updateSelectionCount,
  setActiveCollapseState,
  setActiveSortMode,
  buildReplaceConfirmationHTML,
  updateEntryStatusDom,
} from '../render/shared.js';

/**
 * 显示一个确认弹窗，详细列出将被替换的世界书及其条目。
 * @param {Array<object>} matches - 匹配项数组。
 * @param {object} stats - 分类统计对象。
 * @param {string} searchTerm - 要搜索的词。
 * @param {string} replaceTerm - 用于替换的词。
 * @returns {Promise<boolean>} - 用户确认则 resolve(true)，否则 reject。
 */
const showReplaceConfirmationModal = (matches, stats, booksMatchedByNameOnly, searchTerm, replaceTerm, context) => {

  const modalContent = buildReplaceConfirmationHTML(matches, stats, booksMatchedByNameOnly, searchTerm, replaceTerm, context);

  // 2. 调用核心 showModal
  return showModal({
    type: 'confirm',
    title: '确认替换',
    html: modalContent,
    danger: true,
  });
};

// 顶部工具栏折叠/展开按钮
export const toggleToolbar = errorCatched(async event => {
  const $ = get$();
  const parentDoc = getParentDoc();

  const $panel = $(`#${PANEL_ID}`, parentDoc);
  if (!$panel.length) return;

  let $toolbarShell = $panel.find(`#${DOM_ID.TOOLBAR_SHELL}`);
  if (!$toolbarShell.length) {
    $toolbarShell = $panel.find('.rlh-toolbar-shell').first();
    if ($toolbarShell.length) {
      $toolbarShell.attr('id', DOM_ID.TOOLBAR_SHELL);
    }
  }
  if (!$toolbarShell.length) return;

  const willCollapse = !$toolbarShell.hasClass('rlh-toolbar-shell--collapsed');

  event?.preventDefault?.();
  event?.stopPropagation?.();

  $toolbarShell.toggleClass('rlh-toolbar-shell--collapsed', willCollapse);
  $toolbarShell.attr('aria-hidden', String(willCollapse));

  appState.isToolbarCollapsed = willCollapse;

  const $toggleButton = event?.currentTarget ? $(event.currentTarget) : $panel.find(`#${DOM_ID.TOGGLE_TOOLBAR_BTN}`);
  if ($toggleButton.length) {
    $toggleButton.text(willCollapse ? '工具栏' : '工具栏');
    $toggleButton.attr('aria-expanded', String(!willCollapse));
    $toggleButton.attr('title', willCollapse ? '工具栏' : '工具栏');
  }
});
// --- UI 事件处理 ---
export function createUIHandlers(deps = {}) {
  const $ = deps.$ ?? get$();
  const parentDoc = deps.parentDoc ?? getParentDoc();
  const lorebookHandlers = deps.lorebookHandlers;
  const itemHandlers = deps.itemHandlers;
  const getTargetKeyPrefix = () => {
    switch (appState.multiSelectTarget) {
      case 'book':
        return 'book:';
      case 'entry':
        return 'lore:';
      case 'regex':
        return 'regex:';
      default:
        return '';
    }
  };

  const parseSelectionKey = rawKey => {
    const key = String(rawKey ?? '');
    const firstSepIndex = key.indexOf(':');
    if (firstSepIndex === -1) {
      return { type: key, raw: '' };
    }

    const type = key.slice(0, firstSepIndex);
    const remainder = key.slice(firstSepIndex + 1);

    if (type === 'book') {
      return { type, bookName: decodeSelectionPart(remainder) };
    }

    if (type === 'lore') {
      const lastSepIndex = remainder.lastIndexOf(':');
      if (lastSepIndex === -1) {
        return { type, bookName: decodeSelectionPart(remainder), entryId: null };
      }
      const rawBook = remainder.slice(0, lastSepIndex);
      const rawEntryId = remainder.slice(lastSepIndex + 1);
      return {
        type,
        bookName: decodeSelectionPart(rawBook),
        entryId: decodeSelectionPart(rawEntryId),
      };
    }

    if (type === 'regex') {
      return { type, regexId: decodeSelectionPart(remainder) };
    }

    return { type, raw: remainder };
  };

  const getUnifiedStatusElements = () => ({
    $menu: $(`#${UNIFIED_STATUS_MENU_ID}`, parentDoc),
    $button: $(`#${UNIFIED_STATUS_BUTTON_ID}`, parentDoc),
  });

  const getSelectedEntriesByBook = () => {
    const selectedEntriesByBook = new Map();
    for (const itemKey of appState.selectedItems) {
      const { type, bookName, entryId } = parseSelectionKey(itemKey);
      if (type === 'lore' && bookName) {
        const numericId = Number(entryId);
        const uid = Number.isFinite(numericId) ? numericId : entryId;
        if (uid === null || uid === undefined || uid === '') continue;
        if (!selectedEntriesByBook.has(bookName)) selectedEntriesByBook.set(bookName, []);
        selectedEntriesByBook.get(bookName).push(uid);
      }
    }
    return selectedEntriesByBook;
  };

  let unifiedStatusMenuListenersActive = false;

  function closeUnifiedStatusMenu() {
    const { $menu, $button } = getUnifiedStatusElements();
    if ($menu.length) {
      $menu.attr('data-open', 'false');
    }
    if ($button.length) {
      $button.attr('aria-expanded', 'false');
    }
    if (unifiedStatusMenuListenersActive) {
      $(parentDoc).off('click.rlhUnifiedStatus', handleUnifiedStatusMenuOutsideClick);
      unifiedStatusMenuListenersActive = false;
    }
  }

  function handleUnifiedStatusMenuOutsideClick(event) {
    const { $menu, $button } = getUnifiedStatusElements();
    if (!$menu.length) return;
    const $target = $(event.target);
    if ($target.closest(`#${UNIFIED_STATUS_MENU_ID}`).length) return;
    if ($button.length && $target.closest(`#${UNIFIED_STATUS_BUTTON_ID}`).length) return;
    closeUnifiedStatusMenu();
  }

  function openUnifiedStatusMenu() {
    const { $menu, $button } = getUnifiedStatusElements();
    if (!$menu.length || !$button.length) return;
    $menu.attr('data-open', 'true');
    $button.attr('aria-expanded', 'true');
    if (!unifiedStatusMenuListenersActive) {
      $(parentDoc).on('click.rlhUnifiedStatus', handleUnifiedStatusMenuOutsideClick);
      unifiedStatusMenuListenersActive = true;
    }
  }

  const updateUnifiedStatusButtonState = () => {
    const { $menu, $button } = getUnifiedStatusElements();
    if (!$button.length) return;
    const context = getViewContext();
    const isEntryContext = context?.type === 'lore';
    if (!isEntryContext) {
      $button.attr('disabled', 'disabled').attr('title', '统一状态仅在条目视图可用');
      if ($menu.length && $menu.attr('data-open') === 'true') closeUnifiedStatusMenu();
      return;
    }

    const fallbackNames = [
      context?.activeBookName,
      appState.activeBookName,
      appState.activeCharacterBook,
      appState.chatLorebook,
    ];
    let resolvedBookName =
      fallbackNames.find(name => typeof name === 'string' && name.trim().length > 0)?.toString().trim() ?? '';

    const selectedEntriesMap = getSelectedEntriesByBook();
    if (!resolvedBookName && selectedEntriesMap.size === 1) {
      resolvedBookName = [...selectedEntriesMap.keys()][0] ?? '';
    }
    const entries = resolvedBookName ? safeGetLorebookEntries(resolvedBookName) : [];
    const hasEntries = entries.length > 0;

    const isEntryMultiSelect = appState.multiSelectMode && appState.multiSelectTarget === 'entry';
    let selectedTotal = 0;
    selectedEntriesMap.forEach(list => {
      if (Array.isArray(list)) selectedTotal += list.length;
    });
    const shouldEnable = isEntryMultiSelect ? selectedTotal > 0 : hasEntries;

    let tooltip;
    if (isEntryMultiSelect) {
      tooltip = selectedTotal > 0
        ? `多选模式：将对已选中的 ${selectedTotal} 个条目统一状态`
        : '已开启多选，请先勾选要调整状态的条目';
    } else if (hasEntries) {
      tooltip = `将对「${resolvedBookName || '当前世界书'}」的所有条目统一状态`;
    } else {
      tooltip = resolvedBookName ? `「${resolvedBookName}」暂无条目可调整` : '请先打开需要统一状态的世界书';
    }

    $button.attr('title', tooltip);
    if (shouldEnable) {
      $button.removeAttr('disabled');
    } else {
      $button.attr('disabled', 'disabled');
      if ($menu.length && $menu.attr('data-open') === 'true') closeUnifiedStatusMenu();
    }
  };

  const updatePositionButtonState = () => {
    const { $menu, $button } = getPositionMenuElements();
    if (!$button.length) return;
    const context = getViewContext();

    const fallbackNames = [
      context?.activeBookName,
      appState.activeBookName,
      appState.activeCharacterBook,
      appState.chatLorebook,
    ];
    let resolvedBookName =
      fallbackNames.find(name => typeof name === 'string' && name.trim().length > 0)?.toString().trim() ?? '';

    const selectedEntriesMap = getSelectedEntriesByBook();
    if (!resolvedBookName && selectedEntriesMap.size === 1) {
      resolvedBookName = [...selectedEntriesMap.keys()][0] ?? '';
    }

    const entries = resolvedBookName ? safeGetLorebookEntries(resolvedBookName) : [];
    const hasEntries = entries.length > 0;
    const isEntryMultiSelect = appState.multiSelectMode && appState.multiSelectTarget === 'entry';
    let selectedTotal = 0;
    selectedEntriesMap.forEach(list => {
      if (Array.isArray(list)) selectedTotal += list.length;
    });
    const shouldEnable = isEntryMultiSelect ? selectedTotal > 0 : hasEntries;

    let tooltip;
    if (isEntryMultiSelect) {
      tooltip = selectedTotal > 0
        ? `多选模式：将对已选中的 ${selectedTotal} 个条目统一位置`
        : '已开启多选，请先勾选要调整位置的条目';
    } else if (hasEntries) {
      tooltip = `将对「${resolvedBookName || '当前世界书'}」的所有条目统一位置`;
    } else {
      tooltip = resolvedBookName ? `「${resolvedBookName}」暂无条目可调整` : '请先打开需要统一位置的世界书';
    }

    $button.attr('title', tooltip);
    if (shouldEnable) {
      $button.removeAttr('disabled');
    } else {
      $button.attr('disabled', 'disabled');
      if ($menu.length) $menu.attr('data-open', 'false');
    }
  };

  const syncToolbarState = () => {
    updateSelectionCount();
    updateUnifiedStatusButtonState();
    updatePositionButtonState();
  };

  const getVisibleSelectKeys = () => {
    if (!appState.multiSelectMode) return [];
    const $panel = $(`#${PANEL_ID}`, parentDoc);
    if (!$panel.length) return [];

    let selector;
    switch (appState.multiSelectTarget) {
      case 'book':
        selector = '.rlh-book-group[data-select-key]';
        break;
      case 'entry':
        selector = '.rlh-item-container[data-select-key][data-type="lore"]';
        break;
      case 'regex':
        selector = '.rlh-item-container[data-select-key][data-type="regex"]';
        break;
      default:
        selector = '[data-select-key]';
        break;
    }

    const keys = [];
    $panel.find(selector).each((_, el) => {
      const $el = $(el);
      if (!$el.is(':visible')) return;
      const key = $el.data('select-key');
      if (key) keys.push(String(key));
    });
    return keys;
  };

  const hasSelectionForCurrentTarget = () => {
    if (!appState.selectedItems || appState.selectedItems.size === 0) return false;
    const prefix = getTargetKeyPrefix();
    if (!prefix) return appState.selectedItems.size > 0;
    for (const key of appState.selectedItems) {
      if (key.startsWith(prefix)) return true;
    }
    return false;
  };

  const resolveSelectionKey = $container => {
    if (!$container || !$container.length) return null;
    if ($container.hasClass('rlh-book-group')) {
      if (appState.multiSelectTarget !== 'book') return null;
      const bookName = $container.data('book-name');
      return bookName ? buildBookSelectionKey(bookName) : null;
    }
    if ($container.hasClass('rlh-item-container')) {
      const itemType = $container.data('type');
      const itemId = $container.data('id');
      if (itemType === 'lore' && appState.multiSelectTarget === 'entry') {
        const bookName = $container.data('book-name');
        return bookName != null && itemId != null ? buildLoreSelectionKey(bookName, itemId) : null;
      }
      if (itemType === 'regex' && appState.multiSelectTarget === 'regex') {
        return itemId != null ? buildRegexSelectionKey(itemId) : null;
      }
    }
    return null;
  };

  const toggleSelectionForContainer = $container => {
    const itemKey = resolveSelectionKey($container);
    if (!itemKey) return false;
    if (appState.selectedItems.has(itemKey)) {
      appState.selectedItems.delete(itemKey);
      $container.removeClass('selected');
      $container.find('.rlh-multi-select-checkbox').prop('checked', false);
    } else {
      appState.selectedItems.add(itemKey);
      $container.addClass('selected');
      $container.find('.rlh-multi-select-checkbox').prop('checked', true);
    }
    syncToolbarState();
    return true;
  };

  const handleGlobalSearch = errorCatched(async (event) => {
    const $target = $(event.currentTarget);
    const value = $target.val();

    if ($target.attr('id') === 'rlh-global-search-input') {
        appState.globalSearch.term = value;
    } else if ($target.attr('id') === 'rlh-global-replace-input') {
        appState.globalSearch.replace = value;
    }

    // 仅当搜索词变化时才重绘以应用高亮
    if ($target.attr('id') === 'rlh-global-search-input') {
        renderContent();
    }
  });
  const handleSearchInputKeydown = errorCatched(async event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const term = event.currentTarget.value ?? '';
      appState.globalSearch.term = term;
      renderContent();
    }
  });

  const normalizeBookNames = (names = []) => {
    const unique = new Set();
    names.forEach(name => {
      if (typeof name !== 'string') return;
      const trimmed = name.trim();
      if (trimmed) unique.add(trimmed);
    });
    return Array.from(unique);
  };

  const ensureEntriesLoadedForBooks = async names => {
    const targets = normalizeBookNames(names);
    if (!targets.length) return true;

    const pending = targets.filter(name => {
      const meta = appState.allLorebooks.find(book => book.name === name);
      if (meta?.entriesLoaded) return false;
      const cachedEntries = safeGetLorebookEntries(name);
      return !Array.isArray(cachedEntries) || cachedEntries.length === 0;
    });

    if (!pending.length) return true;

    const progressToast = showProgressToast(`正在加载 ${pending.length} 本世界书的条目...`);
    try {
      await Promise.all(pending.map(name => loadLorebookEntriesIfNeeded(name)));
      progressToast.remove();
      return true;
    } catch (error) {
      progressToast.remove();
      console.error('[RegexLoreHub] Failed to load entries before replace:', error);
      await showModal({
        type: 'alert',
        title: '加载失败',
        text: '在执行替换前加载世界书条目失败，请检查控制台。',
      });
      return false;
    }
  };

  const handleSearchClear = errorCatched(async () => {
    const $input = $(`#${SEARCH_INPUT_ID}`, parentDoc);
    if ($input.length) $input.val('');
    appState.globalSearch.term = '';
    renderContent();
  });

  const handleReplace = errorCatched(async () => {
    const searchTerm = $(`#${SEARCH_INPUT_ID}`, parentDoc).val();
    const replaceTerm = $(`#${REPLACE_INPUT_ID}`, parentDoc).val();
    const context = getViewContext();

    if (!searchTerm) {
      await showModal({ type: 'alert', title: '替换失败', text: '请先输入搜索词。' });
      return;
    }

    // 替换词可以为空，表示删除
    // if (!replaceTerm) {
    //   await showModal({ type: 'alert', title: '替换失败', text: '请先输入替换词。' });
    //   return;
    // }

    // 核心逻辑：在全局搜索前，确保所有世界书条目已加载
    if (context.view === 'global-lore-list') {
      const booksToLoad = appState.allLorebooks.filter(b => !b.entriesLoaded);
      if (booksToLoad.length > 0) {
        const progressToast = showProgressToast(`正在加载 ${booksToLoad.length} 本世界书的条目...`);
        try {
          await Promise.all(booksToLoad.map(b => loadLorebookEntriesIfNeeded(b.name)));
          progressToast.remove();
        } catch (error) {
          progressToast.remove();
          console.error('[RegexLoreHub] Failed to load entries before replace:', error);
          await showModal({
            type: 'alert',
            title: '加载失败',
            text: '在执行替换前加载世界书条目失败，请检查控制台。',
          });
          return;
        }
      }
    }

    let matches, stats, booksMatchedByNameOnly;
    let modalContext;

    if (context.type === 'lore') {
      modalContext = { type: 'lorebook', bookNames: [] };

      if (context.view === 'global-lore-list') {
        ({ matches, stats, booksMatchedByNameOnly } = getGlobalLorebookMatches(searchTerm));
      } else if (context.view === 'global-lore-detail') {
        const activeName = normalizeBookNames([context.activeBookName]);
        if (!activeName.length) {
          await showModal({ type: 'alert', title: '操作无效', text: '请先选择要替换的世界书。' });
          return;
        }
        if (!(await ensureEntriesLoadedForBooks(activeName))) return;
        ({ matches, stats, booksMatchedByNameOnly } = getGlobalLorebookMatches(searchTerm, false, { bookNames: activeName }));
        modalContext.bookNames = activeName;
      } else if (context.id === 'char-lore') {
        const activeNames = normalizeBookNames([context.activeBookName, appState.activeCharacterBook]);
        if (!activeNames.length) {
          await showModal({ type: 'alert', title: '操作无效', text: '当前没有可用的角色世界书，无法执行替换。' });
          return;
        }
        if (!(await ensureEntriesLoadedForBooks(activeNames))) return;
        ({ matches, stats, booksMatchedByNameOnly } = getGlobalLorebookMatches(searchTerm, false, { bookNames: activeNames }));
        modalContext.bookNames = activeNames;
      } else if (context.id === 'chat-lore') {
        const activeNames = normalizeBookNames([context.activeBookName, appState.chatLorebook]);
        if (!activeNames.length) {
          await showModal({ type: 'alert', title: '操作无效', text: '当前没有可用的聊天世界书，无法执行替换。' });
          return;
        }
        if (!(await ensureEntriesLoadedForBooks(activeNames))) return;
        ({ matches, stats, booksMatchedByNameOnly } = getGlobalLorebookMatches(searchTerm, false, { bookNames: activeNames }));
        modalContext.bookNames = activeNames;
      } else {
        await showModal({ type: 'alert', title: '操作无效', text: '当前视图不支持替换功能。' });
        return;
      }
    } else if (context.type === 'regex') {
      ({ matches, stats } = getRegexMatches(searchTerm));
      modalContext = 'regex';
    } else {
      await showModal({ type: 'alert', title: '操作无效', text: '未知的视图类型，无法执行替换。' });
      return;
    }

    if ((!matches || matches.length === 0) && (!booksMatchedByNameOnly || booksMatchedByNameOnly.length === 0)) {
      await showModal({ type: 'alert', title: '无匹配项', text: '未找到可替换的条目。' });
      return;
    }

    try {
      // 使用新的详细确认弹窗，并传递 stats 对象
      await showReplaceConfirmationModal(matches, stats, booksMatchedByNameOnly, searchTerm, replaceTerm, modalContext);

      // 用户确认后执行替换
      const progressToast = showProgressToast('正在执行替换...');
      try {
        await performReplace(matches, searchTerm, replaceTerm);
        progressToast.remove();
        showToast('替换完成');
        renderContent(); // 刷新视图
      } catch (error) {
        progressToast.remove();
        console.error('[RegexLoreHub] Replace error:', error);
        await showModal({
          type: 'alert',
          title: '替换失败',
          text: '替换过程中发生错误，请检查开发者控制台获取详细信息。',
        });
      }
    } catch (error) {
      // 用户在确认弹窗中点击了“取消”，无需任何操作
      console.log('[RegexLoreHub] Replace operation cancelled by user.');
    }
  });
  const handleToolbarToggleCollapse = errorCatched(async () => {
    const context = getViewContext();
    if (!context.showCollapseToggle) return;

    const key = getContextInstanceKey(context);
    const current = appState.collapseStateByContext.get(key) ?? 'expanded';
    const nextState = current === 'collapsed' ? 'expanded' : 'collapsed';
    setActiveCollapseState(context, nextState);

    // 查找所有可见的、可折叠的顶层元素
    const $containers = $(
      `#${PANEL_ID}-content .rlh-item-container:visible, #${PANEL_ID}-content .rlh-book-group:visible`,
      parentDoc,
    );

    $containers.each(function () {
      const $container = $(this);
      const $content = $container.find('.rlh-collapsible-content').first();
      const isCurrentlyVisible = $content.is(':visible');
      const $header = $container.find('.rlh-item-header, .rlh-global-book-header').first();

      // 如果需要展开但当前是折叠的，则触发点击（带批量操作标记）
      if (nextState === 'expanded' && !isCurrentlyVisible) {
        $header.trigger('click.rlh', { bulk: true });
      }
      // 如果需要折叠但当前是展开的，也触发点击
      else if (nextState === 'collapsed' && isCurrentlyVisible) {
        $header.trigger('click.rlh', { bulk: true });
      }
    });

    // 手动更新按钮状态以避免完全重绘
    const $button = $(`#${TOGGLE_COLLAPSE_BTN_ID}`, parentDoc);
    if ($button.length) {
      const iconClass = nextState === 'collapsed' ? 'fa-expand-arrows-alt' : 'fa-compress-arrows-alt';
      const label = nextState === 'collapsed' ? '全部展开' : '全部折叠';
      $button.attr('data-collapse-state', nextState);
      $button.find('i').removeClass('fa-expand-arrows-alt fa-compress-arrows-alt').addClass(iconClass);
      $button.find('span').text(label);
    }
  });




  let sortMenuListenersActive = false;

  function getSortMenuElements() {
    return {
      $menu: $(`#${SORT_MENU_ID}`, parentDoc),
      $button: $(`#${SORT_MENU_BUTTON_ID}`, parentDoc),
    };
  }

  function handleSortMenuOutsideClick(event) {
    if (!sortMenuListenersActive) return;
    const $target = $(event.target);
    if ($target.closest(`#${SORT_MENU_ID}`).length) return;
    if ($target.closest(`#${SORT_MENU_BUTTON_ID}`).length) return;
    closeSortMenu();
  }

  function handleSortMenuKeydown(event) {
    if (event.key !== 'Escape') return;
    const { $button } = getSortMenuElements();
    closeSortMenu();
    if ($button.length) {
      $button.trigger('focus');
    }
  }

  function attachSortMenuListeners() {
    if (sortMenuListenersActive) return;
    $(parentDoc).on('click.rlhSortMenu', handleSortMenuOutsideClick);
    $(parentDoc).on('keydown.rlhSortMenu', handleSortMenuKeydown);
    sortMenuListenersActive = true;
  }

  function detachSortMenuListeners() {
    if (!sortMenuListenersActive) return;
    $(parentDoc).off('click.rlhSortMenu', handleSortMenuOutsideClick);
    $(parentDoc).off('keydown.rlhSortMenu', handleSortMenuKeydown);
    sortMenuListenersActive = false;
  }

  function closeSortMenu() {
    const { $menu, $button } = getSortMenuElements();
    if (!$menu.length) return;
    $menu.attr('data-open', 'false').removeClass('open');
    if ($button.length) {
      $button.attr('aria-expanded', 'false');
    }
    detachSortMenuListeners();
  }

  function openSortMenu() {
    const { $menu, $button } = getSortMenuElements();
    if (!$menu.length) return;
    $menu.attr('data-open', 'true').addClass('open');
    if ($button.length) {
      $button.attr('aria-expanded', 'true');
    }
    attachSortMenuListeners();
  }

  const handleSortMenuToggle = errorCatched(async event => {
    event.preventDefault();
    event.stopPropagation();
    const { $menu } = getSortMenuElements();
    if (!$menu.length) return;
    const isOpen = $menu.attr('data-open') === 'true';
    if (isOpen) closeSortMenu();
  else openSortMenu();
});



  const handleSortOptionSelect = errorCatched(async event => {
    event.preventDefault();
    const sortValue = $(event.currentTarget).data('sort-value');
    if (!sortValue) return;
    closeSortMenu();
    const context = getViewContext();
    setActiveSortMode(context, sortValue);
    renderContent();
  });



  let themeMenuListenersActive = false;

  const getThemeMenuElements = () => ({
    $wrapper: $(`#${THEME_MENU_WRAPPER_ID}`, parentDoc),
    $menu: $(`#${THEME_MENU_ID}`, parentDoc),
    $button: $(`#${THEME_TOGGLE_BTN_ID}`, parentDoc),
  });

  function handleThemeMenuOutsideClick(event) {
    if (!themeMenuListenersActive) return;
    const { $wrapper } = getThemeMenuElements();
    if (!$wrapper.length) return;
    const target = event?.target ?? null;
    if (target && $wrapper[0]?.contains(target)) return;
    closeThemeMenu();
  }

  function handleThemeMenuKeydown(event) {
    if (event.key !== 'Escape') return;
    const { $button } = getThemeMenuElements();
    closeThemeMenu();
    if ($button.length) {
      $button.trigger('focus');
    }
  }

  function attachThemeMenuListeners() {
    if (themeMenuListenersActive) return;
    $(parentDoc).on('click.rlhThemeMenu', handleThemeMenuOutsideClick);
    $(parentDoc).on('keydown.rlhThemeMenu', handleThemeMenuKeydown);
    themeMenuListenersActive = true;
  }

  function detachThemeMenuListeners() {
    if (!themeMenuListenersActive) return;
    $(parentDoc).off('click.rlhThemeMenu', handleThemeMenuOutsideClick);
    $(parentDoc).off('keydown.rlhThemeMenu', handleThemeMenuKeydown);
    themeMenuListenersActive = false;
  }

  function closeThemeMenu() {
    const { $wrapper, $menu, $button } = getThemeMenuElements();
    if ($wrapper.length) {
      $wrapper.removeClass('open');
    }
    if ($menu.length) {
      $menu.attr('data-open', 'false');
    }
    if ($button.length) {
      $button.attr('aria-expanded', 'false');
    }
    detachThemeMenuListeners();
  }

  function openThemeMenu() {
    const { $wrapper, $menu, $button } = getThemeMenuElements();
    if (!$wrapper.length || !$menu.length) return;
    $wrapper.addClass('open');
    $menu.attr('data-open', 'true');
    if ($button.length) {
      $button.attr('aria-expanded', 'true');
    }
    attachThemeMenuListeners();
  }

  const handleThemeMenuToggle = errorCatched(event => {
    event.preventDefault();
    event.stopPropagation();
    const { $wrapper } = getThemeMenuElements();
    if (!$wrapper.length) return;
    const isOpen = $wrapper.hasClass('open');
    if (isOpen) closeThemeMenu();
    else openThemeMenu();
  });

  const handleThemeOptionSelect = errorCatched(async event => {
    event.preventDefault();
    const $option = $(event.currentTarget);
    if (!$option.hasClass(THEME_OPTION_CLASS)) {
      closeThemeMenu();
      return;
    }
    const rawThemeId = $option.data('themeId');
    const themeId = typeof rawThemeId === 'string' || typeof rawThemeId === 'number' ? String(rawThemeId).trim() : '';
    if (!themeId) {
      closeThemeMenu();
      return;
    }
    const currentTheme = getActiveTheme();
    if (!currentTheme || currentTheme.id !== themeId) {
      const theme = setActiveTheme(themeId, { reason: 'user' });
      if (theme) {
        await saveThemePreference(theme.id);
      }
    }
    closeThemeMenu();
  });



  let positionMenuListenersActive = false;

  function getPositionMenuElements() {
    return {
      $menu: $(`#${POSITION_MENU_ID}`, parentDoc),
      $button: $(`#${POSITION_MENU_BUTTON_ID}`, parentDoc),
    };
  }

  function handlePositionMenuOutsideClick(event) {
    if (!positionMenuListenersActive) return;
    const $target = $(event.target);
    if ($target.closest(`#${POSITION_MENU_ID}`).length) return;
    if ($target.closest(`#${POSITION_MENU_BUTTON_ID}`).length) return;
    closePositionMenu();
  }

  function handlePositionMenuKeydown(event) {
    if (event.key !== 'Escape') return;
    const { $button } = getPositionMenuElements();
    closePositionMenu();
    if ($button.length) {
      $button.trigger('focus');
    }
  }

  function attachPositionMenuListeners() {
    if (positionMenuListenersActive) return;
    $(parentDoc).on('click.rlhPositionMenu', handlePositionMenuOutsideClick);
    $(parentDoc).on('keydown.rlhPositionMenu', handlePositionMenuKeydown);
    positionMenuListenersActive = true;
  }

  function detachPositionMenuListeners() {
    if (!positionMenuListenersActive) return;
    $(parentDoc).off('click.rlhPositionMenu', handlePositionMenuOutsideClick);
    $(parentDoc).off('keydown.rlhPositionMenu', handlePositionMenuKeydown);
    positionMenuListenersActive = false;
  }

  function closePositionMenu() {
    const { $menu, $button } = getPositionMenuElements();
    if (!$menu.length) return;
    $menu.attr('data-open', 'false').removeClass('open');
    if ($button.length) {
      $button.attr('aria-expanded', 'false');
    }
    detachPositionMenuListeners();
  }

  function openPositionMenu() {
    const { $menu, $button } = getPositionMenuElements();
    if (!$menu.length) return;
    if ($button.is('[disabled]')) return;
    $menu.attr('data-open', 'true').addClass('open');
    if ($button.length) {
      $button.attr('aria-expanded', 'true');
    }
    attachPositionMenuListeners();
  }

  const handlePositionMenuToggle = errorCatched(async event => {
    event.preventDefault();
    event.stopPropagation();
    syncToolbarState();
    const { $menu } = getPositionMenuElements();
    if (!$menu.length) return;
    const isOpen = $menu.attr('data-open') === 'true';
    if (isOpen) closePositionMenu();
    else openPositionMenu();
  });

  const handlePositionOptionSelect = errorCatched(async event => {
    event.preventDefault();
    const $option = $(event.currentTarget);
    const positionValue = ($option.data('position-value') ?? '').toString().trim();
    const bookName = ($option.data('book-name') ?? $option.closest(`#${POSITION_MENU_ID}`).data('book-name') ?? '')
      .toString()
      .trim();

    closePositionMenu();

    if (!positionValue) return;
    if (lorebookHandlers?.applyUnifiedPosition) {
      await lorebookHandlers.applyUnifiedPosition({ bookName, positionValue });
    }
  });

  const handleUnifiedStatusMenuToggle = errorCatched(async event => {
    event.preventDefault();
    event.stopPropagation();
    syncToolbarState();
    const { $menu, $button } = getUnifiedStatusElements();
    if (!$menu.length || !$button.length) return;
    if ($button.is(':disabled')) return;
    const isOpen = $menu.attr('data-open') === 'true';
    if (isOpen) closeUnifiedStatusMenu();
    else openUnifiedStatusMenu();
  });

  const handleUnifiedStatusOptionSelect = errorCatched(async event => {
    event.preventDefault();
    const $option = $(event.currentTarget);
    const statusId = ($option.data('status-id') ?? '').toString().trim();
    if (!statusId) return;
    closeUnifiedStatusMenu();

    const isEntryMultiSelect = appState.multiSelectMode && appState.multiSelectTarget === 'entry';
    let entriesByBook = getSelectedEntriesByBook();

    if (isEntryMultiSelect && entriesByBook.size === 0) {
      await showModal({ type: 'alert', title: '提示', text: '请至少选择一个已保存的条目。' });
      syncToolbarState();
      return;
    }

    if (!isEntryMultiSelect) {
      const context = getViewContext();
      const fallbackNames = [
        context?.activeBookName,
        appState.activeBookName,
        appState.activeCharacterBook,
        appState.chatLorebook,
      ];
      const resolvedBookName =
        fallbackNames.find(name => typeof name === 'string' && name.trim().length > 0)?.toString().trim() ?? '';
      if (!resolvedBookName) {
        await showModal({ type: 'alert', title: '提示', text: '请先打开一个世界书以便执行统一状态。' });
        syncToolbarState();
        return;
      }
      let entries = [...safeGetLorebookEntries(resolvedBookName)];
      if (!entries.length) {
        await loadLorebookEntriesIfNeeded(resolvedBookName);
        entries = [...safeGetLorebookEntries(resolvedBookName)];
      }
      if (!entries.length) {
        await showModal({ type: 'alert', title: '提示', text: `「${resolvedBookName}」暂无条目可操作。` });
        syncToolbarState();
        return;
      }
      const uids = [];
      entries.forEach(entry => {
        const numericUid = Number(entry?.uid);
        if (Number.isFinite(numericUid)) uids.push(numericUid);
      });
      if (!uids.length) {
        await showModal({ type: 'alert', title: '提示', text: '当前没有已保存的条目可操作。' });
        syncToolbarState();
        return;
      }
      entriesByBook = new Map([[resolvedBookName, uids]]);
    }

    const statusMeta = resolveWorldbookStatus(statusId) ?? DEFAULT_WORLD_BOOK_STATUS;
    const toastLabel = statusMeta.toastLabel ?? statusMeta.label;
    const totalTargets = Array.from(entriesByBook.values()).reduce((sum, list) => sum + list.length, 0);
    const progressToast = showProgressToast(`正在更新 ${totalTargets} 个条目的状态...`);

    let appliedCount = 0;
    let alreadyCount = 0;
    let failedCount = 0;
    let ignoredCount = 0;
    let unsavedCount = 0;
    const failureDetails = [];

    try {
      const viewContext = getViewContext();
      let processedBooks = 0;
      for (const [bookName, entryIds] of entriesByBook.entries()) {
        processedBooks += 1;
        progressToast.update(`正在更新「${bookName}」 (${processedBooks}/${entriesByBook.size})`);
        const result = await updateWorldbookEntriesStatus(bookName, entryIds, statusMeta.id, {
          context: viewContext?.id ?? 'unknown',
        }).catch(error => {
          console.error('[RegexLoreHub] 批量状态更新异常:', error);
          failureDetails.push({ bookName, reason: error?.message ?? '未知错误' });
          failedCount += entryIds.length;
          return null;
        });

        if (!result) {
          continue;
        }

        const summary = result.summary ?? {
          appliedCount: 0,
          alreadyAppliedCount: 0,
          failedCount: 0,
          ignoredCount: 0,
          ignoredUnsavedCount: 0,
        };

        appliedCount += summary.appliedCount ?? 0;
        alreadyCount += summary.alreadyAppliedCount ?? 0;
        failedCount += summary.failedCount ?? 0;
        ignoredCount += summary.ignoredCount ?? 0;
        unsavedCount += summary.ignoredUnsavedCount ?? 0;

        if (Array.isArray(result.failed)) {
          result.failed.forEach(record => {
            failureDetails.push({
              bookName,
              name: record.name ?? `#${record.uid ?? record.tempUid ?? '未知'}`,
              reason: record.reason ?? '未说明',
            });
          });
        }

        if (Array.isArray(result.ignored)) {
          result.ignored
            .filter(record => record.reason && record.reason !== 'UNSAVED_ENTRY')
            .forEach(record => {
              failureDetails.push({
                bookName,
                name: record.name ?? `#${record.uid ?? record.tempUid ?? '未知'}`,
                reason: record.reason,
              });
            });
        }

        if (Array.isArray(result.success)) {
          result.success.forEach(record => {
            const targetUid = record.uid ?? record.tempUid;
            if (targetUid != null) {
              updateEntryStatusDom(bookName, targetUid, statusMeta.id);
            }
          });
        }
      }
    } finally {
      progressToast.remove();
    }

    const ignoredOtherCount = Math.max(ignoredCount - unsavedCount, 0);

    let message = '';
    if (
      appliedCount > 0
      && failedCount === 0
      && unsavedCount === 0
      && ignoredOtherCount === 0
    ) {
      message = `${appliedCount} 个条目的状态已更新为「${toastLabel}」`;
      if (alreadyCount > 0) {
        message += `（其中 ${alreadyCount} 个原本已处于该状态）`;
      }
    } else {
      const parts = [];
      if (appliedCount > 0) {
        parts.push(`${appliedCount} 个条目更新为「${toastLabel}」`);
      }
      if (alreadyCount > 0) {
        parts.push(`${alreadyCount} 个原本已处于该状态`);
      }
      if (failedCount > 0) {
        parts.push(`${failedCount} 个条目更新失败`);
      }
      if (unsavedCount > 0) {
        parts.push(`忽略 ${unsavedCount} 个未保存条目`);
      }
      if (ignoredOtherCount > 0) {
        parts.push(`跳过 ${ignoredOtherCount} 个条目`);
      }
      message = parts.length > 0 ? parts.join('；') : '未执行任何状态更新，请确认已选择有效条目。';
    }

    let toastType = 'success';
    if (failedCount > 0) {
      toastType = appliedCount > 0 ? 'warning' : 'error';
    } else if (unsavedCount > 0 || ignoredOtherCount > 0) {
      toastType = 'info';
    }

    showToast(message, toastType);

    if (failureDetails.length) {
      console.warn('[RegexLoreHub] 状态更新详情（仅日志）:', failureDetails);
    }

    syncToolbarState();
  });



  const handleCharacterBookSwitch = errorCatched(async event => {
    const value = ($(event.currentTarget).val() ?? '').toString().trim();
    if (!value || appState.activeCharacterBook === value) return;
    appState.activeCharacterBook = value;
    renderContent();
  });



  const handleSelectionCheckboxChange = errorCatched(async event => {
    const $checkbox = $(event.currentTarget);
    const selectKey = $checkbox.data('select-key');
    if (!selectKey) return;
    if (!appState.multiSelectMode) {
      $checkbox.prop('checked', false);
      return;
    }
    const isChecked = $checkbox.is(':checked');
    if (isChecked) appState.selectedItems.add(selectKey);
    else appState.selectedItems.delete(selectKey);
    $checkbox.closest('[data-select-key]').toggleClass('selected', isChecked);
    syncToolbarState();
  });



  // 执行替换操作的函数



  const performReplace = async (matches, searchTerm, replaceTerm) => {
    const replaceRegex = buildSearchRegex(searchTerm, false);
    const updatesByBook = new Map();

    const keysAreEqual = (a, b) => {
      if (!Array.isArray(a) || !Array.isArray(b)) return false;
      if (a.length !== b.length) return false;
      for (let index = 0; index < a.length; index += 1) {
        if (a[index] !== b[index]) return false;
      }
      return true;
    };

    for (const match of matches) {
      const { bookName, entry } = match ?? {};
      if (!bookName || !entry) {
        throw new Error('仅支持世界书条目的批量替换。');
      }

      const uid = Number(entry?.uid);
      if (!Number.isFinite(uid)) continue;

      const update = { uid };
      let hasChange = false;

      if (Array.isArray(entry.keys)) {
        const newKeys = entry.keys.map(key => key.replace(replaceRegex, replaceTerm));
        if (!keysAreEqual(entry.keys, newKeys)) {
          update.keys = newKeys;
          hasChange = true;
        }
      }

      if (typeof entry.content === 'string') {
        const newContent = entry.content.replace(replaceRegex, replaceTerm);
        if (newContent !== entry.content) {
          update.content = newContent;
          hasChange = true;
        }
      }

      if (typeof entry.name === 'string') {
        const newName = entry.name.replace(replaceRegex, replaceTerm);
        if (newName !== entry.name) {
          update.name = newName;
          hasChange = true;
        }
      }

      if (typeof entry.comment === 'string') {
        const newComment = entry.comment.replace(replaceRegex, replaceTerm);
        if (newComment !== entry.comment) {
          update.comment = newComment;
          hasChange = true;
        }
      }

      if (!hasChange) continue;

      if (!updatesByBook.has(bookName)) {
        updatesByBook.set(bookName, []);
      }
      updatesByBook.get(bookName).push(update);
    }

    for (const [bookName, updates] of updatesByBook.entries()) {
      if (updates.length === 0) continue;
      await updateWorldbookEntries(bookName, updates);
    }
  };

  // 获取全局世界书匹配项的函数




  const togglePanel = errorCatched(async () => {
  const $panel = $(`#${PANEL_ID}`, parentDoc);
  if ($panel.is(':visible')) {
    hidePanel();
  } else {
    await showPanel();
  }
  });



  const hidePanel = async () => {
    // 异步保存所有更改，并在后台处理结果
    showToast('正在后台保存数据...', 'info');
    saveAllChanges()
      .then(() => {
        showToast('数据保存成功！', 'success');
      })
      .catch(error => {
        console.error('[RegexLoreHub] Background save failed:', error);
        showToast('后台保存失败，请检查控制台日志。', 'error');
      });

    // 立即隐藏面板，无需等待保存完成
    const $panel = $(`#${PANEL_ID}`, parentDoc);
    const $parentBody = $('body', parentDoc);
    $panel.hide();
    $(`#${BUTTON_ID}`, parentDoc).removeClass('active');
    $parentBody.off('mousedown.rlh-outside-click');
  };



  const showPanel = async () => {
  const $panel = $(`#${PANEL_ID}`, parentDoc);
  const $parentBody = $('body', parentDoc);
  $panel.css('display', 'flex');
  $(`#${BUTTON_ID}`, parentDoc).addClass('active');

  $parentBody.on('mousedown.rlh-outside-click', function (event) {
    if (
      $(event.target).closest(`#${PANEL_ID}`).length === 0 &&
      $(event.target).closest(`#${BUTTON_ID}`).length === 0
    ) {
      hidePanel();
    }
  });

  if (!appState.isDataLoaded) {
    await loadAllData();
  } else {
    renderContent();
  }
  };

const handleTabRefresh = errorCatched(async tabId => {
  appState.isLoadingTabData = true;
  renderContent();

  try {
    await refreshCharacterData();

    // 确保新出现的世界书在缓存中有元数据，避免加载条目时缺失
    const ensureBookMeta = name => {
      if (!name) return null;
      if (!Array.isArray(appState.allLorebooks)) {
        appState.allLorebooks = [];
      }
      let book = appState.allLorebooks.find(b => b.name === name);
      if (!book) {
        book = { name, enabled: false, entryCount: 0, enabledEntryCount: 0, entriesLoaded: false };
        appState.allLorebooks.push(book);
      }
      return book;
    };

    if (tabId === 'char-lore') {
      const books = Array.isArray(appState.lorebooks.character) ? appState.lorebooks.character : [];
      for (const bookName of books) {
        ensureBookMeta(bookName);
        await loadLorebookEntriesIfNeeded(bookName, true);
      }
    } else if (tabId === 'chat-lore') {
      const chatBookName = appState.chatLorebook;
      if (chatBookName) {
        ensureBookMeta(chatBookName);
        await loadLorebookEntriesIfNeeded(chatBookName, true);
      }
    }
  } catch (error) {
    console.error(`[RegexLoreHub] Error refreshing tab ${tabId}:`, error);
    // 使用已有的错误处理函数报告错误
    errorCatched(() => { throw error; })();
  } finally {
    appState.isLoadingTabData = false;
    renderContent();
  }
});



  const updateActiveViewForTab = tabId => {
    switch (tabId) {
      case 'char-lore':
        appState.activeView = 'char-lore';
        break;
      case 'chat-lore':
        appState.activeView = 'chat-lore';
        break;
      case 'global-regex':
        appState.activeView = 'global-regex';
        break;
      case 'char-regex':
        appState.activeView = 'char-regex';
        break;
      case 'global-lore':
      default:
        if (appState.activeView !== 'global-lore-detail') {
          appState.activeView = 'global-lore-list';
        }
        break;
    }
  };

  const switchTab = errorCatched(async event => {
  const targetTab = $(event.currentTarget).data('tab');

  // 新增逻辑：如果当前在详情页，点击全局世界书标签则返回列表
  if (targetTab === 'global-lore' && appState.activeView === 'global-lore-detail') {
    await lorebookHandlers.handleExitLorebookDetail();
    return;
  }

  appState.activeTab = targetTab;
  updateActiveViewForTab(targetTab);
  $(`#${PANEL_ID} .rlh-tab`, parentDoc).removeClass('active');
  $(event.currentTarget).addClass('active');
  $(`#${CREATE_LOREBOOK_BTN_ID}`, parentDoc).toggle(appState.activeTab === 'global-lore');
  appState.selectedItems.clear();
  const shouldRefreshCharLore = targetTab === 'char-lore' && !appState.charLoreInitialSynced;
  if (shouldRefreshCharLore) {
    await loadAllData();
    appState.charLoreInitialSynced = true;
  }

  // 新增：如果切换到角色或聊天世界书，则触发刷新
  if (targetTab === 'char-lore' || targetTab === 'chat-lore') {
    await handleTabRefresh(targetTab);
  } else {
    renderContent();
  }
  });



  const toggleMultiSelectMode = errorCatched(async event => {
  appState.multiSelectMode = !appState.multiSelectMode;
  appState.selectedItems.clear();
  $(`#rlh-multi-select-btn`, parentDoc).toggleClass('active', appState.multiSelectMode);
  $(`#rlh-multi-select-controls`, parentDoc).toggleClass('active', appState.multiSelectMode);
  renderContent();
  syncToolbarState();
});



  const handleSelectAll = errorCatched(async () => {
  if (!appState.multiSelectMode) return;
  const keys = getVisibleSelectKeys();
  if (!keys.length) return;
  keys.forEach(key => appState.selectedItems.add(key));
  renderContent();
  syncToolbarState();
});



  const handleSelectNone = errorCatched(async () => {
  if (!appState.multiSelectMode) return;
  const prefix = getTargetKeyPrefix();
  let changed = false;
  if (!prefix) {
    if (appState.selectedItems.size === 0) return;
    appState.selectedItems.clear();
    changed = true;
  } else {
    const keys = [...appState.selectedItems];
    keys.forEach(key => {
      if (key.startsWith(prefix)) {
        appState.selectedItems.delete(key);
        changed = true;
      }
    });
  }
  if (changed) {
    renderContent();
    syncToolbarState();
  }
});



  const handleSelectInvert = errorCatched(async () => {
  if (!appState.multiSelectMode) return;
  const keys = getVisibleSelectKeys();
  if (!keys.length) return;
  keys.forEach(key => {
    if (appState.selectedItems.has(key)) appState.selectedItems.delete(key);
    else appState.selectedItems.add(key);
  });
  renderContent();
  syncToolbarState();
});



  const handleBatchEnable = errorCatched(async () => {
  if (!appState.multiSelectMode) return;
  if (!hasSelectionForCurrentTarget())
    return await showModal({ type: 'alert', title: '提示', text: '请先选择要启用的项目。' });
  await performBatchOperation(true);
  showToast('批量启用成功');
  });



  const handleBatchDisable = errorCatched(async () => {
  if (!appState.multiSelectMode) return;
  if (!hasSelectionForCurrentTarget())
    return await showModal({ type: 'alert', title: '提示', text: '请先选择要禁用的项目。' });
  await performBatchOperation(false);
  showToast('批量禁用成功');
  });



  const handleBatchDelete = errorCatched(async () => {
  if (!appState.multiSelectMode) return;
  const selectedBooks = new Set();
  const selectedEntries = new Map();
  const selectedRegexIds = new Set();
  let totalEntriesToDelete = 0;

  for (const key of appState.selectedItems) {
    const { type, bookName, entryId, regexId } = parseSelectionKey(key);
    if (type === 'book' && bookName) {
      selectedBooks.add(bookName);
    } else if (type === 'lore' && bookName) {
      const numericId = Number(entryId);
      if (!Number.isFinite(numericId)) continue;
      if (!selectedEntries.has(bookName)) {
        selectedEntries.set(bookName, []);
      }
      selectedEntries.get(bookName).push(numericId);
      totalEntriesToDelete++;
    } else if (type === 'regex') {
      const normalizedRegexId = regexId != null && regexId !== '' ? String(regexId) : '';
      if (normalizedRegexId) {
        selectedRegexIds.add(normalizedRegexId);
      }
    }
  }

  if (selectedBooks.size === 0 && totalEntriesToDelete === 0 && selectedRegexIds.size === 0) {
    return await showModal({ type: 'alert', title: '提示', text: '请先选择要删除的项目。' });
  }

  let confirmText = '您确定要永久删除';
  const parts = [];
  if (selectedBooks.size > 0) parts.push(`选中的 ${selectedBooks.size} 本世界书`);
  if (totalEntriesToDelete > 0) parts.push(`${totalEntriesToDelete} 个条目`);
  if (selectedRegexIds.size > 0) parts.push(`${selectedRegexIds.size} 个正则`);
  confirmText += ` ${parts.join('和')} 吗？此操作无法撤销。`;

  try {
    await showModal({ type: 'confirm', title: '确认删除', text: confirmText, danger: true });
  } catch {
    return; // User cancelled
  }

  const progressToast = showProgressToast('开始删除...');
  try {
    let deletedBooksCount = 0;
    let deletedEntriesCount = 0;
    let deletedRegexCount = 0;
    let processedEntries = 0;
    let processedBooks = 0;

    // 先删除条目
    const entriesToDelete = Array.from(selectedEntries.entries());
    for (const [bookName, uids] of entriesToDelete) {
      if (selectedBooks.has(bookName)) {
        processedEntries += uids.length;
        continue;
      }

      progressToast.update(`正在删除条目... (${processedEntries}/${totalEntriesToDelete})`);
      const result = await TavernAPI.deleteWorldbookEntries(bookName, uids);
      processedEntries += uids.length;

      if (result && result.deleted_entries && result.deleted_entries.length > 0) {
        deletedEntriesCount += result.deleted_entries.length;
        safeSetLorebookEntries(bookName, result.worldbook.map(normalizeWorldbookEntry));
        uids.forEach(uid => appState.selectedItems.delete(buildLoreSelectionKey(bookName, uid)));
      }
    }

    // 再删除整个世界书
    const booksToDelete = Array.from(selectedBooks);
    for (const bookName of booksToDelete) {
      progressToast.update(`正在删除世界书... (${processedBooks + 1}/${booksToDelete.length})`);
      if (await TavernAPI.deleteWorldbook(bookName)) {
        deletedBooksCount++;
        appState.allLorebooks = appState.allLorebooks.filter(b => b.name !== bookName);
        safeDeleteLorebookEntries(bookName);
        appState.selectedItems.delete(buildBookSelectionKey(bookName));
        const lorePrefix = buildLoreSelectionPrefix(bookName);
        for (const key of [...appState.selectedItems]) {
          if (key.startsWith(lorePrefix)) {
            appState.selectedItems.delete(key);
          }
        }
      }
      processedBooks++;
    }

    // 新增：删除正则表达式
    if (selectedRegexIds.size > 0) {
      progressToast.update(`正在删除 ${selectedRegexIds.size} 个正则...`);
      const allServerRegexes = await TavernAPI.getRegexes();
      const regexesToKeep = allServerRegexes.filter(r => !selectedRegexIds.has(String(r.id)));

      // 只替换非卡片内正则
      await TavernAPI.replaceRegexes(regexesToKeep.filter(r => r.source !== 'card'));
      await TavernAPI.saveSettings();

      deletedRegexCount = allServerRegexes.length - regexesToKeep.length;

      // 更新本地状态
      appState.regexes.global = appState.regexes.global.filter(r => !selectedRegexIds.has(String(r.id)));
      appState.regexes.character = appState.regexes.character.filter(r => !selectedRegexIds.has(String(r.id)));
      updateRegexOrderMetadata(appState.regexes.global);
      updateRegexOrderMetadata(appState.regexes.character);
      selectedRegexIds.forEach(id => appState.selectedItems.delete(buildRegexSelectionKey(id)));
    }

    progressToast.remove();

    const messageParts = [];
    if (deletedBooksCount > 0) messageParts.push(`成功删除 ${deletedBooksCount} 本世界书`);
    if (deletedEntriesCount > 0) messageParts.push(`成功删除 ${deletedEntriesCount} 个条目`);
    if (deletedRegexCount > 0) messageParts.push(`成功删除 ${deletedRegexCount} 个正则`);

    if (messageParts.length > 0) {
      showToast(messageParts.join('，'));
      // 删除成功后退出多选模式
      if (appState.multiSelectMode) {
        toggleMultiSelectMode();
      } else {
        renderContent();
      }
    } else {
      await showModal({ type: 'alert', title: '删除失败', text: '删除项目时发生错误，请检查控制台。' });
    }
  } catch (error) {
    progressToast.remove();
    console.error('[RegexLoreHub] Batch delete failed:', error);
    await showModal({ type: 'alert', title: '删除失败', text: `操作失败: ${error.message}` });
    await loadAllData(true); // 发生错误时重新加载以同步状态
  }
  });



  const handleCleanOrphanLorebooks = errorCatched(async () => {
    if (!Array.isArray(appState.allLorebooks) || appState.allLorebooks.length === 0) {
      await showModal({ type: 'alert', title: '提示', text: '没有找到可以清理的世界书。' });
      return;
    }

    const orphanBooks = appState.allLorebooks
      .filter(book => {
        const usageList = appState.lorebookUsage instanceof Map ? appState.lorebookUsage.get(book.name) : [];
        const linkedChars = Array.isArray(usageList) ? usageList : [];
        return !book.enabled && linkedChars.length === 0;
      })
      .map(book => book.name);

    if (orphanBooks.length === 0) {
      await showModal({ type: 'alert', title: '提示', text: '没有找到未启用且未绑定角色卡的世界书。' });
      return;
    }

    appState.multiSelectMode = true;
    appState.multiSelectTarget = 'book';
    appState.selectedItems.clear();
    orphanBooks.forEach(name => appState.selectedItems.add(buildBookSelectionKey(name)));
    renderContent();

    const confirmText = '将删除 ' + orphanBooks.length + ' 本未启用且未绑定角色卡的世界书。因API限制，无法直接获取聊天绑定世界书，存在误删该世界书的可能。确定继续吗？';


    try {
      await showModal({ type: 'confirm', title: '确认清理孤立世界书', text: confirmText, danger: true });
    } catch {
      return;
    }

    const progressToast = showProgressToast('开始清理孤立世界书...');
    const failedBooks = [];
    let deletedCount = 0;

    try {
      for (let index = 0; index < orphanBooks.length; index += 1) {
        const bookName = orphanBooks[index];
        progressToast.update('正在删除第 ' + (index + 1) + ' / ' + orphanBooks.length + ' 本世界书...');
        const success = await TavernAPI.deleteWorldbook(bookName);
        if (success) {
          deletedCount += 1;
          appState.allLorebooks = appState.allLorebooks.filter(book => book.name !== bookName);
          safeDeleteLorebookEntries(bookName);
          if (appState.lorebookUsage instanceof Map && appState.lorebookUsage.has(bookName)) {
            appState.lorebookUsage.delete(bookName);
          }
          if (Array.isArray(appState.lorebooks?.character)) {
            appState.lorebooks.character = appState.lorebooks.character.filter(name => name !== bookName);
          }
          if (appState.chatLorebook === bookName) {
            appState.chatLorebook = null;
          }
          if (appState.activeCharacterBook === bookName) {
            appState.activeCharacterBook = null;
          }
          if (appState.activeBookName === bookName) {
            appState.activeBookName = null;
          }
          appState.selectedItems.delete(buildBookSelectionKey(bookName));
          const lorePrefix = buildLoreSelectionPrefix(bookName);
          for (const key of [...appState.selectedItems]) {
            if (key.startsWith(lorePrefix)) {
              appState.selectedItems.delete(key);
            }
          }
        } else {
          failedBooks.push(bookName);
        }
      }
    } catch (error) {
      progressToast.remove();
      console.error('[RegexLoreHub] Clean orphan lorebooks failed:', error);
      await showModal({ type: 'alert', title: '操作失败', text: '清理孤立世界书时发生错误：' + (error?.message || error) });
      await loadAllData(true);
      return;
    }

    progressToast.remove();

    if (deletedCount > 0) {
      showToast('已删除 ' + deletedCount + ' 本孤立世界书');
    }

    if (failedBooks.length > 0) {
      appState.selectedItems.clear();
      failedBooks.forEach(name => appState.selectedItems.add(buildBookSelectionKey(name)));
      await showModal({ type: 'alert', title: '部分删除失败', text: '以下世界书未能删除：' + failedBooks.join('、') });
    } else {
      appState.selectedItems.clear();
      appState.multiSelectMode = false;
    }

    renderContent();
  });



  const performBatchOperation = errorCatched(async enable => {
  const selectedBookNames = new Set();
  const selectedEntriesByBook = new Map();
  const selectedRegexIds = new Set();
  let needsRegexUpdate = false;
  let needsSettingsUpdate = false;

  for (const itemKey of appState.selectedItems) {
    const { type, bookName, entryId, regexId } = parseSelectionKey(itemKey);
    if (type === 'book' && bookName) {
      selectedBookNames.add(bookName);
    } else if (type === 'lore' && bookName) {
      const numericId = Number(entryId);
      if (!Number.isFinite(numericId)) continue;
      if (!selectedEntriesByBook.has(bookName)) selectedEntriesByBook.set(bookName, []);
      selectedEntriesByBook.get(bookName).push(numericId);
    } else if (type === 'regex') {
      const normalizedRegexId = regexId != null && regexId !== '' ? String(regexId) : '';
      if (normalizedRegexId) {
        selectedRegexIds.add(normalizedRegexId);
      }
    }
  }

  if (selectedBookNames.size > 0) {
    let currentBooks = new Set(await TavernAPI.getGlobalWorldbookNames() || []);
    selectedBookNames.forEach(name => (enable ? currentBooks.add(name) : currentBooks.delete(name)));
    await TavernAPI.rebindGlobalWorldbooks(Array.from(currentBooks));
    needsSettingsUpdate = true;
    selectedBookNames.forEach(name => {
      const book = appState.allLorebooks.find(b => b.name === name);
      if (book) book.enabled = enable;
    });
  }

  if (selectedEntriesByBook.size > 0) {
    for (const [bookName, entryIds] of selectedEntriesByBook) {
      const entries = [...safeGetLorebookEntries(bookName)];
      if (entries) {
        const updates = entryIds
          .map(uid => {
            const entry = entries.find(e => e.uid === uid);
            if (entry) {
              entry.enabled = enable;
              return { uid, enabled: enable };
            }
            return null;
          })
          .filter(Boolean);
        if (updates.length > 0) await updateWorldbookEntries(bookName, updates);
      }
    }
  }

  await TavernAPI.saveSettings();

  if (selectedRegexIds.size > 0) {
    const allServerRegexes = await TavernAPI.getRegexes();
    allServerRegexes.forEach(regex => {
      if (selectedRegexIds.has(String(regex.id))) regex.enabled = enable;
    });
    await TavernAPI.replaceRegexes(allServerRegexes.filter(r => r.source !== 'card'));
    needsRegexUpdate = true;
    [appState.regexes.global, appState.regexes.character].forEach(list =>
      list.forEach(r => {
        if (selectedRegexIds.has(String(r.id))) r.enabled = enable;
      }),
    );
  }

  if (needsSettingsUpdate || needsRegexUpdate) await TavernAPI.saveSettings();

  appState.selectedItems.clear();
  renderContent();
  });



  const handleHeaderClick = errorCatched(async (event, data) => {
  const $target = $(event.target);
  const $container = $(event.currentTarget).closest('.rlh-item-container, .rlh-book-group');

  // 1. 检查是否点击在可交互的子控件上
  if ($target.closest('.rlh-item-controls, .rlh-rename-ui').length > 0) {
    return;
  }

  // 2. 如果是多选模式，只处理选择逻辑
  if (appState.multiSelectMode) {
    if (toggleSelectionForContainer($container)) return;
  }

  if (
    !appState.multiSelectMode &&
    appState.activeTab === 'global-lore' &&
    appState.activeView === 'global-lore-list' &&
    $container.is('.rlh-book-group') &&
    $target.closest('.rlh-book-title-wrapper').length > 0
  ) {
    const bookName = $container.data('book-name');
    if (bookName && lorebookHandlers?.handleEnterLorebookDetail) {
      await lorebookHandlers.handleEnterLorebookDetail(bookName);
    }
    return;
  }

  // 3. 非多选模式下的默认展开/折叠逻辑
  if ($container.hasClass('from-card') || $container.hasClass('renaming')) return;

  const $content = $container.find('.rlh-collapsible-content').first();

  // 对于非全局世界书页面的世界书组，执行展开/折叠
  if ($container.is('.rlh-book-group') && appState.activeTab !== 'global-lore') {
    $content.slideToggle(200);
    return;
  }

  // 对于条目，展开/折叠编辑器
  if ($container.is('.rlh-item-container')) {
    if ($content.is(':visible')) {
      $content.stop(true, true).slideUp(200, () => {
        $content.off('input.rlh');
        $content.empty();
        $content.attr('data-entry-mode', 'collapsed');
      });
      $container.attr('data-entry-mode', 'collapsed');
      return;
    }

    // 在非批量操作时，才执行手风琴效果（折叠其他已展开的条目）
    if (!data?.bulk) {
      $container.siblings('.rlh-item-container').find('.rlh-collapsible-content:visible').slideUp(200).empty();
    }

    const type = $container.data('type');
    const id = $container.data('id');
    const storedSearchTerm = $container.data('searchTerm');
    const attrSearchTerm = $container.attr('data-search-term');
    const effectiveSearchTerm = typeof storedSearchTerm === 'string' && storedSearchTerm.length > 0
      ? storedSearchTerm
      : typeof attrSearchTerm === 'string' && attrSearchTerm.length > 0
      ? attrSearchTerm
      : '';

    if (type === 'lore') {
      const bookName = $container.data('book-name');
      const entries = [...safeGetLorebookEntries(bookName)];
      const entry = entries.find(e => e.uid === Number(id));
      if (!entry) return;
      itemHandlers.renderLoreEntryViewer($container, entry, effectiveSearchTerm, { animate: true });
      return;
    }

    if (type === 'regex') {
      const regexItem = [...appState.regexes.global, ...appState.regexes.character].find(r => r.id === id);
      if (!regexItem) return;
      const currentMode = $container.attr('data-entry-mode');
      if (currentMode === 'edit') {
        itemHandlers.renderRegexEditor($container, regexItem, { animate: true });
      } else {
        itemHandlers.renderRegexViewer($container, regexItem, effectiveSearchTerm, { animate: true });
      }
      return;
    }

  }
  });



  const handleMultiSelectContainerClick = errorCatched(async event => {
  if (!appState.multiSelectMode) return;
  const $target = $(event.target);
  if (
    $target.closest('.rlh-item-controls, .rlh-rename-ui, .rlh-action-btn, .rlh-action-btn-icon, .rlh-toggle-btn, .rlh-selection-control, .rlh-multi-select-checkbox, .rlh-item-header, .rlh-global-book-header').length > 0
  ) {
    return;
  }
  const $container = $(event.currentTarget).closest('.rlh-item-container, .rlh-book-group');
  if (!$container.length) return;
  if (toggleSelectionForContainer($container)) {
    event.stopPropagation();
    event.preventDefault();
  }
  });



  const handleEditEntriesToggle = errorCatched(async event => {
  event.stopPropagation();
  const $button = $(event.currentTarget);
  const $bookGroup = $button.closest('.rlh-book-group');
  const isEnteringEditMode = !$bookGroup.hasClass('editing-entries');

  // 切换编辑状态
  $bookGroup.toggleClass('editing-entries');

  if (isEnteringEditMode) {
    // **进入** 编辑模式
    // 1. 如果多选未激活，则自动激活并更新相关UI
    if (!appState.multiSelectMode) {
      appState.multiSelectMode = true;
      $(`#rlh-multi-select-btn`, parentDoc).addClass('active');
      $(`#rlh-multi-select-controls`, parentDoc).addClass('active');
      // 手动为所有可见项目添加多选模式的class，而不是重绘整个面板
      $(`#${PANEL_ID}`, parentDoc).addClass('rlh-multi-select-mode');
    }

    // 2. 强制展开内容
    $bookGroup.find('.rlh-collapsible-content').first().slideDown(200);

    // 3. 更新按钮状态
    $button.attr('title', '完成编辑').find('i').removeClass('fa-pen-to-square').addClass('fa-check-square');
    $button.addClass('active');
  } else {
    // **退出** 编辑模式
    // 1. 仅更新按钮状态
    $button.attr('title', '编辑/选择条目').find('i').removeClass('fa-check-square').addClass('fa-pen-to-square');
    $button.removeClass('active');
  }
  });



  const handleRefresh = errorCatched(async event => {
    const $button = $(event.currentTarget);
    const $icon = $button.find('i');
    $icon.addClass('fa-spin');

    // 在全局刷新前，保护详情视图中的当前世界书条目
    let cachedEntries = null;
    if (appState.activeView === 'global-lore-detail' && appState.activeBookName) {
      cachedEntries = safeGetLorebookEntries(appState.activeBookName);
      console.log(`[RegexLoreHub] 全局刷新时缓存详情视图条目: ${appState.activeBookName}`);
    }

    syncContextWithAppState();
    await loadAllData(true);

    // 恢复详情视图的缓存条目
    if (cachedEntries && appState.activeView === 'global-lore-detail' && appState.activeBookName) {
      safeSetLorebookEntries(appState.activeBookName, cachedEntries);
      updateBookSummary(appState.activeBookName);
      console.log(`[RegexLoreHub] 恢复详情视图条目: ${appState.activeBookName}`);
      // 异步强制刷新以获取最新数据
      loadLorebookEntriesIfNeeded(appState.activeBookName, true).catch(error => {
        console.warn(`[RegexLoreHub] 恢复后刷新条目失败: ${appState.activeBookName}`, error);
      });
      renderContent();
    }

    setTimeout(() => $icon.removeClass('fa-spin'), 500);
  });



  const handlePrimaryCreateButtonClick = errorCatched(async (event) => {
    if (appState.activeView === 'global-lore-list') {
      if (lorebookHandlers?.handleCreateLorebook) {
        await lorebookHandlers.handleCreateLorebook(event);
      }
    } else if (appState.activeView === 'global-lore-detail') {
      if (!appState.activeBookName) return;

      if (itemHandlers?.handleCreateEntry) {

        const mockEvent = { currentTarget: $(`<button data-book-name="${appState.activeBookName}"></button>`) };

        await itemHandlers.handleCreateEntry(mockEvent);

      }

    }
  });



  return {

    handleGlobalSearch,

    handleSearchClear,

    handleSearchInputKeydown,

    handleReplace,

    handleToolbarToggleCollapse,

    handleSortMenuToggle,

    handleSortOptionSelect,

    handleThemeMenuToggle,

    handleThemeOptionSelect,

    handlePositionMenuToggle,

    handlePositionOptionSelect,

    handleUnifiedStatusMenuToggle,

    handleUnifiedStatusOptionSelect,

    handleCharacterBookSwitch,

    handleSelectionCheckboxChange,

    togglePanel,

    switchTab,

    toggleMultiSelectMode,

    handleSelectAll,

    handleSelectNone,

    handleSelectInvert,

    handleBatchEnable,

    handleBatchDisable,

    handleBatchDelete,

    handleCleanOrphanLorebooks,

    handleHeaderClick,

    handleMultiSelectContainerClick,

    handleEditEntriesToggle,

    handleRefresh,

    handlePrimaryCreateButtonClick,

  };
}
