import { get$ } from './appBootstrap.js';

export { get$, getTavernHelper } from './appBootstrap.js';

export const PANEL_ID = 'regex-lore-hub-panel';
export const BUTTON_ID = 'regex-lore-hub-button';
export const BUTTON_ICON_URL = 'https://i.postimg.cc/bY23wb9Y/IMG-20250626-000247.png';
export const BUTTON_TOOLTIP = '世界书&正则管理器';
export const BUTTON_TEXT_IN_MENU = '世界书&正则管理器';
export const CLOSE_BTN_ID = 'rlh-close-btn';
export const SEARCH_INPUT_ID = 'rlh-search-input';
export const REFRESH_BTN_ID = 'rlh-refresh-btn';
export const CORE_TOOLBAR_ID = 'rlh-core-toolbar';
export const REPLACE_TOOL_CONTAINER_ID = 'rlh-replace-tool-container';
export const REPLACE_TOGGLE_BTN_ID = 'rlh-replace-toggle-btn';
export const REPLACE_INPUT_ID = 'rlh-replace-input';
export const TOGGLE_COLLAPSE_BTN_ID = 'rlh-toggle-collapse-btn';
export const TOGGLE_RECURSION_BTN_ID = 'rlh-toggle-recursion-btn';
export const FIX_KEYWORDS_BTN_ID = 'rlh-fix-keywords-btn';
export const SORT_MENU_ID = 'rlh-sort-menu';
export const SORT_MENU_BUTTON_ID = 'rlh-sort-menu-btn';
export const POSITION_MENU_ID = 'rlh-position-menu';
export const POSITION_MENU_BUTTON_ID = 'rlh-position-menu-btn';
export const UNIFIED_STATUS_MENU_ID = 'rlh-unified-status-menu';
export const UNIFIED_STATUS_BUTTON_ID = 'rlh-unified-status-btn';
export const CREATE_LOREBOOK_BTN_ID = 'rlh-create-primary-btn';
export const CHARACTER_BOOK_SWITCH_ID = 'rlh-character-book-switch';
export const PREFETCH_INDICATOR_ID = 'rlh-prefetch-indicator';
export const PREFETCH_PROGRESS_TEXT_ID = 'rlh-prefetch-progress-text';
export const PREFETCH_PROGRESS_BAR_ID = 'rlh-prefetch-progress-bar';
export const DOM_ID = {
  TOOLBAR_SHELL: 'regex-lore-hub-toolbar-shell',
  TOGGLE_TOOLBAR_BTN: 'regex-lore-hub-toggle-toolbar-btn',
};

const normalizeUrlBase = value => {
  if (!value || typeof value !== 'string') return '';
  return value.replace(/\\/g, '/').replace(/\/+$/, '');
};

const computeDefaultModuleRoot = () => {
  try {
    const baseUrl = new URL('./', import.meta.url).href;
    return normalizeUrlBase(baseUrl);
  } catch (error) {
    console.warn('[RegexLoreHub] 无法解析脚本根路径：', error);
    return '';
  }
};

const detectRootFromParent = () => {
  try {
    const parentWin = window.parent || window;
    const parentDoc = parentWin?.document;
    if (!parentDoc) return '';

    const scripts = parentDoc.querySelectorAll('script[src]');
    for (const scriptEl of scripts) {
      const src = scriptEl.getAttribute('src');
      if (!src || !/regex[-_]lore[-_]hub/i.test(src)) continue;

      try {
        const absoluteUrl = new URL(src, parentWin.location?.href || window.location.href);
        const normalized = normalizeUrlBase(absoluteUrl.href);
        if (!normalized) continue;
        const trimmed = normalized.replace(/\/[^/]*$/, '');
        if (trimmed) return trimmed;
      } catch (innerError) {
        console.warn('[RegexLoreHub] 宿主脚本根路径解析失败：', innerError);
      }
    }
  } catch (error) {
    console.warn('[RegexLoreHub] 无法从宿主 DOM 推断根路径：', error);
  }
  return '';
};

const RLH_ROOT_URL = normalizeUrlBase(detectRootFromParent()) || computeDefaultModuleRoot();

const WORLD_BOOK_STATUS_DEFINITIONS = [
  {
    id: 'constant',
    label: '永久激活',
    shortLabel: '永久',
    description: '忽略关键词限制，只要条目启用且满足概率就始终尝试激活。',
    strategyType: 'constant',
    toastLabel: '永久激活',
    accentVar: '--rlh-status-constant',
    badgeClass: 'rlh-status-badge--constant',
    order: 0,
  },
  {
    id: 'selective',
    label: '关键词触发',
    shortLabel: '关键词',
    description: '匹配主要/次要关键词后激活，可结合概率与扫描深度控制触发。',
    strategyType: 'selective',
    toastLabel: '关键词触发',
    accentVar: '--rlh-status-selective',
    badgeClass: 'rlh-status-badge--selective',
    order: 1,
  },
  {
    id: 'vectorized',
    label: '向量化',
    shortLabel: '向量',
    description: '依赖向量相似度激活，适用于语义召回场景。',
    strategyType: 'vectorized',
    toastLabel: '向量化',
    accentVar: '--rlh-status-vectorized',
    badgeClass: 'rlh-status-badge--vectorized',
    order: 2,
  },
];

const normalizedStatusDefinitions = WORLD_BOOK_STATUS_DEFINITIONS.map(def =>
  Object.freeze({
    ...def,
    id: String(def.id).toLowerCase(),
    strategyType: String(def.strategyType ?? def.id).toLowerCase(),
    toastLabel: def.toastLabel ?? def.label,
    shortLabel: def.shortLabel ?? def.label,
  }),
);

const statusMap = {};
normalizedStatusDefinitions.forEach(def => {
  statusMap[def.id] = def;
  statusMap[def.strategyType] = def;
});

export const WORLD_BOOK_STATUS_MAP = Object.freeze(statusMap);
export const WORLD_BOOK_STATUS_LIST = Object.freeze([...normalizedStatusDefinitions].sort((a, b) => a.order - b.order));
export const DEFAULT_WORLD_BOOK_STATUS = WORLD_BOOK_STATUS_MAP.constant;
export const DEFAULT_STATUS_ID = DEFAULT_WORLD_BOOK_STATUS?.id ?? 'constant';

export const normalizeWorldbookStatusId = value => {
  if (!value && value !== 0) return null;
  const key = String(value).trim().toLowerCase();
  return WORLD_BOOK_STATUS_MAP[key]?.id ?? null;
};

export const resolveWorldbookStatus = statusId => {
  const normalized = normalizeWorldbookStatusId(statusId);
  return normalized ? WORLD_BOOK_STATUS_MAP[normalized] ?? null : null;
};

export const resolveWorldbookStatusByStrategy = strategyType =>
  resolveWorldbookStatus(strategyType);

export const LOREBOOK_OPTIONS = {
  position: {
    before_character_definition: '角色定义前',
    after_character_definition: '角色定义后',
    before_example_messages: '聊天示例前',
    after_example_messages: '聊天示例后',
    before_author_note: '作者笔记前',
    after_author_note: '作者笔记后',
    at_depth_as_system: '@D ⚙ 系统',
    at_depth_as_assistant: '@D 🗨️ 角色',
    at_depth_as_user: '@D 👤 用户',
  },
  logic: {
    and_any: '任一 AND',
    and_all: '所有 AND',
    not_any: '任一 NOT',
    not_all: '所有 NOT',
  },
};

export const DEFAULT_FILTER_LABELS = {
  bookName: '书名',
  entryName: '条目名',
  keywords: '关键词',
  content: '内容',
};

export const REGEX_FILTER_LABELS = {
  entryName: '名称',
  content: '内容',
};

export const FILTER_DEFINITIONS = {
  bookName: { id: 'rlh-filter-book-name' },
  entryName: { id: 'rlh-filter-entry-name' },
  keywords: { id: 'rlh-filter-keywords' },
  content: { id: 'rlh-filter-content' },
};

export const SORT_OPTION_DEFINITIONS = {
  status: { value: 'status', label: '按启用状态' },
  name: { value: 'name', label: '名称排序' },
};

export const appState = {
  regexes: { global: [], character: [] },
  lorebooks: { character: [] },
  chatLorebook: null,
  allLorebooks: [],
  lorebookEntries: new Map(),
  pendingLorebookUpdates: new Map(), // 待保存的世界书字段更新
  pendingRegexUpdates: new Set(), // 待保存的正则更新
  lorebookUsage: new Map(),
  activeTab: 'global-lore',
  activeView: 'global-lore-list',
  activeBookName: null,
  activeCharacterBook: null,
  charLoreInitialSynced: false,
  pendingHighlightEntry: null,
  isDataLoaded: false,
  isLoadingTabData: false,
  loadingBookName: null,
  searchFilters: { bookName: true, entryName: true, keywords: true, content: true },
  multiSelectMode: false,
  multiSelectTarget: 'book',
  selectedItems: new Set(),
  globalSearch: { term: '', replace: '' },
  searchFilterContextsInitialized: new Set(),
  collapseStateByContext: new Map(),
  sortModeByContext: new Map(),
  characterContext: { name: null, id: null }, // 新增：用于缓存角色上下文
  saveStatus: 'idle',
  saveRetryAttempt: 0,
  isToolbarCollapsed: true,
  isDragSortDisabled: false,
  paths: {
    rlhRoot: RLH_ROOT_URL,
    vendor: RLH_ROOT_URL ? `${RLH_ROOT_URL}/vendor` : '',
  },
};

const normalizeLorebookName = value => {
  if (!value && value !== 0) return '';
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && typeof value.name === 'string') return value.name.trim();
  return String(value ?? '').trim();
};

const pushUniqueString = (targetSet, rawValue) => {
  if (!targetSet || !rawValue && rawValue !== 0) return;
  const str = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue).trim();
  if (!str) return;
  targetSet.add(str);
};

/**
 * 基于世界书名称生成多选键；当名称无效时返回空字符串，调用方需据此跳过写入。
 * @param {unknown} name 待规范化的世界书名称或对象。
 * @returns {string} 形如 `book:xxx` 的键，若名称为空则返回空字符串。
 */
export const buildBookSelectionKey = name => {
  const normalized = normalizeLorebookName(name);
  return normalized ? `book:${normalized}` : '';
};

export const resolveLorebookBindingStats = bookOrName => {
  const charNames = new Set();
  const charIds = new Set();
  const book = typeof bookOrName === 'string' ? { name: bookOrName } : bookOrName ?? {};
  const name = normalizeLorebookName(book);

  const appendCharName = value => pushUniqueString(charNames, value);
  const appendCharId = value => pushUniqueString(charIds, value);

  if (book && typeof book === 'object') {
    if (Array.isArray(book.characters)) {
      book.characters.forEach(appendCharName);
    } else if (book.characters && typeof book.characters === 'object') {
      Object.values(book.characters).forEach(appendCharName);
    }

    if (Array.isArray(book.charIds)) {
      book.charIds.forEach(appendCharId);
    } else if (Array.isArray(book.characterIds)) {
      book.characterIds.forEach(appendCharId);
    } else if (book.charIds && typeof book.charIds === 'object') {
      Object.values(book.charIds).forEach(appendCharId);
    }
  }

  if (name && appState.lorebookUsage instanceof Map && appState.lorebookUsage.has(name)) {
    const usageList = appState.lorebookUsage.get(name);
    if (Array.isArray(usageList)) {
      usageList.forEach(appendCharName);
    }
  }

  const bindingCount = charNames.size + charIds.size;
  return {
    name,
    characters: [...charNames],
    charIds: [...charIds],
    bindingCount,
  };
};

export const isLorebookUnbound = bookOrName => resolveLorebookBindingStats(bookOrName).bindingCount === 0;

const ANALYTICS_EVENT_NAME = 'RegexLoreHubAnalytics';
const ANALYTICS_DEFAULT_FEATURE = 'select_unbound_lorebooks';
const ANALYTICS_DEFAULT_VERSION = 'v3.2';
const ANALYTICS_THROTTLE_INTERVAL_MS = 500;
const analyticsThrottleState = new Map();

export const emitAnalyticsEvent = (payload = {}) => {
  try {
    const now = Date.now();
    const rawCategory = typeof payload.category === 'string' ? payload.category.trim() : '';
    const rawAction = typeof payload.action === 'string' ? payload.action.trim() : '';
    const category = rawCategory || 'unknown';
    const action = rawAction || 'unknown';

    const throttleKey = `${category}::${action}`;
    const lastTrigger = analyticsThrottleState.get(throttleKey) ?? 0;
    if (now - lastTrigger < ANALYTICS_THROTTLE_INTERVAL_MS) {
      return;
    }
    analyticsThrottleState.set(throttleKey, now);

    const defaultViewRaw = typeof appState.activeView === 'string' ? appState.activeView.trim() : '';
    const normalizedFeature =
      typeof payload.feature === 'string' && payload.feature.trim()
        ? payload.feature.trim()
        : ANALYTICS_DEFAULT_FEATURE;
    const normalizedView =
      typeof payload.view === 'string' && payload.view.trim()
        ? payload.view.trim()
        : defaultViewRaw || 'unknown';

    const detail = {
      source: 'regex-lore-hub',
      timestamp: now,
      version: ANALYTICS_DEFAULT_VERSION,
      ...payload,
      category,
      action,
      feature: normalizedFeature,
      view: normalizedView,
    };

    const parentWin = getParentWin();
    const CustomEvt = parentWin?.CustomEvent || (typeof CustomEvent === 'function' ? CustomEvent : null);

    if (parentWin && typeof parentWin.dispatchEvent === 'function' && CustomEvt) {
      parentWin.dispatchEvent(new CustomEvt(ANALYTICS_EVENT_NAME, { detail }));
      return;
    }

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && CustomEvt) {
      window.dispatchEvent(new CustomEvt(ANALYTICS_EVENT_NAME, { detail }));
      return;
    }

    console.info('[RegexLoreHub] Analytics event captured:', detail);
  } catch (error) {
    console.warn('[RegexLoreHub] emitAnalyticsEvent 调用失败：', error);
  }
};

export const safeGetLorebookEntries = bookName => {
  try {
    if (!appState.lorebookEntries || !(appState.lorebookEntries instanceof Map)) {
      console.warn('[RegexLoreHub] appState.lorebookEntries is not a Map, reinitializing...');
      appState.lorebookEntries = new Map();
    }
    if (typeof appState.lorebookEntries.get !== 'function') {
      console.warn('[RegexLoreHub] appState.lorebookEntries.get is not a function, reinitializing...');
      appState.lorebookEntries = new Map();
    }
    const entries = appState.lorebookEntries.get(bookName);
    return Array.isArray(entries) ? entries : [];
  } catch (error) {
    console.error('[RegexLoreHub] Error in safeGetLorebookEntries:', error);
    appState.lorebookEntries = new Map();
    return [];
  }
};

export const safeSetLorebookEntries = (bookName, entries) => {
  try {
    if (!appState.lorebookEntries || !(appState.lorebookEntries instanceof Map)) {
      console.warn('[RegexLoreHub] appState.lorebookEntries is not a Map, reinitializing...');
      appState.lorebookEntries = new Map();
    }
    if (typeof appState.lorebookEntries.set !== 'function') {
      console.warn('[RegexLoreHub] appState.lorebookEntries.set is not a function, reinitializing...');
      appState.lorebookEntries = new Map();
    }
    appState.lorebookEntries.set(bookName, Array.isArray(entries) ? entries : []);
  } catch (error) {
    console.error('[RegexLoreHub] Error in safeSetLorebookEntries:', error);
    appState.lorebookEntries = new Map();
    appState.lorebookEntries.set(bookName, Array.isArray(entries) ? entries : []);
  }
};

export const safeDeleteLorebookEntries = bookName => {
  try {
    if (!appState.lorebookEntries || !(appState.lorebookEntries instanceof Map)) {
      console.warn('[RegexLoreHub] appState.lorebookEntries is not a Map, reinitializing...');
      appState.lorebookEntries = new Map();
      return;
    }
    if (typeof appState.lorebookEntries.delete !== 'function') {
      console.warn('[RegexLoreHub] appState.lorebookEntries.delete is not a function, reinitializing...');
      appState.lorebookEntries = new Map();
      return;
    }
    appState.lorebookEntries.delete(bookName);
  } catch (error) {
    console.error('[RegexLoreHub] Error in safeDeleteLorebookEntries:', error);
    appState.lorebookEntries = new Map();
  }
};

export const safeClearLorebookEntries = () => {
  try {
    if (!appState.lorebookEntries || !(appState.lorebookEntries instanceof Map)) {
      console.warn('[RegexLoreHub] appState.lorebookEntries is not a Map, reinitializing...');
      appState.lorebookEntries = new Map();
      return;
    }
    if (typeof appState.lorebookEntries.clear !== 'function') {
      console.warn('[RegexLoreHub] appState.lorebookEntries.clear is not a function, reinitializing...');
      appState.lorebookEntries = new Map();
      return;
    }
    appState.lorebookEntries.clear();
  } catch (error) {
    console.error('[RegexLoreHub] Error in safeClearLorebookEntries:', error);
    appState.lorebookEntries = new Map();
  }
};

export const safeHasLorebookEntries = bookName => {
  try {
    if (!appState.lorebookEntries || !(appState.lorebookEntries instanceof Map)) {
      console.warn('[RegexLoreHub] appState.lorebookEntries is not a Map, reinitializing...');
      appState.lorebookEntries = new Map();
      return false;
    }
    if (typeof appState.lorebookEntries.has !== 'function') {
      console.warn('[RegexLoreHub] appState.lorebookEntries.has is not a function, reinitializing...');
      appState.lorebookEntries = new Map();
      return false;
    }
    return appState.lorebookEntries.has(bookName);
  } catch (error) {
    console.error('[RegexLoreHub] Error in safeHasLorebookEntries:', error);
    appState.lorebookEntries = new Map();
    return false;
  }
};

export function getParentWin() {
  return window.parent || window;
}

export function getParentDoc() {
  return getParentWin().document;
}

export const escapeHtml = text => {
  if (typeof text !== 'string') return String(text);
  const div = getParentDoc().createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

export const highlightText = (text, searchTerm) => {
  if (!searchTerm || !text) return escapeHtml(text);
  const escapedText = escapeHtml(text);
  const htmlSafeSearchTerm = escapeHtml(searchTerm);
  const regexSpecialChars = new Set(['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\\\']);
  let escapedSearchTerm = '';
  for (const char of htmlSafeSearchTerm) {
    escapedSearchTerm += regexSpecialChars.has(char) ? '\\' + char : char;
  }
  const regex = new RegExp(`(${escapedSearchTerm})`, 'gi');
  return escapedText.replace(regex, '<mark class="rlh-highlight">$1</mark>');
};

export const showToast = (message, type = 'success', duration = 2000) => {
  const $ = get$();
  const parentDoc = getParentDoc();
  if (!$ || !parentDoc) return;
  const $panel = $(`#${PANEL_ID}`, parentDoc);
  if ($panel.length === 0) return;

  $panel.find('.rlh-toast-notification').remove();

  const iconClass = {
    success: 'fa-check-circle',
    error: 'fa-times-circle',
    info: 'fa-info-circle',
  }[type];

  const toastHtml = `
    <div class="rlh-toast-notification ${type}">
      <i class="fa-solid ${iconClass}"></i> ${escapeHtml(message)}
    </div>
  `;

  const $toast = $(toastHtml);
  $panel.append($toast);

  setTimeout(() => $toast.addClass('visible'), 10);

  setTimeout(() => {
    $toast.removeClass('visible');
    setTimeout(() => $toast.remove(), 300);
  }, duration);
};

export const showProgressToast = (initialMessage = '正在处理...') => {
  const $ = get$();
  const parentDoc = getParentDoc();
  if (!$ || !parentDoc) return { update: () => {}, remove: () => {} };
  const $panel = $(`#${PANEL_ID}`, parentDoc);
  if ($panel.length === 0) return { update: () => {}, remove: () => {} };
  $panel.find('.rlh-progress-toast').remove();
  const toastHtml = `<div class="rlh-progress-toast"><i class="fa-solid fa-spinner fa-spin"></i> <span class="rlh-progress-text">${escapeHtml(initialMessage)}</span></div>`;
  const $toast = $(toastHtml);
  $panel.append($toast);
  setTimeout(() => $toast.addClass('visible'), 10);
  const update = newMessage => {
    $toast.find('.rlh-progress-text').html(escapeHtml(newMessage));
  };
  const remove = () => {
    $toast.removeClass('visible');
    setTimeout(() => $toast.remove(), 300);
  };
  return { update, remove };
};

export const showModal = options => {
  const $ = get$();
  const parentDoc = getParentDoc();
  if (!$ || !parentDoc) return Promise.reject();
  return new Promise((resolve, reject) => {
    const { type = 'alert', title = '通知', text = '', html = '', placeholder = '', value = '' } = options || {};
    let buttonsHtml = '';
    if (type === 'alert') buttonsHtml = '<button class="rlh-modal-btn rlh-modal-ok">确定</button>';
    else if (type === 'confirm')
      buttonsHtml =
        '<button class="rlh-modal-btn rlh-modal-cancel">取消</button><button class="rlh-modal-btn rlh-modal-ok">确认</button>';
    else if (type === 'prompt')
      buttonsHtml =
        '<button class="rlh-modal-btn rlh-modal-cancel">取消</button><button class="rlh-modal-btn rlh-modal-ok">确定</button>';

    const inputHtml =
      type === 'prompt'
        ? `<input type="text" class="rlh-modal-input" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(value)}">`
        : '';

    // 优先使用 html 内容，否则回退到 text
    const bodyContent = html ? html : `<p>${escapeHtml(text)}</p>`;

    const modalHtml = `<div class="rlh-modal-overlay"><div class="rlh-modal-content"><div class="rlh-modal-header">${escapeHtml(title)}</div><div class="rlh-modal-body">${bodyContent}${inputHtml}</div><div class="rlh-modal-footer">${buttonsHtml}</div></div></div>`;

    const $modal = $(modalHtml).hide();
    const $panel = $(`#${PANEL_ID}`, parentDoc);
    if ($panel.length > 0) $panel.append($modal);
    else $('body', parentDoc).append($modal);

    $modal.fadeIn(200);
    const $input = $modal.find('.rlh-modal-input');
    if (type === 'prompt') $input.focus().select();

    const closeModal = (isSuccess, val) => {
      $modal.fadeOut(200, () => {
        $modal.remove();
        if (isSuccess) resolve(val);
        else reject();
      });
    };

    $modal.on('click', '.rlh-modal-ok', () => {
      const val = type === 'prompt' ? $input.val() : true;
      if (type === 'prompt' && !String(val).trim()) {
        $input.addClass('rlh-input-error');
        setTimeout(() => $input.removeClass('rlh-input-error'), 500);
        return;
      }
      closeModal(true, val);
    });
    $modal.on('click', '.rlh-modal-cancel', () => closeModal(false));
    if (type === 'prompt') {
      $input.on('keydown', e => {
        if (e.key === 'Enter') $modal.find('.rlh-modal-ok').click();
        else if (e.key === 'Escape') $modal.find('.rlh-modal-cancel').click();
      });
    }
  });
};

export const errorCatched = (fn, context = 'RegexLoreHub', options = {}) => {
  const {
    notify = 'toast',
    toastType = 'error',
    toastDuration = 4000,
    toastMessage = '操作发生异常，请查看控制台获取详细信息。',
    modalTitle = '脚本异常',
    modalText = '操作中发生未知错误，请检查开发者控制台获取详细信息。',
  } = options ?? {};

  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (!error) return;
      console.error(`[${context}] Error:`, error);

      if (notify === 'modal') {
        await showModal({ type: 'alert', title: modalTitle, text: modalText });
        return;
      }

      if (notify === 'toast') {
        showToast(toastMessage, toastType, toastDuration);
      }
    }
  };
};

/**
 * 创建一个防抖函数，该函数会从上一次被调用后，延迟 `delay` 毫秒后调用 `func` 方法。
 * @param {Function} func 要防抖的函数。
 * @param {number} delay 延迟的毫秒数。
 * @returns {Function} 返回一个新的防抖函数。
 */
export function debounce(func, delay) {
  let timeout;
  return function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), delay);
  };
}

/**
 * 根据给定的搜索词和选项构建一个正则表达式对象。
 * @param {string} searchTerm - 用于搜索的字符串。
 * @param {boolean} caseSensitive - 是否区分大小写。
 * @returns {RegExp} - 构建好的正则表达式对象。
 */
export const buildSearchRegex = (searchTerm, caseSensitive) => {
  const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\/\\]/g, '\\$&');
  const flags = caseSensitive ? 'g' : 'gi';
  return new RegExp(escapedTerm, flags);
};

export const UI_TEXTS = {
  INSERT_RULES_TITLE: '插入规则',
  // ... 未来可以添加更多UI文本
};
