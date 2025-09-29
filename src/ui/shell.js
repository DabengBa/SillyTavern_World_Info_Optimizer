import { loadAllData } from '../dataLayer.js';

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

  CREATE_LOREBOOK_BTN_ID,

  CHARACTER_BOOK_SWITCH_ID,

  PREFETCH_INDICATOR_ID,

  PREFETCH_PROGRESS_TEXT_ID,

  PREFETCH_PROGRESS_BAR_ID,
  appState,
  showModal,

  get$,

  getParentDoc,

  getParentWin,

} from '../core.js';

import { toggleToolbar } from './handlers/ui.js';

import { renderContent } from './render/index.js';

import { builtCSS } from '../styles/generated.js';




export function initializeUI(createHandlers) {

  const $ = get$();

  const parentDoc = getParentDoc();

  const parentWin = getParentWin();




  const handlers = createHandlers();





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

    if (parentWin.Sortable) {

      callback();

      return;

    }

    const script = parentWin.document.createElement('script');

    script.src = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js';

    script.onload = () => {

      console.log('[RegexLoreHub] SortableJS loaded successfully.');

      callback();

    };

    script.onerror = () => {

      console.error('[RegexLoreHub] Failed to load SortableJS.');

      showModal({ type: 'alert', title: '错误', text: '无法加载拖拽排序库，请检查网络连接或浏览器控制台。' });

    };

    parentWin.document.head.appendChild(script);

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

              <p class="rlh-shell-meta"><span class="rlh-shell-version">v3.0</span><span class="rlh-shell-dot">·</span><span class="rlh-shell-updated">更新于 2025 年 9 月 30 日</span></p>

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





    const buttonHtml = `<div id="${BUTTON_ID}" class="list-group-item flex-container flexGap5 interactable" title="${BUTTON_TOOLTIP}"><span class="rlh-menu-icon"><i class="fa-solid fa-layer-group"></i></span><span>${BUTTON_TEXT_IN_MENU}</span></div>`;

    const $extensionsMenu = $(`#extensionsMenu`, parentDoc);

    if ($extensionsMenu.find(`#${BUTTON_ID}`).length === 0) {

      $extensionsMenu.append(buttonHtml);

      console.log(`[RegexLoreHub] Button #${BUTTON_ID} appended to #extensionsMenu.`);

    }





    const $panel = $(`#${PANEL_ID}`, parentDoc);

    $panel.addClass('dark');





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

      .on('click.rlh', `#${POSITION_MENU_BUTTON_ID}`, handlers.handlePositionMenuToggle)

      .on('click.rlh', '.rlh-position-option', handlers.handlePositionOptionSelect)

      .on('change.rlh', '.rlh-multi-select-checkbox', handlers.handleSelectionCheckboxChange)

      .on('click.rlh', `#${REFRESH_BTN_ID}`, handlers.handleRefresh)

      .on('click.rlh', '#rlh-multi-select-btn', handlers.toggleMultiSelectMode)

      .on('click.rlh', '#rlh-select-all-btn', handlers.handleSelectAll)

      .on('click.rlh', '#rlh-select-none-btn', handlers.handleSelectNone)

      .on('click.rlh', '#rlh-select-invert-btn', handlers.handleSelectInvert)

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
