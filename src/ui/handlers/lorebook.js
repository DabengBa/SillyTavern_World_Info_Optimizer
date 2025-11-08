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
  escapeHtml,
  decodeSelectionPart,
  buildLoreSelectionPrefix,
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


  const updateLinkedCharacters = async (oldBookName, newBookName, progressToast, attemptInfo = {}) => {
    const linkedChars = appState.lorebookUsage.get(oldBookName) || [];
    if (linkedChars.length === 0) return;

    const context = parentWin.SillyTavern.getContext();
    const originalCharId = context.characterId;
    let processedCount = 0;
    const totalCount = linkedChars.length;
    const { currentAttempt = 1, totalAttempts = 1 } = attemptInfo;
    progressToast?.update?.(
      `正在更新 ${totalCount} 个关联角色... (${processedCount}/${totalCount})（尝试 ${currentAttempt}/${totalAttempts}）`,
    );

    const failedCharacters = [];

    try {
      for (const charName of linkedChars) {
        try {
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
            failedCharacters.push({ name: charName, error: new Error('无法获取世界书列表') });
            continue;
          }

          console.log(`[RegexLoreHub] Current worldbooks for "${charName}":`, charBooks);
          let updated = false;
          if (charBooks.primary === oldBookName) {
            console.log(`[RegexLoreHub] Updating primary lorebook from "${oldBookName}" to "${newBookName}"`);
            charBooks.primary = newBookName;
            updated = true;
          }
          if (Array.isArray(charBooks.additional)) {
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
          failedCharacters.push({ name: charName, error: charError });
        }
        processedCount++;
        progressToast?.update?.(
          `正在更新 ${totalCount} 个关联角色... (${processedCount}/${totalCount})（尝试 ${currentAttempt}/${totalAttempts}）`,
        );
      }
    } finally {
      if (context.characterId !== originalCharId) {
        await context.selectCharacterById(originalCharId);
      }
    }

    if (failedCharacters.length > 0) {
      const names = failedCharacters.map(item => item.name).join(', ');
      const aggregatedError = new Error(`以下角色的世界书绑定未成功更新：${names}`);
      aggregatedError.details = failedCharacters;
      throw aggregatedError;
    }
  };



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
      return;
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
      return;
    }

    const RETRY_SETTINGS = { maxAttempts: 3, delayMs: 600 };
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const cleanupTasks = [];
    const registerCleanupTask = (description, action) => {
      const task = {
        id: `cleanup-${cleanupTasks.length + 1}`,
        description,
        action,
        status: 'pending',
        lastError: null,
      };
      cleanupTasks.push(task);
      return task;
    };
    const getStatusText = status => {
      if (status === 'success') return '已完成';
      if (status === 'failed') return '失败';
      if (status === 'running') return '执行中';
      return '待执行';
    };
    const runCleanupTasks = async (onlyFailed = false) => {
      for (const task of cleanupTasks) {
        if (onlyFailed && task.status === 'success') continue;
        try {
          task.status = 'running';
          await task.action();
          task.status = 'success';
          task.lastError = null;
        } catch (taskError) {
          task.status = 'failed';
          task.lastError = taskError;
        }
      }
    };
    const buildCleanupModalHtml = errorMessage => {
      const tasksHtml = cleanupTasks.length
        ? `<ul class="rlh-cleanup-task-list">${cleanupTasks
            .map(
              task =>
                `<li class="rlh-cleanup-task" data-task-id="${task.id}" data-status="${task.status}">
                  <span class="rlh-cleanup-task-title">${escapeHtml(task.description)}</span>
                  <span class="rlh-cleanup-task-status">${escapeHtml(getStatusText(task.status))}</span>
                  ${
                    task.lastError
                      ? `<div class="rlh-cleanup-task-error">${escapeHtml(task.lastError.message ?? String(task.lastError))}</div>`
                      : ''
                  }
                </li>`,
            )
            .join('')}</ul>`
        : '<p class="rlh-cleanup-empty">没有需要执行的清理任务。</p>';
      return `
        <div class="rlh-cleanup-modal">
          <p class="rlh-cleanup-error">${escapeHtml(errorMessage)}</p>
          ${tasksHtml}
          ${
            cleanupTasks.length
              ? '<button type="button" class="rlh-modal-btn rlh-cleanup-retry">重试清理</button>'
              : ''
          }
          <p class="rlh-cleanup-hint">如清理多次失败，请查看控制台或在 SillyTavern 中手动恢复。</p>
        </div>
      `;
    };
    const presentCleanupModal = async errorMessage => {
      const modalPromise = showModal({
        type: 'alert',
        title: '重命名失败',
        html: buildCleanupModalHtml(errorMessage),
      });
      setTimeout(() => {
        const $overlay = $('.rlh-modal-overlay', parentDoc).last();
        if ($overlay.length === 0) return;
        const refreshList = () => {
          cleanupTasks.forEach(task => {
            const $item = $overlay.find(`[data-task-id="${task.id}"]`);
            if ($item.length === 0) return;
            $item.attr('data-status', task.status);
            $item.find('.rlh-cleanup-task-status').text(getStatusText(task.status));
            const $error = $item.find('.rlh-cleanup-task-error');
            if (task.lastError) {
              if ($error.length) {
                $error.text(task.lastError.message ?? String(task.lastError));
              } else {
                $item.append(
                  `<div class="rlh-cleanup-task-error">${escapeHtml(task.lastError.message ?? String(task.lastError))}</div>`,
                );
              }
            } else if ($error.length) {
              $error.remove();
            }
          });
        };
        refreshList();
        const $retryBtn = $overlay.find('.rlh-cleanup-retry');
        if ($retryBtn.length) {
          $retryBtn.on('click', async e => {
            e.preventDefault();
            if ($retryBtn.prop('disabled')) return;
            $retryBtn.prop('disabled', true).text('正在重试...');
            await runCleanupTasks(true);
            refreshList();
            $retryBtn.prop('disabled', false).text('重试清理');
          });
        }
      }, 0);
      await modalPromise;
    };
    const retryOperation = async (operation, { description, onAttempt, onError } = {}) => {
      let attempt = 0;
      let lastError;
      while (attempt < RETRY_SETTINGS.maxAttempts) {
        attempt += 1;
        onAttempt?.(attempt, RETRY_SETTINGS.maxAttempts);
        try {
          return await operation(attempt, RETRY_SETTINGS.maxAttempts);
        } catch (error) {
          lastError = error;
          console.warn(`[RegexLoreHub] ${description} 第 ${attempt} 次尝试失败:`, error);
          onError?.(error, attempt, RETRY_SETTINGS.maxAttempts);
          if (attempt >= RETRY_SETTINGS.maxAttempts) break;
          await sleep(RETRY_SETTINGS.delayMs);
        }
      }
      throw lastError ?? new Error(`${description} 失败`);
    };

    const progressToast = showProgressToast('开始重命名...');
    const currentChatLorebook = appState.chatLorebook;
    let globalBooksBeforeUpdate = null;
    let shouldVerifyGlobal = false;
    let shouldVerifyChat = false;

    try {
      progressToast.update('正在创建新世界书...');
      const createSuccess = await TavernAPI.createWorldbook(newName);
      if (!createSuccess) {
        throw new Error('创建新世界书文件失败。');
      }
      registerCleanupTask(`删除新建的世界书 "${newName}"`, async () => {
        const names = (await TavernAPI.getWorldbooks()) ?? [];
        if (!names.includes(newName)) return;
        await TavernAPI.deleteWorldbook(newName);
        const verifyNames = (await TavernAPI.getWorldbooks()) ?? [];
        if (verifyNames.includes(newName)) {
          throw new Error('新世界书仍存在，删除失败。');
        }
      });

      const oldEntries = [...safeGetLorebookEntries(oldName)];
      if (oldEntries.length > 0) {
        const entriesToCreate = oldEntries.map(entry => {
          const newEntry = { ...entry };
          delete newEntry.uid;
          delete newEntry.tempUid;
          delete newEntry.temp_uid;
          return newEntry;
        });
        await retryOperation(
          async () => {
            await TavernAPI.replaceWorldbook(newName, entriesToCreate);
            const createdEntries = await TavernAPI.getWorldbook(newName);
            const createdCount = Array.isArray(createdEntries) ? createdEntries.length : 0;
            if (createdCount !== entriesToCreate.length) {
              throw new Error(
                `复制条目校验失败（期望 ${entriesToCreate.length} 条，实际 ${createdCount} 条）。`,
              );
            }
          },
          {
            description: '复制条目',
            onAttempt: (attempt, total) => {
              const suffix = attempt > 1 ? `（尝试 ${attempt}/${total}）` : '';
              progressToast.update(`正在复制条目...${suffix}`);
            },
          },
        );
      }

      if (linkedCharacters.length > 0) {
        await retryOperation(
          async (attempt, total) =>
            await updateLinkedCharacters(oldName, newName, progressToast, {
              currentAttempt: attempt,
              totalAttempts: total,
            }),
          {
            description: '更新角色绑定',
            onAttempt: (attempt, total) => {
              const suffix = attempt > 1 ? `（尝试 ${attempt}/${total}）` : '';
              progressToast.update(`正在更新角色绑定...${suffix}`);
            },
          },
        );
        registerCleanupTask(
          `恢复 ${linkedCharacters.length} 个角色的世界书绑定`,
          async () => {
            await updateLinkedCharacters(newName, oldName, null, { currentAttempt: 1, totalAttempts: 1 });
          },
        );
      }

      progressToast.update('正在更新全局设置...');
      const enabledGlobalBooks = await TavernAPI.getGlobalWorldbookNames();
      const globalNeedsUpdate = Array.isArray(enabledGlobalBooks) && enabledGlobalBooks.includes(oldName);
      let targetGlobalBooks = null;
      if (globalNeedsUpdate) {
        globalBooksBeforeUpdate = [...enabledGlobalBooks];
        targetGlobalBooks = globalBooksBeforeUpdate.map(name => (name === oldName ? newName : name));
        await retryOperation(
          async () => {
            await TavernAPI.rebindGlobalWorldbooks(targetGlobalBooks);
            const verifyBooks = await TavernAPI.getGlobalWorldbookNames();
            if (
              !Array.isArray(verifyBooks) ||
              !verifyBooks.includes(newName) ||
              verifyBooks.includes(oldName)
            ) {
              throw new Error('全局世界书列表更新校验失败。');
            }
          },
          {
            description: '更新全局设置',
            onAttempt: (attempt, total) => {
              const suffix = attempt > 1 ? `（尝试 ${attempt}/${total}）` : '';
              progressToast.update(`正在更新全局设置...${suffix}`);
            },
          },
        );
        registerCleanupTask('回滚全局世界书绑定', async () => {
          if (!Array.isArray(globalBooksBeforeUpdate)) return;
          await TavernAPI.rebindGlobalWorldbooks(globalBooksBeforeUpdate);
          const verifyBooks = await TavernAPI.getGlobalWorldbookNames();
          if (
            !Array.isArray(verifyBooks) ||
            verifyBooks.includes(newName) ||
            !verifyBooks.includes(oldName)
          ) {
            throw new Error('全局世界书回滚校验失败。');
          }
        });
        shouldVerifyGlobal = true;
      }

      if (isChatLinked) {
        await retryOperation(
          async () => {
            await TavernAPI.rebindChatWorldbook(newName);
            const verifyChat = await TavernAPI.getChatWorldbookName();
            if (verifyChat !== newName) {
              throw new Error(`聊天世界书仍为 ${verifyChat ?? '未绑定'}`);
            }
          },
          {
            description: '更新聊天绑定',
            onAttempt: (attempt, total) => {
              const suffix = attempt > 1 ? `（尝试 ${attempt}/${total}）` : '';
              progressToast.update(`正在更新聊天绑定...${suffix}`);
            },
          },
        );
        appState.chatLorebook = newName;
        registerCleanupTask('恢复聊天世界书绑定', async () => {
          await TavernAPI.rebindChatWorldbook(oldName);
          const verifyChat = await TavernAPI.getChatWorldbookName();
          if (verifyChat !== oldName) {
            throw new Error(`聊天世界书仍为 ${verifyChat ?? '未绑定'}`);
          }
          appState.chatLorebook = oldName;
        });
        shouldVerifyChat = true;
      }

      progressToast.update('正在更新内部映射...');
      if (appState.lorebookUsage.has(oldName)) {
        const linkedChars = appState.lorebookUsage.get(oldName);
        appState.lorebookUsage.delete(oldName);
        appState.lorebookUsage.set(newName, linkedChars);
        console.log(`[RegexLoreHub] Updated lorebookUsage mapping from "${oldName}" to "${newName}"`);
      }

      await retryOperation(
        async () => {
          await TavernAPI.deleteWorldbook(oldName);
          const names = (await TavernAPI.getWorldbooks()) ?? [];
          if (names.includes(oldName)) {
            throw new Error('旧世界书仍存在，删除失败。');
          }
        },
        {
          description: '删除旧世界书',
          onAttempt: (attempt, total) => {
            const suffix = attempt > 1 ? `（尝试 ${attempt}/${total}）` : '';
            progressToast.update(`正在删除旧世界书...${suffix}`);
          },
        },
      );
      cleanupTasks.length = 0;

      progressToast.update('正在刷新数据...');
      const expectedChatLorebook = appState.chatLorebook;
      await loadAllData(true);

      if (expectedChatLorebook && appState.chatLorebook !== expectedChatLorebook) {
        console.log(`[RegexLoreHub] Restoring chat lorebook state after data refresh: "${expectedChatLorebook}"`);
        appState.chatLorebook = expectedChatLorebook;
      }

      const allBookNames = appState.allLorebooks.map(book => book.name);
      if (!allBookNames.includes(newName)) {
        console.warn(`[RegexLoreHub] 验证失败：刷新后未找到新世界书 "${newName}"。`);
      }
      if (allBookNames.includes(oldName)) {
        console.warn(`[RegexLoreHub] 验证失败：刷新后旧世界书 "${oldName}" 仍然存在。`);
      }

      if (shouldVerifyGlobal) {
        const finalGlobalBooks = await TavernAPI.getGlobalWorldbookNames();
        if (!Array.isArray(finalGlobalBooks) || !finalGlobalBooks.includes(newName)) {
          console.warn(`[RegexLoreHub] 验证失败：全局世界书未包含 "${newName}"。`, finalGlobalBooks);
        }
        if (Array.isArray(finalGlobalBooks) && finalGlobalBooks.includes(oldName)) {
          console.warn(`[RegexLoreHub] 验证失败：全局世界书仍包含 "${oldName}"。`, finalGlobalBooks);
        }
      }

      if (shouldVerifyChat) {
        try {
          const finalChatLorebook = await TavernAPI.getChatWorldbookName();
          if (finalChatLorebook !== newName) {
            console.warn(
              `[RegexLoreHub] 验证失败：聊天世界书未更新为 "${newName}"，当前值 "${finalChatLorebook ?? '未绑定'}"。`,
            );
            appState.chatLorebook = finalChatLorebook;
          }
        } catch (verifyError) {
          console.warn('[RegexLoreHub] 验证聊天世界书状态失败:', verifyError);
        }
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
      if (cleanupTasks.length > 0) {
        await runCleanupTasks();
        await presentCleanupModal(error?.message ?? '重命名过程中发生错误。');
      } else {
        await showModal({
          type: 'alert',
          title: '重命名失败',
          text: `操作失败: ${error?.message ?? '未知错误'}`,
        });
      }

      await loadAllData(true);

      if (currentChatLorebook && appState.chatLorebook !== currentChatLorebook) {
        console.log(`[RegexLoreHub] Restoring chat lorebook state after error recovery: "${currentChatLorebook}"`);
        appState.chatLorebook = currentChatLorebook;
      }

      try {
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
      danger: true,
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
      const selectionPrefix = buildLoreSelectionPrefix(resolvedBookName);
      const selectedUidSet = new Set();
      appState.selectedItems.forEach(key => {
        if (typeof key !== 'string' || !key.startsWith(selectionPrefix)) return;
        const encodedId = key.slice(selectionPrefix.length);
        const decodedId = decodeSelectionPart(encodedId);
        const numericId = Number(decodedId);
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
