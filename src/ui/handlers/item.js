import {
  LOREBOOK_OPTIONS,
  appState,
  safeGetLorebookEntries,
  safeSetLorebookEntries,
  errorCatched,
  showToast,
  showModal,
  escapeHtml,
  get$,
  getParentDoc,
  debounce,
} from '../../core.js';
import {
  TavernAPI,
  createInMemoryEntry,
  updateInMemoryEntry,
  saveAllChanges,
  updateBookSummary,
  updateWorldbookEntries, // 导入新的更新函数
  queueLorebookEntryUpdate,
  queueRegexUpdate,
  normalizeWorldbookEntry,
} from '../../dataLayer.js';
import {
  getViewContext,
  prependEntry,
  buildLoreEntryViewerHTML,
  buildRegexViewerHTML,
} from '../render/index.js';

// --- 条目事件处理 ---
export function createItemHandlers(deps = {}) {
  const $ = deps.$ ?? get$();
  const parentDoc = deps.parentDoc ?? getParentDoc();
  // 定位当前编辑的正则项，便于在输入时同步状态
  const findRegexItemById = (rawId) => {
    const targetId = String(rawId);
    const fromGlobal = appState.regexes.global.find(item => String(item.id) === targetId);
    if (fromGlobal) return fromGlobal;
    return appState.regexes.character.find(item => String(item.id) === targetId) ?? null;
  };

  // 将输入值写入正则项，自动处理嵌套字段和类型转换
  const applyRegexFieldUpdate = (regexItem, fieldPath, rawValue) => {
    if (!regexItem || !fieldPath) return;
    let value = rawValue;
    if (typeof value !== 'boolean') {
      value = value ?? '';
    }
    if (fieldPath === 'min_depth' || fieldPath === 'max_depth') {
      const numeric = parseInt(value, 10);
      value = Number.isNaN(numeric) ? null : numeric;
    }
    const segments = fieldPath.split('.');
    if (segments.length === 1) {
      regexItem[segments[0]] = value;
      return;
    }
    let cursor = regexItem;
    for (let i = 0; i < segments.length - 1; i++) {
      const key = segments[i];
      if (!cursor[key] || typeof cursor[key] !== 'object') {
        cursor[key] = {};
      }
      cursor = cursor[key];
    }
    cursor[segments[segments.length - 1]] = value;
  };

  // 创建一个防抖函数用于自动保存
  const debouncedSave = debounce(() => saveAllChanges({ silent: true }), 1000);

  const handleEditorInput = errorCatched(async event => {
    const $target = $(event.currentTarget);
    const $container = $target.closest('.rlh-item-container');
    const type = $container.data('type');
    const id = $container.data('id');
    const numericId = Number(id);
    const field = $target.data('field');
    if (!field) return;
    if (type === 'lore') {
      const bookName = $container.data('book-name');
      const entries = safeGetLorebookEntries(bookName);
      const entry = entries.find(item => {
        const itemUid = item?.uid;
        if (typeof itemUid === 'number' && !Number.isNaN(numericId)) {
          return itemUid === numericId;
        }
        return String(itemUid) === String(id);
      });
      if (!entry) return;
      // 实时更新内存中的状态，而不是直接调用API
      let value;
      if ($target.is(':checkbox')) {
        value = $target.is(':checked');
      } else if ($target.is('[contenteditable="true"]')) {
        const element = $target.get(0);
        if (element) {
          const blockTags = new Set(['div', 'p', 'li', 'ul', 'ol', 'blockquote', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'tr']);
          const parts = [];
          const appendText = textValue => {
            if (!textValue) return;
            parts.push(textValue);
          };
          const appendNewline = () => {
            if (!parts.length) {
              parts.push('\n');
              return;
            }
            const last = parts[parts.length - 1];
            if (last?.endsWith('\n')) return;
            parts.push('\n');
          };
          const collectText = node => {
            if (!node) return;
            const nodeType = node.nodeType;
            if (nodeType === Node.TEXT_NODE) {
              appendText(node.nodeValue || '');
              return;
            }
            if (nodeType !== Node.ELEMENT_NODE) return;
            const tag = node.nodeName.toLowerCase();
            if (tag === 'br') {
              parts.push('\n');
              return;
            }
            if (tag === 'style' || tag === 'script') return;
            node.childNodes.forEach(child => collectText(child));
            if (blockTags.has(tag)) appendNewline();
          };
          collectText(element);
          value = parts.join('');
          value = value.replace(/\u00a0/g, ' ');
          value = value.replace(/\r?\n/g, '\n');
        } else {
          value = '';
        }
      } else {
        value = $target.val();
      }
      // 特殊处理需要类型转换的字段
      if (field === 'keys') {
        entry.keys = value.split(',').map(k => k.trim()).filter(Boolean);
      } else if (['depth', 'order', 'probability'].includes(field)) {
        const numValue = parseInt(value, 10);
        entry[field] = isNaN(numValue) ? ($target.attr('placeholder') === '例如: 0' ? null : 100) : numValue;
      } else {
        entry[field] = value;
      }
      const pendingValue = Array.isArray(entry[field]) ? [...entry[field]] : entry[field];
      queueLorebookEntryUpdate(bookName, entry.uid ?? id, { [field]: pendingValue });
    } else if (type === 'regex') {
      const regexItem = findRegexItemById(id);
      if (!regexItem) return;
      let value;
      if ($target.is(':checkbox')) {
        value = $target.is(':checked');
      } else {
        value = $target.val();
      }
      applyRegexFieldUpdate(regexItem, field, value);
      queueRegexUpdate(regexItem.id);
    }
    // 触发防抖保存
    debouncedSave();
  });
  const buildLoreEntryEditorHtml = (entry) => {
    const positionOptions = Object.entries(LOREBOOK_OPTIONS.position)
      .map(([value, text]) => `<option value="${value}" ${entry.position === value ? 'selected' : ''}>${text}</option>`)
      .join('');
    const logicOptions = Object.entries(LOREBOOK_OPTIONS.logic)
      .map(([value, text]) => `<option value="${value}" ${entry.logic === value ? 'selected' : ''}>${text}</option>`)
      .join('');
    const keywordsText = Array.isArray(entry.keys) ? entry.keys.join(', ') : '';
    const contentText = entry.content || '';
    return `
      <div class="rlh-editor-wrapper" data-mode="edit">
        <div class="rlh-editor-field">
          <label>关键词 (逗号分隔)</label>
          <input type="text" class="rlh-edit-keys" data-field="keys" value="${escapeHtml(keywordsText)}">
        </div>
        <div class="rlh-editor-field">
          <label>内容</label>
          <div class="rlh-edit-content" data-field="content" contenteditable="true">${escapeHtml(contentText)}</div>
        </div>
        <div class="rlh-editor-group"><h5>插入规则</h5>
          <div class="rlh-editor-grid">
            <div class="rlh-grid-item"><label>位置</label><select class="rlh-edit-position rlh-select-nudge" data-field="position">${positionOptions}</select></div>
            <div class="rlh-grid-item rlh-depth-container"><label>深度</label><input type="number" class="rlh-edit-depth" data-field="depth" placeholder="例如: 0" value="${entry.depth ?? ''}"></div>
            <div class="rlh-grid-item"><label>顺序</label><input type="number" class="rlh-edit-order" data-field="order" placeholder="例如: 100" value="${entry.order ?? ''}"></div>
          </div>
        </div>
        <div class="rlh-editor-group"><h5>激活逻辑</h5>
          <div class="rlh-editor-grid">
            <div class="rlh-grid-item"><label>概率 (%)</label><input type="number" class="rlh-edit-probability" data-field="probability" min="0" max="100" placeholder="100" value="${entry.probability ?? ''}"></div>
            <div class="rlh-grid-item"><label>关键词逻辑</label><select class="rlh-edit-logic rlh-select-nudge" data-field="logic">${logicOptions}</select></div>
          </div>
        </div>
        <div class="rlh-editor-group"><h5>匹配与递归</h5>
          <div class="rlh-editor-options-row">
            <label class="rlh-editor-option-item"><input type="checkbox" class="rlh-edit-case-sensitive" data-field="case_sensitive" ${entry.case_sensitive ? 'checked' : ''}> 大小写敏感</label>
            <label class="rlh-editor-option-item"><input type="checkbox" class="rlh-edit-match-whole" data-field="match_whole_words" ${entry.match_whole_words ? 'checked' : ''}> 全词匹配</label>
            <label class="rlh-editor-option-item"><input type="checkbox" class="rlh-edit-prevent-recursion" data-field="prevent_recursion" ${entry.prevent_recursion ? 'checked' : ''}> 防止递归</label>
            <label class="rlh-editor-option-item"><input type="checkbox" class="rlh-edit-exclude-recursion" data-field="exclude_recursion" ${entry.exclude_recursion ? 'checked' : ''}> 不可被递归</label>
          </div>
        </div>
      </div>
    `;
  };
  const buildRegexEditorHtml = (regexItem) => {
    const destination = regexItem?.destination ?? {};
    const source = regexItem?.source ?? {};
    const findValue = escapeHtml(regexItem?.find_regex ?? '');
    const replaceValue = escapeHtml(regexItem?.replace_string ?? '');
    const minDepthValue = escapeHtml(String(regexItem?.min_depth ?? ''));
    const maxDepthValue = escapeHtml(String(regexItem?.max_depth ?? ''));
    return `
      <div class="rlh-editor-wrapper" data-mode="edit">
        <div class="rlh-editor-field">
          <label>查找正则表达式</label>
          <textarea class="rlh-edit-find" data-field="find_regex">${findValue}</textarea>
        </div>
        <div class="rlh-editor-field">
          <label>替换为</label>
          <textarea class="rlh-edit-replace" data-field="replace_string">${replaceValue}</textarea>
        </div>
        <div class="rlh-editor-group">
          <h5>短暂</h5>
          <div class="rlh-editor-options-row">
            <label class="rlh-editor-option-item"><input type="checkbox" class="rlh-edit-dest-display" data-field="destination.display" ${destination.display ? 'checked' : ''}> 仅格式显示</label>
            <label class="rlh-editor-option-item"><input type="checkbox" class="rlh-edit-dest-prompt" data-field="destination.prompt" ${destination.prompt ? 'checked' : ''}> 仅格式提示词</label>
          </div>
        </div>
        <div class="rlh-editor-group">
          <h5>作用范围</h5>
          <div class="rlh-editor-options-row">
            <label class="rlh-editor-option-item"><input type="checkbox" class="rlh-edit-src-user" data-field="source.user_input" ${source.user_input ? 'checked' : ''}> 用户输入</label>
            <label class="rlh-editor-option-item"><input type="checkbox" class="rlh-edit-src-ai" data-field="source.ai_output" ${source.ai_output ? 'checked' : ''}> AI输出</label>
            <label class="rlh-editor-option-item"><input type="checkbox" class="rlh-edit-src-slash" data-field="source.slash_command" ${source.slash_command ? 'checked' : ''}> 斜杠命令</label>
            <label class="rlh-editor-option-item"><input type="checkbox" class="rlh-edit-src-world" data-field="source.world_info" ${source.world_info ? 'checked' : ''}> 世界书</label>
          </div>
        </div>
        <div class="rlh-editor-group">
          <h5>深度</h5>
          <div class="rlh-depth-inputs">
            <input type="number" class="rlh-edit-depth-min" data-field="min_depth" placeholder="最小深度" value="${minDepthValue}">
            <input type="number" class="rlh-edit-depth-max" data-field="max_depth" placeholder="最大深度" value="${maxDepthValue}">
          </div>
        </div>
      </div>
    `;
  };

  const updateRenameButtonState = ($container, mode) => {
  const $button = $container.find('.rlh-rename-btn').first();
  if (!$button.length) return;
  const $icon = $button.find('i').first();
  if (mode === 'edit') {
    $button.attr('title', '退出编辑模式');
    $button.attr('data-rename-mode', 'exit');
    if ($icon.length) {
      $icon.removeClass('fa-pencil').addClass('fa-eye');
    }
  } else {
    $button.attr('title', '重命名并编辑');
    $button.attr('data-rename-mode', 'rename');
    if ($icon.length) {
      $icon.removeClass('fa-eye').addClass('fa-pencil');
    }
  }
};

  const bindLoreEditorInputs = $content => {
    $content.on('input.rlh change.rlh', 'input, textarea, select, [contenteditable="true"]', handleEditorInput);
    $content.find('.rlh-edit-position').trigger('change');
  };

  const switchLoreEntryMode = (mode, $container, entry, { animate = true, searchTerm } = {}) => {
    const $content = $container.find('.rlh-collapsible-content').first();
    if (!$content.length) return;

    const isViewMode = mode === 'view';
    const normalizedTerm = typeof searchTerm === 'string'
      ? searchTerm
      : ($container.data('searchTerm') || '');

    const html = isViewMode
      ? buildLoreEntryViewerHTML(entry, normalizedTerm)
      : buildLoreEntryEditorHtml(entry);

    if (isViewMode) {
      $container.data('searchTerm', normalizedTerm);
      $container.attr('data-search-term', normalizedTerm);
    }

    $content.stop(true, true);
    $content.off('input.rlh change.rlh');
    $content.html(html);

    $container.attr('data-entry-mode', mode);
    $content.attr('data-entry-mode', mode);
    $container.toggleClass('rlh-editing', !isViewMode);
    updateRenameButtonState($container, mode);

    const $nameSpan = $container.find('.rlh-item-name').first();
    if ($nameSpan.length) {
      if (isViewMode) {
        $nameSpan.show().removeAttr('aria-hidden');
      } else {
        $nameSpan.hide().attr('aria-hidden', 'true');
      }
    }

    const finalize = () => {
      if (!isViewMode) {
        bindLoreEditorInputs($content);
      }
    };

    const animateReveal = done => {
      const el = $content[0];
      if (!el) {
        done();
        return;
      }

      const duration = 280;
      const easeInOut = t => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

      el.style.display = 'block';
      el.style.overflow = 'hidden';
      const startHeight = 0;
      const targetHeight = el.scrollHeight;
      el.style.height = `${startHeight}px`;
      el.style.opacity = '0';

      let startTime = null;
      const step = timestamp => {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / duration, 1);
        const eased = easeInOut(progress);
        const currentHeight = startHeight + (targetHeight - startHeight) * eased;
        el.style.height = `${currentHeight}px`;
        el.style.opacity = String(0.6 + 0.4 * eased);

        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          el.style.height = '';
          el.style.opacity = '';
          el.style.overflow = '';
          done();
        }
      };

      requestAnimationFrame(step);
    };

    if (!$content.is(':visible')) {
      if (animate) {
        animateReveal(finalize);
      } else {
        $content.show();
        finalize();
      }
    } else {
      finalize();
    }
  };

  const renderLoreEntryViewer = ($container, entry, searchTerm, options = {}) => {
    switchLoreEntryMode('view', $container, entry, { ...options, searchTerm });
  };

  const renderLoreEntryEditor = ($container, entry, options = {}) => {
    switchLoreEntryMode('edit', $container, entry, options);
  };
  const renderRegexViewer = ($container, regexItem, searchTerm, { animate = true } = {}) => {
    const $content = $container.find('.rlh-collapsible-content').first();
    if (!$content.length) return;
    const normalizedTerm = typeof searchTerm === 'string' ? searchTerm : '';
    $container.data('searchTerm', normalizedTerm);
    $container.attr('data-search-term', normalizedTerm);
    const viewerHtml = buildRegexViewerHTML(regexItem, normalizedTerm);
    $content.stop(true, true);
    $content.off('input.rlh change.rlh');
    $content.html(viewerHtml);
    $container.attr('data-entry-mode', 'view');
    $content.attr('data-entry-mode', 'view');
    $container.removeClass('rlh-editing');
    updateRenameButtonState($container, 'view');
    const $nameSpan = $container.find('.rlh-item-name').first();
    if ($nameSpan.length) {
      $nameSpan.show().removeAttr('aria-hidden');
    }
    if (!$content.is(':visible')) {
      if (animate) $content.slideDown(200);
      else $content.show();
    }
  };
  const renderRegexEditor = ($container, regexItem, { animate = true } = {}) => {
    const $content = $container.find('.rlh-collapsible-content').first();
    if (!$content.length) return;
    const editorHtml = buildRegexEditorHtml(regexItem);
    $content.stop(true, true);
    $content.off('input.rlh change.rlh');
    const bindInputs = () => {
      $content.on('input.rlh change.rlh', 'input, textarea, select, [contenteditable="true"]', handleEditorInput);
    };
    $content.html(editorHtml);
    $container.attr('data-entry-mode', 'edit');
    $content.attr('data-entry-mode', 'edit');
    $container.addClass('rlh-editing');
    updateRenameButtonState($container, 'edit');
    const $nameSpan = $container.find('.rlh-item-name').first();
    if ($nameSpan.length) {
      $nameSpan.hide().attr('aria-hidden', 'true');
    }
    if (!$content.is(':visible')) {
      if (animate) $content.slideDown(200, bindInputs);
      else {
        $content.show();
        bindInputs();
      }
    } else {
      bindInputs();
    }
  };

  const enterLoreEdit = ($container, options = {}) => {
    const { animate = false, silent = false } = options;
    if (!$container.length) return false;
    if (appState.multiSelectMode) {
      if (!silent) showToast('请先退出多选模式后再编辑。', 'info');
      return false;
    }
    const bookName = $container.data('book-name');
    const entryId = Number($container.data('id'));
    if (!bookName || Number.isNaN(entryId)) return false;
    const entry = safeGetLorebookEntries(bookName).find(e => e.uid === entryId);
    if (!entry) return false;
    renderLoreEntryEditor($container, entry, { animate });
    return true;
  };

  const exitLoreEdit = ($container, options = {}) => {
    const { animate = false } = options;
    if (!$container.length) return false;
    const bookName = $container.data('book-name');
    const entryId = Number($container.data('id'));
    if (!bookName || Number.isNaN(entryId)) return false;
    const entry = safeGetLorebookEntries(bookName).find(e => e.uid === entryId);
    if (!entry) return false;
    const searchTerm = $container.data('searchTerm') || '';
    renderLoreEntryViewer($container, entry, searchTerm, { animate });
    return true;
  };

  const enterRegexEdit = ($container, options = {}) => {
    const { animate = false, silent = false } = options;
    if (!$container.length) return false;
    if (appState.multiSelectMode) {
      if (!silent) showToast('请先退出多选模式后再编辑。', 'info');
      return false;
    }
    const id = $container.data('id');
    const regexItem = findRegexItemById(id);
    if (!regexItem) return false;
    renderRegexEditor($container, regexItem, { animate });
    return true;
  };

  const exitRegexEdit = ($container, options = {}) => {
    const { animate = false } = options;
    if (!$container.length) return false;
    const id = $container.data('id');
    const regexItem = findRegexItemById(id);
    if (!regexItem) return false;
    const searchTerm = $container.data('searchTerm') || '';
    renderRegexViewer($container, regexItem, searchTerm, { animate });
    return true;
  };


  const handleEntryEnterEdit = errorCatched(async event => {
    event.preventDefault();
    event.stopPropagation();
    const $container = $(event.currentTarget).closest('.rlh-item-container');
    enterLoreEdit($container, { animate: false });
  });
  const handleEntryExitEdit = errorCatched(async event => {
    event.preventDefault();
    event.stopPropagation();
    const $container = $(event.currentTarget).closest('.rlh-item-container');
    exitLoreEdit($container, { animate: false });
  });
  const handleRegexEnterEdit = errorCatched(async event => {
    event.preventDefault();
    event.stopPropagation();
    const $container = $(event.currentTarget).closest('.rlh-item-container');
    enterRegexEdit($container, { animate: false });
  });
  const handleRegexExitEdit = errorCatched(async event => {
    event.preventDefault();
    event.stopPropagation();
    const $container = $(event.currentTarget).closest('.rlh-item-container');
    exitRegexEdit($container, { animate: false });
  });
  const handleToggleState = errorCatched(async event => {
  event.stopPropagation();
  const $button = $(event.currentTarget);
  const $elementToSort = $button.closest('.rlh-book-group, .rlh-item-container');
  if ($elementToSort.hasClass('renaming')) return;
  const isEnabling = !$elementToSort.hasClass('enabled');
  const parentList = $elementToSort.parent();
  if ($button.hasClass('rlh-global-toggle')) {
    $button.addClass('rlh-loading');
    try {
      const bookName = $elementToSort.data('book-name');
      const currentBooks = new Set(await TavernAPI.getGlobalWorldbookNames() || []);
      if (isEnabling) currentBooks.add(bookName);
      else currentBooks.delete(bookName);
      await TavernAPI.rebindGlobalWorldbooks(Array.from(currentBooks));
      await TavernAPI.saveSettings();
      const bookState = appState.allLorebooks.find(b => b.name === bookName);
      if (bookState) bookState.enabled = isEnabling;
    } finally {
      $button.removeClass('rlh-loading');
    }
  } else {
    const type = $elementToSort.data('type');
    const id = $elementToSort.data('id');
    if (type === 'lore') {
      const bookName = $elementToSort.data('book-name');
      await updateWorldbookEntries(bookName, [{ uid: Number(id), enabled: isEnabling }]);
      const entry = safeGetLorebookEntries(bookName).find(e => e.uid === Number(id));
      if (entry) entry.enabled = isEnabling;
    } else {
      const allServerRegexes = await TavernAPI.getRegexes();
      const regex = allServerRegexes.find(r => r.id === id);
      if (regex) {
        regex.enabled = isEnabling;
        await TavernAPI.replaceRegexes(allServerRegexes.filter(r => r.source !== 'card'));
        await TavernAPI.saveSettings();
        const localRegex =
          appState.regexes.global.find(r => r.id === id) || appState.regexes.character.find(r => r.id === id);
        if (localRegex) localRegex.enabled = isEnabling;
      }
    }
  }
  showToast(isEnabling ? '已启用' : '已禁用');
  $elementToSort.toggleClass('enabled', isEnabling);
  const items = parentList.children().get();
  items.sort((a, b) => {
    const aEnabled = $(a).hasClass('enabled');
    const bEnabled = $(b).hasClass('enabled');
    if (aEnabled !== bEnabled) return bEnabled - aEnabled;
    const aName = $(a).find('.rlh-item-name').text().trim();
    const bName = $(b).find('.rlh-item-name').text().trim();
    return aName.localeCompare(bName);
  });
  parentList.append(items);
  });
  const handleRename = errorCatched(async event => {
    event.stopPropagation();
    const $button = $(event.currentTarget);
    const $container = $button.closest('.rlh-item-container');
    if (!$container.length) return;

    const type = $container.data('type');
    const isEditing = $container.attr('data-entry-mode') === 'edit';

    if (isEditing) {
      exitRenameMode($container);
      if (type === 'lore') exitLoreEdit($container, { animate: false });
      else exitRegexEdit($container, { animate: false });
      return;
    }

    if (appState.multiSelectMode) {
      showToast('请先退出多选模式后再编辑。', 'info');
      return;
    }

    const $header = $container.find('.rlh-item-header').first();
    const $nameSpan = $header.find('.rlh-item-name').first();
    const oldName = $nameSpan.clone().children().remove().end().text().trim();
    const renameUIHtml = `<div class="rlh-rename-ui"><div class="rlh-rename-input-wrapper"><input type="text" class="rlh-rename-input" value="${escapeHtml(oldName)}" /><button class="rlh-action-btn-icon rlh-rename-save-btn" title="确认"><i class="fa-solid fa-check"></i></button></div></div>`;

    let entered = false;
    if (type === 'lore') entered = enterLoreEdit($container, { animate: false, silent: true });
    else entered = enterRegexEdit($container, { animate: false, silent: true });
    if (!entered) return;

    if (!$header.find('.rlh-rename-ui').length) {
      $container.addClass('renaming');
      $header.append(renameUIHtml);
    }

    $header.find('.rlh-rename-input').focus().select();
  });
  const exitRenameMode = ($container, newName = null) => {
    const $header = $container.find('.rlh-item-header').first();
    const $nameSpan = $header.find('.rlh-item-name').first();
    if (newName) {
      $nameSpan.text(newName);
    }
    $header.find('.rlh-rename-ui').remove();
    if ($nameSpan.length && $container.attr('data-entry-mode') !== 'edit') {
      $nameSpan.show().removeAttr('aria-hidden');
    }
    $container.removeClass('renaming');
  };
  const handleConfirmRename = errorCatched(async event => {
    event.stopPropagation();
    const $container = $(event.currentTarget).closest('.rlh-item-container');
    const type = $container.data('type');
    const exitEditMode = () => {
      if (type === 'lore') {
        exitLoreEdit($container, { animate: false });
      } else {
        exitRegexEdit($container, { animate: false });
      }
    };
    const $input = $container.find('.rlh-rename-input');
    const newName = $input.val().trim();
    const oldName = $container.find('.rlh-item-name').first().text().trim();
    if (!newName || newName === oldName) {
      exitRenameMode($container, oldName);
      exitEditMode();
      return;
    }
    const id = $container.data('id');
    if (type === 'lore') {
      const bookName = $container.data('book-name');
      await updateWorldbookEntries(bookName, [{ uid: Number(id), name: newName }]);
      const entries = [...safeGetLorebookEntries(bookName)];
      const entry = entries.find(e => e.uid === Number(id));
      if (entry) entry.name = newName;
    } else {
      // type === 'regex'
      const allServerRegexes = await TavernAPI.getRegexes();
      const regex = allServerRegexes.find(r => r.id === id);
      if (regex) {
        regex.script_name = newName;
        await TavernAPI.replaceRegexes(allServerRegexes.filter(r => r.source !== 'card'));
        await TavernAPI.saveSettings();
        const localRegex =
          appState.regexes.global.find(r => r.id === id) || appState.regexes.character.find(r => r.id === id);
        if (localRegex) localRegex.script_name = newName;
      }
    }
    exitRenameMode($container, newName);
    exitEditMode();
    showToast('重命名成功');
  });

  const handleRenameKeydown = errorCatched(async event => {
  if (event.key === 'Enter') {
    $(event.currentTarget).siblings('.rlh-rename-save-btn').click();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    const $container = $(event.currentTarget).closest('.rlh-item-container');
    exitRenameMode($container);
  }
  });
  const handleEditorExpandToggle = errorCatched(async event => {
    event.stopPropagation();
    const $button = $(event.currentTarget);
    const $editorWrapper = $button.closest('.rlh-editor-wrapper');
    // 同时处理 textarea 和 contenteditable div，确保功能在两种编辑器中都可用
    const $editors = $editorWrapper.find('textarea, .rlh-edit-content');
    // 通过检查图标的 class 来判断当前状态，实现自包含逻辑
    const isCollapsed = $button.find('i').hasClass('fa-expand');
    if (isCollapsed) {
      // 如果是收缩状态，则展开
      $button.attr('title', '收缩').find('i').removeClass('fa-expand').addClass('fa-compress');
      $editors.each(function () {
        // 自动调整高度以适应内容
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
      });
    } else {
      // 如果是展开状态，则收缩
      $button.attr('title', '展开').find('i').removeClass('fa-compress').addClass('fa-expand');
      $editors.css('height', ''); // 恢复默认高度
    }
  });
  const handleCreateEntry = debounce(errorCatched(async (event) => {
    const $button = $(event.currentTarget);
    const explicitBookName = $button.data('book-name');
    const context = getViewContext();
    const activeBookName = context.activeBookName ?? appState.activeBookName ?? appState.activeCharacterBook ?? appState.chatLorebook ?? '';
    const bookName = explicitBookName || activeBookName;
    if (!bookName) {
      await showModal({ type: 'alert', title: '创建失败', text: '当前没有选中的世界书，无法创建条目。' });
      return;
    }
    // 1. 前端立即响应：创建内存中的临时条目
    const tempEntry = createInMemoryEntry(bookName);
    // 2. 立即渲染新条目到列表顶部并展开
    const $newEntryDom = prependEntry(tempEntry, bookName);
    // 自动触发重命名
    if ($newEntryDom && $newEntryDom.length) {
      const renameButton = $newEntryDom.find('.rlh-rename-btn');
      if (renameButton.length) {
        renameButton.trigger('click');
      }
    }
    try {
      // 3. 异步调用API
      const result = await TavernAPI.createWorldbookEntries(bookName, [{
        name: tempEntry.name,
        enabled: tempEntry.enabled,
        keys: tempEntry.keys,
      }]);
      if (result && result.new_entries && result.new_entries.length > 0) {
        safeSetLorebookEntries(bookName, result.worldbook.map(normalizeWorldbookEntry));
        const serverEntry = result.new_entries[0];
        if (serverEntry) {
          // 4. API成功后，用真实数据更新内存条目和DOM
          updateInMemoryEntry(bookName, tempEntry.uid, serverEntry);
          const $entryDom = $(`#${'rlh-panel'} .rlh-item-container[data-id="${tempEntry.uid}"]`, parentDoc);
          if ($entryDom.length) {
            $entryDom.attr('data-id', serverEntry.uid);
            $entryDom.data('id', serverEntry.uid); // 更新jQuery data
          }
        }
        updateBookSummary(bookName);
        showToast('新条目已创建');
      } else {
        throw new Error('API返回数据格式不正确');
      }
    } catch (error) {
      // 5. API失败后，显示错误并保持前端条目可编辑
      console.error('[RegexLoreHub] Create entry failed:', error);
      showModal({ type: 'alert', title: '创建失败', text: `创建新条目时发生错误，但您仍可编辑当前内容并手动保存。错误: ${error.message}` });
    }
  }), 300);
  const handleDeleteEntry = errorCatched(async event => {
  event.stopPropagation();
  const $item = $(event.currentTarget).closest('.rlh-item-container');
  const bookName = $item.data('book-name');
  const uid = Number($item.data('id'));
  const entryName = $item.find('.rlh-item-name').text().trim();
  try {
    await showModal({ type: 'confirm', title: '确认删除', text: `您确定要删除条目 "${entryName}" 吗？` });
  } catch {
    return;
  }
  const result = await TavernAPI.deleteWorldbookEntries(bookName, [uid]);
  // 使用新的API响应结构
  if (result && result.deleted_entries && result.deleted_entries.length > 0) {
    safeSetLorebookEntries(bookName, result.worldbook.map(normalizeWorldbookEntry));
    updateBookSummary(bookName);
    $item.slideUp(300, () => $item.remove());
    showToast('删除成功');
  } else {
    await showModal({ type: 'alert', title: '删除失败', text: '删除条目时发生错误，请检查控制台。' });
  }
  });
  const handlePositionChange = errorCatched(async event => {
  const $select = $(event.currentTarget);
  const $depthContainer = $select.closest('.rlh-editor-grid').find('.rlh-depth-container');
  if ($select.val().startsWith('at_depth')) {
    $depthContainer.slideDown(200);
  } else {
    $depthContainer.slideUp(200);
  }
  });
  return {
    handleToggleState,
    handleEditorInput,
    renderLoreEntryViewer,
    renderLoreEntryEditor,
    renderRegexViewer,
    renderRegexEditor,
    handleEntryEnterEdit,
    handleEntryExitEdit,
    handleRegexEnterEdit,
    handleRegexExitEdit,
    handleRename,
    handleConfirmRename,
    handleRenameKeydown,
    handleEditorExpandToggle,
    handleCreateEntry,
    handleDeleteEntry,
    handlePositionChange,
  };
}
