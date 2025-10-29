import { loadAllData, loadThemePreference } from '../dataLayer.js';

import {

  DOM_ID,
  PANEL_ID,

  BUTTON_ID,

  BUTTON_ICON_URL,

  BUTTON_TOOLTIP,

  BUTTON_TEXT_IN_MENU,

  CLOSE_BTN_ID,

  SEARCH_INPUT_ID,

  REFRESH_BTN_ID,

  CORE_TOOLBAR_ID,

  REPLACE_TOOL_CONTAINER_ID,

  REPLACE_TOGGLE_BTN_ID,

  REPLACE_INPUT_ID,

  TOGGLE_COLLAPSE_BTN_ID,

  TOGGLE_RECURSION_BTN_ID,

  FIX_KEYWORDS_BTN_ID,

  SORT_MENU_BUTTON_ID,

  POSITION_MENU_BUTTON_ID,
  UNIFIED_STATUS_BUTTON_ID,

  CREATE_LOREBOOK_BTN_ID,

  CHARACTER_BOOK_SWITCH_ID,

  PREFETCH_INDICATOR_ID,

  PREFETCH_PROGRESS_TEXT_ID,

  PREFETCH_PROGRESS_BAR_ID,
  appState,
  showModal,
  syncThemeToDom,
  listThemes,
  getActiveTheme,
  getThemeLabel,
  setActiveTheme,
  onThemeChange,
  THEME_MENU_WRAPPER_ID,
  THEME_MENU_ID,
  THEME_TOGGLE_BTN_ID,
  THEME_TOGGLE_LABEL_ID,
  THEME_OPTION_CLASS,
  escapeHtml,

  get$,

  getParentDoc,

  getParentWin,

} from '../core.js';

import { toggleToolbar } from './handlers/ui.js';

import { renderContent } from './render/index.js';

import { builtCSS } from '../styles/generated.js';

const LOCAL_SORTABLE_URL = (() => {
  try {
    // 基于当前模块路径推导 vendor 目录下的 Sortable 资源
    return new URL('../vendor/Sortable.min.js', import.meta.url).href;
  } catch (error) {
    console.error('[RegexLoreHub] 计算 SortableJS 本地路径失败：', error);
    return '';
  }
})();

const normalizeUrl = value => {
  if (!value || typeof value !== 'string') return '';
  return value.trim().replace(/\\/g, '/').replace(/\/+$/, '');
};

const joinUrlSegments = (base, segment) => {
  const normalizedBase = normalizeUrl(base);
  if (!normalizedBase) return '';
  const cleanedSegment = segment.replace(/^\/+/, '');
  return `${normalizedBase}/${cleanedSegment}`;
};

const collectSortableCandidateUrls = (parentDoc, parentWin) => {
  const candidates = [];
  const addCandidate = url => {
    if (!url || typeof url !== 'string') return;
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!candidates.includes(trimmed)) candidates.push(trimmed);
  };

  addCandidate(joinUrlSegments(appState.paths?.vendor, 'Sortable.min.js'));
  addCandidate(joinUrlSegments(appState.paths?.rlhRoot, 'vendor/Sortable.min.js'));

  try {
    addCandidate(new URL('../vendor/Sortable.min.js', import.meta.url).href);
  } catch (error) {
    console.warn('[RegexLoreHub] 基于模块路径推导 Sortable 资源失败：', error);
  }

  try {
    if (parentDoc) {
      const scriptEls = parentDoc.querySelectorAll('script[src]');
      scriptEls.forEach(scriptEl => {
        const src = scriptEl.getAttribute('src');
        if (!src || !/regex[-_]lore[-_]hub/i.test(src)) return;
        try {
          const absolute = new URL(src, parentWin?.location?.href || window.location.href);
          const base = normalizeUrl(absolute.href.replace(/\/[^/]*$/, ''));
          addCandidate(joinUrlSegments(base, 'vendor/Sortable.min.js'));
          addCandidate(joinUrlSegments(base, 'src/vendor/Sortable.min.js'));
        } catch (innerError) {
          console.warn('[RegexLoreHub] 宿主脚本路径推导失败：', innerError);
        }
      });
    }
  } catch (error) {
    console.warn('[RegexLoreHub] 遍历宿主脚本节点失败：', error);
  }

  addCandidate(LOCAL_SORTABLE_URL);
  addCandidate('https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js');

  return candidates.filter(Boolean);
};



export async function initializeUI(createHandlers) {

  const $ = get$();

  const parentDoc = getParentDoc();

  const parentWin = getParentWin();

  try {
    const storedThemeId = await loadThemePreference();
    if (storedThemeId) {
      const restoredTheme = setActiveTheme(storedThemeId, {
        applyToDom: false,
        silent: true,
        reason: 'restore',
      });
      if (!restoredTheme) {
        console.warn('[RegexLoreHub] 无法恢复存储的主题，ID:', storedThemeId);
      }
    } else {
      setActiveTheme('dark', { applyToDom: false, silent: true, reason: 'initial-default' });
    }
  } catch (error) {
    console.warn('[RegexLoreHub] 读取主题偏好失败：', error);
  }




  const handlers = createHandlers();

  const describeScheme = scheme => {
    if (scheme === 'dark') return '暗色';
    if (scheme === 'light') return '亮色';
    return '自定义';
  };

  const renderThemeMenuOptions = () => {
    const $menu = $(`#${THEME_MENU_ID}`, parentDoc);
    if (!$menu.length) return;
    const activeTheme = getActiveTheme();
    const activeId = activeTheme?.id ?? '';
    const themes = listThemes();
    const itemsHtml = themes
      .map(theme => {
        const themeId = typeof theme?.id === 'string' ? theme.id.trim() : '';
        const isActive = themeId && themeId === activeId;
        const label = escapeHtml(getThemeLabel(themeId));
        const schemeLabel = escapeHtml(describeScheme(theme?.colorScheme));
        return `
          <button type="button" class="rlh-sort-option ${THEME_OPTION_CLASS}" data-theme-id="${escapeHtml(
            themeId,
          )}" role="menuitemradio" aria-checked="${isActive ? 'true' : 'false'}" data-active="${isActive}">
            <span class="rlh-theme-option-text">
              <span class="rlh-theme-option-name">${label}</span>
              <span class="rlh-theme-option-meta">${schemeLabel}</span>
            </span>
            <span class="rlh-theme-option-check"><i class="fa-solid fa-check" aria-hidden="true"></i></span>
          </button>`;
      })
      .join('');
    $menu.html(itemsHtml);
  };

  const updateThemeToggleUI = theme => {
    const activeTheme = theme ?? getActiveTheme();
    const activeId = activeTheme?.id ?? '';
    const activeLabel = getThemeLabel(activeId);
    const $label = $(`#${THEME_TOGGLE_LABEL_ID}`, parentDoc);
    if ($label.length) {
      $label.text(activeTheme ? `主题：${activeLabel}` : '主题：未设置');
    }
    const $wrapper = $(`#${THEME_MENU_WRAPPER_ID}`, parentDoc);
    if ($wrapper.length) {
      $wrapper.attr('data-active-theme', activeId);
    }
    const $options = $(`#${THEME_MENU_ID}`, parentDoc).find(`.${THEME_OPTION_CLASS}`);
    $options.each((_, element) => {
      const $option = $(element);
      const optionId = String($option.data('themeId') ?? '').trim();
      const isActive = optionId === activeId && Boolean(activeId);
      $option.attr('data-active', String(isActive));
      $option.attr('aria-checked', String(isActive));
    });
  };

  onThemeChange(({ theme }) => {
    renderThemeMenuOptions();
    updateThemeToggleUI(theme);
  });
  function injectCSS() {

    const existingStyle = parentDoc.getElementById(`${PANEL_ID}-styles`);

    if (existingStyle) {

      existingStyle.textContent = builtCSS;

      return;

    }

    const styleElement = parentDoc.createElement('style');

    styleElement.id = `${PANEL_ID}-styles`;

    styleElement.textContent = builtCSS;

    parentDoc.head.appendChild(styleElement);

  }




  function loadSortableJS(callback) {
    appState.isDragSortDisabled = false;

    if (parentWin.Sortable) {
      if (typeof callback === 'function') {
        try {
          callback();
        } catch (error) {
          console.error('[RegexLoreHub] 初始化回调执行失败：', error);
        }
      }
      return;
    }

    let hasFinished = false;
    const safeInvokeCallback = () => {
      if (hasFinished) return;
      hasFinished = true;
      if (typeof callback === 'function') {
        try {
          callback();
        } catch (error) {
          console.error('[RegexLoreHub] 初始化回调执行失败：', error);
        }
      }
    };

    const candidateUrls = collectSortableCandidateUrls(parentDoc, parentWin);

    const handleTotalFailure = lastError => {
      if (!parentDoc) {
        appState.isDragSortDisabled = true;
        console.error('[RegexLoreHub] 无法加载 SortableJS：宿主文档不可访问。', lastError);
        safeInvokeCallback();
        return;
      }

      const attemptedUrls = candidateUrls.length ? `尝试路径：${candidateUrls.join(', ')}` : '未找到可用候选路径。';
      const inlineFallback = async () => {
        if (typeof (parentWin.fetch || window.fetch) !== 'function') throw lastError || new Error('fetch not available');
        const fetchImpl = parentWin.fetch ? parentWin.fetch.bind(parentWin) : window.fetch.bind(window);
        const inlineUrl =
          (() => {
            try {
              return new URL('../vendor/Sortable.min.js', import.meta.url).href;
            } catch (error) {
              console.warn('[RegexLoreHub] 内联回退路径解析失败：', error);
              return '';
            }
          })() || candidateUrls[0] || '';

        if (!inlineUrl) throw lastError || new Error('missing inline url');

        const response = await fetchImpl(inlineUrl, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
        const scriptText = await response.text();
        const inlineScript = parentDoc.createElement('script');
        inlineScript.textContent = scriptText;
        parentDoc.head.appendChild(inlineScript);
        console.warn('[RegexLoreHub] SortableJS 已通过内联模式加载。');
        appState.isDragSortDisabled = false;
        safeInvokeCallback();
      };

      inlineFallback()
        .catch(error => {
          appState.isDragSortDisabled = true;
          console.error('[RegexLoreHub] Failed to load SortableJS.', error ?? lastError);
          showModal({
            type: 'alert',
            title: '错误',
            text: `无法加载拖拽排序库，请检查资源路径配置。${attemptedUrls}`,
          }).catch(() => {});
          safeInvokeCallback();
        })
        .finally(() => {});
    };

    if (!candidateUrls.length) {
      handleTotalFailure(new Error('Sortable candidate URLs not found.'));
      return;
    }

    const attemptLoad = index => {
      if (index >= candidateUrls.length) {
        handleTotalFailure(new Error('All Sortable candidates failed.'));
        return;
      }

      const url = candidateUrls[index];
      const scriptEl = parentWin.document.createElement('script');
      scriptEl.src = url;
      scriptEl.dataset.rlhSortableCandidate = String(index);

      scriptEl.onload = () => {
        appState.isDragSortDisabled = false;
        console.log('[RegexLoreHub] SortableJS loaded successfully.', url);
        appState.paths = appState.paths || {};
        appState.paths.vendor = normalizeUrl(url.replace(/\/Sortable\.min\.js(?:\?.*)?$/, ''));
        appState.paths.rlhRoot =
          appState.paths.vendor?.replace(/\/vendor$/, '') || appState.paths.rlhRoot || '';
        safeInvokeCallback();
      };

      scriptEl.onerror = event => {
        scriptEl.remove();
        console.warn('[RegexLoreHub] SortableJS 加载失败，尝试下一个候选。', url, event?.error);
        attemptLoad(index + 1);
      };

      parentWin.document.head.appendChild(scriptEl);
    };

    attemptLoad(0);
  }





  function initializeScript() {

    console.log('[RegexLoreHub] Initializing UI and button...');





    if ($(`#${PANEL_ID}`, parentDoc).length > 0) {

      console.log('[RegexLoreHub] Panel already exists. Skipping UI creation.');

      return;

    }





    injectCSS();





    const panelHtml = `
      <div id="${PANEL_ID}">

        <div class="rlh-shell">

          <header class="rlh-shell-header">

            <div class="rlh-shell-title">

              <h4>${BUTTON_TOOLTIP}</h4>

              <p class="rlh-shell-meta"><span class="rlh-shell-version">v3.2</span><span class="rlh-shell-dot">·</span><span class="rlh-shell-updated">更新于 2025 年 10 月 21 日</span></p>

            </div>

            <div class="rlh-shell-right">

              <div id="${PREFETCH_INDICATOR_ID}" class="rlh-prefetch-indicator" data-visible="false" aria-hidden="true">

                <div id="${PREFETCH_PROGRESS_TEXT_ID}" class="rlh-prefetch-text" aria-live="polite">后台加载世界书 (0/0)，不影响其他操作</div>

                <div class="rlh-prefetch-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">

                  <span id="${PREFETCH_PROGRESS_BAR_ID}" class="rlh-prefetch-bar-inner"></span>

                </div>

              </div>

              <button type="button" id="${DOM_ID.TOGGLE_TOOLBAR_BTN}" class="rlh-toolbar-toggle-btn" title="折叠工具栏" aria-controls="${DOM_ID.TOOLBAR_SHELL}" aria-expanded="true">折叠工具栏</button>

              <div class="rlh-shell-actions">

                <div id="${THEME_MENU_WRAPPER_ID}" class="rlh-theme-menu rlh-sort-menu" data-open="false">

                  <button type="button" id="${THEME_TOGGLE_BTN_ID}" class="rlh-theme-toggle" title="切换主题" aria-haspopup="true" aria-expanded="false" aria-controls="${THEME_MENU_ID}">

                    <i class="fa-solid fa-palette" aria-hidden="true"></i>

                    <span id="${THEME_TOGGLE_LABEL_ID}" class="rlh-theme-toggle-label">主题：加载中</span>

                    <i class="fa-solid fa-caret-down rlh-theme-toggle-caret" aria-hidden="true"></i>

                  </button>

                  <div id="${THEME_MENU_ID}" class="rlh-sort-menu-list rlh-theme-menu-list" role="menu"></div>

                </div>

                <button type="button" id="${REFRESH_BTN_ID}" class="rlh-icon-button rlh-refresh-button" title="刷新数据">

                  <i class="fa-solid fa-arrows-rotate"></i>

                </button>

                <button type="button" id="${CLOSE_BTN_ID}" class="rlh-icon-button rlh-close-button" title="关闭面板">

                  <i class="fa-solid fa-xmark"></i>

                </button>

              </div>

            </div>

          </header>





          <nav class="rlh-tab-nav">

            <div class="rlh-tab active" data-tab="global-lore"><span class="rlh-tab-text-full">全局世界书</span><span class="rlh-tab-text-short">全局书</span></div>

            <div class="rlh-tab" data-tab="char-lore"><span class="rlh-tab-text-full">角色世界书</span><span class="rlh-tab-text-short">角色书</span></div>

            <div class="rlh-tab" data-tab="chat-lore"><span class="rlh-tab-text-full">聊天世界书</span><span class="rlh-tab-text-short">聊天书</span></div>

            <div class="rlh-tab" data-tab="global-regex"><span class="rlh-tab-text-full">全局正则</span><span class="rlh-tab-text-short">全局正则</span></div>

            <div class="rlh-tab" data-tab="char-regex"><span class="rlh-tab-text-full">角色正则</span><span class="rlh-tab-text-short">角色正则</span></div>

          </nav>

          <div id="${DOM_ID.TOOLBAR_SHELL}" class="rlh-toolbar-shell">

            <div id="${CORE_TOOLBAR_ID}" class="rlh-toolbar-container"></div>

            <div id="${REPLACE_TOOL_CONTAINER_ID}" class="rlh-replace-container"></div>

          </div>

          <div class="rlh-content-pane">

            <div id="${PANEL_ID}-content"></div>

          </div>

          <footer class="rlh-shell-footer">

            <div id="regex-lore-hub-save-status" class="rlh-save-status"></div>

          </footer>

        </div>

      </div>`;





    $('body', parentDoc).append(panelHtml);
    syncThemeToDom();
    renderThemeMenuOptions();
    updateThemeToggleUI();


    const buttonHtml = `<div id="${BUTTON_ID}" class="list-group-item flex-container flexGap5 interactable" title="${BUTTON_TOOLTIP}"><span class="rlh-menu-icon"><i class="fa-solid fa-layer-group"></i></span><span>${BUTTON_TEXT_IN_MENU}</span></div>`;

    const $extensionsMenu = $(`#extensionsMenu`, parentDoc);

    if ($extensionsMenu.find(`#${BUTTON_ID}`).length === 0) {

      $extensionsMenu.append(buttonHtml);

      console.log(`[RegexLoreHub] Button #${BUTTON_ID} appended to #extensionsMenu.`);

    }





    const $panel = $(`#${PANEL_ID}`, parentDoc);

    const $parentBody = $('body', parentDoc);

    $parentBody.off('.rlh').on('click.rlh', `#${BUTTON_ID}`, handlers.togglePanel);





    $panel

      .off('.rlh')

      .on('click.rlh', `#${CLOSE_BTN_ID}`, handlers.togglePanel)

      .on('click.rlh', '.rlh-tab', handlers.switchTab)

      .on('click.rlh', '.rlh-item-header, .rlh-global-book-header', handlers.handleHeaderClick)

      .on('click.rlh', '.rlh-item-container', handlers.handleMultiSelectContainerClick)

      .on('click.rlh', '.rlh-book-group', handlers.handleMultiSelectContainerClick)

      .on('click.rlh', '.rlh-back-to-list-btn', handlers.handleExitLorebookDetail) // 新增绑定

      .on('click.rlh', '.rlh-toggle-btn', handlers.handleToggleState)

      .on('click.rlh', '.rlh-refresh-detail-btn', handlers.handleRefreshLorebookDetail)

      .on('click.rlh', '.rlh-entry-edit-btn', handlers.handleEntryEnterEdit)

      .on('click.rlh', '.rlh-entry-view-btn', handlers.handleEntryExitEdit)

      .on('click.rlh', '.rlh-regex-edit-btn', handlers.handleRegexEnterEdit)

      .on('click.rlh', '.rlh-regex-view-btn', handlers.handleRegexExitEdit)

      .on('keydown.rlh', `#${SEARCH_INPUT_ID}`, handlers.handleSearchInputKeydown)

      .on('click.rlh', '#rlh-search-clear-btn', handlers.handleSearchClear)

      .on('input.rlh', `#${SEARCH_INPUT_ID}, #${REPLACE_INPUT_ID}`, handlers.handleGlobalSearch) // 详情页搜索/替换框

      .on('change.rlh', '#rlh-search-filters-container input', renderContent)

      .on('change.rlh', `#${CHARACTER_BOOK_SWITCH_ID}`, handlers.handleCharacterBookSwitch)

      .on('click.rlh', `#${TOGGLE_COLLAPSE_BTN_ID}`, handlers.handleToolbarToggleCollapse)

      .on('click.rlh', `#${SORT_MENU_BUTTON_ID}`, handlers.handleSortMenuToggle)

      .on('click.rlh', '.rlh-sort-option', handlers.handleSortOptionSelect)

      .on('click.rlh', `#${THEME_TOGGLE_BTN_ID}`, handlers.handleThemeMenuToggle)

      .on('click.rlh', `#${THEME_MENU_ID} .${THEME_OPTION_CLASS}`, handlers.handleThemeOptionSelect)

      .on('click.rlh', `#${POSITION_MENU_BUTTON_ID}`, handlers.handlePositionMenuToggle)

      .on('click.rlh', '.rlh-position-option', handlers.handlePositionOptionSelect)

      .on('click.rlh', `#${UNIFIED_STATUS_BUTTON_ID}`, handlers.handleUnifiedStatusMenuToggle)

      .on('click.rlh', '.rlh-unified-status-option', handlers.handleUnifiedStatusOptionSelect)

      .on('change.rlh', '.rlh-multi-select-checkbox', handlers.handleSelectionCheckboxChange)

      .on('click.rlh', `#${REFRESH_BTN_ID}`, handlers.handleRefresh)

      .on('click.rlh', '#rlh-multi-select-btn', handlers.toggleMultiSelectMode)

      .on('click.rlh', '#rlh-select-all-btn', handlers.handleSelectAll)

      .on('click.rlh', '#rlh-select-none-btn', handlers.handleSelectNone)

      .on('click.rlh', '#rlh-select-invert-btn', handlers.handleSelectInvert)

      .on('click.rlh', '.rlh-select-unbound', handlers.handleSelectUnboundBooks)

      .on('click.rlh', '#rlh-batch-enable-btn', handlers.handleBatchEnable)

      .on('click.rlh', '#rlh-batch-disable-btn', handlers.handleBatchDisable)

      .on('click.rlh', '#rlh-batch-delete-btn', handlers.handleBatchDelete)

      .on('click.rlh', '.rlh-clean-orphan-books-btn', handlers.handleCleanOrphanLorebooks)

      .on('click.rlh', `#${CREATE_LOREBOOK_BTN_ID}`, handlers.handlePrimaryCreateButtonClick)

      .on('click.rlh', '.rlh-rename-book-btn', handlers.handleRenameBook)

      .on('click.rlh', '.rlh-edit-entries-btn', handlers.handleEditEntriesToggle)

      .on('click.rlh', '.rlh-delete-book-btn', handlers.handleDeleteLorebook)

      .on('click.rlh', '.rlh-create-entry-btn', handlers.handleCreateEntry)

      .on('click.rlh', '#regex-lore-hub-create-lorebook-btn', handlers.handleCreateLorebook)

      .on('click.rlh', '.rlh-delete-entry-btn', handlers.handleDeleteEntry)

      .on('click.rlh', '.rlh-batch-recursion-btn', handlers.handleBatchSetRecursion)

      .on('click.rlh', '.rlh-fix-keywords-btn', handlers.handleFixKeywords)

      .on('click.rlh', '.rlh-rename-btn', handlers.handleRename)

      .on('click.rlh', '.rlh-rename-save-btn', handlers.handleConfirmRename)

      .on('keydown.rlh', '.rlh-rename-input', handlers.handleRenameKeydown)

      .on('change.rlh', '.rlh-edit-position', handlers.handlePositionChange)

      .on('click.rlh', '#rlh-create-chat-lore-btn', handlers.handleCreateChatLorebook)

      .on('click.rlh', '.rlh-unlink-chat-lore-btn', handlers.handleUnlinkChatLorebook)

      .on('click.rlh', `#${DOM_ID.TOGGLE_TOOLBAR_BTN}`, toggleToolbar)
      .on('click.rlh', '#rlh-replace-btn', handlers.handleReplace);

    if (appState.isToolbarCollapsed) {

      const $toolbarShell = $(`#${DOM_ID.TOOLBAR_SHELL}`, parentDoc);

      $toolbarShell.addClass('rlh-toolbar-shell--collapsed');

      const $toggleBtn = $(`#${DOM_ID.TOGGLE_TOOLBAR_BTN}`, parentDoc);

      if ($toggleBtn.length) {

        $toggleBtn.text('展开工具栏').attr('aria-expanded', 'false').attr('title', '展开工具栏');

      }

    }





    console.log('[RegexLoreHub] All UI and events initialized.');





    loadAllData();

  }





  loadSortableJS(initializeScript);

}
