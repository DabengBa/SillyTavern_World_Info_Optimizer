"use strict";

// Name: Regex & Lorebook Hub
// Version: 2.7

// 使用IIFE封装，避免全局污染
(() => {
    console.log('[RegexLoreHub Script] Script execution started.');
    function onReady(callback) {
        const domSelector = '#extensionsMenu';
        const maxRetries = 100; // 最多等待20秒
        let retries = 0;
        
        console.log(`[RegexLoreHub] Starting readiness check. Polling for DOM element "${domSelector}" AND core APIs (TavernHelper, jQuery).`);

        const interval = setInterval(() => {
            const parentDoc = window.parent.document;
            const parentWin = window.parent;

            const domReady = parentDoc.querySelector(domSelector) !== null;
            const apiReady = parentWin.TavernHelper && typeof parentWin.TavernHelper.getCharData === 'function' && parentWin.jQuery;

            if (domReady && apiReady) {
                clearInterval(interval);
                console.log(`[RegexLoreHub] SUCCESS: Both DOM ("${domSelector}") and Core APIs are ready. Initializing script.`);
                try {
                    callback(parentWin.jQuery, parentWin.TavernHelper); // 传递父窗口的jQuery和TavernHelper
                } catch (e) {
                    console.error('[RegexLoreHub] FATAL: Error during main callback execution.', e);
                }
            } else {
                retries++;
                if (retries > maxRetries) {
                    clearInterval(interval);
                    console.error(`[RegexLoreHub] FATAL: Readiness check timed out.`);
                    if (!domReady) console.error(`[RegexLoreHub] -> Failure: DOM element "${domSelector}" not found.`);
                    if (!apiReady) console.error(`[RegexLoreHub] -> Failure: Core APIs not available. TavernHelper: ${!!parentWin.TavernHelper}, jQuery: ${!!parentWin.jQuery}`);
                }
            }
        }, 150);
    }

    // 主程序逻辑，接收父窗口的jQuery和TavernHelper
    function main($, TavernHelper) {
        const parentDoc = window.parent.document;

        // --- 配置常量 ---
        const PANEL_ID = 'regex-lore-hub-panel';
        const BUTTON_ID = 'regex-lore-hub-button';
        const BUTTON_ICON_URL = 'https://i.postimg.cc/bY23wb9Y/IMG-20250626-000247.png';
        const BUTTON_TOOLTIP = '世界书＆正则便捷管理';
        const BUTTON_TEXT_IN_MENU = '世界书＆正则便捷管理';
        const SEARCH_INPUT_ID = 'rlh-search-input';
        const REFRESH_BTN_ID = 'rlh-refresh-btn';
        const COLLAPSE_CURRENT_BTN_ID = 'rlh-collapse-current-btn';
        const COLLAPSE_ALL_BTN_ID = 'rlh-collapse-all-btn';
        const CREATE_LOREBOOK_BTN_ID = 'rlh-create-lorebook-btn';

        const LOREBOOK_OPTIONS = {
            position: {
                'before_character_definition': '角色定义前',
                'after_character_definition': '角色定义后',
                'before_example_messages': '聊天示例前',
                'after_example_messages': '聊天示例后',
                'before_author_note': '作者笔记前',
                'after_author_note': '作者笔记后',
                'at_depth_as_system': '@D ⚙ 系统',
                'at_depth_as_assistant': '@D 🗨️ 角色',
                'at_depth_as_user': '@D 👤 用户'
            },
            logic: {
                'and_any': '任一 AND',
                'and_all': '所有 AND',
                'not_any': '任一 NOT',
                'not_all': '所有 NOT'
            }
        };

        // --- 应用程序状态 ---
        const appState = {
            regexes: { global: [], character: [] },
            lorebooks: { character: [] },
            chatLorebook: null, // 新增：用于存储聊天世界书的名称
            allLorebooks: [],
            lorebookEntries: new Map(),
            lorebookUsage: new Map(), // 新增：用于存储世界书 -> 角色的映射
            activeTab: 'global-lore',
            isDataLoaded: false,
            searchFilters: { bookName: true, entryName: true, keywords: true, content: true },
            multiSelectMode: false,
            selectedItems: new Set(),
        };
        
        // --- 帮助函数 ---
        const errorCatched = (fn, context = 'RegexLoreHub') => async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                // Do not show modal for user cancellations (empty error)
                if (error) {
                    console.error(`[${context}] Error:`, error);
                    await showModal({ type: 'alert', title: '脚本异常', text: `操作中发生未知错误，请检查开发者控制台获取详细信息。` });
                }
            }
        };
        // 安全访问 lorebookEntries 的函数
        const safeGetLorebookEntries = (bookName) => {
            try {
                // 检查 appState.lorebookEntries 是否是 Map 对象
                if (!appState.lorebookEntries || !(appState.lorebookEntries instanceof Map)) {
                    console.warn('[RegexLoreHub] appState.lorebookEntries is not a Map, reinitializing...');
                    appState.lorebookEntries = new Map();
                }

                // 检查 get 方法是否存在
                if (typeof appState.lorebookEntries.get !== 'function') {
                    console.warn('[RegexLoreHub] appState.lorebookEntries.get is not a function, reinitializing...');
                    appState.lorebookEntries = new Map();
                }

                // 安全地获取条目
                const entries = appState.lorebookEntries.get(bookName);
                return Array.isArray(entries) ? entries : [];
            } catch (error) {
                console.error('[RegexLoreHub] Error in safeGetLorebookEntries:', error);
                // 重新初始化 Map
                appState.lorebookEntries = new Map();
                return [];
            }
        };

        // 安全设置 lorebookEntries 的函数
        const safeSetLorebookEntries = (bookName, entries) => {
            try {
                // 检查 appState.lorebookEntries 是否是 Map 对象
                if (!appState.lorebookEntries || !(appState.lorebookEntries instanceof Map)) {
                    console.warn('[RegexLoreHub] appState.lorebookEntries is not a Map, reinitializing...');
                    appState.lorebookEntries = new Map();
                }

                // 检查 set 方法是否存在
                if (typeof appState.lorebookEntries.set !== 'function') {
                    console.warn('[RegexLoreHub] appState.lorebookEntries.set is not a function, reinitializing...');
                    appState.lorebookEntries = new Map();
                }

                // 安全地设置条目
                appState.lorebookEntries.set(bookName, Array.isArray(entries) ? entries : []);
            } catch (error) {
                console.error('[RegexLoreHub] Error in safeSetLorebookEntries:', error);
                // 重新初始化 Map
                appState.lorebookEntries = new Map();
                appState.lorebookEntries.set(bookName, Array.isArray(entries) ? entries : []);
            }
        };

        // 安全删除 lorebookEntries 的函数
        const safeDeleteLorebookEntries = (bookName) => {
            try {
                // 检查 appState.lorebookEntries 是否是 Map 对象
                if (!appState.lorebookEntries || !(appState.lorebookEntries instanceof Map)) {
                    console.warn('[RegexLoreHub] appState.lorebookEntries is not a Map, reinitializing...');
                    appState.lorebookEntries = new Map();
                    return;
                }

                // 检查 delete 方法是否存在
                if (typeof appState.lorebookEntries.delete !== 'function') {
                    console.warn('[RegexLoreHub] appState.lorebookEntries.delete is not a function, reinitializing...');
                    appState.lorebookEntries = new Map();
                    return;
                }

                // 安全地删除条目
                appState.lorebookEntries.delete(bookName);
            } catch (error) {
                console.error('[RegexLoreHub] Error in safeDeleteLorebookEntries:', error);
                // 重新初始化 Map
                appState.lorebookEntries = new Map();
            }
        };

        // 安全清空 lorebookEntries 的函数
        const safeClearLorebookEntries = () => {
            try {
                // 检查 appState.lorebookEntries 是否是 Map 对象
                if (!appState.lorebookEntries || !(appState.lorebookEntries instanceof Map)) {
                    console.warn('[RegexLoreHub] appState.lorebookEntries is not a Map, reinitializing...');
                    appState.lorebookEntries = new Map();
                    return;
                }

                // 检查 clear 方法是否存在
                if (typeof appState.lorebookEntries.clear !== 'function') {
                    console.warn('[RegexLoreHub] appState.lorebookEntries.clear is not a function, reinitializing...');
                    appState.lorebookEntries = new Map();
                    return;
                }

                // 安全地清空
                appState.lorebookEntries.clear();
            } catch (error) {
                console.error('[RegexLoreHub] Error in safeClearLorebookEntries:', error);
                // 重新初始化 Map
                appState.lorebookEntries = new Map();
            }
        };

        // 安全检查 lorebookEntries 是否有某个键的函数
        const safeHasLorebookEntries = (bookName) => {
            try {
                // 检查 appState.lorebookEntries 是否是 Map 对象
                if (!appState.lorebookEntries || !(appState.lorebookEntries instanceof Map)) {
                    console.warn('[RegexLoreHub] appState.lorebookEntries is not a Map, reinitializing...');
                    appState.lorebookEntries = new Map();
                    return false;
                }

                // 检查 has 方法是否存在
                if (typeof appState.lorebookEntries.has !== 'function') {
                    console.warn('[RegexLoreHub] appState.lorebookEntries.has is not a function, reinitializing...');
                    appState.lorebookEntries = new Map();
                    return false;
                }

                // 安全地检查是否存在
                return appState.lorebookEntries.has(bookName);
            } catch (error) {
                console.error('[RegexLoreHub] Error in safeHasLorebookEntries:', error);
                // 重新初始化 Map
                appState.lorebookEntries = new Map();
                return false;
            }
        };

        const escapeHtml = (text) => {
            if (typeof text !== 'string') return String(text);
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        };

        // 高亮搜索匹配的文本
        const highlightText = (text, searchTerm) => {
            if (!searchTerm || !text) return escapeHtml(text);
            
            // 先对原文本进行HTML转义
            const escapedText = escapeHtml(text);
            // 对搜索词也进行HTML转义，以便与已转义文本匹配
            const htmlSafeSearchTerm = escapeHtml(searchTerm);
            // 再转义搜索词中的正则特殊字符
            const escapedSearchTerm = htmlSafeSearchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(${escapedSearchTerm})`, 'gi');
            
            // 在转义后的文本上进行高亮处理
            return escapedText.replace(regex, '<mark class="rlh-highlight">$1</mark>');
        };

        const showSuccessTick = (message = '操作成功', duration = 1500) => {
            const $panel = $(`#${PANEL_ID}`, parentDoc);
            if ($panel.length === 0) return;
            // 移除现有的提示，避免重叠
            $panel.find('.rlh-toast-notification').remove();
            
            const toastHtml = `<div class="rlh-toast-notification"><i class="fa-solid fa-check-circle"></i> ${escapeHtml(message)}</div>`;
            const $toast = $(toastHtml);
            
            $panel.append($toast);
            
            // 入场动画
            setTimeout(() => {
                $toast.addClass('visible');
            }, 10);

            // 离场动画
            setTimeout(() => {
                $toast.removeClass('visible');
                setTimeout(() => {
                    $toast.remove();
                }, 300); // 等待CSS过渡完成
            }, duration);
        };

        const showProgressToast = (initialMessage = '正在处理...') => {
            const $panel = $(`#${PANEL_ID}`, parentDoc);
            if ($panel.length === 0) return { update: () => {}, remove: () => {} };

            $panel.find('.rlh-progress-toast').remove();

            const toastHtml = `<div class="rlh-progress-toast"><i class="fa-solid fa-spinner fa-spin"></i> <span class="rlh-progress-text">${escapeHtml(initialMessage)}</span></div>`;
            const $toast = $(toastHtml);
            
            $panel.append($toast);
            
            setTimeout(() => {
                $toast.addClass('visible');
            }, 10);

            const update = (newMessage) => {
                $toast.find('.rlh-progress-text').html(escapeHtml(newMessage));
            };

            const remove = () => {
                $toast.removeClass('visible');
                setTimeout(() => {
                    $toast.remove();
                }, 300);
            };

            return { update, remove };
        };

        const showModal = (options) => {
            return new Promise((resolve, reject) => {
                const { type = 'alert', title = '通知', text = '', placeholder = '', value = '' } = options;
                let buttonsHtml = '';
                if (type === 'alert') buttonsHtml = '<button class="rlh-modal-btn rlh-modal-ok">确定</button>';
                else if (type === 'confirm') buttonsHtml = '<button class="rlh-modal-btn rlh-modal-cancel">取消</button><button class="rlh-modal-btn rlh-modal-ok">确认</button>';
                else if (type === 'prompt') buttonsHtml = '<button class="rlh-modal-btn rlh-modal-cancel">取消</button><button class="rlh-modal-btn rlh-modal-ok">确定</button>';
                
                const inputHtml = type === 'prompt' ? `<input type="text" class="rlh-modal-input" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(value)}">` : '';
                
                const modalHtml = `<div class="rlh-modal-overlay"><div class="rlh-modal-content"><div class="rlh-modal-header">${escapeHtml(title)}</div><div class="rlh-modal-body"><p>${escapeHtml(text)}</p>${inputHtml}</div><div class="rlh-modal-footer">${buttonsHtml}</div></div></div>`;
                
                const $modal = $(modalHtml).hide();
                const $panel = $(`#${PANEL_ID}`, parentDoc);
                if ($panel.length > 0) {
                    $panel.append($modal);
                } else {
                    $('body', parentDoc).append($modal);
                }
                
                $modal.fadeIn(200);
                const $input = $modal.find('.rlh-modal-input');
                if (type === 'prompt') $input.focus().select();
                
                const closeModal = (isSuccess, val) => {
                    $modal.fadeOut(200, () => {
                        $modal.remove();
                        if (isSuccess) resolve(val); else reject();
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
                    $input.on('keydown', (e) => {
                        if (e.key === 'Enter') $modal.find('.rlh-modal-ok').click();
                        else if (e.key === 'Escape') closeModal(false);
                    });
                }
            });
        };

        // --- API 包装器 ---
        const TavernAPI = {
            createLorebook: errorCatched(async (name) => await TavernHelper.createLorebook(name)),
            deleteLorebook: errorCatched(async (name) => await TavernHelper.deleteLorebook(name)),
            getLorebooks: errorCatched(async () => await TavernHelper.getLorebooks()),
            setLorebookSettings: errorCatched(async (settings) => await TavernHelper.setLorebookSettings(settings)),
            getCharData: errorCatched(async () => await TavernHelper.getCharData()),
            Character: TavernHelper.Character,
            getRegexes: errorCatched(async () => await TavernHelper.getTavernRegexes({ scope: 'all' })),
            replaceRegexes: errorCatched(async (regexes) => await TavernHelper.replaceTavernRegexes(regexes, { scope: 'all' })),
            getLorebookSettings: errorCatched(async () => await TavernHelper.getLorebookSettings()),
            getCharLorebooks: errorCatched(async (charData) => await TavernHelper.getCharLorebooks(charData)),
            getCurrentCharLorebooks: errorCatched(async () => await TavernHelper.getCharLorebooks()),
            getChatLorebook: errorCatched(async () => await TavernHelper.getChatLorebook()),
            getOrCreateChatLorebook: errorCatched(async (name) => await TavernHelper.getOrCreateChatLorebook(name)),
            setChatLorebook: errorCatched(async (name) => await TavernHelper.setChatLorebook(name)),
            getLorebookEntries: errorCatched(async (name) => await TavernHelper.getLorebookEntries(name)),
            setLorebookEntries: errorCatched(async (name, entries) => await TavernHelper.setLorebookEntries(name, entries)),
            createLorebookEntries: errorCatched(async (name, entries) => await TavernHelper.createLorebookEntries(name, entries)),
            deleteLorebookEntries: errorCatched(async (name, uids) => await TavernHelper.deleteLorebookEntries(name, uids)),
            saveSettings: errorCatched(async () => await TavernHelper.builtin.saveSettings()),
            setCurrentCharLorebooks: errorCatched(async (lorebooks) => await TavernHelper.setCurrentCharLorebooks(lorebooks)),
        };

        const loadAllData = errorCatched(async () => {
            const $content = $(`#${PANEL_ID}-content`, parentDoc);
            $content.html('<p class="rlh-info-text">正在加载所有数据，请稍候...</p>');

            try {
                // 防御性检查：确保SillyTavern API可用
                if (!window.parent.SillyTavern || !window.parent.SillyTavern.getContext) {
                    console.warn('[RegexLoreHub] SillyTavern API not available, initializing with empty data');
                    appState.regexes.global = [];
                    appState.regexes.character = [];
                    appState.allLorebooks = [];
                    appState.lorebooks.character = [];
                    appState.chatLorebook = null;
                    safeClearLorebookEntries();
                    appState.isDataLoaded = true;
                    renderContent();
                    return;
                }

                const context = window.parent.SillyTavern.getContext() || {};
                const allCharacters = Array.isArray(context.characters) ? context.characters : [];
                const hasActiveCharacter = context.characterId !== undefined && context.characterId !== null;
                const hasActiveChat = context.chatId !== undefined && context.chatId !== null;

                let charData = null, charLinkedBooks = null, chatLorebook = null;

                // 使用Promise.allSettled来避免单个失败影响整体
                const promises = [
                    TavernAPI.getRegexes().catch(() => []),
                    TavernAPI.getLorebookSettings().catch(() => ({})),
                    TavernAPI.getLorebooks().catch(() => []),
                ];

                if (hasActiveCharacter) {
                    promises.push(TavernAPI.getCharData().catch(() => null));
                    promises.push(TavernAPI.getCurrentCharLorebooks().catch(() => null));
                } else {
                    promises.push(Promise.resolve(null), Promise.resolve(null));
                }

                if (hasActiveChat) {
                    promises.push(TavernAPI.getChatLorebook().catch(() => null));
                } else {
                    promises.push(Promise.resolve(null));
                }

                const results = await Promise.allSettled(promises);
                
                // 安全提取结果
                const allUIRegexes = results[0].status === 'fulfilled' ? results[0].value : [];
                const globalSettings = results[1].status === 'fulfilled' ? results[1].value : {};
                const allBookFileNames = results[2].status === 'fulfilled' ? results[2].value : [];
                charData = results[3]?.status === 'fulfilled' ? results[3].value : null;
                charLinkedBooks = results[4]?.status === 'fulfilled' ? results[4].value : null;
                chatLorebook = results[5]?.status === 'fulfilled' ? results[5].value : null;

                appState.regexes.global = Array.isArray(allUIRegexes) ? allUIRegexes.filter(r => r.scope === 'global') : [];
                updateCharacterRegexes(allUIRegexes, charData);

                safeClearLorebookEntries();
                appState.lorebookUsage.clear();
                const knownBookNames = new Set(Array.isArray(allBookFileNames) ? allBookFileNames : []);

                // 安全处理角色世界书
                if (Array.isArray(allCharacters) && allCharacters.length > 0) {
                    try {
                        await Promise.all(allCharacters.map(async (char) => {
                            if (!char || !char.name) return;
                            try {
                                let books = null;
                                try {
                                    const result = TavernHelper.getCharLorebooks({ name: char.name });
                                    // 检查是否为 Promise
                                    if (result && typeof result.then === 'function') {
                                        books = await result;
                                    } else {
                                        books = result;
                                    }
                                } catch (error) {
                                    console.warn(`[RegexLoreHub] Error getting lorebooks for character "${char.name}":`, error);
                                    books = null;
                                }
                                if (books && typeof books === 'object') {
                                    const bookSet = new Set();
                                    if (books.primary && typeof books.primary === 'string') bookSet.add(books.primary);
                                    if (Array.isArray(books.additional)) {
                                        books.additional.forEach(b => typeof b === 'string' && bookSet.add(b));
                                    }
                                    
                                    bookSet.forEach(bookName => {
                                        if (typeof bookName === 'string') {
                                            if (!appState.lorebookUsage.has(bookName)) {
                                                appState.lorebookUsage.set(bookName, []);
                                            }
                                            appState.lorebookUsage.get(bookName).push(char.name);
                                            knownBookNames.add(bookName);
                                            console.log(`[RegexLoreHub] Character "${char.name}" uses lorebook "${bookName}"`);
                                        }
                                    });
                                }
                            } catch (charError) {
                                console.warn(`[RegexLoreHub] Error processing character ${char.name}:`, charError);
                            }
                        }));
                    } catch (charProcessingError) {
                        console.warn('[RegexLoreHub] Error processing characters:', charProcessingError);
                    }
                }

                const enabledGlobalBooks = new Set(Array.isArray(globalSettings?.selected_global_lorebooks) ? globalSettings.selected_global_lorebooks : []);
                appState.allLorebooks = (Array.isArray(allBookFileNames) ? allBookFileNames : []).map(name => ({
                    name: name,
                    enabled: enabledGlobalBooks.has(name)
                }));
                
                const charBookSet = new Set();
                if (charLinkedBooks && typeof charLinkedBooks === 'object') {
                    if (charLinkedBooks.primary && typeof charLinkedBooks.primary === 'string') {
                        charBookSet.add(charLinkedBooks.primary);
                    }
                    if (Array.isArray(charLinkedBooks.additional)) {
                        charLinkedBooks.additional.forEach(name => typeof name === 'string' && charBookSet.add(name));
                    }
                }
                appState.lorebooks.character = Array.from(charBookSet);
                appState.chatLorebook = (typeof chatLorebook === 'string') ? chatLorebook : null;
                if (typeof chatLorebook === 'string') {
                    knownBookNames.add(chatLorebook);
                }
 
                const allBooksToLoad = Array.from(knownBookNames);
                const existingBookFiles = new Set(Array.isArray(allBookFileNames) ? allBookFileNames : []);
                
                // 分批加载世界书条目，避免同时加载过多
                const batchSize = 5;
                for (let i = 0; i < allBooksToLoad.length; i += batchSize) {
                    const batch = allBooksToLoad.slice(i, i + batchSize);
                    await Promise.allSettled(
                        batch.map(async (name) => {
                            if (existingBookFiles.has(name) && typeof name === 'string') {
                                try {
                                    const entries = await TavernAPI.getLorebookEntries(name).catch(() => []);
                                    safeSetLorebookEntries(name, entries);
                                } catch (entryError) {
                                    console.warn(`[RegexLoreHub] Error loading entries for book ${name}:`, entryError);
                                }
                            }
                        })
                    );
                }

                appState.isDataLoaded = true;
                renderContent();
                
            } catch (error) {
                console.error('[RegexLoreHub] Error in loadAllData:', error);
                // 发生严重错误时，显示友好的错误信息
                $content.html(`
                    <div style="padding: 20px; text-align: center;">
                        <p style="color: #ff6b6b; margin-bottom: 10px;">
                            <i class="fa-solid fa-exclamation-triangle"></i> 数据加载失败
                        </p>
                        <p style="color: #666; font-size: 14px;">
                            请检查开发者控制台获取详细信息，或尝试刷新页面。
                        </p>
                        <button class="rlh-modal-btn" onclick="$('#${REFRESH_BTN_ID}').click()" 
                                style="margin-top: 15px; padding: 8px 16px;">
                            <i class="fa-solid fa-refresh"></i> 重试
                        </button>
                    </div>
                `);
                throw error; // 让errorCatched捕获并显示通用错误消息
            }
        });

        const refreshCharacterData = errorCatched(async () => {
            const [charData, charBooks, allUIRegexes, chatLorebook] = await Promise.all([
                TavernAPI.getCharData(),
                TavernAPI.getCurrentCharLorebooks(),
                TavernAPI.getRegexes(),
                TavernAPI.getChatLorebook()
            ]);
            updateCharacterRegexes(allUIRegexes, charData);
            updateCharacterLorebooks(charBooks);
            appState.chatLorebook = chatLorebook;
            const newBooksToLoad = appState.lorebooks.character.filter(name => !safeHasLorebookEntries(name));
            if (newBooksToLoad.length > 0) {
                await Promise.all(newBooksToLoad.map(async (name) => {
                    const entries = await TavernAPI.getLorebookEntries(name);
                    safeSetLorebookEntries(name, entries);
                }));
            }
        });

        function updateCharacterRegexes(allUIRegexes, charData) {
            const characterUIRegexes = allUIRegexes?.filter(r => r.scope === 'character') || [];
            let cardRegexes = [];
            if (charData && TavernAPI.Character) {
                try {
                    const character = new TavernAPI.Character(charData);
                    cardRegexes = (character.getRegexScripts() || []).map((r, i) => ({
                        id: r.id || `card-${Date.now()}-${i}`,
                        script_name: r.scriptName || '未命名卡内正则',
                        find_regex: r.findRegex,
                        replace_string: r.replaceString,
                        enabled: !r.disabled,
                        scope: 'character',
                        source: 'card'
                    }));
                } catch (e) {
                    console.warn("无法解析角色卡正则脚本:", e);
                }
            }
            const uiRegexIdentifiers = new Set(characterUIRegexes.map(r => `${r.script_name}::${r.find_regex}::${r.replace_string}`));
            const uniqueCardRegexes = cardRegexes.filter(r => {
                const identifier = `${r.script_name}::${r.find_regex}::${r.replace_string}`;
                return !uiRegexIdentifiers.has(identifier);
            });
            appState.regexes.character = [...characterUIRegexes, ...uniqueCardRegexes];
        }

        function updateCharacterLorebooks(charBooks) {
            let characterBookNames = [];
            if (charBooks) {
                if (charBooks.primary) characterBookNames.push(charBooks.primary);
                if (charBooks.additional) characterBookNames.push(...charBooks.additional);
            }
            appState.lorebooks.character = [...new Set(characterBookNames)];
        }

        const renderContent = () => {
            const searchTerm = $(`#${SEARCH_INPUT_ID}`, parentDoc).val().toLowerCase();
            appState.searchFilters.bookName = $(`#rlh-filter-book-name`, parentDoc).is(':checked');
            appState.searchFilters.entryName = $(`#rlh-filter-entry-name`, parentDoc).is(':checked');
            appState.searchFilters.keywords = $(`#rlh-filter-keywords`, parentDoc).is(':checked');
            appState.searchFilters.content = $(`#rlh-filter-content`, parentDoc).is(':checked');
            
            const $content = $(`#${PANEL_ID}-content`, parentDoc);
            $content.empty();
            
            $(`#${PANEL_ID}`, parentDoc).toggleClass('rlh-multi-select-mode', appState.multiSelectMode);
            const isLoreTab = appState.activeTab === 'global-lore' || appState.activeTab === 'char-lore' || appState.activeTab === 'chat-lore';
            $(`#rlh-search-filters-container`, parentDoc).toggle(isLoreTab);
            
            updateSelectionCount();
            
            switch (appState.activeTab) {
                case 'global-lore':
                    renderGlobalLorebookView(searchTerm, $content);
                    break;
                case 'char-lore':
                    renderCharacterLorebookView(searchTerm, $content);
                    break;
                case 'chat-lore':
                    renderChatLorebookView(searchTerm, $content);
                    break;
                case 'global-regex':
                    renderRegexView(appState.regexes.global, searchTerm, $content, '全局正则');
                    break;
                case 'char-regex':
                    renderRegexView(appState.regexes.character, searchTerm, $content, '角色正则');
                    break;
            }
        };

        // 替换功能的处理函数
        const handleReplace = errorCatched(async () => {
            const searchTerm = $(`#${SEARCH_INPUT_ID}`, parentDoc).val();
            const replaceTerm = $('#rlh-replace-input', parentDoc).val();
            
            // 检查搜索词是否为空
            if (!searchTerm) {
                await showModal({ type: 'alert', title: '替换失败', text: '请先输入搜索词。' });
                return;
            }
            
            // 检查替换词是否为空
            if (!replaceTerm) {
                await showModal({ type: 'alert', title: '替换失败', text: '请先输入替换词。' });
                return;
            }
            
            // 获取当前视图的匹配项
            let matches = [];
            
            switch (appState.activeTab) {
                case 'global-lore':
                    matches = getGlobalLorebookMatches(searchTerm);
                    break;
                case 'char-lore':
                    matches = getCharacterLorebookMatches(searchTerm);
                    break;
                case 'chat-lore':
                    matches = getChatLorebookMatches(searchTerm);
                    break;
                default:
                    await showModal({ type: 'alert', title: '替换失败', text: '替换功能仅支持世界书视图。' });
                    return;
            }
            
            // 如果没有匹配项，提示用户
            if (matches.length === 0) {
                await showModal({ type: 'alert', title: '替换失败', text: '未找到匹配的条目。' });
                return;
            }
            
            // 显示确认对话框
            const confirmResult = await showModal({
                type: 'confirm',
                title: '确认替换',
                text: `找到 ${matches.length} 个匹配项。\n\n确定要将 "${searchTerm}" 替换为 "${replaceTerm}" 吗？\n\n注意：此操作仅替换条目的关键词、内容和条目名称，不会替换世界书本身的名称。\n此操作不可撤销，请谨慎操作。`
            });
            
            // 如果用户确认替换，则执行替换
            if (confirmResult) {
                const progressToast = showProgressToast('正在执行替换...');
                try {
                    await performReplace(matches, searchTerm, replaceTerm);
                    progressToast.remove();
                    showSuccessTick('替换完成');
                    // 刷新视图
                    renderContent();
                } catch (error) {
                    progressToast.remove();
                    console.error('[RegexLoreHub] Replace error:', error);
                    await showModal({ type: 'alert', title: '替换失败', text: '替换过程中发生错误，请检查开发者控制台获取详细信息。' });
                }
            }
        });

        // 执行替换操作的函数
        const performReplace = async (matches, searchTerm, replaceTerm) => {
            // 创建一个映射来跟踪每个世界书的更改
            const bookUpdates = new Map();
            
            // 遍历所有匹配项
            for (const match of matches) {
                const { bookName, entry } = match;
                let updated = false;
                
                // 如果还没有为这个世界书创建更新数组，则创建一个
                if (!bookUpdates.has(bookName)) {
                    bookUpdates.set(bookName, []);
                }
                
                // 创建条目的深拷贝以进行修改
                const updatedEntry = JSON.parse(JSON.stringify(entry));
                
                // 替换关键词
                if (updatedEntry.keys && Array.isArray(updatedEntry.keys)) {
                    const newKeys = updatedEntry.keys.map(key => 
                        key.replace(new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\/\\]/g, '\\$&'), 'g'), replaceTerm)
                    );
                    // 检查是否有实际更改
                    if (JSON.stringify(updatedEntry.keys) !== JSON.stringify(newKeys)) {
                        updatedEntry.keys = newKeys;
                        updated = true;
                    }
                }
                
                // 替换条目内容
                if (updatedEntry.content) {
                    const newContent = updatedEntry.content.replace(new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\/\\]/g, '\\$&'), 'g'), replaceTerm);
                    if (updatedEntry.content !== newContent) {
                        updatedEntry.content = newContent;
                        updated = true;
                    }
                }
                
                // 替换条目名称（comment）
                if (updatedEntry.comment) {
                    const newComment = updatedEntry.comment.replace(new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\/\\]/g, '\\$&'), 'g'), replaceTerm);
                    if (updatedEntry.comment !== newComment) {
                        updatedEntry.comment = newComment;
                        updated = true;
                    }
                }
                
                // 如果有更改，则将更新后的条目添加到更新数组中
                if (updated) {
                    bookUpdates.get(bookName).push(updatedEntry);
                }
            }
            
            // 应用所有更改
            for (const [bookName, entriesToUpdate] of bookUpdates.entries()) {
                if (entriesToUpdate.length > 0) {
                    // 调用TavernAPI来更新条目
                    const result = await TavernAPI.setLorebookEntries(bookName, entriesToUpdate);
                    if (result && result.entries) {
                        // 更新本地状态
                        safeSetLorebookEntries(bookName, result.entries);
                    }
                }
            }
            
            // 等待一段时间以确保所有操作完成
            await new Promise(resolve => setTimeout(resolve, 100));
        };

        // 获取全局世界书匹配项的函数
        const getGlobalLorebookMatches = (searchTerm) => {
            let matches = [];
            let books = [...appState.allLorebooks].sort((a, b) => b.enabled - a.enabled || a.name.localeCompare(b.name));

            if (!searchTerm) {
                // 如果没有搜索词，返回所有条目
                books.forEach(book => {
                    const entries = [...safeGetLorebookEntries(book.name)];
                    entries.forEach(entry => {
                        matches.push({ bookName: book.name, entry });
                    });
                });
            } else {
                // 根据搜索词和过滤器获取匹配项
                books.forEach(book => {
                    const entries = [...safeGetLorebookEntries(book.name)];
                    let bookNameMatches = appState.searchFilters.bookName && book.name.toLowerCase().includes(searchTerm.toLowerCase());
                    
                    entries.forEach(entry => {
                        let entryNameMatches = appState.searchFilters.entryName && (entry.comment || '').toLowerCase().includes(searchTerm.toLowerCase());
                        let keywordsMatch = appState.searchFilters.keywords && entry.keys.join(' ').toLowerCase().includes(searchTerm.toLowerCase());
                        let contentMatch = appState.searchFilters.content && entry.content && entry.content.toLowerCase().includes(searchTerm.toLowerCase());
                        
                        // 如果书名匹配，或者条目名、关键词、内容中有任何一个匹配，则添加到匹配项中
                        if (bookNameMatches || entryNameMatches || keywordsMatch || contentMatch) {
                            matches.push({ bookName: book.name, entry });
                        }
                    });
                });
            }
            
            return matches;
        };

        const renderGlobalLorebookView = (searchTerm, $container) => {
            let books = [...appState.allLorebooks].sort((a, b) => b.enabled - a.enabled || a.name.localeCompare(b.name));
            let filteredBookData = [];

            if (!searchTerm) {
                filteredBookData = books.map(book => ({ book, forceShowAllEntries: true, filteredEntries: null }));
            } else {
                books.forEach(book => {
                    const entries = [...safeGetLorebookEntries(book.name)];
                    let bookNameMatches = appState.searchFilters.bookName && book.name.toLowerCase().includes(searchTerm);
                    let matchingEntries = entries.filter(entry =>
                        (appState.searchFilters.entryName && (entry.comment || '').toLowerCase().includes(searchTerm)) ||
                        (appState.searchFilters.keywords && entry.keys.join(' ').toLowerCase().includes(searchTerm)) ||
                        (appState.searchFilters.content && entry.content && entry.content.toLowerCase().includes(searchTerm))
                    );

                    if (bookNameMatches || matchingEntries.length > 0) {
                        filteredBookData.push({ book, forceShowAllEntries: bookNameMatches, filteredEntries: matchingEntries });
                    }
                });
            }

            if (filteredBookData.length === 0 && appState.allLorebooks.length > 0) {
                $container.html(`<p class="rlh-info-text">未找到匹配的世界书。</p>`);
            } else if (appState.allLorebooks.length === 0) {
                $container.html(`<p class="rlh-info-text">还没有世界书，点击上方"+"创建一个吧。</p>`);
            }

            filteredBookData.forEach(data => {
                if (data && data.book) {
                    $container.append(createGlobalLorebookElement(data.book, searchTerm, data.forceShowAllEntries, data.filteredEntries));
                }
            });
        };

        // 获取角色世界书匹配项的函数
        const getCharacterLorebookMatches = (searchTerm) => {
            let matches = [];
            const linkedBooks = appState.lorebooks.character;
            const context = window.parent.SillyTavern.getContext();
            const hasActiveCharacter = context.characterId !== undefined && context.characterId !== null;

            if (!hasActiveCharacter || linkedBooks.length === 0) {
                return matches;
            }

            linkedBooks.forEach(bookName => {
                const entries = [...safeGetLorebookEntries(bookName)].sort((a, b) => b.enabled - a.enabled || a.display_index - b.display_index);
                
                if (!searchTerm) {
                    // 如果没有搜索词，返回所有条目
                    entries.forEach(entry => {
                        matches.push({ bookName, entry });
                    });
                } else {
                    // 根据搜索词和过滤器获取匹配项
                    entries.forEach(entry => {
                        let bookNameMatches = appState.searchFilters.bookName && bookName.toLowerCase().includes(searchTerm.toLowerCase());
                        let entryNameMatches = appState.searchFilters.entryName && (entry.comment || '').toLowerCase().includes(searchTerm.toLowerCase());
                        let keywordsMatch = appState.searchFilters.keywords && entry.keys.join(' ').toLowerCase().includes(searchTerm.toLowerCase());
                        let contentMatch = appState.searchFilters.content && entry.content && entry.content.toLowerCase().includes(searchTerm.toLowerCase());
                        
                        // 如果书名匹配，或者条目名、关键词、内容中有任何一个匹配，则添加到匹配项中
                        if (bookNameMatches || entryNameMatches || keywordsMatch || contentMatch) {
                            matches.push({ bookName, entry });
                        }
                    });
                }
            });
            
            return matches;
        };

        const renderCharacterLorebookView = (searchTerm, $container) => {
            const linkedBooks = appState.lorebooks.character;
            const context = window.parent.SillyTavern.getContext();
            const hasActiveCharacter = context.characterId !== undefined && context.characterId !== null;

            if (!hasActiveCharacter) {
                $container.html(`<p class="rlh-info-text">请先加载一个角色以管理角色世界书。</p>`);
                return;
            }
            if (linkedBooks.length === 0) {
                $container.html(`<p class="rlh-info-text">当前角色没有绑定的世界书。点击同步按钮刷新。</p>`);
                return;
            }

            const renderBook = (bookName) => {
                const $bookContainer = $(`
                    <div class="rlh-book-group" data-book-name="${escapeHtml(bookName)}">
                        <div class="rlh-book-group-header">
                            <span>${escapeHtml(bookName)}</span>
                            <div class="rlh-item-controls">
                                <button class="rlh-action-btn-icon rlh-rename-book-btn" title="重命名世界书"><i class="fa-solid fa-pencil"></i></button>
                                <button class="rlh-action-btn-icon rlh-delete-book-btn" title="删除世界书"><i class="fa-solid fa-trash-can"></i></button>
                            </div>
                        </div>
                        <div class="rlh-entry-list-wrapper"></div>
                    </div>
                `);
                const $listWrapper = $bookContainer.find('.rlh-entry-list-wrapper');
                const $entryActions = $(`<div class="rlh-entry-actions"><button class="rlh-action-btn rlh-create-entry-btn" data-book-name="${escapeHtml(bookName)}"><i class="fa-solid fa-plus"></i> 新建条目</button><button class="rlh-action-btn rlh-batch-recursion-btn" data-book-name="${escapeHtml(bookName)}"><i class="fa-solid fa-shield-halved"></i> 全开防递</button><button class="rlh-action-btn rlh-fix-keywords-btn" data-book-name="${escapeHtml(bookName)}"><i class="fa-solid fa-check-double"></i> 修复关键词</button></div>`);
                $listWrapper.append($entryActions);
                
                let entries = [...safeGetLorebookEntries(bookName)].sort((a, b) => b.enabled - a.enabled || a.display_index - b.display_index);
                let bookNameMatches = !searchTerm || (appState.searchFilters.bookName && bookName.toLowerCase().includes(searchTerm));
                let matchingEntries = entries.filter(entry => !searchTerm || (appState.searchFilters.entryName && (entry.comment || '').toLowerCase().includes(searchTerm)) || (appState.searchFilters.keywords && entry.keys.join(' ').toLowerCase().includes(searchTerm)) || (appState.searchFilters.content && entry.content && entry.content.toLowerCase().includes(searchTerm)));

                if (!bookNameMatches && matchingEntries.length === 0) return null;

                const entriesToShow = bookNameMatches ? entries : matchingEntries;

                if (entriesToShow.length === 0 && searchTerm) {
                            $listWrapper.append(`<p class="rlh-info-text-small">无匹配条目</p>`);
                        } else {
                            entriesToShow.forEach(entry => $listWrapper.append(createItemElement(entry, 'lore', bookName, searchTerm)));
                        }
                return $bookContainer;
            };

            let renderedCount = 0;
            linkedBooks.forEach(bookName => {
                const $el = renderBook(bookName);
                if ($el) {
                    $container.append($el);
                    renderedCount++;
                }
            });

            if (renderedCount === 0 && searchTerm) {
                $container.html(`<p class="rlh-info-text">未找到匹配的世界书或条目。</p>`);
            }
        };

        // 获取聊天世界书匹配项的函数
        const getChatLorebookMatches = (searchTerm) => {
            let matches = [];
            const bookName = appState.chatLorebook;
            const context = window.parent.SillyTavern.getContext();
            const hasActiveChat = context.chatId !== undefined && context.chatId !== null;

            if (!hasActiveChat || !bookName) {
                return matches;
            }

            const entries = [...safeGetLorebookEntries(bookName)].sort((a, b) => b.enabled - a.enabled || a.display_index - b.display_index);
            
            if (!searchTerm) {
                // 如果没有搜索词，返回所有条目
                entries.forEach(entry => {
                    matches.push({ bookName, entry });
                });
            } else {
                // 根据搜索词和过滤器获取匹配项
                entries.forEach(entry => {
                    let entryNameMatches = appState.searchFilters.entryName && (entry.comment || '').toLowerCase().includes(searchTerm.toLowerCase());
                    let keywordsMatch = appState.searchFilters.keywords && entry.keys.join(' ').toLowerCase().includes(searchTerm.toLowerCase());
                    let contentMatch = appState.searchFilters.content && entry.content && entry.content.toLowerCase().includes(searchTerm.toLowerCase());
                    
                    // 如果条目名、关键词、内容中有任何一个匹配，则添加到匹配项中
                    if (entryNameMatches || keywordsMatch || contentMatch) {
                        matches.push({ bookName, entry });
                    }
                });
            }
            
            return matches;
        };

        const renderChatLorebookView = (searchTerm, $container) => {
            const bookName = appState.chatLorebook;
            const context = window.parent.SillyTavern.getContext();
            const hasActiveChat = context.chatId !== undefined && context.chatId !== null;

            if (!hasActiveChat) {
                $container.html(`<p class="rlh-info-text">请先打开一个聊天以管理聊天世界书。</p>`);
                return;
            }

            if (!bookName) {
                $container.html(`
                    <div class="rlh-chat-lore-empty">
                        <p class="rlh-info-text">当前聊天没有绑定的世界书。</p>
                        <button class="rlh-action-btn" id="rlh-create-chat-lore-btn"><i class="fa-solid fa-plus"></i> 创建并绑定聊天世界书</button>
                    </div>
                `);
                return;
            }

            const $bookContainer = $(`
                <div class="rlh-book-group" data-book-name="${escapeHtml(bookName)}">
                    <div class="rlh-book-group-header">
                        <span>${escapeHtml(bookName)} (聊天专用)</span>
                        <div class="rlh-item-controls">
                            <button class="rlh-action-btn-icon rlh-rename-book-btn" title="重命名世界书"><i class="fa-solid fa-pencil"></i></button>
                            <button class="rlh-action-btn-icon rlh-unlink-chat-lore-btn" title="解除绑定"><i class="fa-solid fa-unlink"></i></button>
                        </div>
                    </div>
                    <div class="rlh-entry-list-wrapper"></div>
                </div>
            `);
            const $listWrapper = $bookContainer.find('.rlh-entry-list-wrapper');
            const $entryActions = $(`<div class="rlh-entry-actions"><button class="rlh-action-btn rlh-create-entry-btn" data-book-name="${escapeHtml(bookName)}"><i class="fa-solid fa-plus"></i> 新建条目</button><button class="rlh-action-btn rlh-batch-recursion-btn" data-book-name="${escapeHtml(bookName)}"><i class="fa-solid fa-shield-halved"></i> 全开防递</button><button class="rlh-action-btn rlh-fix-keywords-btn" data-book-name="${escapeHtml(bookName)}"><i class="fa-solid fa-check-double"></i> 修复关键词</button></div>`);
            $listWrapper.append($entryActions);

            let entries = [...safeGetLorebookEntries(bookName)].sort((a, b) => b.enabled - a.enabled || a.display_index - b.display_index);
            let matchingEntries = entries.filter(entry =>
                !searchTerm ||
                (appState.searchFilters.entryName && (entry.comment || '').toLowerCase().includes(searchTerm)) ||
                (appState.searchFilters.keywords && entry.keys.join(' ').toLowerCase().includes(searchTerm)) ||
                (appState.searchFilters.content && entry.content && entry.content.toLowerCase().includes(searchTerm))
            );

            if (matchingEntries.length === 0 && searchTerm) {
                $listWrapper.append(`<p class="rlh-info-text-small">无匹配条目</p>`);
            } else {
                matchingEntries.forEach(entry => $listWrapper.append(createItemElement(entry, 'lore', bookName, searchTerm)));
            }
            
            $container.empty().append($bookContainer);
        };

        const renderRegexView = (itemList, searchTerm, $container, title) => {
            const listId = `rlh-regex-list-${title.replace(/\s+/g, '-')}`;
            const $listContainer = $(`<div id="${listId}" class="rlh-regex-list"></div>`);
            $container.append($listContainer);

            if (title === '角色正则') {
                const context = window.parent.SillyTavern.getContext();
                const hasActiveCharacter = context.characterId !== undefined && context.characterId !== null;
                if (!hasActiveCharacter) {
                    $listContainer.html(`<p class="rlh-info-text">请先加载一个角色以管理角色正则。</p>`);
                    return;
                }
            }

            if (!itemList || itemList.length === 0) {
                $listContainer.html(`<p class="rlh-info-text">没有${title}。点击同步按钮刷新。</p>`);
                return;
            }

            let filteredItems = [...itemList];
            if (searchTerm) {
                filteredItems = filteredItems.filter(item => (item.script_name || '').toLowerCase().includes(searchTerm));
            }

            if (filteredItems.length === 0) {
                $listContainer.html(`<p class="rlh-info-text">没有匹配的${title}。</p>`);
                return;
            }

            filteredItems.forEach((item, index) => {
                const $element = createItemElement(item, 'regex');
                $element.find('.rlh-item-name').prepend(`<span class="rlh-order-indicator">#${index + 1}</span> `);
                $listContainer.append($element);
            });

            const listEl = $listContainer[0];
            if (listEl && parent.Sortable) {
                new parent.Sortable(listEl, {
                    animation: 150,
                    handle: '.rlh-drag-handle',
                    ghostClass: 'sortable-ghost',
                    chosenClass: 'sortable-chosen',
                    onEnd: (evt) => handleRegexDragEnd(evt, title === '全局正则' ? 'global' : 'character'),
                });
            }
        };

        const createGlobalLorebookElement = (book, searchTerm, forceShowAllEntries, filteredEntries) => {
            const usedByChars = appState.lorebookUsage.get(book.name) || [];
            const usedByHtml = usedByChars.length > 0
                ? `<div class="rlh-used-by-chars">使用者: ${usedByChars.map(char => `<span>${escapeHtml(char)}</span>`).join(', ')}</div>`
                : '';

            // 应用高亮到世界书名称
            const highlightedBookName = highlightText(book.name, searchTerm);

            const $element = $(`
                <div class="rlh-book-group" data-book-name="${escapeHtml(book.name)}">
                    <div class="rlh-global-book-header">
                        <span class="rlh-item-name">${highlightedBookName}</span>
                        <div class="rlh-item-controls">
                            <button class="rlh-action-btn-icon rlh-edit-entries-btn" title="编辑/选择条目"><i class="fa-solid fa-pen-to-square"></i></button>
                            <button class="rlh-action-btn-icon rlh-rename-book-btn" title="重命名世界书"><i class="fa-solid fa-pencil"></i></button>
                            <button class="rlh-toggle-btn rlh-global-toggle" title="启用/禁用整个世界书"><i class="fa-solid fa-power-off"></i></button>
                            <button class="rlh-action-btn-icon rlh-delete-book-btn" title="删除世界书"><i class="fa-solid fa-trash-can"></i></button>
                        </div>
                        ${usedByHtml}
                    </div>
                    <div class="rlh-collapsible-content"></div>
                </div>
            `);
            
            $element.toggleClass('enabled', book.enabled);
            $element.find('.rlh-global-book-header').toggleClass('enabled', book.enabled);

            if (appState.multiSelectMode) {
                const itemKey = `book:${book.name}`;
                $element.toggleClass('selected', appState.selectedItems.has(itemKey));
            }

            const $content = $element.find('.rlh-collapsible-content');
            const $entryActions = $(`<div class="rlh-entry-actions"><button class="rlh-action-btn rlh-create-entry-btn" data-book-name="${escapeHtml(book.name)}"><i class="fa-solid fa-plus"></i> 新建条目</button><button class="rlh-action-btn rlh-batch-recursion-btn" data-book-name="${escapeHtml(book.name)}"><i class="fa-solid fa-shield-halved"></i> 全开防递</button><button class="rlh-action-btn rlh-fix-keywords-btn" data-book-name="${escapeHtml(book.name)}"><i class="fa-solid fa-check-double"></i> 修复关键词</button></div>`);
            $content.append($entryActions);
            
            let allEntries = [...safeGetLorebookEntries(book.name)].sort((a, b) => b.enabled - a.enabled || a.display_index - b.display_index);
            let entriesToShow = forceShowAllEntries ? allEntries : (filteredEntries || []);

            if (entriesToShow && entriesToShow.length > 0) {
                const $listWrapper = $('<div class="rlh-entry-list-wrapper"></div>');
                entriesToShow.forEach(entry => $listWrapper.append(createItemElement(entry, 'lore', book.name, searchTerm)));
                $content.append($listWrapper);
            } else if (searchTerm) {
                $content.append(`<div class="rlh-info-text-small">无匹配项</div>`);
            }

            return $element;
        };

        const createItemElement = (item, type, bookName = '', searchTerm = '') => {
            const isLore = type === 'lore';
            const id = isLore ? item.uid : item.id;
            const name = isLore ? (item.comment || '无标题条目') : (item.script_name || '未命名正则');
            const fromCard = item.source === 'card';

            let controlsHtml = '';

            if (isLore) {
                // 所有世界书条目都有完整的操作按钮
                controlsHtml = `
                    <button class="rlh-action-btn-icon rlh-rename-btn" title="重命名"><i class="fa-solid fa-pencil"></i></button>
                    <button class="rlh-toggle-btn rlh-item-toggle" title="启用/禁用此条目"><i class="fa-solid fa-power-off"></i></button>
                    <button class="rlh-action-btn-icon rlh-delete-entry-btn" title="删除条目"><i class="fa-solid fa-trash-can"></i></button>
                `;
            } else { // 是正则
                if (fromCard) {
                    // 来自卡片的正则只有开关
                    controlsHtml = '<button class="rlh-toggle-btn rlh-item-toggle" title="启用/禁用此条目"><i class="fa-solid fa-power-off"></i></button>';
                } else {
                    // UI中的正则有重命名和开关
                    controlsHtml = `
                        <button class="rlh-action-btn-icon rlh-rename-btn" title="重命名"><i class="fa-solid fa-pencil"></i></button>
                        <button class="rlh-toggle-btn rlh-item-toggle" title="启用/禁用此条目"><i class="fa-solid fa-power-off"></i></button>
                    `;
                }
            }
            
            const dragHandleHtml = !fromCard && !isLore ? '<span class="rlh-drag-handle" title="拖拽排序"><i class="fa-solid fa-grip-vertical"></i></span>' : '';
            
            // 应用高亮到条目名称
            const highlightedName = highlightText(name, searchTerm);
            
            const $element = $(`<div class="rlh-item-container ${fromCard ? 'from-card' : ''}" data-type="${type}" data-id="${id}" ${isLore ? `data-book-name="${escapeHtml(bookName)}"`: ''}><div class="rlh-item-header" title="${fromCard ? '此条目来自角色卡，部分操作受限' : (appState.multiSelectMode ? '点击选择/取消选择' : '点击展开/编辑')}">${dragHandleHtml}<span class="rlh-item-name">${highlightedName}</span><div class="rlh-item-controls">${controlsHtml}</div></div><div class="rlh-collapsible-content"></div></div>`);
            
            // 保存搜索词以便在内容展开时使用
            $element.data('searchTerm', searchTerm);
            
            $element.toggleClass('enabled', item.enabled);

            if (appState.multiSelectMode) {
                const itemKey = isLore ? `lore:${bookName}:${id}` : `regex:${id}`;
                $element.toggleClass('selected', appState.selectedItems.has(itemKey));
            }

            return $element;
        };
        
        const updateSelectionCount = () => {
            $(`#rlh-selection-count`, parentDoc).text(`已选择: ${appState.selectedItems.size}`);
        };

        const getAllVisibleItems = () => {
            const visibleItems = [];
            const activeTab = appState.activeTab;
            if (activeTab === 'global-lore') {
                appState.allLorebooks.forEach(book => {
                    visibleItems.push({ type: 'book', id: book.name, enabled: book.enabled });
                    [...safeGetLorebookEntries(book.name)].forEach(entry => {
                        visibleItems.push({ type: 'lore', id: entry.uid, bookName: book.name, enabled: entry.enabled });
                    });
                });
            } else if (activeTab === 'char-lore') {
                appState.lorebooks.character.forEach(bookName => {
                    [...safeGetLorebookEntries(bookName)].forEach(entry => {
                        visibleItems.push({ type: 'lore', id: entry.uid, bookName, enabled: entry.enabled });
                    });
                });
            } else if (activeTab === 'global-regex') {
                appState.regexes.global.forEach(regex => {
                    visibleItems.push({ type: 'regex', id: regex.id, enabled: regex.enabled });
                });
            } else if (activeTab === 'char-regex') {
                appState.regexes.character.forEach(regex => {
                    visibleItems.push({ type: 'regex', id: regex.id, enabled: regex.enabled });
                });
            }
            return visibleItems;
        };
        
        const togglePanel = errorCatched(async () => {
            const $panel = $(`#${PANEL_ID}`, parentDoc);
            if ($panel.is(':visible')) {
                hidePanel();
            } else {
                await showPanel();
            }
        });

        const hidePanel = () => {
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

            $parentBody.on('mousedown.rlh-outside-click', function(event) {
                if ($(event.target).closest(`#${PANEL_ID}`).length === 0 && $(event.target).closest(`#${BUTTON_ID}`).length === 0) {
                    hidePanel();
                }
            });

            if (!appState.isDataLoaded) {
                await loadAllData();
            } else {
                renderContent();
            }
        };

        const switchTab = errorCatched(async (event) => {
            appState.activeTab = $(event.currentTarget).data('tab');
            $(`#${PANEL_ID} .rlh-tab`, parentDoc).removeClass('active');
            $(event.currentTarget).addClass('active');
            $(`#${CREATE_LOREBOOK_BTN_ID}`, parentDoc).toggle(appState.activeTab === 'global-lore');
            appState.selectedItems.clear();
            renderContent();
        });
        
        const toggleMultiSelectMode = errorCatched(async (event) => {
            appState.multiSelectMode = !appState.multiSelectMode;
            appState.selectedItems.clear();
            $(`#rlh-multi-select-btn`, parentDoc).toggleClass('active', appState.multiSelectMode);
            $(`#rlh-multi-select-controls`, parentDoc).toggleClass('active', appState.multiSelectMode);
            renderContent();
        });

        const handleMultiSelectHeaderClick = errorCatched(async (event) => {
            if (!appState.multiSelectMode) return;
            if ($(event.target).closest('.rlh-item-controls').length > 0) return;

            const $header = $(event.currentTarget);
            const $container = $header.closest('.rlh-item-container, .rlh-book-group');
            let itemKey;

            if ($container.hasClass('rlh-book-group')) {
                const bookName = $container.data('book-name');
                itemKey = `book:${bookName}`;
            } else {
                const itemType = $container.data('type');
                const itemId = $container.data('id');
                const bookName = $container.data('book-name');
                itemKey = (itemType === 'lore') ? `lore:${bookName}:${itemId}` : `regex:${itemId}`;
            }

            if (appState.selectedItems.has(itemKey)) {
                appState.selectedItems.delete(itemKey);
                $container.removeClass('selected');
            } else {
                appState.selectedItems.add(itemKey);
                $container.addClass('selected');
            }
            updateSelectionCount();
        });

        const handleSelectAll = errorCatched(async () => {
            getAllVisibleItems().forEach(item => {
                let itemKey;
                if (item.type === 'book') itemKey = `book:${item.id}`;
                else if (item.type === 'lore') itemKey = `lore:${item.bookName}:${item.id}`;
                else itemKey = `regex:${item.id}`;
                appState.selectedItems.add(itemKey);
            });
            renderContent();
        });

        const handleSelectNone = errorCatched(async () => {
            appState.selectedItems.clear();
            renderContent();
        });

        const handleSelectInvert = errorCatched(async () => {
            const newSelection = new Set();
            getAllVisibleItems().forEach(item => {
                let itemKey;
                if (item.type === 'book') itemKey = `book:${item.id}`;
                else if (item.type === 'lore') itemKey = `lore:${item.bookName}:${item.id}`;
                else itemKey = `regex:${item.id}`;
                if (!appState.selectedItems.has(itemKey)) {
                    newSelection.add(itemKey);
                }
            });
            appState.selectedItems = newSelection;
            renderContent();
        });

        const handleBatchEnable = errorCatched(async () => {
            if (appState.selectedItems.size === 0) return await showModal({ type: 'alert', title: '提示', text: '请先选择要启用的项目。' });
            await performBatchOperation(true);
            showSuccessTick("批量启用成功");
        });

        const handleBatchDisable = errorCatched(async () => {
            if (appState.selectedItems.size === 0) return await showModal({ type: 'alert', title: '提示', text: '请先选择要禁用的项目。' });
            await performBatchOperation(false);
            showSuccessTick("批量禁用成功");
        });

        const handleBatchDelete = errorCatched(async () => {
            const selectedBooks = new Set();
            const selectedEntries = new Map();
            const selectedRegexIds = new Set();
            let totalEntriesToDelete = 0;

            for (const key of appState.selectedItems) {
                const [type, ...parts] = key.split(':');
                if (type === 'book') {
                    selectedBooks.add(parts[0]);
                } else if (type === 'lore') {
                    const [bookName, entryId] = parts;
                    if (!selectedEntries.has(bookName)) {
                        selectedEntries.set(bookName, []);
                    }
                    selectedEntries.get(bookName).push(Number(entryId));
                    totalEntriesToDelete++;
                } else if (type === 'regex') {
                    selectedRegexIds.add(parts[0]);
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
                await showModal({ type: 'confirm', title: '确认删除', text: confirmText });
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
                    const result = await TavernAPI.deleteLorebookEntries(bookName, uids);
                    processedEntries += uids.length;

                    if (result && result.delete_occurred) {
                        deletedEntriesCount += uids.length;
                        safeSetLorebookEntries(bookName, result.entries);
                        uids.forEach(uid => appState.selectedItems.delete(`lore:${bookName}:${uid}`));
                    }
                }

                // 再删除整个世界书
                const booksToDelete = Array.from(selectedBooks);
                for (const bookName of booksToDelete) {
                    progressToast.update(`正在删除世界书... (${processedBooks + 1}/${booksToDelete.length})`);
                    if (await TavernAPI.deleteLorebook(bookName)) {
                        deletedBooksCount++;
                        appState.allLorebooks = appState.allLorebooks.filter(b => b.name !== bookName);
                        safeDeleteLorebookEntries(bookName);
                        appState.selectedItems.delete(`book:${bookName}`);
                        for (const key of appState.selectedItems) {
                            if (key.startsWith(`lore:${bookName}:`)) {
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
                    const regexesToKeep = allServerRegexes.filter(r => !selectedRegexIds.has(r.id));
                    
                    // 只替换非卡片内正则
                    await TavernAPI.replaceRegexes(regexesToKeep.filter(r => r.source !== 'card'));
                    await TavernAPI.saveSettings();

                    deletedRegexCount = allServerRegexes.length - regexesToKeep.length;

                    // 更新本地状态
                    appState.regexes.global = appState.regexes.global.filter(r => !selectedRegexIds.has(r.id));
                    appState.regexes.character = appState.regexes.character.filter(r => !selectedRegexIds.has(r.id));
                    selectedRegexIds.forEach(id => appState.selectedItems.delete(`regex:${id}`));
                }

                progressToast.remove();

                const messageParts = [];
                if (deletedBooksCount > 0) messageParts.push(`成功删除 ${deletedBooksCount} 本世界书`);
                if (deletedEntriesCount > 0) messageParts.push(`成功删除 ${deletedEntriesCount} 个条目`);
                if (deletedRegexCount > 0) messageParts.push(`成功删除 ${deletedRegexCount} 个正则`);

                if (messageParts.length > 0) {
                    showSuccessTick(messageParts.join('，'));
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
                await loadAllData(); // 发生错误时重新加载以同步状态
            }
        });
        
        const performBatchOperation = errorCatched(async (enable) => {
            const selectedBookNames = new Set();
            const selectedEntriesByBook = new Map();
            const selectedRegexIds = new Set();
            let needsRegexUpdate = false;
            let needsSettingsUpdate = false;
            
            for (const itemKey of appState.selectedItems) {
                const [type, ...parts] = itemKey.split(':');
                if (type === 'book') selectedBookNames.add(parts[0]);
                else if (type === 'lore') {
                    const [bookName, entryId] = parts;
                    if (!selectedEntriesByBook.has(bookName)) selectedEntriesByBook.set(bookName, []);
                    selectedEntriesByBook.get(bookName).push(Number(entryId));
                } else if (type === 'regex') selectedRegexIds.add(parts[0]);
            }

            if (selectedBookNames.size > 0) {
                const settings = await TavernAPI.getLorebookSettings();
                let currentBooks = new Set(settings.selected_global_lorebooks || []);
                selectedBookNames.forEach(name => enable ? currentBooks.add(name) : currentBooks.delete(name));
                await TavernAPI.setLorebookSettings({ selected_global_lorebooks: Array.from(currentBooks) });
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
                        const updates = entryIds.map(uid => {
                            const entry = entries.find(e => e.uid === uid);
                            if (entry) {
                                entry.enabled = enable;
                                return { uid, enabled: enable };
                            }
                            return null;
                        }).filter(Boolean);
                        if (updates.length > 0) await TavernAPI.setLorebookEntries(bookName, updates);
                    }
                }
            }

            if (selectedRegexIds.size > 0) {
                const allServerRegexes = await TavernAPI.getRegexes();
                allServerRegexes.forEach(regex => {
                    if (selectedRegexIds.has(regex.id)) regex.enabled = enable;
                });
                await TavernAPI.replaceRegexes(allServerRegexes.filter(r => r.source !== 'card'));
                needsRegexUpdate = true;
                [appState.regexes.global, appState.regexes.character].forEach(list => 
                    list.forEach(r => { if (selectedRegexIds.has(r.id)) r.enabled = enable; })
                );
            }

            if (needsSettingsUpdate || needsRegexUpdate) await TavernAPI.saveSettings();
            
            appState.selectedItems.clear();
            renderContent();
        });
        
        const handleHeaderClick = errorCatched(async (event) => {
            const $target = $(event.target);
            const $container = $(event.currentTarget).closest('.rlh-item-container, .rlh-book-group');

            // 如果点击的是按钮等可交互控件，则不执行后续逻辑
            if ($target.closest('.rlh-item-controls, .rlh-rename-ui').length > 0) {
                return;
            }

            // 如果处于多选模式
            if (appState.multiSelectMode) {
                let itemKey;
                const isGlobalLoreTab = appState.activeTab === 'global-lore';
                const isBookHeader = $container.hasClass('rlh-book-group');

                if (isGlobalLoreTab && isBookHeader) {
                    // **全局世界书页面的特殊逻辑**
                    const isEditingEntries = $container.hasClass('editing-entries');
                    if (!isEditingEntries) {
                        // 只有在非编辑模式下才能选择书本本身
                        const bookName = $container.data('book-name');
                        itemKey = `book:${bookName}`;
                    }
                } else if ($container.hasClass('rlh-item-container')) {
                    // **适用于所有页面中的条目 (item) 的通用逻辑**
                    const canSelectItem = isGlobalLoreTab ? $container.closest('.rlh-book-group').hasClass('editing-entries') : true;
                    
                    if (canSelectItem) {
                        const itemType = $container.data('type');
                        const itemId = $container.data('id');
                        if (itemType === 'lore') {
                            const bookName = $container.data('book-name');
                            itemKey = `lore:${bookName}:${itemId}`;
                        } else if (itemType === 'regex') {
                            itemKey = `regex:${itemId}`;
                        }
                    }
                }

                if (itemKey) {
                    if (appState.selectedItems.has(itemKey)) {
                        appState.selectedItems.delete(itemKey);
                        $container.removeClass('selected');
                    } else {
                        appState.selectedItems.add(itemKey);
                        $container.addClass('selected');
                    }
                    updateSelectionCount();
                }
                return; // 多选模式下不执行后续的单选展开逻辑
            }

            // --- 以下是单选模式下的展开/折叠逻辑 ---
            if ($container.hasClass('from-card') || $container.hasClass('renaming')) return;
            
            const $content = $container.find('.rlh-collapsible-content').first();
            
            // 对于世界书组，总是展开/折叠
            if ($container.is('.rlh-book-group')) {
                $content.slideToggle(200);
                return;
            }

            // 对于条目，展开/折叠编辑器
            if ($content.is(':visible')) {
                $content.slideUp(200, () => $content.empty());
                return;
            }
            
            $container.siblings('.rlh-item-container').find('.rlh-collapsible-content:visible').slideUp(200).empty();

            const type = $container.data('type');
            const id = $container.data('id');
            let item, editorHtml;

            if (type === 'lore') {
                const bookName = $container.data('book-name');
                const entries = [...safeGetLorebookEntries(bookName)];
                item = entries.find(e => e.uid === id);
                if (!item) return;

                const positionOptions = Object.entries(LOREBOOK_OPTIONS.position).map(([value, text]) => `<option value="${value}" ${item.position === value ? 'selected' : ''}>${text}</option>`).join('');
                const logicOptions = Object.entries(LOREBOOK_OPTIONS.logic).map(([value, text]) => `<option value="${value}" ${item.logic === value ? 'selected' : ''}>${text}</option>`).join('');

                // 获取搜索词以用于内容高亮
                const searchTerm = $container.data('searchTerm') || '';
                const highlightedContent = searchTerm ? highlightText(item.content || '', searchTerm) : escapeHtml(item.content || '');

                editorHtml = `
                    <div class="rlh-editor-field"><label>关键词 (逗号分隔)</label><input type="text" class="rlh-edit-keys" value="${escapeHtml((item.keys || []).join(', '))}"></div>
                    <div class="rlh-editor-field"><label>内容</label><div class="rlh-edit-content" contenteditable="true" style="min-height: 80px; padding: 8px; border-radius: 6px; border: 1px solid var(--rlh-border-color); box-sizing: border-box; background-color: var(--rlh-input-bg); color: #2C3E50;">${highlightedContent}</div></div>
                    <div class="rlh-editor-group"><h5>插入规则</h5>
                        <div class="rlh-editor-grid">
                            <div class="rlh-grid-item"><label>位置</label><select class="rlh-edit-position rlh-select-nudge">${positionOptions}</select></div>
                            <div class="rlh-grid-item rlh-depth-container"><label>深度</label><input type="number" class="rlh-edit-depth" placeholder="例如: 0" value="${item.depth ?? ''}"></div>
                            <div class="rlh-grid-item"><label>顺序</label><input type="number" class="rlh-edit-order" placeholder="例如: 100" value="${item.order ?? ''}"></div>
                        </div>
                    </div>
                    <div class="rlh-editor-group"><h5>激活逻辑</h5>
                        <div class="rlh-editor-grid">
                            <div class="rlh-grid-item"><label>概率 (%)</label><input type="number" class="rlh-edit-probability" min="0" max="100" placeholder="100" value="${item.probability ?? ''}"></div>
                            <div class="rlh-grid-item"><label>关键词逻辑</label><select class="rlh-edit-logic rlh-select-nudge">${logicOptions}</select></div>
                        </div>
                    </div>
                    <div class="rlh-editor-group"><h5>匹配与递归</h5>
                        <div class="rlh-editor-options-row">
                            <label class="rlh-editor-option-item"><input type="checkbox" class="rlh-edit-case-sensitive" ${item.case_sensitive ? 'checked' : ''}> 大小写敏感</label>
                            <label class="rlh-editor-option-item"><input type="checkbox" class="rlh-edit-match-whole" ${item.match_whole_words ? 'checked' : ''}> 全词匹配</label>
                            <label class="rlh-editor-option-item"><input type="checkbox" class="rlh-edit-prevent-recursion" ${item.prevent_recursion ? 'checked' : ''}> 防止递归</label>
                        </div>
                    </div>`;
            } else { // Regex editor
                item = [...appState.regexes.global, ...appState.regexes.character].find(r => r.id === id);
                if (!item) return;
                editorHtml = `<div class="rlh-editor-field"><label>查找正则表达式</label><textarea class="rlh-edit-find">${escapeHtml(item.find_regex || '')}</textarea></div>
                    <div class="rlh-editor-field"><label>替换为</label><textarea class="rlh-edit-replace">${escapeHtml(item.replace_string || '')}</textarea></div>
                    <div class="rlh-editor-group"><h5>短暂</h5><div class="rlh-editor-options-row"><label class="rlh-editor-option-item"><input type="checkbox" class="rlh-edit-dest-display" ${item.destination?.display ? 'checked' : ''}> 仅格式显示</label><label class="rlh-editor-option-item"><input type="checkbox" class="rlh-edit-dest-prompt" ${item.destination?.prompt ? 'checked' : ''}> 仅格式提示词</label></div></div>
                    <div class="rlh-editor-group"><h5>作用范围</h5><div class="rlh-editor-options-row"><label class="rlh-editor-option-item"><input type="checkbox" class="rlh-edit-src-user" ${item.source?.user_input ? 'checked' : ''}> 用户输入</label><label class="rlh-editor-option-item"><input type="checkbox" class="rlh-edit-src-ai" ${item.source?.ai_output ? 'checked' : ''}> AI输出</label><label class="rlh-editor-option-item"><input type="checkbox" class="rlh-edit-src-slash" ${item.source?.slash_command ? 'checked' : ''}> 斜杠命令</label><label class="rlh-editor-option-item"><input type="checkbox" class="rlh-edit-src-world" ${item.source?.world_info ? 'checked' : ''}> 世界书</label></div></div>
                    <div class="rlh-editor-group"><h5>深度</h5><div class="rlh-depth-inputs"><input type="number" class="rlh-edit-depth-min" placeholder="最小深度" value="${item.min_depth ?? ''}"><input type="number" class="rlh-edit-depth-max" placeholder="最大深度" value="${item.max_depth ?? ''}"></div></div>`;
            }

            const fullEditorHtml = `<div class="rlh-editor-wrapper">${editorHtml}<div class="rlh-editor-actions"><button class="rlh-action-btn rlh-maximize-btn" title="展开"><i class="fa-solid fa-expand"></i></button><button class="rlh-action-btn rlh-save-btn">保存</button></div></div>`;
            $content.html(fullEditorHtml).slideDown(200, () => {
                $content.find('.rlh-edit-position').trigger('change');
            });
        });
        
        const handleEditEntriesToggle = errorCatched(async (event) => {
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
        
        const handleToggleState = errorCatched(async (event) => {
            event.stopPropagation();
            const $button = $(event.currentTarget);
            const $elementToSort = $button.closest('.rlh-book-group, .rlh-item-container');
            if ($elementToSort.hasClass('renaming')) return;

            const isEnabling = !$elementToSort.hasClass('enabled');
            const parentList = $elementToSort.parent();

            if ($button.hasClass('rlh-global-toggle')) {
                const bookName = $elementToSort.data('book-name');
                const settings = await TavernAPI.getLorebookSettings();
                const currentBooks = new Set(settings.selected_global_lorebooks || []);
                if (isEnabling) currentBooks.add(bookName); else currentBooks.delete(bookName);
                await TavernAPI.setLorebookSettings({ selected_global_lorebooks: Array.from(currentBooks) });
                await TavernAPI.saveSettings();
                const bookState = appState.allLorebooks.find(b => b.name === bookName);
                if (bookState) bookState.enabled = isEnabling;
            } else {
                const type = $elementToSort.data('type');
                const id = $elementToSort.data('id');
                if (type === 'lore') {
                    const bookName = $elementToSort.data('book-name');
                    await TavernAPI.setLorebookEntries(bookName, [{ uid: Number(id), enabled: isEnabling }]);
                    const entry = safeGetLorebookEntries(bookName).find(e => e.uid === Number(id));
                    if (entry) entry.enabled = isEnabling;
                } else {
                    const allServerRegexes = await TavernAPI.getRegexes();
                    const regex = allServerRegexes.find(r => r.id === id);
                    if (regex) {
                        regex.enabled = isEnabling;
                        await TavernAPI.replaceRegexes(allServerRegexes.filter(r => r.source !== 'card'));
                        await TavernAPI.saveSettings();
                        const localRegex = appState.regexes.global.find(r => r.id === id) || appState.regexes.character.find(r => r.id === id);
                        if (localRegex) localRegex.enabled = isEnabling;
                    }
                }
            }

            showSuccessTick(isEnabling ? "已启用" : "已禁用");
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

        const handleSave = errorCatched(async (event) => {
            const $container = $(event.currentTarget).closest('.rlh-item-container');
            const type = $container.data('type');
            const id = $container.data('id');
            
            if (type === 'lore') {
                const bookName = $container.data('book-name');
                const updatedEntry = { uid: Number(id) };
                updatedEntry.keys = $container.find('.rlh-edit-keys').val().split(',').map(k => k.trim()).filter(Boolean);
                updatedEntry.content = $container.find('.rlh-edit-content').text();
                updatedEntry.position = $container.find('.rlh-edit-position').val();
                
                const depthVal = parseInt($container.find('.rlh-edit-depth').val(), 10);
                updatedEntry.depth = isNaN(depthVal) ? null : depthVal;
                
                const orderVal = parseInt($container.find('.rlh-edit-order').val(), 10);
                updatedEntry.order = isNaN(orderVal) ? 100 : orderVal;
                
                const probabilityVal = parseInt($container.find('.rlh-edit-probability').val(), 10);
                updatedEntry.probability = isNaN(probabilityVal) ? 100 : probabilityVal;
                
                updatedEntry.logic = $container.find('.rlh-edit-logic').val();
                updatedEntry.case_sensitive = $container.find('.rlh-edit-case-sensitive').is(':checked');
                updatedEntry.match_whole_words = $container.find('.rlh-edit-match-whole').is(':checked');
                updatedEntry.prevent_recursion = $container.find('.rlh-edit-prevent-recursion').is(':checked');
                
                await TavernAPI.setLorebookEntries(bookName, [updatedEntry]);
                
                const entry = safeGetLorebookEntries(bookName).find(e => e.uid === Number(id));
                if (entry) { Object.assign(entry, updatedEntry); }
                
            } else { // type === 'regex'
                const allServerRegexes = await TavernAPI.getRegexes();
                const regex = allServerRegexes.find(r => r.id === id);
                
                if (regex) {
                    regex.find_regex = $container.find('.rlh-edit-find').val();
                    regex.replace_string = $container.find('.rlh-edit-replace').val();
                    regex.destination.display = $container.find('.rlh-edit-dest-display').is(':checked');
                    regex.destination.prompt = $container.find('.rlh-edit-dest-prompt').is(':checked');
                    regex.source.user_input = $container.find('.rlh-edit-src-user').is(':checked');
                    regex.source.ai_output = $container.find('.rlh-edit-src-ai').is(':checked');
                    regex.source.slash_command = $container.find('.rlh-edit-src-slash').is(':checked');
                    regex.source.world_info = $container.find('.rlh-edit-src-world').is(':checked');
                    
                    const minDepth = parseInt($container.find('.rlh-edit-depth-min').val(), 10);
                    const maxDepth = parseInt($container.find('.rlh-edit-depth-max').val(), 10);
                    regex.min_depth = isNaN(minDepth) ? null : minDepth;
                    regex.max_depth = isNaN(maxDepth) ? null : maxDepth;
                    
                    await TavernAPI.replaceRegexes(allServerRegexes.filter(r => r.source !== 'card'));
                    await TavernAPI.saveSettings();
                    
                    Object.assign(appState.regexes.global.find(r => r.id === id) || appState.regexes.character.find(r => r.id === id), regex);
                }
            }
            showSuccessTick("保存成功");
        });
        
        const updateLinkedCharacters = errorCatched(async (oldBookName, newBookName, progressToast) => {
            const linkedChars = appState.lorebookUsage.get(oldBookName) || [];
            if (linkedChars.length === 0) return;

            const context = window.parent.SillyTavern.getContext();
            const originalCharId = context.characterId;
            let processedCount = 0;
            const totalCount = linkedChars.length;
            progressToast.update(`正在更新 ${totalCount} 个关联角色... (0/${totalCount})`);

            for (const charName of linkedChars) {
                try {
                    // 使用正确的方法获取角色索引
                    const charIndex = window.parent.Character?.findCharacterIndex?.(charName) ?? 
                                    context.characters.findIndex(c => c.name === charName);
                    if (charIndex === -1) {
                        console.warn(`[RegexLoreHub] Character "${charName}" not found, skipping...`);
                        continue;
                    }

                    console.log(`[RegexLoreHub] Switching to character "${charName}" (index: ${charIndex})`);
                    await context.selectCharacterById(charIndex);
                    
                    const charBooks = await TavernAPI.getCharLorebooks({ name: charName });
                    if (!charBooks) {
                        console.warn(`[RegexLoreHub] Failed to get lorebooks for character "${charName}"`);
                        continue;
                    }

                    console.log(`[RegexLoreHub] Current lorebooks for "${charName}":`, charBooks);
                    let updated = false;
                    if (charBooks.primary === oldBookName) {
                        console.log(`[RegexLoreHub] Updating primary lorebook from "${oldBookName}" to "${newBookName}"`);
                        charBooks.primary = newBookName;
                        updated = true;
                    }
                    if (charBooks.additional) {
                        const index = charBooks.additional.indexOf(oldBookName);
                        if (index > -1) {
                            console.log(`[RegexLoreHub] Updating additional lorebook at index ${index} from "${oldBookName}" to "${newBookName}"`);
                            charBooks.additional[index] = newBookName;
                            updated = true;
                        }
                    }

                    if (updated) {
                        console.log(`[RegexLoreHub] Saving updated lorebooks for "${charName}":`, charBooks);
                        await TavernAPI.setCurrentCharLorebooks(charBooks);
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
        
        const handleRenameBook = errorCatched(async (event) => {
            event.stopPropagation();
            const $bookGroup = $(event.currentTarget).closest('.rlh-book-group');
            const oldName = $bookGroup.data('book-name');
            if (!oldName) return;

            let newName;
            try {
                newName = await showModal({
                    type: 'prompt',
                    title: '重命名世界书',
                    text: '请输入新的世界书名称：',
                    value: oldName
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
            
            console.log(`[RegexLoreHub] Renaming lorebook "${oldName}" to "${newName}", linked characters:`, linkedCharacters, 'chat linked:', isChatLinked);
            
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
            if (totalBindings === 0) {
                confirmText += `无绑定关系\n`;
            }
            
            // 在全局世界书页面添加API限制提示
            if (appState.activeTab === 'global-lore') {
                confirmText += `\n⚠️ 重要提示：由于SillyTavern API限制，目前只能获取当前聊天的世界书绑定关系，无法直接列出所有聊天的世界书绑定。如果此世界书被其他聊天使用，重命名后需要手动检查那些聊天的绑定状态。\n`;
            }
            
            confirmText += `\n是否继续？`;
            
            try {
                await showModal({
                    type: 'confirm',
                    title: '确认重命名',
                    text: confirmText
                });
            } catch {
                return; // User cancelled
            }

            const progressToast = showProgressToast('开始重命名...');
            try {
                progressToast.update('正在创建新世界书...');
                const createSuccess = await TavernAPI.createLorebook(newName);
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
                    await TavernAPI.createLorebookEntries(newName, entriesToCreate);
                }

                await updateLinkedCharacters(oldName, newName, progressToast);

                progressToast.update('正在更新全局设置...');
                const globalSettings = await TavernAPI.getLorebookSettings();
                if (globalSettings.selected_global_lorebooks && globalSettings.selected_global_lorebooks.includes(oldName)) {
                    const newGlobalBooks = globalSettings.selected_global_lorebooks.map(name => name === oldName ? newName : name);
                    await TavernAPI.setLorebookSettings({ selected_global_lorebooks: newGlobalBooks });
                    console.log(`[RegexLoreHub] Updated global lorebook settings from "${oldName}" to "${newName}"`);
                    
                    // 验证全局设置更新是否成功
                    const updatedGlobalSettings = await TavernAPI.getLorebookSettings();
                    if (!updatedGlobalSettings.selected_global_lorebooks || !updatedGlobalSettings.selected_global_lorebooks.includes(newName)) {
                        console.warn(`[RegexLoreHub] Global lorebook settings update verification failed for "${newName}"`);
                    }
                }

                if (appState.chatLorebook === oldName) {
                   progressToast.update('正在更新聊天绑定...');
                   await TavernAPI.setChatLorebook(newName);
                   appState.chatLorebook = newName;
                   console.log(`[RegexLoreHub] Updated chat lorebook from "${oldName}" to "${newName}"`);
                   
                   // 立即验证聊天世界书更新是否成功
                   const updatedChatLorebook = await TavernAPI.getChatLorebook();
                   if (updatedChatLorebook !== newName) {
                       console.warn(`[RegexLoreHub] Chat lorebook update verification failed. Expected: "${newName}", Got: "${updatedChatLorebook}"`);
                       appState.chatLorebook = updatedChatLorebook;
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
                await TavernAPI.deleteLorebook(oldName);
                
                progressToast.update('正在刷新数据...');
                // 保存当前聊天世界书状态，防止在数据刷新时丢失
                const currentChatLorebook = appState.chatLorebook;
                await loadAllData();
                
                // 如果聊天世界书在刷新后发生了意外变化，恢复正确的状态
                if (currentChatLorebook && appState.chatLorebook !== currentChatLorebook) {
                    console.log(`[RegexLoreHub] Restoring chat lorebook state after data refresh: "${currentChatLorebook}"`);
                    appState.chatLorebook = currentChatLorebook;
                }
                
                // 强制同步聊天世界书状态，确保在所有页面都能正确反映最新状态
                try {
                    const finalChatLorebook = await TavernAPI.getChatLorebook();
                    if (finalChatLorebook !== appState.chatLorebook) {
                        console.log(`[RegexLoreHub] Final chat lorebook sync: "${finalChatLorebook}"`);
                        appState.chatLorebook = finalChatLorebook;
                    }
                } catch (syncError) {
                    console.warn('[RegexLoreHub] Failed to sync final chat lorebook state:', syncError);
                }
                
                progressToast.remove();
                showSuccessTick("世界书重命名成功");

            } catch (error) {
                progressToast.remove();
                console.error('[RegexLoreHub] Rename failed:', error);
                await showModal({ type: 'alert', title: '重命名失败', text: `操作失败: ${error.message}` });
                // Attempt to clean up the newly created book if rename fails midway
                if (appState.allLorebooks.some(b => b.name === newName)) {
                    await TavernAPI.deleteLorebook(newName);
                }
                
                // 保存当前聊天世界书状态，防止在错误恢复时丢失
                const currentChatLorebook = appState.chatLorebook;
                await loadAllData();
                
                // 恢复聊天世界书状态（如果在错误处理过程中被意外更改）
                 if (currentChatLorebook && appState.chatLorebook !== currentChatLorebook) {
                     console.log(`[RegexLoreHub] Restoring chat lorebook state after error recovery: "${currentChatLorebook}"`);
                     appState.chatLorebook = currentChatLorebook;
                 }
                 
                 // 在错误恢复后也强制同步聊天世界书状态
                 try {
                     const finalChatLorebook = await TavernAPI.getChatLorebook();
                     if (finalChatLorebook !== appState.chatLorebook) {
                         console.log(`[RegexLoreHub] Final chat lorebook sync after error recovery: "${finalChatLorebook}"`);
                         appState.chatLorebook = finalChatLorebook;
                     }
                 } catch (syncError) {
                     console.warn('[RegexLoreHub] Failed to sync chat lorebook state after error recovery:', syncError);
                 }
            }
        });

        const handleRename = errorCatched(async (event) => {
            event.stopPropagation();
            const $container = $(event.currentTarget).closest('.rlh-item-container');
            if ($container.hasClass('renaming') || $container.length === 0) return;

            const $header = $container.find('.rlh-item-header').first();
            const $nameSpan = $header.find('.rlh-item-name').first();
            const oldName = $nameSpan.clone().children().remove().end().text().trim();
            
            const renameUIHtml = `<div class="rlh-rename-ui"><div class="rlh-rename-input-wrapper"><input type="text" class="rlh-rename-input" value="${escapeHtml(oldName)}" /><button class="rlh-action-btn-icon rlh-rename-save-btn" title="确认"><i class="fa-solid fa-check"></i></button><button class="rlh-action-btn-icon rlh-rename-cancel-btn" title="取消"><i class="fa-solid fa-times"></i></button></div></div>`;
            
            $container.addClass('renaming');
            $header.append(renameUIHtml);
            $header.find('.rlh-rename-input').focus().select();
        });

        const exitRenameMode = ($container, newName = null) => {
            const $header = $container.find('.rlh-item-header').first();
            const $nameSpan = $header.find('.rlh-item-name').first();
            if (newName) {
                $nameSpan.text(newName);
            }
            $header.find('.rlh-rename-ui').remove();
            $container.removeClass('renaming');
        };

        const handleConfirmRename = errorCatched(async (event) => {
            event.stopPropagation();
            const $container = $(event.currentTarget).closest('.rlh-item-container');
            const $input = $container.find('.rlh-rename-input');
            const newName = $input.val().trim();
            const oldName = $container.find('.rlh-item-name').first().text().trim();

            if (!newName || newName === oldName) {
                exitRenameMode($container, oldName);
                return;
            }

            const type = $container.data('type');
            const id = $container.data('id');

            if (type === 'lore') {
                const bookName = $container.data('book-name');
                await TavernAPI.setLorebookEntries(bookName, [{ uid: Number(id), comment: newName }]);
                const entries = [...safeGetLorebookEntries(bookName)];
                const entry = entries.find(e => e.uid === Number(id));
                if (entry) entry.comment = newName;
            } else { // type === 'regex'
                const allServerRegexes = await TavernAPI.getRegexes();
                const regex = allServerRegexes.find(r => r.id === id);
                if (regex) {
                    regex.script_name = newName;
                    await TavernAPI.replaceRegexes(allServerRegexes.filter(r => r.source !== 'card'));
                    await TavernAPI.saveSettings();
                    const localRegex = appState.regexes.global.find(r => r.id === id) || appState.regexes.character.find(r => r.id === id);
                    if (localRegex) localRegex.script_name = newName;
                }
            }
            exitRenameMode($container, newName);
            showSuccessTick("重命名成功");
        });

        const handleCancelRename = errorCatched(async (event) => {
            event.stopPropagation();
            const $container = $(event.currentTarget).closest('.rlh-item-container');
            exitRenameMode($container);
        });

        const handleRenameKeydown = errorCatched(async (event) => {
            if (event.key === 'Enter') {
                $(event.currentTarget).siblings('.rlh-rename-save-btn').click();
            } else if (event.key === 'Escape') {
                $(event.currentTarget).siblings('.rlh-rename-cancel-btn').click();
            }
        });

        const handleEditorExpandToggle = errorCatched(async (event) => {
            event.stopPropagation();
            const $button = $(event.currentTarget);
            const $editorWrapper = $button.closest('.rlh-editor-wrapper');
            const $textareas = $editorWrapper.find('textarea');
            $editorWrapper.toggleClass('expanded');
            
            if ($editorWrapper.hasClass('expanded')) {
                $button.attr('title', '收缩').find('i').removeClass('fa-expand').addClass('fa-compress');
                $textareas.each(function() {
                    this.style.height = 'auto';
                    this.style.height = (this.scrollHeight) + 'px';
                });
            } else {
                $button.attr('title', '展开').find('i').removeClass('fa-compress').addClass('fa-expand');
                $textareas.css('height', '');
            }
        });
        
        const handleCollapseCurrent = errorCatched(async (event) => {
            const $visibleContent = $(`#${PANEL_ID}-content .rlh-item-container .rlh-collapsible-content:visible`, parentDoc).first();
            if ($visibleContent.length) {
                $visibleContent.slideUp(200, function() {
                    $(this).empty();
                });
            }
        });
        
        const handleCollapseAll = errorCatched(async (event) => {
            const $visibleContents = $(`#${PANEL_ID}-content .rlh-collapsible-content:visible`, parentDoc);
            if ($visibleContents.length) {
                $visibleContents.slideUp(200, function() {
                    if ($(this).closest('.rlh-item-container').length) {
                        $(this).empty();
                    }
                });
            }
        });

        const handleRefresh = errorCatched(async (event) => {
            const $button = $(event.currentTarget);
            const $icon = $button.find('i');
            $icon.addClass('fa-spin');
            await loadAllData();
            setTimeout(() => $icon.removeClass('fa-spin'), 500);
        });

        const handleCreateLorebook = errorCatched(async () => {
            let newName;
            try {
                newName = await showModal({ type: 'prompt', title: '新建世界书', text: '请输入新世界书的名称:' });
            } catch {
                return;
            }

            if (appState.allLorebooks.some(book => book.name === newName.trim())) {
                await showModal({ type: 'alert', title: '错误', text: '已存在同名世界书。' });
                return;
            }
            
            const success = await TavernAPI.createLorebook(newName.trim());
            if (success) {
                await loadAllData();
                showSuccessTick("世界书创建成功");
            } else {
                await showModal({ type: 'alert', title: '创建失败', text: '创建世界书时发生错误，请检查控制台。' });
            }
        });

        const handleDeleteLorebook = errorCatched(async (event) => {
            event.stopPropagation();
            const $bookGroup = $(event.currentTarget).closest('.rlh-book-group');
            const bookName = $bookGroup.data('book-name');
            try {
                await showModal({ type: 'confirm', title: '确认删除', text: `您确定要永久删除世界书 "${bookName}" 吗？此操作无法撤销。` });
            } catch {
                return;
            }

            const success = await TavernAPI.deleteLorebook(bookName);
            if (success) {
                appState.allLorebooks = appState.allLorebooks.filter(b => b.name !== bookName);
                safeDeleteLorebookEntries(bookName);
                $bookGroup.slideUp(300, () => $bookGroup.remove());
                showSuccessTick("删除成功");
            } else {
                await showModal({ type: 'alert', title: '删除失败', text: '删除世界书时发生错误，请检查控制台。' });
            }
        });

        const handleCreateEntry = errorCatched(async (event) => {
            const $button = $(event.currentTarget);
            const bookName = $button.data('book-name');
            const result = await TavernAPI.createLorebookEntries(bookName, [{ comment: '新条目', enabled: false, keys: [] }]);
            
            if (result && result.new_uids && result.new_uids.length > 0) {
                const newEntry = result.entries.find(e => e.uid === result.new_uids[0]);
                safeSetLorebookEntries(bookName, result.entries);
                const $newEntryElement = createItemElement(newEntry, 'lore', bookName);
                $button.parent('.rlh-entry-actions').after($newEntryElement);
                $newEntryElement.hide().slideDown(200, () => {
                    const $header = $newEntryElement.find('.rlh-item-header');
                    if (!$header.hasClass('renaming')) {
                        $header.click();
                    }
                });
                showSuccessTick("新条目已创建");
            } else {
                await showModal({ type: 'alert', title: '创建失败', text: '创建新条目时发生错误，请检查控制台。' });
            }
        });

        const handleDeleteEntry = errorCatched(async (event) => {
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
            
            const result = await TavernAPI.deleteLorebookEntries(bookName, [uid]);
            if (result && result.delete_occurred) {
                safeSetLorebookEntries(bookName, result.entries);
                $item.slideUp(300, () => $item.remove());
                showSuccessTick("删除成功");
            } else {
                await showModal({ type: 'alert', title: '删除失败', text: '删除条目时发生错误，请检查控制台。' });
            }
        });

        const debouncedSaveRegexOrder = debounce(errorCatched(async () => {
            const allRegexes = [...appState.regexes.global, ...appState.regexes.character];
            await TavernAPI.replaceRegexes(allRegexes.filter(r => r.source !== 'card'));
            await TavernAPI.saveSettings();
            showSuccessTick("正则顺序已保存");
        }), 800);

        const handleRegexDragEnd = errorCatched(async (evt, scope) => {
            const { oldIndex, newIndex } = evt;
            if (oldIndex === newIndex) return;

            const targetList = appState.regexes[scope];
            const [movedItem] = targetList.splice(oldIndex, 1);
            targetList.splice(newIndex, 0, movedItem);

            // 乐观更新UI：重新渲染序号
            renderContent();
            
            // 防抖保存
            debouncedSaveRegexOrder();
        });


        // Debounce function
        function debounce(func, delay) {
            let timeout;
            return function(...args) {
                const context = this;
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(context, args), delay);
            };
        }
        const handlePositionChange = errorCatched(async (event) => {
            const $select = $(event.currentTarget);
            const $depthContainer = $select.closest('.rlh-editor-grid').find('.rlh-depth-container');
            if ($select.val().startsWith('at_depth')) {
                $depthContainer.slideDown(200);
            } else {
                $depthContainer.slideUp(200);
            }
        });

        const handleBatchSetRecursion = errorCatched(async (event) => {
            const bookName = $(event.currentTarget).data('book-name');
            const entries = [...safeGetLorebookEntries(bookName)];
            if (!entries || entries.length === 0) {
                await showModal({ type: 'alert', title: '提示', text: '该世界书没有条目可操作。' });
                return;
            }

            try {
                await showModal({ type: 'confirm', title: '确认操作', text: `确定要为 "${bookName}" 中的所有条目开启“防止递归”吗？` });
            } catch {
                return; // 用户取消
            }

            const updates = entries.map(entry => ({
                uid: entry.uid,
                prevent_recursion: true
            }));

            await TavernAPI.setLorebookEntries(bookName, updates);

            // 更新本地状态
            entries.forEach(entry => {
                entry.prevent_recursion = true;
            });

            // 如果有打开的编辑器，则更新其中的复选框
            const $openEditor = $(`#${PANEL_ID}-content .rlh-item-container[data-book-name="${bookName}"] .rlh-collapsible-content:visible`, parentDoc);
            if ($openEditor.length) {
                $openEditor.find('.rlh-edit-prevent-recursion').prop('checked', true);
            }
            
            showSuccessTick("已为所有条目开启“防止递归”");
        });

        const handleFixKeywords = errorCatched(async (event) => {
            const bookName = $(event.currentTarget).data('book-name');
            const entries = [...safeGetLorebookEntries(bookName)];
            if (!entries || entries.length === 0) {
                await showModal({ type: 'alert', title: '提示', text: '该世界书没有条目可操作。' });
                return;
            }

            try {
                await showModal({ type: 'confirm', title: '确认操作', text: `确定要为 "${bookName}" 中的所有条目修复关键词（将中文逗号替换为英文逗号）吗？` });
            } catch {
                return; // 用户取消
            }

            let changedCount = 0;
            const updates = entries.map(entry => {
                const originalKeysString = (entry.keys || []).join(', ');
                // 修复中文逗号和多余的空格
                const newKeysString = originalKeysString.replace(/，/g, ',').replace(/,+/g, ',').trim();
                const newKeysArray = newKeysString.split(',').map(k => k.trim()).filter(Boolean);
                const finalKeysString = newKeysArray.join(', ');

                if (originalKeysString !== finalKeysString) {
                    changedCount++;
                    return {
                        uid: entry.uid,
                        keys: newKeysArray
                    };
                }
                return null;
            }).filter(Boolean);

            if (updates.length > 0) {
                await TavernAPI.setLorebookEntries(bookName, updates);

                // 更新本地状态
                updates.forEach(update => {
                    const entry = entries.find(e => e.uid === update.uid);
                    if (entry) {
                        entry.keys = update.keys;
                    }
                });

                // 如果有打开的编辑器，则更新其中的输入框
                updates.forEach(update => {
                    const $openEditor = $(`#${PANEL_ID}-content .rlh-item-container[data-book-name="${bookName}"][data-id="${update.uid}"] .rlh-collapsible-content:visible`, parentDoc);
                    if ($openEditor.length) {
                        $openEditor.find('.rlh-edit-keys').val(update.keys.join(', '));
                    }
                });

                showSuccessTick(`成功修复了 ${changedCount} 个条目的关键词`);
            } else {
                await showModal({ type: 'alert', title: '提示', text: '所有条目的关键词格式都正确，无需修复。' });
            }
        });

        const handleCreateChatLorebook = errorCatched(async () => {
            const bookName = await TavernAPI.getOrCreateChatLorebook();
            if (bookName) {
                showSuccessTick(`已创建并绑定聊天世界书: ${bookName}`);
                await loadAllData();
            } else {
                await showModal({ type: 'alert', title: '操作失败', text: '无法创建或绑定聊天世界书，请检查控制台。' });
            }
        });

        const handleUnlinkChatLorebook = errorCatched(async () => {
            const bookName = appState.chatLorebook;
            if (!bookName) return;

            try {
                await showModal({ type: 'confirm', title: '确认解除绑定', text: `您确定要解除与聊天世界书 "${bookName}" 的绑定吗？世界书本身不会被删除。` });
            } catch {
                return; // 用户取消
            }

            await TavernAPI.setChatLorebook(null);
            appState.chatLorebook = null;
            showSuccessTick("已解除绑定");
            renderContent();
        });

        // --- UI 创建与初始化 ---
        function loadSortableJS(callback) {
            if (parent.Sortable) {
                callback();
                return;
            }
            const script = parent.document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js';
            script.onload = () => {
                console.log('[RegexLoreHub] SortableJS loaded successfully.');
                callback();
            };
            script.onerror = () => {
                console.error('[RegexLoreHub] Failed to load SortableJS.');
                showModal({ type: 'alert', title: '错误', text: '无法加载拖拽排序库，请检查网络连接或浏览器控制台。' });
            };
            parent.document.head.appendChild(script);
        }
        
        function initializeScript() {
            console.log('[RegexLoreHub] Initializing UI and button...');
            
            if ($(`#${PANEL_ID}`, parentDoc).length > 0) {
                console.log('[RegexLoreHub] Panel already exists. Skipping UI creation.');
                return;
            }
            
            const styles = `<style id="regex-lore-hub-styles">
                /* 移除全局文本阴影修改，避免影响整个酒馆 */
                #${PANEL_ID} * { text-shadow: none !important; }
                /* 限制CSS变量作用域，避免影响全局 */
                #${PANEL_ID} {
                    --rlh-border-color: #7EB7D5;
                    --rlh-text-color: #2C3E50;
                    --rlh-bg-color: #FAF5D5;
                    --rlh-shadow-color: rgba(0,0,0,0.1);
                    --rlh-header-bg: #DAEEF5;
                    --rlh-hover-bg: rgba(126, 183, 213, 0.15);
                    --rlh-em-color: #34495E;
                    --rlh-accent-color: #6B9BC2;
                    --rlh-selected-border: #6B9BC2;
                    --rlh-green: #28a745; 
                    --rlh-red: #dc3545; 
                    --rlh-green-bg: rgba(40, 167, 69, 0.15); 
                    --rlh-red-bg: rgba(220, 53, 69, 0.15);                    
                }
                @keyframes fa-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } } 
                .fa-spin { animation: fa-spin 1s infinite linear; } 
                #${PANEL_ID} {
                    display: none; position: fixed; top: 50px; left: 50%; transform: translateX(-50%);
                    width: 90%; max-width: 850px; height: 80vh; max-height: 80vh;
                    background-color: var(--rlh-bg-color); color: var(--rlh-text-color);
                    border: 1px solid var(--rlh-border-color); border-radius: 12px; 
                    box-shadow: 0 8px 25px var(--rlh-shadow-color); z-index: 10000; 
                    flex-direction: column; font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; overflow: hidden;
                } 
                .rlh-panel-header { 
                    display: flex; justify-content: space-between; align-items: center; 
                    padding: 12px 20px; border-bottom: 1px solid var(--rlh-border-color); 
                    background-color: var(--rlh-header-bg); border-radius: 10px 10px 0 0; flex-shrink: 0;
                } 
                .rlh-close-button { background: none; border: none; font-size: 1.8em; cursor: pointer; transition: color 0.2s; color: var(--rlh-em-color);} 
                .rlh-tab-nav { display: flex; border-bottom: 1px solid var(--rlh-border-color); padding: 0 10px; background-color: var(--rlh-bg-color); flex-shrink: 0;} 
                .rlh-tab { padding: 12px 18px; cursor: pointer; border-bottom: 3px solid transparent; transition: all 0.2s; color: var(--rlh-em-color); font-weight: 500;} 
                .rlh-tab:hover { background-color: var(--rlh-hover-bg);} 
                .rlh-tab.active { color: var(--rlh-text-color); border-bottom-color: var(--rlh-accent-color); font-weight: 600;} 
                .rlh-tab-text-short { display: none;} 
                .rlh-tab-text-full { display: inline;} 
                .rlh-search-container { padding: 10px 20px; border-bottom: 1px solid var(--rlh-border-color); flex-shrink: 0;} 
                .rlh-search-controls { display: flex; align-items: center; gap: 8px;} 
                #${SEARCH_INPUT_ID}, #rlh-replace-input {
                    width: 100%; flex-grow: 1; padding: 10px; border: 1px solid var(--rlh-border-color);
                    border-radius: 8px; box-sizing: border-box; background-color: var(--rlh-input-bg); color: #2C3E50 !important;
                }
                #${SEARCH_INPUT_ID}:focus { border-color: var(--rlh-accent-color); box-shadow: 0 0 0 3px var(--rlh-selected-bg); outline: none;} 
                .rlh-search-action-btn { 
                    flex-shrink: 0; background: none; border: 1px solid var(--rlh-border-color); color: var(--rlh-em-color); 
                    padding: 0; width: 38px; height: 38px; border-radius: 8px; cursor: pointer; 
                    transition: all 0.2s ease; display: inline-flex; justify-content: center; align-items: center; font-size: 1.1em;
                } 
                .rlh-search-action-btn:hover { background-color: var(--rlh-hover-bg); border-color: var(--rlh-accent-color); color: var(--rlh-text-color);} 
                #${CREATE_LOREBOOK_BTN_ID} { color: var(--rlh-green); border-color: var(--rlh-green);} 
                #${CREATE_LOREBOOK_BTN_ID}:hover { background-color: var(--rlh-green-bg);} 
                .rlh-multi-select-btn { color: var(--rlh-accent-color); border-color: var(--rlh-accent-color);} 
                .rlh-multi-select-btn.active { background-color: var(--rlh-accent-color); color: var(--rlh-bg-color); border-color: var(--rlh-accent-color);} 
                .rlh-multi-select-btn:hover { background-color: var(--rlh-hover-bg);} 
                .rlh-multi-select-btn.active:hover { background-color: var(--rlh-accent-color); opacity: 0.9;} 
                #rlh-search-filters-container { display: flex; gap: 15px; margin-top: 10px; flex-wrap: wrap;} 
                .rlh-filter-item { display: flex; align-items: center; cursor: pointer; font-size: 0.9em;} 
                .rlh-filter-item input { margin-right: 5px; cursor: pointer; accent-color: var(--rlh-border-color);} 
                #${PANEL_ID}-content { 
                    overflow-y: auto; flex-grow: 1; padding: 15px; background-color: var(--rlh-bg-color); 
                    border-bottom-left-radius: 10px; border-bottom-right-radius: 10px;
                } 
                .rlh-info-text, .rlh-info-text-small { text-align: center; color: var(--rlh-em-color); padding: 20px; font-style: italic;} 
                .rlh-info-text-small { padding: 10px;} 
                .rlh-book-group, .rlh-item-container { margin-bottom: 10px; border-radius: 8px; overflow: hidden; } 
                .rlh-book-group-header { font-size: 1.2em; font-weight: bold; padding: 8px 5px; border-bottom: 2px solid var(--rlh-hover-bg); margin-bottom: 10px;} 
                .rlh-global-book-header {
                    display: flex; justify-content: space-between; align-items: center; padding: 10px 15px;
                    border: 1px solid var(--rlh-border-color); transition: background-color 0.2s, border-color 0.2s;
                    cursor: pointer; border-radius: 8px;
                    flex-wrap: wrap;
                }
                .rlh-used-by-chars {
                    width: 100%;
                    margin-top: 8px;
                    padding-top: 8px;
                    border-top: 1px solid var(--rlh-hover-bg);
                    font-size: 0.85em;
                    color: var(--rlh-em-color);
                }
                .rlh-used-by-chars span {
                    background-color: var(--rlh-hover-bg);
                    padding: 2px 5px;
                    border-radius: 4px;
                    margin: 0 2px;
                    display: inline-block;
                    margin-bottom: 3px;
                }
                .rlh-book-group.enabled .rlh-global-book-header { background-color: var(--rlh-selected-bg); border-color: var(--rlh-accent-color);} 
                .rlh-item-container {border: 1px solid var(--rlh-border-color); border-radius: 12px;} 
                .rlh-item-container.from-card { border-color: var(--rlh-accent-color); } 
                .rlh-item-container.from-card .rlh-item-header { cursor: not-allowed; } 
                .rlh-item-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; cursor: pointer; position: relative;} 
                .rlh-item-name { font-weight: 600; flex-grow: 1; margin-right: 15px; color: var(--rlh-text-color);} 
                .rlh-item-controls { display: flex; align-items: center; gap: 5px; flex-shrink: 0;} 
                .rlh-toggle-btn { background: none; border: none; width: 28px; height: 28px; cursor: pointer; color: var(--rlh-em-color); display: flex; align-items: center; justify-content: center; transition: all 0.2s; font-size: 1.1em;} 
                .rlh-item-container.enabled .rlh-item-toggle, .rlh-book-group.enabled .rlh-global-toggle { color: var(--rlh-green); } 
                .rlh-item-container:not(.enabled) .rlh-item-toggle, .rlh-book-group:not(.enabled) .rlh-global-toggle { color: var(--rlh-red); } 
                .rlh-toggle-btn:hover { transform: scale(1.15); color: var(--rlh-accent-color);} 
                .rlh-action-btn-icon { background: none; border: none; width: 28px; height: 28px; cursor: pointer; color: var(--rlh-em-color); display: flex; align-items: center; justify-content: center; transition: all 0.2s; font-size: 0.9em; border-radius: 50%;} 
                .rlh-action-btn-icon:hover { background-color: var(--rlh-hover-bg); color: var(--rlh-text-color);} 
                .rlh-delete-book-btn:hover, .rlh-delete-entry-btn:hover { color: var(--rlh-red); background-color: var(--rlh-red-bg);} 
                .rlh-multi-select-controls { display: none; margin-top: 10px; padding: 10px; background-color: var(--rlh-header-bg); border-radius: 6px; border: 1px solid var(--rlh-border-color);} 
                .rlh-multi-select-controls.active { display: block;} 
                .rlh-multi-select-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center;} 
                .rlh-multi-select-action-btn { padding: 6px 12px; border: 1px solid var(--rlh-border-color); border-radius: 4px; background: none; color: var(--rlh-text-color); cursor: pointer; font-size: 0.9em; transition: all 0.2s;} 
                .rlh-multi-select-action-btn:hover { background-color: var(--rlh-hover-bg); border-color: var(--rlh-accent-color);} 
                .rlh-multi-select-action-btn.enable { color: var(--rlh-green); border-color: var(--rlh-green);} 
                .rlh-multi-select-action-btn.enable:hover { background-color: var(--rlh-green-bg);} 
                .rlh-multi-select-action-btn.disable { color: var(--rlh-red); border-color: var(--rlh-red);} 
                .rlh-multi-select-action-btn.disable:hover { background-color: var(--rlh-red-bg);} 
                .rlh-selection-count { margin-left: auto; font-size: 0.9em; color: var(--rlh-em-color); font-weight: 500;} 
                .rlh-multi-select-mode .rlh-item-header { position: relative; cursor: pointer; transition: background-color 0.2s;} 
                .rlh-multi-select-mode .rlh-global-book-header { position: relative; cursor: pointer; transition: background-color 0.2s;} 
                .rlh-multi-select-mode .rlh-item-header:hover { background-color: var(--rlh-hover-bg);} 
                .rlh-multi-select-mode .rlh-global-book-header:hover { background-color: var(--rlh-hover-bg);}
                .rlh-multi-select-mode .rlh-item-container.selected, .rlh-multi-select-mode .rlh-book-group.selected .rlh-global-book-header {
                    border-color: #FF8C00; /* 亮橙色 */
                    box-shadow: 0 0 0 2px rgba(255, 140, 0, 0.5);
                }
                .rlh-multi-select-mode .rlh-item-name { user-select: none;}
                .rlh-book-group.editing-entries > .rlh-global-book-header {
                    background-color: var(--rlh-hover-bg);
                }
                .rlh-edit-entries-btn.active {
                    color: var(--rlh-green);
                    background-color: var(--rlh-green-bg);
                }
                .rlh-item-container, .rlh-book-group { transition: background-color 0.2s, border-color 0.2s, box-shadow 0.2s;}
                .rlh-item-header, .rlh-global-book-header { transition: cursor 0.2s;}
                .rlh-rename-ui { position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; background-color: var(--rlh-bg-color); padding: 6px 15px;}
                .rlh-rename-input-wrapper { position: relative; flex-grow: 1;} 
                .rlh-rename-input { 
                    width: 100%; height: 100%; box-sizing: border-box; padding: 6px 64px 6px 8px; border-radius: 6px; 
                    font-weight: 600; color: #2C3E50; background-color: var(--rlh-input-bg); 
                    border: 1px solid var(--rlh-accent-color); box-shadow: 0 0 0 2px var(--rlh-hover-bg); outline: none;
                } 
                .rlh-rename-ui .rlh-action-btn-icon { position: absolute; top: 50%; transform: translateY(-50%); width: 24px; height: 24px; font-size: 0.9em;} 
                .rlh-rename-save-btn { right: 32px; color: var(--rlh-green);} 
                .rlh-rename-cancel-btn { right: 4px; color: var(--rlh-red);} 
                .rlh-entry-actions { padding: 5px 15px 15px; border-bottom: 1px dashed var(--rlh-border-color); margin-bottom: 10px;} 
                .rlh-action-btn.rlh-create-entry-btn { background-color: var(--rlh-green-bg); color: var(--rlh-green); border: 1px solid var(--rlh-green); width: 32%;}
                .rlh-action-btn.rlh-create-entry-btn:hover { background-color: var(--rlh-green-bg); opacity: 0.9;}
                .rlh-action-btn.rlh-batch-recursion-btn { background-color: var(--rlh-hover-bg); color: var(--rlh-accent-color); border: 1px solid var(--rlh-accent-color); width: 32%;}
                .rlh-action-btn.rlh-batch-recursion-btn:hover { opacity: 0.9; }
                .rlh-action-btn.rlh-fix-keywords-btn { background-color: var(--rlh-hover-bg); color: var(--rlh-accent-color); border: 1px solid var(--rlh-accent-color); width: 32%;}
                .rlh-action-btn.rlh-fix-keywords-btn:hover { opacity: 0.9; }
                .rlh-entry-actions { display: flex; justify-content: space-between; }
                .rlh-entry-list-wrapper { position: relative; padding-left: 20px; padding-right: 20px;} 
                .rlh-entry-list-wrapper::before { 
                    content: ''; position: absolute; left: 8px; top: 0; bottom: 0; 
                    width: 2px; background-color: var(--rlh-border-color); opacity: 0.3;
                } 
                .rlh-collapsible-content { display: none; max-height: 45vh; overflow-y: auto;} 
                .rlh-book-group .rlh-collapsible-content { max-height: none; overflow: visible; padding-top: 10px; border-top: 1px solid var(--rlh-hover-bg);} 
                .rlh-editor-wrapper { padding: 15px; display: flex; flex-direction: column;} 
                .rlh-editor-field { margin-top: 15px; display: flex; flex-direction: column;} 
                .rlh-editor-field:first-child { margin-top: 0;} 
                .rlh-editor-field input[type=text], .rlh-editor-field textarea, .rlh-editor-field select { 
                    width: 100%; min-height: 80px; resize: vertical; padding: 8px; border-radius: 6px; 
                    border: 1px solid var(--rlh-border-color); box-sizing: border-box; 
                    background-color: var(--rlh-input-bg); color: #2C3E50;
                } 
                .rlh-editor-field input[type=text], .rlh-editor-field select { min-height: auto;} 
                .rlh-editor-actions { display: flex; align-items: center; justify-content: center; gap: 15px; margin-top: 15px;} 
                .rlh-action-btn { 
                    padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-weight: 500; 
                    background-color: var(--rlh-border-color); color: var(--rlh-bg-color); transition: all 0.2s;
                } 
                .rlh-action-btn:hover { opacity: 0.9;} 
                .rlh-maximize-btn { background: none; color: var(--rlh-em-color); border: 1px solid var(--rlh-em-color);} 
                .rlh-editor-wrapper.expanded .rlh-editor-field textarea { height: auto; min-height: 150px;} 
                .rlh-editor-group { margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--rlh-hover-bg);} 
                .rlh-editor-group:first-child { margin-top: 0; padding-top: 0; border-top: none; } 
                .rlh-editor-group h5 { margin: 0 0 10px 0; font-size: 1em; font-weight: 600; color: var(--rlh-accent-color);} 
                .rlh-editor-grid { display: flex; gap: 15px; align-items: flex-end; } 
                .rlh-grid-item { flex: 1; } 
                .rlh-grid-item label { display: block; font-size: 0.9em; font-weight: 500; margin-bottom: 5px; } 
                .rlh-grid-item input, .rlh-grid-item select { 
                    width: 100%; padding: 8px; border: 1px solid var(--rlh-border-color); border-radius: 6px; 
                    background-color: var(--rlh-input-bg); color: #2C3E50; height: 38px; box-sizing: border-box;
                } 
                .rlh-depth-container { display: none; } 
                .rlh-select-nudge { position: relative; top: 4.5px; } 
                .rlh-editor-options-row { display: flex; flex-wrap: nowrap; gap: 10px; align-items: center;} 
                .rlh-editor-option-item { display: flex; align-items: center; cursor: pointer; font-size: 0.9em; flex-shrink: 1; white-space: nowrap;} 
                .rlh-editor-option-item input[type=checkbox] { margin-right: 5px; accent-color: var(--rlh-border-color); flex-shrink: 0;} 
                .rlh-depth-inputs { display: flex; gap: 10px;} 
                .rlh-depth-inputs input[type=number] { 
                    width: 100%; padding: 8px; border: 1px solid var(--rlh-border-color); border-radius: 6px; 
                    background-color: var(--rlh-input-bg); color: #2C3E50;
                }
                .rlh-edit-keys, .rlh-edit-content, .rlh-edit-position, .rlh-select-nudge, .rlh-edit-order, .rlh-edit-probability {
                    color: #2C3E50 !important;
                    background-color: var(--rlh-input-bg) !important;
                }
                /* 为浅色主题提供更好的对比度 */
                .rlh-item-container:not(.enabled) .rlh-item-name {
                    opacity: 0.6;
                }
                .rlh-book-group:not(.enabled) .rlh-item-name {
                    opacity: 0.6;
                }
                /* 正则执行顺序指示器样式 */
                .rlh-order-indicator {
                    display: inline-block;
                    background-color: var(--rlh-accent-color);
                    color: white;
                    font-size: 0.75em;
                    font-weight: bold;
                    padding: 2px 6px;
                    border-radius: 10px;
                    margin-right: 8px;
                    min-width: 20px;
                    text-align: center;
                }
               .rlh-drag-handle {
                   cursor: grab;
                   color: var(--rlh-em-color);
                   margin-right: 10px;
                   padding: 0 5px;
                   opacity: 0.6;
                   transition: opacity 0.2s;
               }
               .rlh-drag-handle:hover {
                   opacity: 1;
               }
               .rlh-item-container.sortable-ghost {
                   opacity: 0.4;
                   background: var(--rlh-selected-bg);
               }
               .rlh-item-container.sortable-chosen {
                   cursor: grabbing;
               }
               /* 搜索关键词高亮样式 */
               .rlh-highlight {
                   background-color: #ffeb3b;
                   color: #000;
                   padding: 1px 3px;
                   border-radius: 3px;
                   font-weight: bold;
               }
                .rlh-toast-notification, .rlh-progress-toast {
                   position: absolute;
                   bottom: 20px;
                   left: 50%;
                   transform: translateX(-50%) translateY(10px);
                   background-color: var(--rlh-green);
                   color: white;
                   padding: 10px 20px;
                   border-radius: 20px;
                   box-shadow: 0 4px 10px rgba(0,0,0,0.2);
                   z-index: 10003;
                   font-size: 0.9em;
                   opacity: 0;
                   transition: transform 0.3s ease-out, opacity 0.3s ease-out;
                   pointer-events: none;
               }
               .rlh-progress-toast {
                   background-color: var(--rlh-accent-color);
               }
               .rlh-toast-notification.visible, .rlh-progress-toast.visible {
                   opacity: 1;
                   transform: translateX(-50%) translateY(0);
               }
                .rlh-modal-overlay { 
                    position: absolute; top: 0; left: 0; width: 100%; height: 100%; 
                    background: rgba(0, 0, 0, 0.4); z-index: 10001; 
                    display: flex; justify-content: center; align-items: center;
                } 
                .rlh-modal-content { 
                    background: var(--rlh-bg-color); color: var(--rlh-text-color); border-radius: 8px; 
                    box-shadow: 0 5px 15px rgba(0,0,0,0.3); width: 90%; max-width: 400px;
                } 
                .rlh-modal-header { padding: 12px 15px; font-weight: bold; border-bottom: 1px solid var(--rlh-border-color);} 
                .rlh-modal-body { padding: 20px 15px;} 
                .rlh-modal-body p { margin: 0;} 
                .rlh-modal-input { 
                    width: 100%; padding: 8px; border: 1px solid var(--rlh-border-color); border-radius: 4px; 
                    margin-top: 15px; box-sizing: border-box; 
                    background-color: var(--rlh-input-bg); color: #2C3E50;
                } 
                .rlh-modal-input.rlh-input-error { border-color: var(--rlh-red); animation: shake 0.5s;} 
                .rlh-modal-footer { padding: 10px 15px; border-top: 1px solid var(--rlh-border-color); text-align: right;} 
                .rlh-modal-btn { 
                    padding: 8px 15px; border: 1px solid var(--rlh-border-color); border-radius: 5px; 
                    cursor: pointer; margin-left: 10px; font-weight: 500; background: none; 
                    color: var(--rlh-text-color); transition: all 0.2s;
                } 
                .rlh-modal-btn:hover { background-color: var(--rlh-hover-bg);} 
                .rlh-modal-btn.rlh-modal-ok { background: var(--rlh-green); color: #fff; border-color: var(--rlh-green);} 
                .rlh-modal-btn.rlh-modal-ok:hover { opacity: 0.9;} 
                .rlh-modal-btn.rlh-modal-cancel { background: var(--rlh-red); color: #fff; border-color: var(--rlh-red);} 
                .rlh-modal-btn.rlh-modal-cancel:hover { opacity: 0.9;} 
                @keyframes shake { 0%, 100% { transform: translateX(0); } 10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); } 20%, 40%, 60%, 80% { transform: translateX(5px); } } 
                @media (max-width: 768px) { 
                    .rlh-tab, .rlh-item-header, .rlh-global-book-header, .rlh-search-action-btn, .rlh-action-btn-icon, .rlh-toggle-btn { touch-action: manipulation;} 
                    #${PANEL_ID} { width: 95%; height: 90vh; top: 5vh; max-width: none;} 
                    .rlh-panel-header { padding: 8px 15px; font-size: 0.9em;} 
                    .rlh-tab-nav { 
                        padding: 0 5px; overflow-x: auto; overflow-y: hidden; white-space: nowrap; 
                        -webkit-overflow-scrolling: touch; scrollbar-width: thin; scrollbar-color: var(--rlh-border-color) transparent;
                    } 
                    .rlh-tab-nav::-webkit-scrollbar { height: 3px;} 
                    .rlh-tab-nav::-webkit-scrollbar-track { background: transparent;} 
                    .rlh-tab-nav::-webkit-scrollbar-thumb { background: var(--rlh-border-color); border-radius: 3px;} 
                    .rlh-tab-nav::-webkit-scrollbar-thumb:hover { background: var(--rlh-accent-color);} 
                    .rlh-tab { padding: 10px 12px; font-size: 0.85em; flex-shrink: 0; white-space: nowrap;} 
                    .rlh-tab-text-full { display: none;} .rlh-tab-text-short { display: inline;} 
                    .rlh-search-container { padding: 8px 15px;} 
                    .rlh-search-controls { flex-wrap: wrap; gap: 6px;} 
                    #${SEARCH_INPUT_ID} { font-size: 16px; padding: 8px;} 
                    .rlh-search-action-btn { width: 36px; height: 36px; font-size: 1em;} 
                    #rlh-search-filters-container { flex-wrap: wrap; gap: 10px; margin-top: 8px;} 
                    .rlh-filter-item { font-size: 0.85em;} 
                    .rlh-multi-select-controls { padding: 8px; margin-top: 8px;} 
                    .rlh-multi-select-actions { gap: 6px; justify-content: center;} 
                    .rlh-multi-select-action-btn { padding: 6px 10px; font-size: 0.8em; flex: 0 0 auto;} 
                    .rlh-selection-count { flex-basis: 100%; text-align: center; margin: 5px 0 0 0; font-size: 0.8em;} 
                    #${PANEL_ID}-content { padding: 10px;} 
                    .rlh-item-header, .rlh-global-book-header { padding: 8px 10px; font-size: 0.9em;} 
                    .rlh-item-controls { gap: 3px;} 
                    .rlh-toggle-btn, .rlh-action-btn-icon { width: 32px; height: 32px; font-size: 0.9em;} 
                    .rlh-editor-wrapper { padding: 10px;} 
                    .rlh-editor-actions { flex-direction: column; gap: 10px;} 
                    .rlh-action-btn { width: 100%; padding: 10px;} 
                    .rlh-editor-grid { flex-wrap: wrap; } 
                    .rlh-modal-content { width: 95%; margin: 0 auto;} 
                    .rlh-modal-footer { text-align: center;} 
                    .rlh-modal-btn { display: block; width: 100%; margin: 5px 0; padding: 12px;} 
                } 
                @media (max-width: 480px) { 
                    .rlh-tab { padding: 8px 10px; font-size: 0.8em;} 
                    .rlh-search-container { padding: 6px 10px;} 
                    .rlh-multi-select-action-btn { padding: 5px 8px; font-size: 0.75em;} 
                    #${PANEL_ID}-content { padding: 8px;} 
                    .rlh-item-header, .rlh-global-book-header { padding: 8px 10px; font-size: 0.85em;} 
                } 
            </style>`;
            $('head', parentDoc).append(styles);
            
            const panelHtml = `<div id="${PANEL_ID}">
                <div class="rlh-panel-header"><h4>${BUTTON_TOOLTIP}</h4><button class="rlh-close-button" title="关闭">×</button></div>
                <div class="rlh-tab-nav">
                    <div class="rlh-tab active" data-tab="global-lore"><span class="rlh-tab-text-full">全局世界书</span><span class="rlh-tab-text-short">全局书</span></div>
                    <div class="rlh-tab" data-tab="char-lore"><span class="rlh-tab-text-full">角色世界书</span><span class="rlh-tab-text-short">角色书</span></div>
                    <div class="rlh-tab" data-tab="chat-lore"><span class="rlh-tab-text-full">聊天世界书</span><span class="rlh-tab-text-short">聊天书</span></div>
                    <div class="rlh-tab" data-tab="global-regex"><span class="rlh-tab-text-full">全局正则</span><span class="rlh-tab-text-short">全局正则</span></div>
                    <div class="rlh-tab" data-tab="char-regex"><span class="rlh-tab-text-full">角色正则</span><span class="rlh-tab-text-short">角色正则</span></div>
                    
                </div>
                <div class="rlh-search-container">
                    <div class="rlh-search-controls">
                        <input type="search" id="${SEARCH_INPUT_ID}" placeholder="搜索..." style="width: 40%;">
                        <input type="text" id="rlh-replace-input" placeholder="替换为..." style="width: 40%;">
                        <button id="rlh-replace-btn" class="rlh-search-action-btn" title="替换"><i class="fa-solid fa-exchange-alt"></i></button>
                        <button id="rlh-multi-select-btn" class="rlh-search-action-btn rlh-multi-select-btn" title="多选模式"><i class="fa-solid fa-list-check"></i></button>
                        <button id="${CREATE_LOREBOOK_BTN_ID}" class="rlh-search-action-btn" title="新建世界书"><i class="fa-solid fa-plus"></i></button>
                        <button id="${REFRESH_BTN_ID}" class="rlh-search-action-btn" title="同步/刷新角色数据"><i class="fa-solid fa-sync"></i></button>
                        <button id="${COLLAPSE_CURRENT_BTN_ID}" class="rlh-search-action-btn" title="折叠当前条目"><i class="fa-solid fa-eye-slash"></i></button>
                        <button id="${COLLAPSE_ALL_BTN_ID}" class="rlh-search-action-btn" title="全部折叠"><i class="fa-solid fa-compress"></i></button>
                    </div>
                    <div id="rlh-search-filters-container" style="display: flex; justify-content: center; gap: 20px; margin-top: 15px;">
                        <label class="rlh-filter-item"><input type="checkbox" id="rlh-filter-book-name" checked>世界书名</label>
                        <label class="rlh-filter-item"><input type="checkbox" id="rlh-filter-entry-name" checked>条目名</label>
                        <label class="rlh-filter-item"><input type="checkbox" id="rlh-filter-keywords" checked>关键词</label>
                        <label class="rlh-filter-item"><input type="checkbox" id="rlh-filter-content" checked>内容</label>
                    </div>
                    <div id="rlh-multi-select-controls" class="rlh-multi-select-controls">
                        <div class="rlh-multi-select-actions">
                            <button class="rlh-multi-select-action-btn" id="rlh-select-all-btn">全选</button>
                            <button class="rlh-multi-select-action-btn" id="rlh-select-none-btn">取消全选</button>
                            <button class="rlh-multi-select-action-btn" id="rlh-select-invert-btn">反选</button>
                            <button class="rlh-multi-select-action-btn enable" id="rlh-batch-enable-btn">批量启用</button>
                            <button class="rlh-multi-select-action-btn disable" id="rlh-batch-disable-btn">批量禁用</button>
                            <button class="rlh-multi-select-action-btn disable" id="rlh-batch-delete-btn">批量删除</button>
                            <span class="rlh-selection-count" id="rlh-selection-count">已选择: 0</span>
                        </div>
                    </div>
                </div>
                <div id="${PANEL_ID}-content"></div>
            </div>`;
            $('body', parentDoc).append(panelHtml);

            // 创建按钮
            const buttonHtml = `<div id="${BUTTON_ID}" class="list-group-item flex-container flexGap5 interactable" title="${BUTTON_TOOLTIP}"><img src="${BUTTON_ICON_URL}" style="width: 20px; height: 20px; object-fit: contain; vertical-align: middle;"><span>${BUTTON_TEXT_IN_MENU}</span></div>`;
            const $extensionsMenu = $(`#extensionsMenu`, parentDoc);
            if ($extensionsMenu.find(`#${BUTTON_ID}`).length === 0) {
                $extensionsMenu.append(buttonHtml);
                console.log(`[RegexLoreHub] Button #${BUTTON_ID} appended to #extensionsMenu.`);
            }

            // 绑定事件
            const $parentBody = $('body', parentDoc);
            $parentBody.off('.rlh').on('click.rlh', `#${BUTTON_ID}`, togglePanel);
            const $panel = $(`#${PANEL_ID}`, parentDoc);
            $panel.off('.rlh')
                .on('click.rlh', '.rlh-close-button', togglePanel)
                .on('click.rlh', '.rlh-tab', switchTab)
                .on('click.rlh', '.rlh-item-header, .rlh-global-book-header', handleHeaderClick)
                .on('click.rlh', '.rlh-toggle-btn', handleToggleState)
                .on('click.rlh', '.rlh-save-btn', handleSave)
                .on('click.rlh', '.rlh-maximize-btn', handleEditorExpandToggle)
                .on('input.rlh', `#${SEARCH_INPUT_ID}`, () => { setTimeout(renderContent, 200) })
                .on('change.rlh', '#rlh-search-filters-container input', renderContent)
                .on('click.rlh', `#${COLLAPSE_CURRENT_BTN_ID}`, handleCollapseCurrent)
                .on('click.rlh', `#${COLLAPSE_ALL_BTN_ID}`, handleCollapseAll)
                .on('click.rlh', `#${REFRESH_BTN_ID}`, handleRefresh)
                .on('click.rlh', '#rlh-multi-select-btn', toggleMultiSelectMode)
                .on('click.rlh', '#rlh-select-all-btn', handleSelectAll)
                .on('click.rlh', '#rlh-select-none-btn', handleSelectNone)
                .on('click.rlh', '#rlh-select-invert-btn', handleSelectInvert)
                .on('click.rlh', '#rlh-batch-enable-btn', handleBatchEnable)
                .on('click.rlh', '#rlh-batch-disable-btn', handleBatchDisable)
                .on('click.rlh', '#rlh-batch-delete-btn', handleBatchDelete)
                .on('click.rlh', `#${CREATE_LOREBOOK_BTN_ID}`, handleCreateLorebook)
                .on('click.rlh', '.rlh-rename-book-btn', handleRenameBook)
                .on('click.rlh', '.rlh-edit-entries-btn', handleEditEntriesToggle)
                .on('click.rlh', '.rlh-delete-book-btn', handleDeleteLorebook)
                .on('click.rlh', '.rlh-create-entry-btn', handleCreateEntry)
                .on('click.rlh', '.rlh-delete-entry-btn', handleDeleteEntry)
                .on('click.rlh', '.rlh-batch-recursion-btn', handleBatchSetRecursion)
                .on('click.rlh', '.rlh-fix-keywords-btn', handleFixKeywords)
                .on('click.rlh', '.rlh-rename-btn', handleRename)
                .on('click.rlh', '.rlh-rename-save-btn', handleConfirmRename)
                .on('click.rlh', '.rlh-rename-cancel-btn', handleCancelRename)
                .on('keydown.rlh', '.rlh-rename-input', handleRenameKeydown)
                .on('change.rlh', '.rlh-edit-position', handlePositionChange)
                .on('click.rlh', '#rlh-create-chat-lore-btn', handleCreateChatLorebook)
                .on('click.rlh', '.rlh-unlink-chat-lore-btn', handleUnlinkChatLorebook)
                .on('click.rlh', '#rlh-replace-btn', handleReplace);
            console.log('[RegexLoreHub] All UI and events initialized.');
        }

        loadSortableJS(initializeScript);
    }

    onReady(main);

})();
