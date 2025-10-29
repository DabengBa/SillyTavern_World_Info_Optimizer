import {
  appState,
  errorCatched,
  get$,
  getParentWin,
} from '../../core.js';
import { saveAllChanges, updateRegexOrderMetadata } from '../../dataLayer.js';
import { createItemElement, getActiveSortMode, getActiveCollapseState, matchRegex } from './shared.js';

const sortRegexEntries = (entries, sortMode) => {
  const list = Array.isArray(entries) ? [...entries] : [];
  if (sortMode === 'status') {
    return list.sort((a, b) => {
      const diff = Number(b.enabled) - Number(a.enabled);
      if (diff !== 0) return diff;
      return (a.script_name || '').localeCompare(b.script_name || '', 'zh');
    });
  }
  if (sortMode === 'name') {
    return list.sort((a, b) => (a.script_name || '').localeCompare(b.script_name || '', 'zh'));
  }
  return list;
};

export const getRegexMatches = (searchTerm, caseSensitive = false) => {
  const matches = [];
  const stats = { name: 0, content: 0 };
  if (!searchTerm) return { matches, stats };

  const scripts = [...appState.regexes.global, ...appState.regexes.character];
  const flags = caseSensitive ? '' : 'i';
  const searchRegex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\/\\]/g, '\\$&'), flags);

  const matchedScriptsForName = new Set();
  const matchedScriptsForContent = new Set();
  const addedScripts = new Set();

  for (const script of scripts) {
    let hasMatch = false;
    if (searchRegex.test(script.script_name || '')) {
      matchedScriptsForName.add(script.script_name);
      hasMatch = true;
    }

    const contentToSearch = `${script.find_regex || ''} ${script.replace_string || ''}`;
    if (searchRegex.test(contentToSearch)) {
      matchedScriptsForContent.add(script.script_name);
      hasMatch = true;
    }

    if (hasMatch && !addedScripts.has(script.id)) {
      matches.push(script);
      addedScripts.add(script.id);
    }
  }

  stats.name = matchedScriptsForName.size;
  stats.content = matchedScriptsForContent.size;

  return { matches, stats };
};

export const renderRegexView = (context, itemList, searchTerm, $container, title) => {
  const $ = get$();
  const parentWin = getParentWin();
  const sortMode = getActiveSortMode(context);
  const collapseState = getActiveCollapseState(context);
  const items = sortRegexEntries(itemList ?? [], sortMode);
  const label = title ?? (context.id === 'char-regex' ? '角色正则' : '全局正则');

  if (context.id === 'char-regex') {
    const hostContext = parentWin.SillyTavern?.getContext?.() || {};
    const hasActiveCharacter = hostContext.characterId !== undefined && hostContext.characterId !== null;
    if (!hasActiveCharacter) {
      $container.html('<p class="rlh-info-text">请先加载一个角色以管理角色正则。</p>');
      return;
    }
  }

  if (!items.length) {
    $container.html(`<p class="rlh-info-text">没有${label}。点击同步按钮刷新。</p>`);
    return;
  }

  const filteredItems = searchTerm ? items.filter(item => matchRegex(item, searchTerm)) : items;

  if (!filteredItems.length) {
    $container.html(`<p class="rlh-info-text">没有匹配的${label}。</p>`);
    return;
  }

  const listId = `rlh-regex-list-${context.id}`;
  const $listContainer = $(`<div id="${listId}" class="rlh-regex-list"></div>`);
  $container.append($listContainer);

  const canReorder = !searchTerm;

  filteredItems.forEach((item, index) => {
    const $element = createItemElement(item, 'regex', '', searchTerm, {
      collapseState,
      enableDrag: canReorder,
    });
    $element.find('.rlh-item-name').prepend(`<span class="rlh-order-indicator">#${index + 1}</span> `);
    $listContainer.append($element);
  });

  const listEl = $listContainer[0];
  const dragNoticeClass = 'rlh-drag-disabled-banner';
  $container.find(`.${dragNoticeClass}`).remove();

  if (canReorder && appState.isDragSortDisabled) {
    $listContainer.attr('data-drag-disabled', 'true');
    $container.prepend(
      `<p class="rlh-info-text-small ${dragNoticeClass}">提示：拖拽排序功能暂时不可用，请使用按钮调整顺序。</p>`,
    );
  } else {
    $listContainer.removeAttr('data-drag-disabled');
  }

  if (canReorder && !appState.isDragSortDisabled && listEl && parentWin.Sortable) {
    const sortable = parentWin.Sortable.create(listEl, {
      animation: 150,
      handle: '.rlh-drag-handle',
      forceFallback: true,
      fallbackOnBody: true,
      fallbackTolerance: 6,
      delayOnTouchOnly: true,
      touchStartThreshold: 8,
      fallbackClass: 'rlh-sorting-fallback',
      onStart: () => {
        $listContainer.addClass('sorting-active');
      },
      onEnd: errorCatched(async evt => {
        $listContainer.removeClass('sorting-active');
        const { oldIndex, newIndex } = evt;
        if (oldIndex === newIndex) return;

        const scope = context.id === 'global-regex' ? 'global' : 'character';
        const targetList = appState.regexes[scope];
        if (!Array.isArray(targetList)) return;

        const [moved] = targetList.splice(oldIndex, 1);
        if (!moved) return;
        targetList.splice(newIndex, 0, moved);
        updateRegexOrderMetadata(targetList);

        if (!(appState.pendingRegexUpdates instanceof Set)) {
          appState.pendingRegexUpdates = new Set();
        }
        appState.pendingRegexUpdates.add(scope);

        await saveAllChanges({ silent: true });
        $container.empty();
        renderRegexView(context, targetList, searchTerm, $container, title);
      }, 'RegexLoreHub.RegexSortable'),
    });
  }
};
