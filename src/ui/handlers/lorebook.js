import {
  appState,
  safeGetLorebookEntries,
  safeDeleteLorebookEntries,
  errorCatched,
  showModal,
  showToast,
  showProgressToast,
  get$,
  getParentDoc,
  getParentWin,
  POSITION_MENU_ID,
  POSITION_MENU_BUTTON_ID,
  LOREBOOK_OPTIONS,
} from '../../core.js';

import {
  TavernAPI,
  loadAllData,
  loadLorebookEntriesIfNeeded,
  updateBookSummary,
  updateWorldbookEntries, // 导入新的更新函数
} from '../../dataLayer.js';

import { renderContent, getViewContext } from '../render/index.js';

// --- 世界书事件处理 ---
export function createLorebookHandlers(deps = {}) {
  const $ = deps.$ ?? get$();
  const parentDoc = deps.parentDoc ?? getParentDoc();
  const parentWin = deps.parentWin ?? getParentWin();
  const refreshLorebookData = async (bookName, { showLoading = true } = {}) => {
    const targetName = (bookName ?? '').toString().trim();
    if (!targetName) return;
    const previousLoading = appState.loadingBookName;
    try {
      if (showLoading) {
        appState.loadingBookName = targetName;
        renderContent();
      }
      await loadLorebookEntriesIfNeeded(targetName, true);
    } finally {
      appState.loadingBookName = previousLoading && previousLoading !== targetName ? previousLoading : null;
      renderContent();
    }
  };

  const handleEnterLorebookDetail = errorCatched(async (bookName) => {
    appState.activeView = 'global-lore-detail';
    appState.activeBookName = bookName;

    // 强制显示加载状态，避免竞态条件
    appState.loadingBookName = bookName;
    renderContent(); // 立即渲染以显示加载状态

    await loadLorebookEntriesIfNeeded(bookName);

    appState.loadingBookName = null;
    renderContent(); // 再次渲染以显示加载后的内容
  });


  const handleExitLorebookDetail = errorCatched(async () => {
    appState.activeView = 'global-lore-list';
    appState.activeBookName = null;

    // 重置状态
    appState.selectedItems.clear();
    appState.globalSearch = { term: '', replace: '' };

    // 清空UI输入
    const $searchInput = $(`#${'rlh-global-search-input'}`, parentDoc);
    if ($searchInput.length) {
      $searchInput.val('');
    }

    renderContent();
  });


  const updateLinkedCharacters = errorCatched(async (oldBookName, newBookName, progressToast) => {
  const linkedChars = appState.lorebookUsage.get(oldBookName) || [];
  if (linkedChars.length === 0) return;

  const context = parentWin.SillyTavern.getContext();
  const originalCharId = context.characterId;
  let processedCount = 0;
  const totalCount = linkedChars.length;
  progressToast.update(`正在更新 ${totalCount} 个关联角色... (0/${totalCount})`);

  for (const charName of linkedChars) {
    try {
      // 使用正确的方法获取角色索引
      const charIndex =
        parentWin.Character?.findCharacterIndex?.(charName) ??
        context.characters.findIndex(c => c.name === charName);
      if (charIndex === -1) {
        console.warn(`[RegexLoreHub] Character "${charName}" not found, skipping...`);
        continue;
      }

      console.log(`[RegexLoreHub] Switching to character "${charName}" (index: ${charIndex})`);
      await context.selectCharacterById(charIndex);

      const charBooks = await TavernAPI.getCharWorldbookNames({ name: charName });
      if (!charBooks) {
        console.warn(`[RegexLoreHub] Failed to get worldbooks for character "${charName}"`);
        continue;
      }

      console.log(`[RegexLoreHub] Current worldbooks for "${charName}":`, charBooks);
      let updated = false;
      if (charBooks.primary === oldBookName) {
        console.log(`[RegexLoreHub] Updating primary lorebook from "${oldBookName}" to "${newBookName}"`);
        charBooks.primary = newBookName;
        updated = true;
      }
      if (charBooks.additional) {
        const index = charBooks.additional.indexOf(oldBookName);
        if (index > -1) {
          console.log(
            `[RegexLoreHub] Updating additional lorebook at index ${index} from "${oldBookName}" to "${newBookName}"`,
          );
          charBooks.additional[index] = newBookName;
          updated = true;
        }
      }

      if (updated) {
        console.log(`[RegexLoreHub] Saving updated lorebooks for "${charName}":`, charBooks);
        await TavernAPI.rebindCharWorldbooks(charBooks);
        console.log(`[RegexLoreHub] Successfully updated lorebooks for "${charName}"`);
      } else {
        console.log(`[RegexLoreHub] No updates needed for character "${charName}"`);
      }
    } catch (charError) {
      console.error(`[RegexLoreHub] Failed to update lorebook for character "${charName}":`, charError);
    }
    processedCount++;
    progressToast.update(`正在更新 ${totalCount} 个关联角色... (${processedCount}/${totalCount})`);
  }

  if (context.characterId !== originalCharId) {
    await context.selectCharacterById(originalCharId);
  }
  });



  const handleRenameBook = errorCatched(async event => {
  event.stopPropagation();
  const $trigger = $(event.currentTarget);
  const $bookSource = $trigger.closest('.rlh-book-group, .rlh-detail-view');
  const isDetailView = $bookSource.hasClass('rlh-detail-view');
  const oldName = $bookSource.data('book-name') || appState.activeBookName;
  if (!oldName) return;

  let newName;
  try {
    newName = await showModal({
      type: 'prompt',
      title: '重命名世界书',
      text: '请输入新的世界书名称：',
      value: oldName,
    });
  } catch {
    return; // User cancelled
  }

  newName = newName.trim();
  if (!newName || newName === oldName) {
    return;
  }

  if (appState.allLorebooks.some(b => b.name === newName)) {
    await showModal({ type: 'alert', title: '重命名失败', text: '该名称的世界书已存在，请选择其他名称。' });
    return;
  }

  const linkedCharacters = appState.lorebookUsage.get(oldName) || [];
  const isChatLinked = appState.chatLorebook === oldName;
  const chatCount = isChatLinked ? 1 : 0;
  const totalBindings = linkedCharacters.length + chatCount;

  console.log(
    `[RegexLoreHub] Renaming lorebook "${oldName}" to "${newName}", linked characters:`,
    linkedCharacters,
    'chat linked:',
    isChatLinked,
  );

  let confirmText = `此操作将更新 ${totalBindings} 个绑定关系`;
  if (linkedCharacters.length > 0) {
    confirmText += `，需要临时切换到 ${linkedCharacters.length} 个关联角色卡来更新世界书链接`;
  }
  confirmText += `，期间请勿操作。\n\n`;

  if (linkedCharacters.length > 0) {
    confirmText += `关联角色卡：${linkedCharacters.join(', ')}\n`;
  }
  if (isChatLinked) {
    confirmText += `关联聊天：当前聊天\n`;
  }

  // 在全局世界书页面添加API限制提示
  if (appState.activeTab === 'global-lore') {
    confirmText += `\n⚠️ 重要提示：由于SillyTavern API限制，无法直接列出所有*聊天世界书*绑定。如果此世界书与*聊天*绑定，重命名后需要手动检查那些聊天绑定状态。\n`;
  }

  confirmText += `\n是否继续？`;

  try {
    await showModal({
      type: 'confirm',
      title: '确认重命名',
      text: confirmText,
    });
  } catch {
    return; // User cancelled
  }

  const progressToast = showProgressToast('开始重命名...');
  try {
    progressToast.update('正在创建新世界书...');
    const createSuccess = await TavernAPI.createWorldbook(newName);
    if (!createSuccess) {
      throw new Error('创建新世界书文件失败。');
    }

    const oldEntries = [...safeGetLorebookEntries(oldName)];
    if (oldEntries.length > 0) {
      progressToast.update('正在复制条目...');
      const entriesToCreate = oldEntries.map(entry => {
        const newEntry = { ...entry };
        delete newEntry.uid;
        return newEntry;
      });
      await TavernAPI.createWorldbookEntries(newName, entriesToCreate);
    }

    await updateLinkedCharacters(oldName, newName, progressToast);

    progressToast.update('正在更新全局设置...');
    const enabledGlobalBooks = await TavernAPI.getGlobalWorldbookNames();
    if (enabledGlobalBooks && enabledGlobalBooks.includes(oldName)) {
      const newGlobalBooks = enabledGlobalBooks.map(name =>
        name === oldName ? newName : name,
      );
      await TavernAPI.rebindGlobalWorldbooks(newGlobalBooks);
      console.log(`[RegexLoreHub] Updated global lorebook settings from "${oldName}" to "${newName}"`);

      // 验证全局设置更新是否成功
      const updatedGlobalBooks = await TavernAPI.getGlobalWorldbookNames();
      if (
        !updatedGlobalBooks ||
        !updatedGlobalBooks.includes(newName)
      ) {
        console.warn(`[RegexLoreHub] Global lorebook settings update verification failed for "${newName}"`);
      }
    }

    if (appState.chatLorebook === oldName) {
      progressToast.update('正在更新聊天绑定...');
      await TavernAPI.rebindChatWorldbook(newName);
      appState.chatLorebook = newName;
      console.log(`[RegexLoreHub] Updated chat lorebook from "${oldName}" to "${newName}"`);

      // 立即验证聊天世界书更新是否成功
      try {
        const updatedChatLorebook = await TavernAPI.getChatWorldbookName();
        if (updatedChatLorebook !== newName) {
          console.warn(
            `[RegexLoreHub] Chat lorebook update verification failed. Expected: "${newName}", Got: "${updatedChatLorebook}"`,
          );
          appState.chatLorebook = updatedChatLorebook;
        }
      } catch (verifyError) {
        console.warn('[RegexLoreHub] Failed to verify chat lorebook update:', verifyError);
      }
    }

    progressToast.update('正在更新内部映射...');
    // 更新 lorebookUsage 映射
    if (appState.lorebookUsage.has(oldName)) {
      const linkedChars = appState.lorebookUsage.get(oldName);
      appState.lorebookUsage.delete(oldName);
      appState.lorebookUsage.set(newName, linkedChars);
      console.log(`[RegexLoreHub] Updated lorebookUsage mapping from "${oldName}" to "${newName}"`);
    }

    progressToast.update('正在删除旧世界书...');
    await TavernAPI.deleteWorldbook(oldName);

    progressToast.update('正在刷新数据...');
    // 保存当前聊天世界书状态，防止在数据刷新时丢失
    const currentChatLorebook = appState.chatLorebook;
    await loadAllData(true);

    // 如果聊天世界书在刷新后发生了意外变化，恢复正确的状态
    if (currentChatLorebook && appState.chatLorebook !== currentChatLorebook) {
      console.log(`[RegexLoreHub] Restoring chat lorebook state after data refresh: "${currentChatLorebook}"`);
      appState.chatLorebook = currentChatLorebook;
    }

    // 强制同步聊天世界书状态，确保在所有页面都能正确反映最新状态
    try {
      // 检查是否有活跃的聊天
      const context = parentWin.SillyTavern.getContext() || {};
      const hasActiveChat = context.chatId !== undefined && context.chatId !== null;

      if (hasActiveChat) {
        const finalChatLorebook = await TavernAPI.getChatWorldbookName();
        if (finalChatLorebook !== appState.chatLorebook) {
          console.log(`[RegexLoreHub] Final chat lorebook sync: "${finalChatLorebook}"`);
          appState.chatLorebook = finalChatLorebook;
        }
      }
    } catch (syncError) {
      console.warn('[RegexLoreHub] Failed to sync final chat lorebook state:', syncError);
    }

    progressToast.remove();
    showToast('世界书重命名成功');
    if (isDetailView) {
      await handleEnterLorebookDetail(newName);
    } else {
      renderContent();
    }
  } catch (error) {
    progressToast.remove();
    console.error('[RegexLoreHub] Rename failed:', error);
    await showModal({ type: 'alert', title: '重命名失败', text: `操作失败: ${error.message}` });
    // Attempt to clean up the newly created book if rename fails midway
    if (appState.allLorebooks.some(b => b.name === newName)) {
      await TavernAPI.deleteWorldbook(newName);
    }

    // 保存当前聊天世界书状态，防止在错误恢复时丢失
    const currentChatLorebook = appState.chatLorebook;
    await loadAllData(true);

    // 恢复聊天世界书状态（如果在错误处理过程中被意外更改）
    if (currentChatLorebook && appState.chatLorebook !== currentChatLorebook) {
      console.log(`[RegexLoreHub] Restoring chat lorebook state after error recovery: "${currentChatLorebook}"`);
      appState.chatLorebook = currentChatLorebook;
    }

    // 在错误恢复后也强制同步聊天世界书状态
    try {
      // 检查是否有活跃的聊天
      const context = parentWin.SillyTavern.getContext() || {};
      const hasActiveChat = context.chatId !== undefined && context.chatId !== null;

      if (hasActiveChat) {
        const finalChatLorebook = await TavernAPI.getChatWorldbookName();
        if (finalChatLorebook !== appState.chatLorebook) {
          console.log(`[RegexLoreHub] Final chat lorebook sync after error recovery: "${finalChatLorebook}"`);
          appState.chatLorebook = finalChatLorebook;
        }
      }
    } catch (syncError) {
      console.warn('[RegexLoreHub] Failed to sync chat lorebook state after error recovery:', syncError);
    }
  }
  });



  const handleCreateLorebook = errorCatched(async (event, previousValue = '') => {
    let newName;
    try {
      newName = await showModal({
        type: 'prompt',
        title: '新建世界书',
        text: '请输入新世界书的名称:',
        value: previousValue,
      });
    } catch {
      return; // 用户取消
    }

    newName = newName.trim();
    if (!newName) {
      return;
    }

    if (appState.allLorebooks.some(book => book.name === newName)) {
      await showModal({ type: 'alert', title: '错误', text: '已存在同名世界书。' });
      // 重新打开输入框并保留用户输入
      return handleCreateLorebook(event, newName);
    }

    const $button = event ? $(event.currentTarget) : null;
    if ($button) {
      $button.prop('disabled', true).addClass('rlh-loading');
    }

    try {
      const success = await TavernAPI.createWorldbook(newName);
      if (success) {
        // 关键优化：手动更新状态，避免全局刷新
        appState.allLorebooks.push({
          name: newName,
          enabled: false,
          entryCount: 0,
          enabledEntryCount: 0,
          entriesLoaded: true, // 新书没有条目，可视为已加载
        });

        // 直接进入新创建的世界书详情页
        await handleEnterLorebookDetail(newName);
      } else {
        await showModal({ type: 'alert', title: '创建失败', text: '创建世界书时发生错误，请检查控制台。' });
      }
    } finally {
      if ($button) {
        $button.prop('disabled', false).removeClass('rlh-loading');
      }
    }
  });



  const handleDeleteLorebook = errorCatched(async event => {
  event.stopPropagation();
  const $trigger = $(event.currentTarget);
  const $bookSource = $trigger.closest('.rlh-book-group, .rlh-detail-view');
  const bookName = $bookSource.data('book-name') || appState.activeBookName;
  if (!bookName) return;
  const isDetailView = $bookSource.hasClass('rlh-detail-view');
  try {
    await showModal({
      type: 'confirm',
      title: '确认删除',
      text: `您确定要永久删除世界书 "${bookName}" 吗？此操作无法撤销。`,
    });
  } catch {
    return;
  }

  const success = await TavernAPI.deleteWorldbook(bookName);
  if (success) {
    appState.allLorebooks = appState.allLorebooks.filter(b => b.name !== bookName);
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
    if (isDetailView) {
      await handleExitLorebookDetail();
    } else {
      renderContent();
    }
    showToast('删除成功');
  } else {
    await showModal({ type: 'alert', title: '删除失败', text: '删除世界书时发生错误，请检查控制台。' });
  }
  });



  const handleBatchSetRecursion = errorCatched(async event => {
  const $trigger = $(event.currentTarget);
  const rawDatasetName = ($trigger.data('book-name') ?? '').toString().trim();
  const context = getViewContext();
  const fallbackNames = [
    rawDatasetName,
    context?.activeBookName ?? '',
    appState.activeBookName ?? '',
    appState.activeCharacterBook ?? '',
    appState.chatLorebook ?? '',
  ];
  const bookName = fallbackNames.find(name => typeof name === 'string' && name.trim().length > 0)?.trim() ?? '';

  if (!bookName) {
    await showModal({ type: 'alert', title: '提示', text: '请先选择或打开一个世界书。' });
    return;
  }

  let entries = [...safeGetLorebookEntries(bookName)];
  if (!entries || entries.length === 0) {
    await loadLorebookEntriesIfNeeded(bookName);
    entries = [...safeGetLorebookEntries(bookName)];
  }

  if (!entries || entries.length === 0) {
    await showModal({ type: 'alert', title: '提示', text: '该世界书没有条目可操作。' });
    return;
  }

  try {
    await showModal({
      type: 'confirm',
      title: '确认操作',
      text: `确定要为 "${bookName}" 中的所有条目开启“防止递归”和“不可被递归”吗？此操作会阻止世界书条目彼此触发。`,
    });
  } catch {
    return; // 用户取消
  }

  const updates = entries.map(entry => ({
    uid: entry.uid,
    prevent_recursion: true,
    exclude_recursion: true,
  }));

  await updateWorldbookEntries(bookName, updates);

  // 更新本地状态
  entries.forEach(entry => {
    entry.prevent_recursion = true;
    entry.exclude_recursion = true;
    if (!entry.recursion || typeof entry.recursion !== 'object') {
      entry.recursion = {};
    }
    entry.recursion.prevent_outgoing = true;
    entry.recursion.prevent_incoming = true;
  });

  // 如果有打开的编辑器，则更新其中的复选框
  updates.forEach(update => {
    const $openEditor = $(
      `#${'rlh-panel'}-content .rlh-item-container[data-book-name="${bookName}"][data-id="${update.uid}"] .rlh-collapsible-content:visible`,
      parentDoc,
    );
    if ($openEditor.length) {
      $openEditor.find('.rlh-edit-prevent-recursion').prop('checked', true);
      $openEditor.find('.rlh-edit-exclude-recursion').prop('checked', true);
    }
  });

  showToast('已为所有条目开启“防止递归”和“不可被递归”');

  await refreshLorebookData(bookName);
  });



  const handleFixKeywords = errorCatched(async event => {
  const $trigger = $(event.currentTarget);
  const rawDatasetName = ($trigger.data('book-name') ?? '').toString().trim();
  const context = getViewContext();
  const fallbackNames = [
    rawDatasetName,
    context?.activeBookName ?? '',
    appState.activeBookName ?? '',
    appState.activeCharacterBook ?? '',
    appState.chatLorebook ?? '',
  ];
  const bookName = fallbackNames.find(name => typeof name === 'string' && name.trim().length > 0)?.trim() ?? '';

  if (!bookName) {
    await showModal({ type: 'alert', title: '提示', text: '请先选择或打开一个世界书。' });
    return;
  }

  let entries = [...safeGetLorebookEntries(bookName)];
  if (!entries || entries.length === 0) {
    await loadLorebookEntriesIfNeeded(bookName);
    entries = [...safeGetLorebookEntries(bookName)];
  }

  if (!entries || entries.length === 0) {
    await showModal({ type: 'alert', title: '提示', text: '该世界书没有条目可操作。' });
    return;
  }

  try {
    await showModal({
      type: 'confirm',
      title: '确认操作',
      text: `确定要为 "${bookName}" 中的所有条目修复关键词（将中文逗号替换为英文逗号）吗？`,
    });
  } catch {
    return; // 用户取消
  }

  let changedCount = 0;
  const updates = entries
    .map(entry => {
      const originalKeysString = (entry.keys || []).join(', ');
      // 修复中文逗号和多余的空格
      const newKeysString = originalKeysString.replace(/，/g, ',').replace(/,+/g, ',').trim();
      const newKeysArray = newKeysString
        .split(',')
        .map(k => k.trim())
        .filter(Boolean);
      const finalKeysString = newKeysArray.join(', ');

      if (originalKeysString !== finalKeysString) {
        changedCount++;
        return {
          uid: entry.uid,
          keys: newKeysArray,
        };
      }
      return null;
    })
    .filter(Boolean);

  if (updates.length > 0) {
    await updateWorldbookEntries(bookName, updates);

    // 更新本地状态
    updates.forEach(update => {
      const entry = entries.find(e => e.uid === update.uid);
      if (entry) {
        entry.keys = update.keys;
      }
    });

    // 如果有打开的编辑器，则更新其中的输入框
    updates.forEach(update => {
      const $openEditor = $(
        `#${'rlh-panel'}-content .rlh-item-container[data-book-name="${bookName}"][data-id="${update.uid}"] .rlh-collapsible-content:visible`,
        parentDoc,
      );
      if ($openEditor.length) {
        $openEditor.find('.rlh-edit-keys').val(update.keys.join(', '));
      }
    });

    showToast(`成功修复了 ${changedCount} 个条目的关键词`);

    await refreshLorebookData(bookName);
  } else {
    await showModal({ type: 'alert', title: '提示', text: '所有条目的关键词格式都正确，无需修复。' });
  }
  });



  const applyUnifiedPosition = errorCatched(async ({ bookName, positionValue }) => {
    const targetPosition = (positionValue ?? '').toString().trim();
    if (!targetPosition) return;

    const context = getViewContext();
    const fallbackNames = [
      bookName,
      context?.activeBookName ?? '',
      appState.activeBookName ?? '',
      appState.activeCharacterBook ?? '',
      appState.chatLorebook ?? '',
    ];
    const resolvedBookName =
      fallbackNames.find(name => typeof name === 'string' && name.trim().length > 0)?.trim() ?? '';

    if (!resolvedBookName) {
      await showModal({ type: 'alert', title: '提示', text: '请先选择或打开一个世界书。' });
      return;
    }

    let entries = [...safeGetLorebookEntries(resolvedBookName)];
    if (!entries.length) {
      await loadLorebookEntriesIfNeeded(resolvedBookName);
      entries = [...safeGetLorebookEntries(resolvedBookName)];
    }

    if (!entries.length) {
      await showModal({ type: 'alert', title: '提示', text: '该世界书没有条目可操作。' });
      return;
    }

    const isEntryMultiSelect = appState.multiSelectMode && appState.multiSelectTarget === 'entry';
    let targetEntries = entries;
    if (isEntryMultiSelect) {
      const selectionPrefix = `lore:${resolvedBookName}:`;
      const selectedUidSet = new Set();
      appState.selectedItems.forEach(key => {
        if (typeof key !== 'string' || !key.startsWith(selectionPrefix)) return;
        const rawId = key.slice(selectionPrefix.length);
        const numericId = Number(rawId);
        if (Number.isFinite(numericId)) selectedUidSet.add(numericId);
      });
      if (selectedUidSet.size === 0) {
        await showModal({ type: 'alert', title: '提示', text: '已开启多选，请先勾选要统一位置的条目。' });
        return;
      }
      targetEntries = entries.filter(entry => selectedUidSet.has(Number(entry?.uid)));
      if (!targetEntries.length) {
        await showModal({ type: 'alert', title: '提示', text: '未能匹配到已选择的条目，请重新选择后再试。' });
        return;
      }
    }

    const optionLabel = LOREBOOK_OPTIONS.position?.[targetPosition] ?? targetPosition;

    const updates = targetEntries
      .filter(entry => (entry?.position ?? '').toString() !== targetPosition)
      .map(entry => ({ uid: entry.uid, position: targetPosition }));

    if (!updates.length) {
      const scopeLabel = isEntryMultiSelect ? '所选条目' : '所有条目';
      await showModal({ type: 'alert', title: '提示', text: `${scopeLabel}的位置已经是「${optionLabel}」。` });
      return;
    }

    try {
      const targetCount = targetEntries.length;
      const scopeLabel = isEntryMultiSelect ? '选中的条目' : `"${resolvedBookName}" 中的条目`;
      await showModal({
        type: 'confirm',
        title: '确认操作',
        text: `确定要将 ${scopeLabel}（共 ${targetCount} 个）设置为「${optionLabel}」吗？`,
      });
    } catch {
      return;
    }

    await updateWorldbookEntries(resolvedBookName, updates);

    const refreshedEntries = safeGetLorebookEntries(resolvedBookName);
    const uniquePositions = new Set(
      refreshedEntries.map(entry => (entry?.position ?? 'before_character_definition').toString()),
    );
    const unifiedPosition = uniquePositions.size === 1 ? uniquePositions.values().next().value : null;

    updates.forEach(update => {
      const selector = `#${'rlh-panel'}-content .rlh-item-container[data-book-name="${resolvedBookName}"][data-id="${update.uid}"]`;
      const $container = $(selector, parentDoc);
      if ($container.length) {
        const $positionSelect = $container.find('.rlh-edit-position');
        if ($positionSelect.length) {
          $positionSelect.val(targetPosition).trigger('change');
        }
      }
    });

    const $menu = $(`#${POSITION_MENU_ID}`, parentDoc);
    if ($menu.length) {
      $menu.attr('data-book-name', resolvedBookName);
      const $button = $(`#${POSITION_MENU_BUTTON_ID}`, parentDoc);
      if ($button.length) {
        $button.removeAttr('disabled');
        $button.attr('data-book-name', resolvedBookName);
      }
      const $options = $menu.find('.rlh-position-option');
      $options.each(function () {
        const $option = $(this);
        const value = ($option.data('position-value') ?? '').toString();
        const isActive = unifiedPosition && value === unifiedPosition;
        $option.toggleClass('active', isActive);
        $option.attr('aria-selected', isActive ? 'true' : 'false');
        $option.attr('data-book-name', resolvedBookName);
      });
    }

    showToast(`已更新 ${updates.length} 个条目的位置为「${optionLabel}」`);

    await refreshLorebookData(resolvedBookName);
  });



  const handleCreateChatLorebook = errorCatched(async () => {
  const bookName = await TavernAPI.getOrCreateChatWorldbook();
  if (bookName) {
    showToast(`已创建并绑定聊天世界书: ${bookName}`);
    await loadAllData(true);
  } else {
    await showModal({ type: 'alert', title: '操作失败', text: '无法创建或绑定聊天世界书，请检查控制台。' });
  }
  });


  const handleUnlinkChatLorebook = errorCatched(async () => {
  const bookName = appState.chatLorebook;
  if (!bookName) return;

  try {
    await showModal({
      type: 'confirm',
      title: '确认解除绑定',
      text: `您确定要解除与聊天世界书 "${bookName}" 的绑定吗？世界书本身不会被删除。`,
    });
  } catch {
    return; // 用户取消
  }

  await TavernAPI.rebindChatWorldbook(null);
  appState.chatLorebook = null;
  showToast('已解除绑定');
  renderContent();
  });


  const handleRefreshLorebookDetail = errorCatched(async () => {
    const bookName = appState.activeBookName;
    if (!bookName) return;

    appState.loadingBookName = bookName;
    renderContent();

    await loadLorebookEntriesIfNeeded(bookName, true); // 强制刷新

    appState.loadingBookName = null;
    renderContent();
  });


  return {
    handleEnterLorebookDetail,
    handleExitLorebookDetail,
    handleRefreshLorebookDetail,
    handleCreateLorebook,
    handleDeleteLorebook,
    handleRenameBook,
    handleBatchSetRecursion,
    handleFixKeywords,
    applyUnifiedPosition,
    handleCreateChatLorebook,
    handleUnlinkChatLorebook,
  };
}
