import {
  SEARCH_INPUT_ID,
  CORE_TOOLBAR_ID,
  REPLACE_INPUT_ID,
  TOGGLE_COLLAPSE_BTN_ID,
  TOGGLE_RECURSION_BTN_ID,
  FIX_KEYWORDS_BTN_ID,
  SORT_MENU_ID,
  SORT_MENU_BUTTON_ID,
  POSITION_MENU_ID,
  POSITION_MENU_BUTTON_ID,
  UNIFIED_STATUS_MENU_ID,
  UNIFIED_STATUS_BUTTON_ID,
  FILTER_DEFINITIONS,
  SORT_OPTION_DEFINITIONS,
  DEFAULT_FILTER_LABELS,
  LOREBOOK_OPTIONS,
  appState,
  highlightText,
  escapeHtml,
  get$,
  getParentDoc,
  getParentWin,
  errorCatched,
  safeGetLorebookEntries,
  safeSetLorebookEntries,
  WORLD_BOOK_STATUS_LIST,
  DEFAULT_WORLD_BOOK_STATUS,
  resolveWorldbookStatus,
  UI_TEXTS,
  buildBookSelectionKey,
  buildLoreSelectionKey,
  buildLoreSelectionPrefix,
  buildRegexSelectionKey,
  decodeSelectionPart,
} from '../../core.js';
import { saveAllChanges } from '../../dataLayer.js';

export const getContextInstanceKey = context => context.instanceKey || context.id || 'default';

export const getActiveCollapseState = context => {
  const key = getContextInstanceKey(context);
  return appState.collapseStateByContext.get(key) ?? 'expanded';
};

export const setActiveCollapseState = (context, state) => {
  const key = getContextInstanceKey(context);
  appState.collapseStateByContext.set(key, state);
};

export const getActiveSortMode = context => {
  const options = Array.isArray(context.sortOptions) ? context.sortOptions : [];
  if (!options.length) return null;
  const key = getContextInstanceKey(context);
  const stored = appState.sortModeByContext.get(key);
  if (stored && options.includes(stored)) {
    return stored;
  }
  const defaultValue = options[0];
  appState.sortModeByContext.set(key, defaultValue);
  return defaultValue;
};

export const setActiveSortMode = (context, mode) => {
  const options = context.sortOptions ?? [];
  if (!options.includes(mode)) return;
  const key = getContextInstanceKey(context);
  appState.sortModeByContext.set(key, mode);
};

const escapeAttr = value => escapeHtml(String(value ?? ''));

const resolveStatusMeta = statusId => resolveWorldbookStatus(statusId) ?? DEFAULT_WORLD_BOOK_STATUS;

export const buildStatusBadge = (statusId, { shortLabel = false, withIcon = true } = {}) => {
  const statusMeta = resolveStatusMeta(statusId);
  const label = shortLabel ? statusMeta.shortLabel : statusMeta.label;
  const iconHtml = withIcon ? '<i class="fa-solid fa-circle"></i>' : '';
  return `<span class="rlh-status-badge ${statusMeta.badgeClass ?? ''}" data-status-id="${escapeAttr(statusMeta.id)}">${iconHtml}<span class="rlh-status-badge__text">${escapeHtml(label)}</span></span>`;
};

const buildUnifiedStatusOptionsHtml = () =>
  WORLD_BOOK_STATUS_LIST.map(status => {
    const badgeHtml = buildStatusBadge(status.id, { shortLabel: true });
    return `<li role="presentation"><button type="button" class="rlh-unified-status-option" data-status-id="${escapeAttr(status.id)}" role="option" aria-selected="false">${badgeHtml}<span class="rlh-unified-status-option__label">${escapeHtml(status.label)}</span></button></li>`;
  }).join('');

const buildFilterCheckboxes = (context, filtersState) => {
  const filters = context.visibleFilters ?? [];
  if (!filters.length) return '';

  const items = filters
    .map(key => {
      const definition = FILTER_DEFINITIONS[key];
      if (!definition) return '';
      const label = context.filterLabels?.[key] ?? DEFAULT_FILTER_LABELS[key] ?? key;
      const isChecked = filtersState[key];
      return `<label class="rlh-filter-item"><input type="checkbox" id="${definition.id}" data-filter-key="${key}" ${isChecked ? 'checked' : ''}>${label}</label>`;
    })
    .filter(Boolean)
    .join('');

  if (!items) return '';
  return `<div class="rlh-filter-list" id="rlh-search-filters-container">${items}</div>`;
};

const buildSortMenu = (context, currentSort) => {
  const options = Array.isArray(context.sortOptions) ? context.sortOptions : [];
  if (!options.length) return '';

  const items = options
    .map(key => {
      const option = SORT_OPTION_DEFINITIONS[key];
      if (!option) return '';
      const isActive = option.value === currentSort;
      return `<li role="presentation"><button type="button" class="rlh-sort-option${isActive ? ' active' : ''}" data-sort-value="${option.value}" role="option" aria-selected="${isActive ? 'true' : 'false'}">${option.label}</button></li>`;
    })
    .filter(Boolean)
    .join('');

  if (!items) return '';
  const menuListId = `${SORT_MENU_ID}-list`;

  return `<div class="rlh-sort-menu" id="${SORT_MENU_ID}" data-open="false"><button type="button" id="${SORT_MENU_BUTTON_ID}" class="rlh-toolbar-btn rlh-btn-secondary" data-current-sort="${currentSort ?? ''}" aria-haspopup="listbox" aria-expanded="false" aria-controls="${menuListId}"><i class="fa-solid fa-sort"></i><span>排序</span></button><ul class="rlh-sort-menu-list" id="${menuListId}" role="listbox" aria-labelledby="${SORT_MENU_BUTTON_ID}">${items}</ul></div>`;
};

const buildPositionMenu = context => {
  if (!context.showPositionMenu) return '';

  const selectionMap = new Map();
  appState.selectedItems.forEach(key => {
    if (typeof key !== 'string' || !key.startsWith('lore:')) return;
    const lastSep = key.lastIndexOf(':');
    if (lastSep === -1) return;
    const encodedName = key.slice(5, lastSep);
    const encodedEntryId = key.slice(lastSep + 1);
    const name = decodeSelectionPart(encodedName);
    const entryId = decodeSelectionPart(encodedEntryId);
    if (!name || entryId === '') return;
    if (!selectionMap.has(name)) selectionMap.set(name, []);
    selectionMap.get(name).push(entryId);
  });

  let bookName = context.activeBookName?.toString().trim() ?? '';
  if (!bookName && selectionMap.size === 1) {
    bookName = [...selectionMap.keys()][0] ?? '';
  }

  const entries = bookName ? safeGetLorebookEntries(bookName) : [];
  const hasEntries = entries.length > 0;
  const isEntryMultiSelect = appState.multiSelectMode && appState.multiSelectTarget === 'entry';
  const selectedForBook = bookName ? selectionMap.get(bookName) ?? [] : [];
  const shouldEnable = Boolean(bookName) && (isEntryMultiSelect ? selectedForBook.length > 0 : hasEntries);
  let tooltip;
  if (!bookName) {
    tooltip = selectionMap.size > 0 ? '多选模式：未能识别选中的条目归属，请重新选择' : '请先打开需要统一位置的世界书';
  } else if (!hasEntries && !isEntryMultiSelect) {
    tooltip = `「${bookName}」暂无条目可调整`;
  } else if (isEntryMultiSelect) {
    tooltip = selectedForBook.length > 0
      ? `多选模式：将对已选中的 ${selectedForBook.length} 个条目统一位置`
      : '已开启多选，请先勾选要调整位置的条目';
  } else {
    tooltip = `将对「${bookName}」中的所有条目统一位置`;
  }

  const uniquePositions = new Set(
    entries.map(entry => (entry?.position ?? 'before_character_definition').toString()),
  );
  const activePosition = uniquePositions.size === 1 ? uniquePositions.values().next().value : null;

  const menuListId = `${POSITION_MENU_ID}-list`;
  const buttonAttributes = [
    'type="button"',
    `id="${POSITION_MENU_BUTTON_ID}"`,
    'class="rlh-toolbar-btn rlh-btn-secondary"',
    'aria-haspopup="listbox"',
    'aria-expanded="false"',
    `aria-controls="${menuListId}"`,
    `title="${escapeHtml(tooltip)}"`,
  ];

  if (!shouldEnable) {
    buttonAttributes.push('disabled');
  }

  if (bookName) {
    buttonAttributes.push(`data-book-name="${escapeHtml(bookName)}"`);
  }

  const items = Object.entries(LOREBOOK_OPTIONS.position)
    .map(([value, label]) => {
      const isActive = hasEntries && activePosition === value;
      const attributes = [
        'type="button"',
        `class="rlh-position-option${isActive ? ' active' : ''}"`,
        `data-position-value="${escapeHtml(value)}"`,
        `role="option"`,
        `aria-selected="${isActive ? 'true' : 'false'}"`,
      ];
      if (bookName) {
        attributes.push(`data-book-name="${escapeHtml(bookName)}"`);
      }
      return `<li role="presentation"><button ${attributes.join(' ')}>${escapeHtml(label)}</button></li>`;
    })
    .join('');

  const containerAttributes = [
    'class="rlh-position-menu"',
    `id="${POSITION_MENU_ID}"`,
    'data-open="false"',
  ];

  if (bookName) {
    containerAttributes.push(`data-book-name="${escapeHtml(bookName)}"`);
  }

  return `<div ${containerAttributes.join(' ')}><button ${buttonAttributes.join(' ')}><i class="fa-solid fa-map-pin"></i><span>统一位置</span></button><ul class="rlh-position-menu-list" id="${menuListId}" role="listbox" aria-labelledby="${POSITION_MENU_BUTTON_ID}">${items}</ul></div>`;
};

export const renderToolbar = (context, { $toolbar, $replaceContainer }) => {
  const collapseState = getActiveCollapseState(context);
  const sortMode = (context.sortOptions?.length ?? 0) ? getActiveSortMode(context) : null;

  const multiSelectClasses = ['rlh-toolbar-btn'];
  if (appState.multiSelectMode) multiSelectClasses.push('active');
  if (!context.supportsMultiSelect) multiSelectClasses.push('disabled');

  const multiSelectAttributes = [
    'type="button"',
    'id="rlh-multi-select-btn"',
    `class="${multiSelectClasses.join(' ')}"`,
    `data-target="${context.supportsMultiSelect ? context.multiSelectTarget : ''}"`,
  ];
  if (!context.supportsMultiSelect) multiSelectAttributes.push('disabled');

  const multiSelectButtonHtml = `<button ${multiSelectAttributes.join(' ')}><i class="fa-solid fa-check-double"></i><span>多选模式</span></button>`;

  const multiSelectControlsClass = ['rlh-multi-select-controls'];
  if (appState.multiSelectMode) multiSelectControlsClass.push('active');
  const multiSelectControlsHtml = context.supportsMultiSelect
    ? `
        <div id="rlh-multi-select-controls" class="${multiSelectControlsClass.join(' ')}">
          <div class="rlh-multi-select-actions">
            <button class="rlh-multi-select-action-btn" id="rlh-select-all-btn" title="全选">全</button>
            <button class="rlh-multi-select-action-btn" id="rlh-select-none-btn" title="清除">清</button>
            <button class="rlh-multi-select-action-btn" id="rlh-select-invert-btn" title="反选">反</button>
            <button class="rlh-multi-select-action-btn enable" id="rlh-batch-enable-btn" title="启用">开</button>
            <button class="rlh-multi-select-action-btn disable" id="rlh-batch-disable-btn" title="禁用">关</button>
            <button class="rlh-multi-select-action-btn disable rlh-btn-danger" id="rlh-batch-delete-btn" title="删除">删</button>
          </div>
          <span class="rlh-selection-count" id="rlh-selection-count">已选择: ${appState.selectedItems.size}</span>
        </div>
      `
    : '';
  const multiSelectModuleHtml = `
        <div class="rlh-multi-select-module">
          ${multiSelectButtonHtml}
          ${multiSelectControlsHtml}
        </div>
      `;

  const unifiedStatusModuleHtml =
    context.supportsMultiSelect && context.multiSelectTarget === 'entry'
      ? (() => {
          const menuId = `${UNIFIED_STATUS_MENU_ID}`;
          const listId = `${UNIFIED_STATUS_MENU_ID}-list`;
          const optionsHtml = buildUnifiedStatusOptionsHtml();
          const containerClasses = ['rlh-unified-status'];
          if (appState.multiSelectMode) containerClasses.push('is-multiselect');
          const selectionMap = new Map();
          appState.selectedItems.forEach(key => {
            if (typeof key !== 'string' || !key.startsWith('lore:')) return;
            const lastSep = key.lastIndexOf(':');
            if (lastSep === -1) return;
            const encodedName = key.slice(5, lastSep);
            const encodedEntryId = key.slice(lastSep + 1);
            const name = decodeSelectionPart(encodedName);
            const entryId = decodeSelectionPart(encodedEntryId);
            if (!name || entryId === '') return;
            if (!selectionMap.has(name)) selectionMap.set(name, []);
            selectionMap.get(name).push(entryId);
          });
          const fallbackNames = [
            context.activeBookName,
            appState.activeBookName,
            appState.activeCharacterBook,
            appState.chatLorebook,
          ];
          let resolvedBookName =
            fallbackNames.find(name => typeof name === 'string' && name.trim().length > 0)?.toString().trim() ?? '';
          if (!resolvedBookName && selectionMap.size === 1) {
            resolvedBookName = [...selectionMap.keys()][0] ?? '';
          }
          const entries = resolvedBookName ? safeGetLorebookEntries(resolvedBookName) : [];
          const hasEntries = entries.length > 0;
          const isEntryMultiSelect = appState.multiSelectMode && appState.multiSelectTarget === 'entry';
          const selectedForBook = resolvedBookName ? selectionMap.get(resolvedBookName) ?? [] : [];
          const selectedTotal = Array.from(selectionMap.values()).reduce(
            (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
            0,
          );
          const shouldEnable = Boolean(resolvedBookName) && (isEntryMultiSelect ? selectedForBook.length > 0 : hasEntries);
          let tooltip;
          if (!resolvedBookName) {
            tooltip = selectionMap.size > 0 ? '多选模式：未能识别选中的条目归属，请重新选择' : '请先打开需要统一状态的世界书';
          } else if (!hasEntries && !isEntryMultiSelect) {
            tooltip = `「${resolvedBookName}」暂无条目可调整`;
          } else if (isEntryMultiSelect) {
            tooltip =
              selectedForBook.length > 0
                ? `多选模式：将对已选中的 ${selectedForBook.length} 个条目统一状态`
                : '已开启多选，请先勾选要调整状态的条目';
          } else {
            tooltip = `将对「${resolvedBookName || '当前世界书'}」的所有条目统一状态`;
          }
          return `
            <div class="${containerClasses.join(' ')}" id="${menuId}" data-open="false">
              <button type="button" id="${UNIFIED_STATUS_BUTTON_ID}" class="rlh-toolbar-btn" aria-haspopup="listbox" aria-expanded="false" aria-controls="${listId}" ${shouldEnable ? '' : 'disabled'} title="${escapeHtml(tooltip)}">
                <i class="fa-solid fa-layer-group"></i><span>统一状态</span>
              </button>
              <ul class="rlh-unified-status-menu" id="${listId}" role="listbox">
                ${optionsHtml}
              </ul>
            </div>
          `;
        })()
      : '';

  let collapseButtonHtml = '';
  if (context.showCollapseToggle) {
    const icon = collapseState === 'collapsed' ? 'fa-expand-arrows-alt' : 'fa-compress-arrows-alt';
    const label = collapseState === 'collapsed' ? '全部展开' : '全部折叠';
    collapseButtonHtml = `<button type="button" id="${TOGGLE_COLLAPSE_BTN_ID}" class="rlh-toolbar-btn" data-collapse-state="${collapseState}"><i class="fa-solid ${icon}"></i><span>${label}</span></button>`;
  }

  const recursionButtonHtml = context.showRecursion
    ? (() => {
        const targetBookName = context.activeBookName ?? '';
        const attributes = [
          'type="button"',
          `id="${TOGGLE_RECURSION_BTN_ID}"`,
          'class="rlh-toolbar-btn rlh-btn-secondary rlh-batch-recursion-btn"',
        ];
        if (targetBookName) {
          attributes.push(`data-book-name="${escapeHtml(targetBookName)}"`);
        } else {
          attributes.push('disabled');
        }
        return `<button ${attributes.join(' ')}><i class="fa-solid fa-shield-halved"></i><span>全开防递归</span></button>`;
      })()
    : '';

  const fixKeywordsButtonHtml = context.showFixKeywords
    ? (() => {
        const targetBookName = context.activeBookName ?? '';
        const attributes = [
          'type="button"',
          `id="${FIX_KEYWORDS_BTN_ID}"`,
          'class="rlh-toolbar-btn rlh-btn-secondary rlh-fix-keywords-btn"',
        ];
        if (targetBookName) {
          attributes.push(`data-book-name="${escapeHtml(targetBookName)}"`);
        } else {
          attributes.push('disabled');
        }
        return `<button ${attributes.join(' ')}><i class="fa-solid fa-check-double"></i><span>修复关键词</span></button>`;
      })()
    : '';

  const positionMenuHtml = buildPositionMenu(context);
  const sortMenuHtml = buildSortMenu(context, sortMode);
  const filtersHtml = buildFilterCheckboxes(context, appState.searchFilters);
  const scopeLabel = escapeHtml(context.scopeLabel);
  const searchPlaceholder = escapeHtml(context.searchPlaceholder);
  const searchValue = escapeAttr(appState.globalSearch.term ?? '');

  const searchFieldHtml = `<label class="rlh-search-field">
          <input type="search" id="${SEARCH_INPUT_ID}" class="rlh-search-input" placeholder="${searchPlaceholder}" value="${searchValue}" autocomplete="off" />
        </label>`;
  const clearButtonHtml = `<button type="button" id="rlh-search-clear-btn" class="rlh-toolbar-icon-btn rlh-btn-secondary" title="清空"><i class="fa-solid fa-eraser"></i></button>`;
  const searchRowHtml = `<div class="rlh-search-row">${searchFieldHtml}${clearButtonHtml}</div>`;
  const replaceValue = escapeAttr(appState.globalSearch.replace ?? '');
  const replacePanelHtml = context.showReplace
    ? `<div class="rlh-replace-body"><input type="text" id="${REPLACE_INPUT_ID}" class="rlh-replace-input" placeholder="替换为..." value="${replaceValue}" /><button type="button" id="rlh-replace-btn" class="rlh-toolbar-icon-btn rlh-btn-secondary rlh-replace-action" title="替换"><i class="fa-solid fa-repeat"></i></button></div>`
    : '';
  const searchMetaHtml = `<div class="rlh-search-meta">
          ${filtersHtml}
          <span class="rlh-search-scope">${scopeLabel}</span>
        </div>`;
  const searchBoxHtml = `<div class="rlh-search-box">${searchRowHtml}${replacePanelHtml}${searchMetaHtml}</div>`;

  let createEntryButtonHtml = '';
  if (context.primaryAction?.visible && context.primaryAction.scope === 'entry') {
    const bookNameForCreate = context.activeBookName ?? '';
    const disabled = !bookNameForCreate;
    const buttonClasses = ['rlh-toolbar-btn', 'rlh-btn-primary', 'rlh-create-entry-btn'];
    if (disabled) buttonClasses.push('disabled');
    const attributes = [
      'type="button"',
      `class="${buttonClasses.join(' ')}"`,
    ];
    const actionTitle = context.primaryAction.title ?? context.primaryAction.label ?? '';
    if (actionTitle) attributes.push(`title="${escapeHtml(actionTitle)}"`);
    if (disabled) attributes.push('disabled');
    else attributes.push(`data-book-name="${escapeHtml(bookNameForCreate)}"`);
    const iconClass = context.primaryAction.icon ? context.primaryAction.icon : 'fa-file-circle-plus';
    const label = escapeHtml(context.primaryAction.label ?? '新建条目');
    createEntryButtonHtml = `<button ${attributes.join(' ')}><i class="fa-solid ${iconClass}"></i><span>${label}</span></button>`;
  }

  let createBookButtonHtml = '';
  if (context.primaryAction?.visible && context.primaryAction.scope === 'book') {
    const buttonClasses = ['rlh-toolbar-btn', 'rlh-btn-primary', 'rlh-create-book-btn'];
    const attributes = [
      'type="button"',
      'id="regex-lore-hub-create-lorebook-btn"',
      `class="${buttonClasses.join(' ')}"`,
    ];
    const actionTitle = context.primaryAction.title ?? context.primaryAction.label ?? '';
    if (actionTitle) attributes.push(`title="${escapeHtml(actionTitle)}"`);
    const iconClass = context.primaryAction.icon ? context.primaryAction.icon : 'fa-plus';
    const label = escapeHtml(context.primaryAction.label ?? '新建世界书');
    createBookButtonHtml = `<button ${attributes.join(' ')}><i class="fa-solid ${iconClass}"></i><span>${label}</span></button>`;
  }

  const selectUnboundButtonHtml =
    context.id === 'global-lore-list'
      ? `<button type="button" class="rlh-toolbar-btn rlh-btn-secondary rlh-select-unbound" title="一键选中未绑定任何角色卡的世界书"><i class="fa-solid fa-link-slash"></i><span>选择孤立世界书</span></button>`
      : '';

  const searchSectionHtml = `
    <div class="rlh-toolbar-section rlh-toolbar-section--search">
      <div class="rlh-search-section-grid">
        <div class="rlh-search-section-main">
          ${searchBoxHtml}
        </div>
        <div class="rlh-search-section-multiselect">
          ${multiSelectModuleHtml}
        </div>
      </div>
    </div>
  `;

  const actionsItems = [
    createBookButtonHtml,
    selectUnboundButtonHtml,
    createEntryButtonHtml,
    context.showCollapseToggle ? collapseButtonHtml : '',
    recursionButtonHtml,
    fixKeywordsButtonHtml,
    unifiedStatusModuleHtml,
    positionMenuHtml,
    sortMenuHtml,
  ].filter(Boolean);

  const actionsSectionHtml = actionsItems.length
    ? `
        <div class="rlh-toolbar-section rlh-toolbar-section--actions">
          <div class="rlh-toolbar-actions">
            ${actionsItems.join('')}
          </div>
        </div>
      `
    : '';

  const toolbarSectionsHtml = [searchSectionHtml, actionsSectionHtml].filter(Boolean).join('');

  const toolbarHtml = `
    <div class="rlh-toolbar-inner">
      ${toolbarSectionsHtml}
    </div>

  `;

  $toolbar.html(toolbarHtml);

  if (context.supportsMultiSelect && context.multiSelectTarget === 'entry') {
    const fallbackNames = [
      context.activeBookName,
      appState.activeBookName,
      appState.activeCharacterBook,
      appState.chatLorebook,
    ];
    const resolvedBookName =
      fallbackNames.find(name => typeof name === 'string' && name.trim().length > 0)?.toString().trim() ?? '';
    const entries = resolvedBookName ? safeGetLorebookEntries(resolvedBookName) : [];
    const hasEntries = entries.length > 0;
    const isEntryMultiSelect = appState.multiSelectMode && appState.multiSelectTarget === 'entry';
    const lorePrefix = buildLoreSelectionPrefix(resolvedBookName);
    const hasSelection =
      isEntryMultiSelect &&
      entries.length > 0 &&
      [...appState.selectedItems].some(key => typeof key === 'string' && key.startsWith(lorePrefix));
    const shouldEnable = hasEntries && (!isEntryMultiSelect || hasSelection);
    const tooltip = !hasEntries
      ? (resolvedBookName ? `「${resolvedBookName}」暂无条目可调整` : '请先打开需要统一状态的世界书')
      : isEntryMultiSelect
        ? (hasSelection ? '多选模式：仅对选中的条目统一状态' : '已开启多选，请先勾选要调整状态的条目')
        : `将对「${resolvedBookName || '当前世界书'}」的所有条目统一状态`;
    const $unifiedButton = $(`#${UNIFIED_STATUS_BUTTON_ID}`, $toolbar);
    if ($unifiedButton.length) {
      $unifiedButton.attr('title', tooltip);
      if (shouldEnable) $unifiedButton.removeAttr('disabled');
      else $unifiedButton.attr('disabled', 'disabled');
    }
  }

  $replaceContainer.empty();
};

export const matchEntry = (entry, searchTerm) => {
  const term = searchTerm.toLowerCase();
  if (!term) return true;
  if (appState.searchFilters.entryName && (entry.name || '').toLowerCase().includes(term)) {
    return true;
  }
  if (appState.searchFilters.keywords && entry.keys.join(' ').toLowerCase().includes(term)) {
    return true;
  }
  if (appState.searchFilters.content && entry.content && entry.content.toLowerCase().includes(term)) {
    return true;
  }
  return false;
};

export const matchRegex = (item, searchTerm) => {
  const term = searchTerm.toLowerCase();
  if (appState.searchFilters.entryName && (item.script_name || '').toLowerCase().includes(term)) {
    return true;
  }
  if (appState.searchFilters.content && (item.find_regex || '').toLowerCase().includes(term)) {
    return true;
  }
  if (appState.searchFilters.content && (item.replace_string || '').toLowerCase().includes(term)) {
    return true;
  }
  return false;
};

export const createGlobalLorebookElement = (book, searchTerm, forceShowAllEntries, filteredEntries) => {
  const $ = get$();
  const usedByChars = appState.lorebookUsage.get(book.name) || [];
  const usedByHtml =
    usedByChars.length > 0
      ? `<div class="rlh-used-by-chars">使用者: ${usedByChars.map(char => `<span>${escapeHtml(char)}</span>`).join(', ')}</div>`
      : '';

  const highlightedBookName = highlightText(book.name, searchTerm);
  const selectionAllowed = appState.multiSelectMode && appState.multiSelectTarget === 'book';
  const selectionKey = buildBookSelectionKey(book.name);
  const hasSelectionKey = typeof selectionKey === 'string' && selectionKey.length > 0;
  const isSelected = selectionAllowed && hasSelectionKey && appState.selectedItems.has(selectionKey);
  const selectionControl = selectionAllowed
    ? `<label class="rlh-selection-control"><input type="checkbox" class="rlh-multi-select-checkbox" data-select-key="${escapeHtml(selectionKey)}" ${isSelected ? 'checked' : ''}></label>`
    : '';

  const $element = $(`
      <div class="rlh-book-group" data-book-name="${escapeHtml(book.name)}" data-select-key="${escapeHtml(selectionKey)}">
          <div class="rlh-global-book-header rlh-clickable-header">
              ${selectionControl}
              <div class="rlh-book-title-wrapper">
                  <span class="rlh-item-name">${highlightedBookName}</span>
                  <div class="rlh-book-stats">条目: ${book.enabledEntryCount} / ${book.entryCount}</div>
              </div>
              <div class="rlh-item-controls">
                  <button class="rlh-action-btn-icon rlh-btn-secondary rlh-rename-book-btn" title="重命名世界书"><i class="fa-solid fa-pen-to-square"></i></button>
                  <button class="rlh-toggle-btn rlh-btn-secondary rlh-global-toggle" title="启用/禁用整个世界书"><i class="fa-solid fa-power-off"></i></button>
                  <button class="rlh-action-btn-icon rlh-btn-danger rlh-delete-book-btn" title="删除世界书"><i class="fa-solid fa-folder-minus"></i></button>
              </div>
          </div>
          ${usedByChars.length > 0 ? `<div class="rlh-book-summary">${usedByHtml}</div>` : ''}
          <div class="rlh-collapsible-content"></div>
      </div>
    `);

  $element.toggleClass('enabled', book.enabled);
  $element.find('.rlh-global-book-header').toggleClass('enabled', book.enabled);
  $element.toggleClass('selected', isSelected);

  const $content = $element.find('.rlh-collapsible-content');
  const $entryActions = $(
    `<div class="rlh-entry-actions"><button class="rlh-action-btn rlh-btn-primary rlh-create-entry-btn" data-book-name="${escapeHtml(book.name)}"><i class="fa-solid fa-plus"></i> 新建条目</button><button class="rlh-action-btn rlh-btn-secondary rlh-batch-recursion-btn" data-book-name="${escapeHtml(book.name)}"><i class="fa-solid fa-shield-halved"></i> 全开防递归</button><button class="rlh-action-btn rlh-btn-secondary rlh-fix-keywords-btn" data-book-name="${escapeHtml(book.name)}"><i class="fa-solid fa-check-double"></i> 修复关键词</button></div>`,
  );
  $content.append($entryActions);

  let allEntries = [...safeGetLorebookEntries(book.name)].sort(
    (a, b) => ((a.display_index ?? Number.MAX_SAFE_INTEGER) - (b.display_index ?? Number.MAX_SAFE_INTEGER)),
  );
  let entriesToShow = forceShowAllEntries ? allEntries : filteredEntries || [];

  if (entriesToShow && entriesToShow.length > 0) {
    const $listWrapper = $('<div class="rlh-entry-list-wrapper"></div>');
    entriesToShow.forEach(entry => $listWrapper.append(createItemElement(entry, 'lore', book.name, searchTerm, { enableDrag: false })));
    $content.append($listWrapper);
  } else if (searchTerm) {
    $content.append(`<div class="rlh-info-text-small">无匹配项</div>`);
  }

  return $element;
};

const convertMultilineToHtml = html => (typeof html === 'string' ? html.replace(/\r?\n/g, '<br>') : html);
const buildViewerPlaceholder = text => `<span class="rlh-viewer-empty">${escapeHtml(text)}</span>`;

export const buildLoreEntryViewerHTML = (entry, searchTerm) => {
  const statusMeta = resolveStatusMeta(entry?.statusId);
  const statusBadgeHtml = buildStatusBadge(statusMeta.id);
  const keywords = Array.isArray(entry?.keys) ? entry.keys : [];
  const keywordsText = keywords.join(', ');
  const keywordsHtml = keywordsText
    ? convertMultilineToHtml(searchTerm ? highlightText(keywordsText, searchTerm) : escapeHtml(keywordsText))
    : buildViewerPlaceholder('暂无关键词');
  const rawContent = entry?.content ?? '';
  const contentHtml = rawContent
    ? convertMultilineToHtml(searchTerm ? highlightText(rawContent, searchTerm) : escapeHtml(rawContent))
    : buildViewerPlaceholder('暂无内容');

  const hasValue = value => value !== undefined && value !== null && value !== '';
  const formatViewerText = (value, placeholder = '未设置') => {
    if (!hasValue(value)) {
      return buildViewerPlaceholder(placeholder);
    }
    return escapeHtml(String(value));
  };

  const buildViewerField = field => {
    if (!field) return '';
    const { label, value, placeholder, html } = field;
    const body = html !== undefined ? html : formatViewerText(value, placeholder);
    return `
      <div class="rlh-editor-field rlh-viewer-field">
        <label>${label}</label>
        <div class="rlh-viewer-text">${body}</div>
      </div>
    `;
  };

  const buildViewerGroup = (title, fields, options = {}) => {
    if (!fields.length) return '';
    const layout = options.layout ?? 'grid';
    const headingHtml = title ? `<h5>${title}</h5>` : '';
    let contentHtml = '';
    if (layout === 'grid') {
      const itemsHtml = fields
        .map(field => `
          <div class="rlh-grid-item">${buildViewerField(field)}</div>`)
        .join('');
      contentHtml = `
        <div class="rlh-editor-grid">${itemsHtml}
        </div>
      `;
    } else {
      contentHtml = fields.map(buildViewerField).join('');
    }
    return `
      <div class="rlh-editor-group rlh-viewer-group">
        ${headingHtml}
        ${contentHtml}
      </div>
    `;
  };

    const positionLabel = (() => {
      const pos = entry?.position;
      if (!hasValue(pos)) return null;

      // 新版：position 是一个带 type 属性的对象
      if (typeof pos === 'object' && pos !== null && typeof pos.type === 'string' && pos.type) {
        return LOREBOOK_OPTIONS.position?.[pos.type] ?? pos.type;
      }

      // 旧版：position 是一个字符串
      if (typeof pos === 'string') {
        return LOREBOOK_OPTIONS.position?.[pos] ?? pos;
      }

      // 对于所有其他意外情况（如无 type 的对象），安全地返回 null
      return null;
    })();
  const depthValue = hasValue(entry?.depth) ? entry.depth : null;
  const orderValue = hasValue(entry?.order) ? entry.order : null;

  const hasLogic = hasValue(entry?.logic);
  const logicKey = hasLogic ? entry.logic : 'and_any';
  const logicBaseLabel = LOREBOOK_OPTIONS.logic?.[logicKey] ?? logicKey;
  const logicValue = hasLogic ? logicBaseLabel : `${logicBaseLabel} (默认)`;

  const probabilityValue = hasValue(entry?.probability)
    ? `${entry.probability}%`
    : '100% (默认)';

  const keywordsField = buildViewerField({ label: '关键词', html: keywordsHtml });
  const contentField = buildViewerField({
    label: '内容',
    html: `<article class="rlh:prose rlh:dark:rlh:prose-invert max-w-none">${contentHtml}</article>`,
  });

  const insertRuleGroup = buildViewerGroup(UI_TEXTS.INSERT_RULES_TITLE, [
    { label: '位置', value: positionLabel, placeholder: '未设置' },
    { label: '深度', value: depthValue, placeholder: '未设置' },
    { label: '顺序', value: orderValue, placeholder: '未设置' },
  ], { layout: 'grid' });
  const activationGroup = buildViewerGroup('激活逻辑', [
    { label: '概率', value: probabilityValue, placeholder: '100% (默认)' },
    { label: '关键词逻辑', value: logicValue, placeholder: '任一 AND (默认)' },
  ], { layout: 'grid' });
  const matchingGroup = buildViewerGroup('匹配与递归', [
    { label: '大小写敏感', value: entry?.case_sensitive ? '开启' : '关闭', placeholder: '关闭' },
    { label: '全词匹配', value: entry?.match_whole_words ? '开启' : '关闭', placeholder: '关闭' },
    { label: '防止递归', value: entry?.prevent_recursion ? '开启' : '关闭', placeholder: '关闭' },
    { label: '不可被递归', value: entry?.exclude_recursion ? '开启' : '关闭', placeholder: '关闭' },
  ], { layout: 'grid' });
  const statusGroup = buildViewerGroup('状态', [
    { label: '当前状态', html: statusBadgeHtml },
  ], { layout: 'grid' });

  return `
    <div class="rlh-entry-viewer" data-mode="view">
      ${statusGroup}
      ${keywordsField}
      ${contentField}
      ${insertRuleGroup}
      ${activationGroup}
      ${matchingGroup}
    </div>
  `;
};

export const buildRegexViewerHTML = (item, searchTerm) => {
  const findRaw = item?.find_regex ?? '';
  const replaceRaw = item?.replace_string ?? '';
  const normalizedTerm = typeof searchTerm === 'string' ? searchTerm : '';
  const findHtml = findRaw
    ? convertMultilineToHtml(normalizedTerm ? highlightText(findRaw, normalizedTerm) : escapeHtml(findRaw))
    : buildViewerPlaceholder('暂无查找正则');
  const replaceHtml = replaceRaw
    ? convertMultilineToHtml(normalizedTerm ? highlightText(replaceRaw, normalizedTerm) : escapeHtml(replaceRaw))
    : buildViewerPlaceholder('暂无替换内容');

  const destination = item?.destination ?? {};
  const source = item?.source ?? {};
  const minDepth = item?.min_depth;
  const maxDepth = item?.max_depth;

  const destinationLabels = [];
  if (destination.display) destinationLabels.push('仅格式显示');
  if (destination.prompt) destinationLabels.push('仅格式提示词');
  const destinationText = destinationLabels.length
    ? destinationLabels.join(' / ')
    : '格式与提示词';

  const sourceMapping = {
    user_input: '用户输入',
    ai_output: 'AI输出',
    slash_command: '斜杠命令',
    world_info: '世界书',
  };
  const activeSources = Object.entries(sourceMapping)
    .filter(([key]) => Boolean(source?.[key]))
    .map(([, label]) => label);
  const sourceText = activeSources.length === 0
    ? '未选择作用范围'
    : activeSources.length === 4
    ? '全部来源'
    : activeSources.join(' / ');

  const hasMin = minDepth !== undefined && minDepth !== null && minDepth !== '';
  const hasMax = maxDepth !== undefined && maxDepth !== null && maxDepth !== '';
  let depthText = '无深度限制';
  if (hasMin && hasMax) depthText = `${minDepth} - ${maxDepth}`;
  else if (hasMin) depthText = `>= ${minDepth}`;
  else if (hasMax) depthText = `<= ${maxDepth}`;

  const metaRows = [
    { label: '输出设置', value: destinationText },
    { label: '作用范围', value: sourceText },
    { label: '深度范围', value: depthText },
  ];

  const metaHtml = metaRows
    .map(row => `
      <div class="rlh-editor-field rlh-viewer-field">
        <label>${row.label}</label>
        <div class="rlh-viewer-text">${escapeHtml(String(row.value ?? ''))}</div>
      </div>
    `)
    .join('');

  return `
    <div class="rlh-regex-viewer" data-mode="view">
      <div class="rlh-editor-field rlh-viewer-field">
        <label>查找正则表达式</label>
        <article class="rlh:prose rlh:dark:rlh:prose-invert max-w-none">${findHtml}</article>
      </div>
      <div class="rlh-editor-field rlh-viewer-field">
        <label>替换为</label>
        <article class="rlh:prose rlh:dark:rlh:prose-invert max-w-none">${replaceHtml}</article>
      </div>
      ${metaHtml}
    </div>
  `;
};

export const createItemElement = (item, type, bookName = '', searchTerm = '', options = {}) => {
  const $ = get$();
  const isLore = type === 'lore';
  const id = isLore ? item.uid : item.id;
  const name = isLore ? item.name || '无标题条目' : item.script_name || '未命名正则';
  const fromCard = item.source === 'card';
  const collapseState = options.collapseState ?? 'expanded';
  const isExpanded = options.isExpanded ?? false;
  const enableDrag = options.enableDrag ?? true;
  const dragRequested = enableDrag && !fromCard;
  const dragDisabled = dragRequested && appState.isDragSortDisabled;
  const dragHandleTitle = dragDisabled ? '拖拽功能不可用：排序脚本未加载' : '拖拽排序';
  const dragHandleDisabledAttrs = dragDisabled ? ' data-disabled="true" aria-disabled="true" style="cursor: not-allowed; opacity: 0.6;"' : '';
  const dragHandleHtml =
    dragRequested
      ? `<span class="rlh-drag-handle${dragDisabled ? ' rlh-drag-handle--disabled' : ''}" title="${escapeHtml(dragHandleTitle)}"${
          dragHandleDisabledAttrs
        }><i class="fa-solid fa-grip-vertical"></i></span>`
      : '';
  const selectionKey =
    options.selectionKey ?? (isLore ? buildLoreSelectionKey(bookName, id) : buildRegexSelectionKey(id));
  const target = appState.multiSelectTarget;
  const selectionAllowed =
    appState.multiSelectMode &&
    ((target === 'entry' && isLore) || (target === 'regex' && !isLore));
  const isSelected = selectionAllowed && appState.selectedItems.has(selectionKey);

  let controlsHtml = '';

  if (isLore) {
    controlsHtml = `
      <button class="rlh-action-btn-icon rlh-btn-secondary rlh-rename-btn" title="重命名并编辑"><i class="fa-solid fa-pencil"></i></button>
      <button class="rlh-toggle-btn rlh-btn-secondary rlh-item-toggle" title="启用/禁用此条目"><i class="fa-solid fa-power-off"></i></button>
      <button class="rlh-action-btn-icon rlh-btn-danger rlh-delete-entry-btn" title="删除条目"><i class="fa-solid fa-trash-can"></i></button>
    `;
  } else if (fromCard) {
    controlsHtml = '<button class="rlh-toggle-btn rlh-btn-secondary rlh-item-toggle" title="启用/禁用此条目"><i class="fa-solid fa-power-off"></i></button>';
  } else {
    controlsHtml = `
      <button class="rlh-action-btn-icon rlh-btn-secondary rlh-rename-btn" title="重命名并编辑"><i class="fa-solid fa-pencil"></i></button>
      <button class="rlh-toggle-btn rlh-btn-secondary rlh-item-toggle" title="启用/禁用此条目"><i class="fa-solid fa-power-off"></i></button>
    `;
  }

  const selectionControl = selectionAllowed
    ? `<label class="rlh-selection-control"><input type="checkbox" class="rlh-multi-select-checkbox" data-select-key="${escapeHtml(selectionKey)}" ${isSelected ? 'checked' : ''}></label>`
    : '';

  const headerTitle = fromCard
    ? '此条目来自角色卡，部分操作受限'
    : selectionAllowed
    ? '点击选择/取消选择'
    : '点击展开/编辑';

  const highlightedName = highlightText(name, searchTerm);
  const statusMeta = isLore ? resolveStatusMeta(item.statusId) : null;
  const statusBadgeHtml = isLore ? buildStatusBadge(statusMeta.id, { shortLabel: true }) : '';

  // 为 fromCard 条目添加来源徽章
  const sourceBadgeHtml = fromCard
    ? `<span class="rlh-source-badge" title="此条目来自角色卡，操作能力受限"><i class="fa-solid fa-id-card"></i><span>来自卡</span></span>`
    : '';

  let metaHtml = '';
  if (isLore) {
    const positionKey = (item.position ?? 'before_character_definition').toString();
    const positionLabelRaw = LOREBOOK_OPTIONS.position?.[positionKey] ?? '默认位置';
    const positionLabel = escapeHtml(positionLabelRaw);
    const orderNumber = Number(item.order);
    const fallbackOrder = Number(item.display_index);
    const effectiveOrder = Number.isFinite(orderNumber)
      ? `#${orderNumber}`
      : Number.isFinite(fallbackOrder)
      ? `#${fallbackOrder}`
      : '未设置';
    const orderLabel = escapeHtml(effectiveOrder);
    metaHtml = `
          <div class="rlh-item-meta" title="插入与顺序信息">
            <span class="rlh-item-meta-chip"><i class="fa-solid fa-map-pin"></i>插入 ${positionLabel}</span>
            <span class="rlh-item-meta-chip"><i class="fa-solid fa-list-ol"></i>顺序 ${orderLabel}</span>
          </div>
        `;
  } else {
    // 正则项的附加信息
    const destination = item?.destination ?? {};
    const source = item?.source ?? {};
    const minDepth = item?.min_depth;
    const maxDepth = item?.max_depth;

    // 处理输出设置标签
    const destinationLabels = [];
    if (destination.display) destinationLabels.push('格式显示');
    if (destination.prompt) destinationLabels.push('格式提示词');
    const destinationText = destinationLabels.length > 0 ? destinationLabels.join('/') : '默认输出';

    // 处理作用范围标签
    const sourceMapping = {
      user_input: '用户输入',
      ai_output: 'AI输出',
      slash_command: '斜杠命令',
      world_info: '世界书',
    };
    const activeSources = Object.entries(sourceMapping)
      .filter(([key]) => Boolean(source?.[key]))
      .map(([, label]) => label);
    let sourceText;
    if (activeSources.length === 0) {
      sourceText = '未设范围';
    } else if (activeSources.length === 4) {
      sourceText = '全部来源';
    } else {
      sourceText = activeSources.length <= 2 ? activeSources.join('/') : `${activeSources[0]}等${activeSources.length}项`;
    }

    // 处理深度范围
    const hasMin = minDepth !== undefined && minDepth !== null && minDepth !== '';
    const hasMax = maxDepth !== undefined && maxDepth !== null && maxDepth !== '';
    let depthText = '无限制';
    if (hasMin && hasMax) {
      depthText = `${minDepth} - ${maxDepth}`;
    } else if (hasMin) {
      depthText = `≥ ${minDepth}`;
    } else if (hasMax) {
      depthText = `≤ ${maxDepth}`;
    }

    metaHtml = `
      <div class="rlh-item-meta" title="作用范围与执行参数">
        <span class="rlh-item-meta-chip"><i class="fa-solid fa-bullseye"></i>范围: ${escapeHtml(sourceText)}</span>
        <span class="rlh-item-meta-chip"><i class="fa-solid fa-layer-group"></i>深度: ${escapeHtml(depthText)}</span>
        <span class="rlh-item-meta-chip"><i class="fa-solid fa-arrow-right"></i>输出: ${escapeHtml(destinationText)}</span>
      </div>
    `;
  }

  const dragStateAttr = dragRequested
    ? ` data-drag-enabled="${dragDisabled ? 'false' : 'true'}"${dragDisabled ? ' data-drag-disabled="true"' : ''}`
    : '';
  const $element = $(
    `<div class="rlh-item-container ${fromCard ? 'from-card' : ''}" data-type="${type}" data-id="${id}" ${isLore ? `data-book-name="${escapeHtml(bookName)}"` : ''} data-select-key="${escapeHtml(selectionKey)}"${isLore ? ` data-status-id="${escapeAttr(statusMeta.id)}"` : ''}${dragStateAttr}>
      <div class="rlh-item-header" title="${headerTitle}">
        ${selectionControl}
        ${dragHandleHtml}
        <div class="rlh-item-header-main">
          <div class="rlh-item-title-row">
            <span class="rlh-item-name">${highlightedName}</span>
            ${statusBadgeHtml}
            ${sourceBadgeHtml}
          </div>
          ${metaHtml}
        </div>
        <div class="rlh-item-controls">${controlsHtml}</div>
      </div>
      <div class="rlh-collapsible-content"></div>
    </div>`
  );

  $element.data('searchTerm', searchTerm);
  $element.attr('data-search-term', typeof searchTerm === 'string' ? searchTerm : '');
  $element.toggleClass('enabled', item.enabled);
  $element.toggleClass('selected', isSelected);

  const $content = $element.find('.rlh-collapsible-content');
  let initialMode = options.initialMode;
  if (!initialMode && searchTerm) {
    initialMode = 'viewer';
  }

  if (isExpanded) {
    $element.removeClass('rlh-collapsed');
    $content.show();
    $element.attr('data-entry-mode', 'edit');
  } else if (initialMode === 'viewer') {
    const viewerHtml = isLore
      ? buildLoreEntryViewerHTML(item, searchTerm)
      : buildRegexViewerHTML(item, searchTerm);
    $content.html(viewerHtml);
    $content.show();
    $element.removeClass('rlh-collapsed');
    $element.attr('data-entry-mode', 'view');
  } else if (collapseState === 'collapsed') {
    $element.addClass('rlh-collapsed');
    $content.hide();
    $element.attr('data-entry-mode', initialMode ?? 'collapsed');
  } else {
    $element.removeClass('rlh-collapsed');
    $element.attr('data-entry-mode', initialMode ?? 'collapsed');
  }

  return $element;
};

export const prependEntry = (entry, bookName) => {
  const $ = get$();
  const parentDoc = getParentDoc();
  const $listWrapper = $('.rlh-entry-list-wrapper', parentDoc);

  if ($listWrapper.length > 0) {
    $listWrapper.find('.rlh-info-text').remove();

    const $newEntryDom = createItemElement(entry, 'lore', bookName, '', { isExpanded: true, enableDrag: false });
    $listWrapper.prepend($newEntryDom);
    return $newEntryDom;
  }
  return null;
};

export const updateSelectionCount = () => {
  const $ = get$();
  const parentDoc = getParentDoc();
  $(`#rlh-selection-count`, parentDoc).text(`已选择: ${appState.selectedItems.size}`);
};

export const updateEntryStatusDom = (bookName, entryId, statusId) => {
  const $ = get$();
  const parentDoc = getParentDoc();
  const hasEntryId = entryId !== undefined && entryId !== null;
  const numericIdCandidate = hasEntryId ? Number(entryId) : NaN;
  const isNumericTarget = Number.isInteger(numericIdCandidate);

  const matchEntryId = candidate => {
    if (candidate === undefined || candidate === null) return false;
    if (isNumericTarget) {
      const numericCandidate = Number(candidate);
      if (Number.isInteger(numericCandidate)) return numericCandidate === numericIdCandidate;
    }
    return String(candidate) === String(entryId);
  };

  const $container = $('.rlh-item-container[data-type="lore"]', parentDoc)
    .filter((_, el) => {
      const $el = $(el);
      const candidateBook = $el.data('book-name') ?? $el.attr('data-book-name');
      if (String(candidateBook) !== String(bookName)) return false;
      const candidateId = $el.data('id');
      if (matchEntryId(candidateId)) return true;
      return matchEntryId($el.attr('data-id'));
    })
    .first();

  if (!$container.length) return;

  const statusMeta = resolveStatusMeta(statusId);
  const badgeHtml = buildStatusBadge(statusMeta.id, { shortLabel: true });
  $container.attr('data-status-id', statusMeta.id);

  const $titleRow = $container.find('.rlh-item-title-row').first();
  if ($titleRow.length) {
    const $existingBadge = $titleRow.find('.rlh-status-badge').first();
    if ($existingBadge.length) {
      $existingBadge.replaceWith(badgeHtml);
    } else {
      $titleRow.append(badgeHtml);
    }
  }

  const $content = $container.find('.rlh-collapsible-content');
  if ($content.length && $container.attr('data-entry-mode') === 'view') {
    const entries = safeGetLorebookEntries(bookName);
    const targetEntry = entries.find(entry => Number(entry?.uid) === numericId);
    if (targetEntry) {
      const viewerHtml = buildLoreEntryViewerHTML(targetEntry, $container.data('searchTerm') ?? '');
      $content.html(viewerHtml);
    }
  }
};

export const buildReplaceConfirmationHTML = (matches, stats, booksMatchedByNameOnly, searchTerm, replaceTerm, context) => {
  let summaryHtml = '';
  let listHtml = '';
  let booksOnlyHtml = '';

  const buildStatsList = statsData => {
    return Object.entries(statsData)
      .filter(([, count]) => count > 0)
      .map(([label, count]) => `<li>- ${escapeHtml(label)}：<strong>${count}</strong> 个</li>`)
      .join('');
  };

  if (context?.type === 'lorebook') {
    const scopeText = context?.bookNames?.length === 1
      ? `当前世界书「${escapeHtml(context.bookNames[0])}」`
      : '匹配到的世界书';
    const totalBooks = new Set(matches.map(m => m.bookName)).size + (booksMatchedByNameOnly?.length ?? 0);
    const totalEntries = matches.length;

    summaryHtml = `
      <div class="rlh-replace-stats">
        <p>- 共匹配到 ${totalBooks} 本世界书，其中 ${totalEntries} 个条目将被修改。</p>
        <p>- 替换范围：${scopeText}</p>
        <p>- 命中详情：</p>
        <ul>
          <li>- 书名：<strong>${stats.bookName}</strong> 个</li>
          <li>- 条目名：<strong>${stats.entryName}</strong> 个</li>
          <li>- 关键词：<strong>${stats.keywords}</strong> 个</li>
          <li>- 内容：<strong>${stats.content}</strong> 个</li>
        </ul>
      </div>
    `;

    const listItemsHtml = matches.map(({ bookName, entry, matchedFields }) => {
      const hitFields = [];
      if (matchedFields) {
        if (matchedFields.entryName) hitFields.push('条目名');
        if (matchedFields.keywords > 0) hitFields.push('关键词');
        if (matchedFields.content) hitFields.push('内容');
      }
      const fieldsText = hitFields.join('、');
      const entryName = escapeHtml(entry.name || '无标题条目');
      const hitDetails = fieldsText ? `（${fieldsText}）` : '';
      return `<li class="rlh-confirm-entry-item">${escapeHtml(bookName)}: ${entryName}${hitDetails}</li>`;
    }).join('');

    listHtml = `<ul class="rlh-confirm-entry-list">${listItemsHtml}</ul>`;

    if (booksMatchedByNameOnly && booksMatchedByNameOnly.length > 0) {
      const bookItems = booksMatchedByNameOnly
        .map(name => `<li class="rlh-confirm-entry-item">${escapeHtml(name)}</li>`)
        .join('');
      booksOnlyHtml = `
        <hr>
        <h4>仅书名匹配 (不会被替换):</h4>
        <div class="rlh-confirm-scroll-list rlh-confirm-scroll-list--secondary">
          <ul class="rlh-confirm-entry-list">${bookItems}</ul>
        </div>
      `;
    }

  } else if (context === 'regex') {
    const statsData = { '名称匹配': stats.name, '内容匹配': stats.content };
    const statsItems = buildStatsList(statsData);
    if (statsItems) {
      summaryHtml = `<div class="rlh-replace-stats"><h4>替换统计摘要：</h4><ul>${statsItems}</ul></div>`;
    }
    listHtml = `<ul class="rlh-confirm-entry-list">${matches
      .map(item => `<li class="rlh-confirm-entry-item">${escapeHtml(item.script_name || '未命名正则')}</li>`)
      .join('')}</ul>`;
  }

  return `
    <div class="rlh-replace-confirm-modal">
      <p>确定要将 <strong>"${escapeHtml(searchTerm)}"</strong> 替换为 <strong>"${escapeHtml(replaceTerm)}"</strong> 吗？</p>
      <p>此操作不可撤销。</p>
      <hr>
      ${summaryHtml}
      <hr>
      <h4>将要修改的条目列表：</h4>
      <div class="rlh-confirm-scroll-list">
        ${listHtml}
      </div>
      ${booksOnlyHtml}
    </div>
  `;
};

export const renderSaveStatus = () => {
  const $ = get$();
  const parentDoc = getParentDoc();
  const $statusContainer = $('#regex-lore-hub-save-status', parentDoc);
  if (!$statusContainer.length) return;

  const status = appState.saveStatus;
  let html = '';
  let statusClass = '';

  switch (status) {
    case 'saving':
      html = '<i class="fa-solid fa-spinner fa-spin"></i> 正在保存...';
      statusClass = 'saving';
      break;
    case 'retrying':
      html = `<i class="fa-solid fa-triangle-exclamation fa-fade"></i> 自动保存失败，正在重试... (${appState.saveRetryAttempt}/3)`;
      statusClass = 'retrying';
      break;
    case 'success':
      html = '<i class="fa-solid fa-check-circle"></i> 数据已保存';
      statusClass = 'success';
      break;
    case 'failed':
      html = '<i class="fa-solid fa-circle-xmark"></i> 自动保存失败，请检查连接或手动保存。';
      statusClass = 'failed';
      break;
    case 'idle':
    default:
      html = '';
      statusClass = 'idle';
      break;
  }

  $statusContainer.html(html);
  $statusContainer.attr('class', `rlh-save-status ${statusClass}`);
};

const reorderLoreEntriesInState = (bookName, orderedIds) => {
  const entries = safeGetLorebookEntries(bookName);
  if (!Array.isArray(entries) || !entries.length) return null;
  if (!Array.isArray(orderedIds) || orderedIds.length !== entries.length) return null;

  const entryMap = new Map(entries.map(entry => [String(entry.uid ?? ''), entry]));
  const reordered = [];

  orderedIds.forEach(id => {
    const key = String(id ?? '');
    if (!entryMap.has(key)) return;
    reordered.push(entryMap.get(key));
    entryMap.delete(key);
  });

  if (!reordered.length) return null;

  entryMap.forEach(entry => reordered.push(entry));

  reordered.forEach((entry, index) => {
    entry.display_index = index;
    if (entry.order === undefined || entry.order === null || Number.isNaN(Number(entry.order))) {
      entry.order = index;
    }
  });

  safeSetLorebookEntries(bookName, reordered);
  return reordered;
};

export const initializeLoreEntrySortable = ($listWrapper, bookName, options = {}) => {
  const parentWin = getParentWin();
  const dragRequested = options.enabled ?? false;
  const hasWrapper = !!$listWrapper?.length;

  const markDragDisabled = () => {
    if (!hasWrapper) return;
    $listWrapper.attr('data-drag-disabled', 'true');
    if (!$listWrapper.find('.rlh-drag-disabled-tip').length) {
      $listWrapper.prepend('<p class="rlh-info-text-small rlh-drag-disabled-tip">拖拽排序功能暂时不可用。</p>');
    }
  };

  if (!dragRequested || !hasWrapper) {
    if (hasWrapper) {
      $listWrapper.removeAttr('data-drag-disabled');
      $listWrapper.find('.rlh-drag-disabled-tip').remove();
    }
    return;
  }

  if (appState.isDragSortDisabled) {
    markDragDisabled();
    return;
  }

  if (!parentWin?.Sortable) return;

  const listEl = $listWrapper[0];
  if (!listEl) return;
  const itemCount = $listWrapper.find('.rlh-item-container').length;
  if (itemCount < 2) return;

  $listWrapper.removeAttr('data-drag-disabled');
  $listWrapper.find('.rlh-drag-disabled-tip').remove();

  parentWin.Sortable.create(listEl, {
    animation: 150,
    handle: '.rlh-drag-handle',
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    onEnd: errorCatched(async evt => {
      const { oldIndex, newIndex } = evt;
      if (oldIndex === newIndex) return;
      const orderedIds = Array.from(listEl.querySelectorAll('.rlh-item-container'))
        .map(node => node.getAttribute('data-id'))
        .filter(Boolean);
      if (!reorderLoreEntriesInState(bookName, orderedIds)) return;
      await saveAllChanges();
    }, 'RegexLoreHub.Sortable'),
  });
};
