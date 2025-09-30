import {
  PANEL_ID,
  CORE_TOOLBAR_ID,
  REPLACE_TOOL_CONTAINER_ID,
  DEFAULT_FILTER_LABELS,
  REGEX_FILTER_LABELS,
  appState,
  get$,
  getParentDoc,
} from '../../core.js';
import { renderGlobalLoreTabView, renderCharacterLorebookView, renderChatLorebookView, cancelGlobalLoreListRender } from './lorebook.js';
import { renderRegexView } from './regex.js';
import { renderToolbar, renderSaveStatus, updateSelectionCount } from './shared.js';
export * from './shared.js';

const normalizeSearchTerm = value => value?.toString().trim().toLowerCase() ?? '';

export const getViewContext = () => {
  const tab = appState.activeTab;
  const view = appState.activeView;

  const base = {
    tab,
    view,
    id: `${tab}`,
    instanceKey: `${tab}`,
    activeBookName: appState.activeBookName,
    type: 'lore',
    scopeLabel: '搜索范围：当前视图',
    replaceScopeLabel: '在当前视图中替换',
    searchPlaceholder: '搜索...',
    visibleFilters: ['entryName', 'keywords', 'content'],
    filterLabels: DEFAULT_FILTER_LABELS,
    defaultFilters: { entryName: true, keywords: true, content: true },
    showReplace: true,
    showRecursion: false,
    showFixKeywords: false,
    showCollapseToggle: false,
    showPositionMenu: false,
    sortOptions: [],
    multiSelectTarget: 'entry',
    supportsMultiSelect: true,
    primaryAction: { visible: false },
  };

  if (tab === 'global-lore') {
    if (view === 'global-lore-detail') {
      const bookName = appState.activeBookName ?? '';
      return {
        ...base,
        id: 'global-lore-detail',
        instanceKey: bookName ? `global-lore-detail:${bookName}` : 'global-lore-detail',
        activeBookName: bookName,
        scopeLabel: '搜索范围：当前世界书',
        replaceScopeLabel: '在当前世界书中替换',
        searchPlaceholder: '搜索...',
        visibleFilters: ['bookName', 'entryName', 'keywords', 'content'],
        defaultFilters: { bookName: false, entryName: true, keywords: true, content: true },
        showRecursion: true,
        showFixKeywords: true,
        showCollapseToggle: true,
        showPositionMenu: true,
        sortOptions: ['status', 'name'],
        multiSelectTarget: 'entry',
        primaryAction: {
          visible: true,
          icon: 'fa-file-circle-plus',
          label: '新建条目',
          title: '新建条目',
          scope: 'entry',
        },
      };
    }

    return {
      ...base,
      id: 'global-lore-list',
      instanceKey: 'global-lore-list',
      activeBookName: null,
      scopeLabel: '搜索范围：全部世界书',
      replaceScopeLabel: '在匹配到的世界书或条目中替换',
      visibleFilters: ['bookName', 'entryName', 'keywords', 'content'],
      defaultFilters: { bookName: true, entryName: true, keywords: true, content: true },
      showReplace: true,
      showRecursion: false,
      showFixKeywords: false,
      showCollapseToggle: false,
      showPositionMenu: false,
      showCleanOrphanBooks: true,
      sortOptions: ['status', 'name'],
      multiSelectTarget: 'book',
      primaryAction: {
        visible: true,
        icon: 'fa-plus',
        label: '新建世界书',
        title: '新建世界书',
        scope: 'book',
      },
    };
  }

  if (tab === 'char-lore') {
    return {
      ...base,
      id: 'char-lore',
      instanceKey: 'char-lore',
      activeBookName: appState.activeCharacterBook,
      scopeLabel: '搜索范围：当前世界书',
      replaceScopeLabel: '在当前世界书中替换',
      visibleFilters: ['entryName', 'keywords', 'content'],
      defaultFilters: { bookName: false, entryName: true, keywords: true, content: true },
      showRecursion: true,
      showFixKeywords: true,
      showCollapseToggle: true,
      showPositionMenu: true,
      sortOptions: ['status', 'name'],
      multiSelectTarget: 'entry',
      primaryAction: {
        visible: true,
        icon: 'fa-file-circle-plus',
        label: '新建条目',
        title: '新建条目',
        scope: 'entry',
      },
    };
  }

  if (tab === 'chat-lore') {
    return {
      ...base,
      id: 'chat-lore',
      instanceKey: 'chat-lore',
      activeBookName: appState.chatLorebook,
      scopeLabel: '搜索范围：当前世界书',
      replaceScopeLabel: '在当前世界书中替换',
      visibleFilters: ['entryName', 'keywords', 'content'],
      defaultFilters: { bookName: false, entryName: true, keywords: true, content: true },
      showRecursion: true,
      showFixKeywords: true,
      showCollapseToggle: true,
      showPositionMenu: true,
      sortOptions: ['status', 'name'],
      multiSelectTarget: 'entry',
      primaryAction: {
        visible: true,
        icon: 'fa-file-circle-plus',
        label: '新建条目',
        title: '新建条目',
        scope: 'entry',
      },
    };
  }

  if (tab === 'global-regex') {
    return {
      ...base,
      id: 'global-regex',
      instanceKey: 'global-regex',
      type: 'regex',
      scopeLabel: '搜索范围：全局正则表达式',
      replaceScopeLabel: '在全局正则中替换',
      visibleFilters: ['entryName', 'content'],
      filterLabels: { ...DEFAULT_FILTER_LABELS, ...REGEX_FILTER_LABELS },
      defaultFilters: { bookName: false, entryName: true, keywords: false, content: true },
      showRecursion: false,
      showFixKeywords: false,
      showCollapseToggle: true,
      showPositionMenu: false,
      sortOptions: [],
      multiSelectTarget: 'regex',
      supportsMultiSelect: true,
      primaryAction: { visible: false },
    };
  }

  if (tab === 'char-regex') {
    return {
      ...base,
      id: 'char-regex',
      instanceKey: 'char-regex',
      type: 'regex',
      scopeLabel: '搜索范围：角色正则表达式',
      replaceScopeLabel: '在角色正则中替换',
      visibleFilters: ['entryName', 'content'],
      filterLabels: { ...DEFAULT_FILTER_LABELS, ...REGEX_FILTER_LABELS },
      defaultFilters: { bookName: false, entryName: true, keywords: false, content: true },
      showRecursion: false,
      showFixKeywords: false,
      showCollapseToggle: true,
      showPositionMenu: false,
      sortOptions: [],
      multiSelectTarget: 'regex',
      supportsMultiSelect: false,
      primaryAction: { visible: false },
    };
  }

  return {
    ...base,
    id: 'unknown',
    instanceKey: 'unknown',
    supportsMultiSelect: false,
  };
};

const ensureSearchFiltersDefaults = context => {
  const contextKey = context.id;
  if (!contextKey) return;
  if (!appState.searchFilterContextsInitialized.has(contextKey)) {
    (context.visibleFilters ?? []).forEach(key => {
      appState.searchFilters[key] = true;
    });
    appState.searchFilterContextsInitialized.add(contextKey);
  }

  if ((context.id === 'char-lore' || context.id === 'chat-lore') && appState.searchFilters.keywords === undefined) {
    appState.searchFilters.keywords = true;
  }
};

export const renderContent = () => {
  const $ = get$();
  const parentDoc = getParentDoc();
  const $panel = $(`#${PANEL_ID}`, parentDoc);

  const ensureLayoutNodes = () => {
    if (!$panel.length) {
      const emptySet = $([]);
      return {
        $toolbarRow: emptySet,
        $toolbar: emptySet,
        $replaceContainer: emptySet,
        $content: emptySet,
      };
    }

    let $toolbarRow = $panel.find('.rlh-toolbar-shell').first();
    if (!$toolbarRow.length) {
      const $tabNav = $panel.find('.rlh-tab-nav').first();
      $toolbarRow = $('<div class="rlh-toolbar-shell"></div>');
      if ($tabNav.length) {
        $toolbarRow.insertAfter($tabNav);
      } else {
        $panel.prepend($toolbarRow);
      }
    }

    let $toolbar = $toolbarRow.find(`#${CORE_TOOLBAR_ID}`);
    if (!$toolbar.length) {
      $toolbar = $(`<div id="${CORE_TOOLBAR_ID}" class="rlh-toolbar-container"></div>`);
      $toolbarRow.append($toolbar);
    }

    let $replaceContainer = $toolbarRow.find(`#${REPLACE_TOOL_CONTAINER_ID}`);
    if (!$replaceContainer.length) {
      $replaceContainer = $(`<div id="${REPLACE_TOOL_CONTAINER_ID}" class="rlh-replace-container"></div>`);
      $toolbarRow.append($replaceContainer);
    }

    let $contentPane = $panel.find('.rlh-content-pane').first();
    if (!$contentPane.length) {
      $contentPane = $('<div class="rlh-content-pane"></div>');
      $contentPane.insertAfter($toolbarRow);
    }

    let $content = $contentPane.find(`#${PANEL_ID}-content`);
    if (!$content.length) {
      $content = $(`<div id="${PANEL_ID}-content"></div>`);
      $contentPane.append($content);
    }

    return { $toolbarRow, $toolbar, $replaceContainer, $content };
  };

  const searchTerm = normalizeSearchTerm(appState.globalSearch.term ?? '');

  const filterSelectors = [
    ['bookName', '#rlh-filter-book-name'],
    ['entryName', '#rlh-filter-entry-name'],
    ['keywords', '#rlh-filter-keywords'],
    ['content', '#rlh-filter-content'],
  ];
  filterSelectors.forEach(([key, selector]) => {
    const $checkbox = $panel.find(selector);
    if ($checkbox.length) {
      appState.searchFilters[key] = $checkbox.is(':checked');
    }
  });

  const { $toolbar, $replaceContainer, $content } = ensureLayoutNodes();
  $toolbar.empty();
  $replaceContainer.empty();
  $content.empty();

  const viewContext = getViewContext();
  ensureSearchFiltersDefaults(viewContext);

  if (viewContext.tab !== 'global-lore') {
    cancelGlobalLoreListRender();
  }

  if (!viewContext.supportsMultiSelect && appState.multiSelectMode) {
    appState.multiSelectMode = false;
    appState.selectedItems.clear();
  }

  if (appState.multiSelectMode) {
    if (appState.multiSelectTarget !== viewContext.multiSelectTarget) {
      appState.multiSelectTarget = viewContext.multiSelectTarget;
      appState.selectedItems.clear();
    }
  } else {
    appState.multiSelectTarget = viewContext.multiSelectTarget;
  }

  $panel.toggleClass('rlh-multi-select-mode', appState.multiSelectMode);

  renderToolbar(viewContext, { $toolbar, $replaceContainer });
  renderSaveStatus();
  updateSelectionCount();

  if (appState.isLoadingTabData) {
    $content.html('<p class="rlh-info-text">加载中...</p>');
    return;
  }

  switch (viewContext.tab) {
    case 'global-lore':
      renderGlobalLoreTabView(viewContext, searchTerm, $content);
      break;
    case 'char-lore':
      renderCharacterLorebookView(viewContext, searchTerm, $content);
      break;
    case 'chat-lore':
      renderChatLorebookView(viewContext, searchTerm, $content);
      break;
    case 'global-regex':
      renderRegexView(viewContext, appState.regexes.global, searchTerm, $content, '全局正则');
      break;
    case 'char-regex':
      renderRegexView(viewContext, appState.regexes.character, searchTerm, $content, '角色正则');
      break;
    default:
      $content.html('<p class="rlh-info-text">当前视图未实现。</p>');
      break;
  }
};
