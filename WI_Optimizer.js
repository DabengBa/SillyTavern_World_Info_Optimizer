"use strict";

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
            allLorebooks: [],
            lorebookEntries: new Map(),
            lorebookUsage: new Map(), // 新增：用于存储世界书 -> 角色的映射
            activeTab: 'global-lore',
            isDataLoaded: false,
            searchFilters: { bookName: true, entryName: true, keywords: true },
            multiSelectMode: false,
            selectedItems: new Set(),
        };
        
        // --- 帮助函数 ---
        const errorCatched = (fn, context = 'RegexLoreHub') => async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                console.error(`[${context}] Error:`, error);
                await showModal({ type: 'alert', title: '脚本异常', text: `操作中发生未知错误，请检查开发者控制台获取详细信息。` });
            }
        };

        const escapeHtml = (text) => {
            if (typeof text !== 'string') return String(text);
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        };

        const showSuccessTick = () => {
            const $panel = $(`#${PANEL_ID}`, parentDoc);
            if ($panel.length === 0 || $panel.find('.rlh-success-indicator').length > 0) return;
            const tickHtml = `<div class="rlh-success-indicator"><svg class="rlh-success-tick" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52"><circle class="rlh-success-tick-circle" cx="26" cy="26" r="25" fill="none"/><path class="rlh-success-tick-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/></svg></div>`;
            const $tick = $(tickHtml);
            $panel.append($tick);
            setTimeout(() => {
                $tick.remove();
            }, 2200);
        };

        const showModal = (options) => {
            return new Promise((resolve, reject) => {
                const { type = 'alert', title = '通知', text = '', placeholder = '' } = options;
                let buttonsHtml = '';
                if (type === 'alert') buttonsHtml = '<button class="rlh-modal-btn rlh-modal-ok">确定</button>';
                else if (type === 'confirm') buttonsHtml = '<button class="rlh-modal-btn rlh-modal-cancel">取消</button><button class="rlh-modal-btn rlh-modal-ok">确认</button>';
                else if (type === 'prompt') buttonsHtml = '<button class="rlh-modal-btn rlh-modal-cancel">取消</button><button class="rlh-modal-btn rlh-modal-ok">确定</button>';
                const inputHtml = type === 'prompt' ? `<input type="text" class="rlh-modal-input" placeholder="${escapeHtml(placeholder)}">` : '';
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
                if (type === 'prompt') $input.focus();
                
                const closeModal = (isSuccess, value) => {
                    $modal.fadeOut(200, () => {
                        $modal.remove();
                        if (isSuccess) resolve(value); else reject();
                    });
                };
                
                $modal.on('click', '.rlh-modal-ok', () => {
                    const value = type === 'prompt' ? $input.val() : true;
                    if (type === 'prompt' && !String(value).trim()) {
                        $input.addClass('rlh-input-error');
                        setTimeout(() => $input.removeClass('rlh-input-error'), 500);
                        return;
                    }
                    closeModal(true, value);
                });
                $modal.on('click', '.rlh-modal-cancel', () => closeModal(false));
                if (type === 'prompt') {
                    $input.on('keydown', (e) => {
                        if (e.key === 'Enter') $modal.find('.rlh-modal-ok').click();
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
            getCharLorebooks: errorCatched(async () => await TavernHelper.getCharLorebooks()),
            getLorebookEntries: errorCatched(async (name) => await TavernHelper.getLorebookEntries(name)),
            setLorebookEntries: errorCatched(async (name, entries) => await TavernHelper.setLorebookEntries(name, entries)),
            createLorebookEntries: errorCatched(async (name, entries) => await TavernHelper.createLorebookEntries(name, entries)),
            deleteLorebookEntries: errorCatched(async (name, uids) => await TavernHelper.deleteLorebookEntries(name, uids)),
            saveSettings: errorCatched(async () => await TavernHelper.builtin.saveSettings()),
        };

        const loadAllData = errorCatched(async () => {
            const $content = $(`#${PANEL_ID}-content`, parentDoc);
            $content.html('<p class="rlh-info-text">正在加载所有数据，请稍候...</p>');

            // 获取所有角色
            const allCharacters = window.parent.SillyTavern.getContext().characters || [];

            const [allUIRegexes, charData, globalSettings, charLinkedBooks, allBookFileNames] = await Promise.all([
                TavernAPI.getRegexes(),
                TavernAPI.getCharData(),
                TavernAPI.getLorebookSettings(),
                TavernAPI.getCharLorebooks(),
                TavernAPI.getLorebooks()
            ]);

            appState.regexes.global = allUIRegexes?.filter(r => r.scope === 'global') || [];
            updateCharacterRegexes(allUIRegexes, charData);

            appState.lorebookEntries.clear();
            appState.lorebookUsage.clear();
            const knownBookNames = new Set(allBookFileNames || []);

            // 构建世界书使用情况映射
            if (Array.isArray(allCharacters)) {
                await Promise.all(allCharacters.map(async (char) => {
                    const books = await TavernHelper.getCharLorebooks({ name: char.name });
                    if (books) {
                        const bookSet = new Set();
                        if (books.primary) bookSet.add(books.primary);
                        if (books.additional) books.additional.forEach(b => bookSet.add(b));
                        
                        bookSet.forEach(bookName => {
                            if (!appState.lorebookUsage.has(bookName)) {
                                appState.lorebookUsage.set(bookName, []);
                            }
                            appState.lorebookUsage.get(bookName).push(char.name);
                            knownBookNames.add(bookName);
                        });
                    }
                }));
            }

            const enabledGlobalBooks = new Set(globalSettings?.selected_global_lorebooks || []);
            appState.allLorebooks = (allBookFileNames || []).map(name => ({
                name: name,
                enabled: enabledGlobalBooks.has(name)
            }));
            
            const charBookSet = new Set();
            if (charLinkedBooks?.primary) {
                charBookSet.add(charLinkedBooks.primary);
            }
            if (charLinkedBooks?.additional) {
                charLinkedBooks.additional.forEach(name => charBookSet.add(name));
            }
            appState.lorebooks.character = Array.from(charBookSet);

            const allBooksToLoad = Array.from(knownBookNames);
            const existingBookFiles = new Set(allBookFileNames || []);
            await Promise.all(allBooksToLoad.map(async (name) => {
                // 只加载实际存在的世界书文件
                if (existingBookFiles.has(name)) {
                    const entries = await TavernAPI.getLorebookEntries(name) || [];
                    appState.lorebookEntries.set(name, entries);
                }
            }));

            appState.isDataLoaded = true;
            renderContent();
        });

        const refreshCharacterData = errorCatched(async () => {
            const [charData, charBooks, allUIRegexes] = await Promise.all([
                TavernAPI.getCharData(),
                TavernAPI.getCharLorebooks(),
                TavernAPI.getRegexes()
            ]);
            updateCharacterRegexes(allUIRegexes, charData);
            updateCharacterLorebooks(charBooks);
            const newBooksToLoad = appState.lorebooks.character.filter(name => !appState.lorebookEntries.has(name));
            if (newBooksToLoad.length > 0) {
                await Promise.all(newBooksToLoad.map(async (name) => {
                    const entries = await TavernAPI.getLorebookEntries(name) || [];
                    appState.lorebookEntries.set(name, entries);
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
            
            const $content = $(`#${PANEL_ID}-content`, parentDoc);
            $content.empty();
            
            $(`#${PANEL_ID}`, parentDoc).toggleClass('rlh-multi-select-mode', appState.multiSelectMode);
            const isLoreTab = appState.activeTab === 'global-lore' || appState.activeTab === 'char-lore';
            $(`#rlh-search-filters-container`, parentDoc).toggle(isLoreTab);
            
            updateSelectionCount();
            
            switch (appState.activeTab) {
                case 'global-lore':
                    renderGlobalLorebookView(searchTerm, $content);
                    break;
                case 'char-lore':
                    renderCharacterLorebookView(searchTerm, $content);
                    break;
                case 'global-regex':
                    renderRegexView(appState.regexes.global, searchTerm, $content, '全局正则');
                    break;
                case 'char-regex':
                    renderRegexView(appState.regexes.character, searchTerm, $content, '角色正则');
                    break;
                
            }
        };

        const renderGlobalLorebookView = (searchTerm, $container) => {
            let books = [...appState.allLorebooks].sort((a, b) => b.enabled - a.enabled || a.name.localeCompare(b.name));
            let filteredBookData = [];

            if (!searchTerm) {
                filteredBookData = books.map(book => ({
                    book: book,
                    forceShowAllEntries: true,
                    filteredEntries: null
                }));
            } else {
                books.forEach(book => {
                    const entries = appState.lorebookEntries.get(book.name) || [];
                    let bookNameMatches = appState.searchFilters.bookName && book.name.toLowerCase().includes(searchTerm);
                    let matchingEntries = entries.filter(entry =>
                        (appState.searchFilters.entryName && (entry.comment || '').toLowerCase().includes(searchTerm)) ||
                        (appState.searchFilters.keywords && entry.keys.join(' ').toLowerCase().includes(searchTerm))
                    );

                    if (bookNameMatches || matchingEntries.length > 0) {
                        filteredBookData.push({
                            book: book,
                            forceShowAllEntries: bookNameMatches,
                            filteredEntries: matchingEntries
                        });
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

        const renderCharacterLorebookView = (searchTerm, $container) => {
            const linkedBooks = appState.lorebooks.character;
            if (linkedBooks.length === 0) {
                $container.html(`<p class="rlh-info-text">当前角色没有绑定的世界书。点击同步按钮刷新。</p>`);
                return;
            }

            const renderBook = (bookName) => {
                const $bookContainer = $(`<div class="rlh-book-group"><div class="rlh-book-group-header">${escapeHtml(bookName)}</div><div class="rlh-entry-list-wrapper"></div></div>`);
                const $listWrapper = $bookContainer.find('.rlh-entry-list-wrapper');
                const $entryActions = $(`<div class="rlh-entry-actions"><button class="rlh-action-btn rlh-create-entry-btn" data-book-name="${escapeHtml(bookName)}"><i class="fa-solid fa-plus"></i> 新建条目</button><button class="rlh-action-btn rlh-batch-recursion-btn" data-book-name="${escapeHtml(bookName)}"><i class="fa-solid fa-shield-halved"></i> 全开防递</button><button class="rlh-action-btn rlh-fix-keywords-btn" data-book-name="${escapeHtml(bookName)}"><i class="fa-solid fa-check-double"></i> 修复关键词</button></div>`);
                $listWrapper.append($entryActions);
                
                let entries = [...(appState.lorebookEntries.get(bookName) || [])].sort((a, b) => b.enabled - a.enabled || a.display_index - b.display_index);
                let bookNameMatches = !searchTerm || (appState.searchFilters.bookName && bookName.toLowerCase().includes(searchTerm));
                let matchingEntries = entries.filter(entry => !searchTerm || (appState.searchFilters.entryName && (entry.comment || '').toLowerCase().includes(searchTerm)) || (appState.searchFilters.keywords && entry.keys.join(' ').toLowerCase().includes(searchTerm)));

                if (!bookNameMatches && matchingEntries.length === 0) {
                    return null;
                }

                const entriesToShow = bookNameMatches ? entries : matchingEntries;

                if (entriesToShow.length === 0 && searchTerm) {
                    $listWrapper.append(`<p class="rlh-info-text-small">无匹配条目</p>`);
                } else {
                    entriesToShow.forEach(entry => $listWrapper.append(createItemElement(entry, 'lore', bookName)));
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

        const renderRegexView = (itemList, searchTerm, $container, title) => {
            if (!itemList || itemList.length === 0) {
                $container.html(`<p class="rlh-info-text">没有${title}。点击同步按钮刷新。</p>`);
                return;
            }

            let filteredItems = [...itemList].sort((a, b) => b.enabled - a.enabled || (a.script_name || '').localeCompare(b.script_name || ''));

            if (searchTerm) {
                filteredItems = filteredItems.filter(item => (item.script_name || '').toLowerCase().includes(searchTerm));
            }

            if (filteredItems.length === 0) {
                $container.html(`<p class="rlh-info-text">没有匹配的${title}。</p>`);
                return;
            }

            filteredItems.forEach(item => $container.append(createItemElement(item, 'regex')));
        };

        

        const createGlobalLorebookElement = (book, searchTerm, forceShowAllEntries, filteredEntries) => {
            const usedByChars = appState.lorebookUsage.get(book.name) || [];
            const usedByHtml = usedByChars.length > 0
                ? `<div class="rlh-used-by-chars">使用者: ${usedByChars.map(char => `<span>${escapeHtml(char)}</span>`).join(', ')}</div>`
                : '';

            const $element = $(`
                <div class="rlh-book-group" data-book-name="${escapeHtml(book.name)}">
                    <div class="rlh-global-book-header">
                        <span class="rlh-item-name">${escapeHtml(book.name)}</span>
                        <div class="rlh-item-controls">
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
            
            let allEntries = [...(appState.lorebookEntries.get(book.name) || [])].sort((a, b) => b.enabled - a.enabled || a.display_index - b.display_index);
            let entriesToShow = forceShowAllEntries ? allEntries : filteredEntries;

            if (entriesToShow && entriesToShow.length > 0) {
                const $listWrapper = $('<div class="rlh-entry-list-wrapper"></div>');
                entriesToShow.forEach(entry => $listWrapper.append(createItemElement(entry, 'lore', book.name)));
                $content.append($listWrapper);
            } else if (searchTerm) {
                $content.append(`<div class="rlh-info-text-small">无匹配项</div>`);
            }

            //if (searchTerm && entriesToShow && entriesToShow.length > 0) {
            //    $content.show();
            //}

            return $element;
        };

        const createItemElement = (item, type, bookName = '') => {
            const isLore = type === 'lore';
            const id = isLore ? item.uid : item.id;
            const name = isLore ? (item.comment || '无标题条目') : (item.script_name || '未命名正则');
            const fromCard = item.source === 'card';

            let controlsHtml = '<button class="rlh-toggle-btn rlh-item-toggle" title="启用/禁用此条目"><i class="fa-solid fa-power-off"></i></button>';
            if (isLore && !fromCard) {
                controlsHtml = `<button class="rlh-action-btn-icon rlh-rename-btn" title="重命名"><i class="fa-solid fa-pencil"></i></button>${controlsHtml}<button class="rlh-action-btn-icon rlh-delete-entry-btn" title="删除条目"><i class="fa-solid fa-trash-can"></i></button>`;
            }
            
            const $element = $(`<div class="rlh-item-container ${fromCard ? 'from-card' : ''}" data-type="${type}" data-id="${id}" ${isLore ? `data-book-name="${escapeHtml(bookName)}"`: ''}><div class="rlh-item-header" title="${fromCard ? '此条目来自角色卡，部分操作受限' : (appState.multiSelectMode ? '点击选择/取消选择' : '点击展开/编辑')}"><span class="rlh-item-name">${escapeHtml(name)}</span><div class="rlh-item-controls">${controlsHtml}</div></div><div class="rlh-collapsible-content"></div></div>`);
            
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
                    (appState.lorebookEntries.get(book.name) || []).forEach(entry => {
                        visibleItems.push({ type: 'lore', id: entry.uid, bookName: book.name, enabled: entry.enabled });
                    });
                });
            } else if (activeTab === 'char-lore') {
                appState.lorebooks.character.forEach(bookName => {
                    (appState.lorebookEntries.get(bookName) || []).forEach(entry => {
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
            if (!appState.multiSelectMode) {
                return;
            }
            if ($(event.target).closest('.rlh-item-controls').length > 0) {
                return;
            }
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
                if (itemType === 'lore') {
                    itemKey = `lore:${bookName}:${itemId}`;
                } else {
                    itemKey = `regex:${itemId}`;
                }
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

        const handleSelectAll = errorCatched(async (event) => {
            const visibleItems = getAllVisibleItems();
            visibleItems.forEach(item => {
                let itemKey;
                if (item.type === 'book') {
                    itemKey = `book:${item.id}`;
                } else if (item.type === 'lore') {
                    itemKey = `lore:${item.bookName}:${item.id}`;
                } else {
                    itemKey = `regex:${item.id}`;
                }
                appState.selectedItems.add(itemKey);
            });
            renderContent();
        });

        const handleSelectNone = errorCatched(async (event) => {
            appState.selectedItems.clear();
            renderContent();
        });

        const handleSelectInvert = errorCatched(async (event) => {
            const visibleItems = getAllVisibleItems();
            const newSelection = new Set();
            visibleItems.forEach(item => {
                let itemKey;
                if (item.type === 'book') {
                    itemKey = `book:${item.id}`;
                } else if (item.type === 'lore') {
                    itemKey = `lore:${item.bookName}:${item.id}`;
                } else {
                    itemKey = `regex:${item.id}`;
                }
                if (!appState.selectedItems.has(itemKey)) {
                    newSelection.add(itemKey);
                }
            });
            appState.selectedItems = newSelection;
            renderContent();
        });

        const handleBatchEnable = errorCatched(async (event) => {
            if (appState.selectedItems.size === 0) {
                await showModal({ type: 'alert', title: '提示', text: '请先选择要启用的项目。' });
                return;
            }
            await performBatchOperation(true);
            showSuccessTick();
        });

        const handleBatchDisable = errorCatched(async (event) => {
            if (appState.selectedItems.size === 0) {
                await showModal({ type: 'alert', title: '提示', text: '请先选择要禁用的项目。' });
                return;
            }
            await performBatchOperation(false);
            showSuccessTick();
        });

        const handleBatchDelete = errorCatched(async () => {
            const selectedBooks = Array.from(appState.selectedItems)
                .filter(key => key.startsWith('book:'))
                .map(key => key.substring(5));

            if (selectedBooks.length === 0) {
                await showModal({ type: 'alert', title: '提示', text: '请先选择要删除的世界书。' });
                return;
            }

            try {
                await showModal({
                    type: 'confirm',
                    title: '确认删除',
                    text: `您确定要永久删除选中的 ${selectedBooks.length} 本世界书吗？此操作无法撤销。`
                });
            } catch {
                return; // 用户取消
            }

            let deletedCount = 0;
            for (const bookName of selectedBooks) {
                const success = await TavernAPI.deleteLorebook(bookName);
                if (success) {
                    deletedCount++;
                    appState.allLorebooks = appState.allLorebooks.filter(b => b.name !== bookName);
                    appState.lorebookEntries.delete(bookName);
                    appState.selectedItems.delete(`book:${bookName}`);
                }
            }

            if (deletedCount > 0) {
                showSuccessTick();
                renderContent();
            } else {
                await showModal({ type: 'alert', title: '删除失败', text: '删除世界书时发生错误，请检查控制台。' });
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
                if (type === 'book') {
                    selectedBookNames.add(parts[0]);
                } else if (type === 'lore') {
                    const [bookName, entryId] = parts;
                    if (!selectedEntriesByBook.has(bookName)) selectedEntriesByBook.set(bookName, []);
                    selectedEntriesByBook.get(bookName).push(Number(entryId));
                } else if (type === 'regex') {
                    selectedRegexIds.add(parts[0]);
                }
            }

            if (selectedBookNames.size > 0) {
                const settings = await TavernAPI.getLorebookSettings();
                let currentBooks = new Set(settings.selected_global_lorebooks || []);
                if (enable) {
                    selectedBookNames.forEach(name => currentBooks.add(name));
                } else {
                    selectedBookNames.forEach(name => currentBooks.delete(name));
                }
                await TavernAPI.setLorebookSettings({ selected_global_lorebooks: Array.from(currentBooks) });
                needsSettingsUpdate = true;
                selectedBookNames.forEach(name => {
                    const book = appState.allLorebooks.find(b => b.name === name);
                    if (book) book.enabled = enable;
                });
            }

            if (selectedEntriesByBook.size > 0) {
                for (const [bookName, entryIds] of selectedEntriesByBook) {
                    const entries = appState.lorebookEntries.get(bookName);
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
                appState.regexes.global.forEach(r => {
                    if (selectedRegexIds.has(r.id)) r.enabled = enable;
                });
                appState.regexes.character.forEach(r => {
                    if (selectedRegexIds.has(r.id)) r.enabled = enable;
                });
            }

            if (needsSettingsUpdate || needsRegexUpdate) {
                await TavernAPI.saveSettings();
            }
            appState.selectedItems.clear();
            renderContent();
        });
        
        const handleHeaderClick = errorCatched(async (event) => {
            if (appState.multiSelectMode || $(event.target).closest('.rlh-item-controls').length > 0 || $(event.currentTarget).closest('.rlh-item-container').hasClass('renaming')) {
                return;
            }
            
            const $header = $(event.currentTarget);
            const $container = $header.closest('.rlh-item-container, .rlh-book-group');
            
            if ($container.hasClass('from-card')) {
                return;
            }
            
            const $content = $container.find('.rlh-collapsible-content').first();
            
            if ($content.is(':visible')) {
                $content.slideUp(200, () => {
                    if ($container.is('.rlh-item-container')) $content.empty();
                });
                return;
            }
            
            if ($container.is('.rlh-item-container')) {
                $container.siblings('.rlh-item-container').find('.rlh-collapsible-content:visible').slideUp(200).empty();
            }
            
            if ($container.is('.rlh-book-group')) {
                $content.slideToggle(200);
                return;
            }

            const type = $container.data('type');
            const id = $container.data('id');
            let item, editorHtml;

            if (type === 'lore') {
                const bookName = $container.data('book-name');
                item = appState.lorebookEntries.get(bookName)?.find(e => e.uid === id);
                if (!item) return;

                const positionOptions = Object.entries(LOREBOOK_OPTIONS.position).map(([value, text]) => `<option value="${value}" ${item.position === value ? 'selected' : ''}>${text}</option>`).join('');
                const logicOptions = Object.entries(LOREBOOK_OPTIONS.logic).map(([value, text]) => `<option value="${value}" ${item.logic === value ? 'selected' : ''}>${text}</option>`).join('');

                editorHtml = `
                    <div class="rlh-editor-field"><label>关键词 (逗号分隔)</label><input type="text" class="rlh-edit-keys" value="${escapeHtml((item.keys || []).join(', '))}"><\/div>
                    <div class="rlh-editor-field"><label>内容<\/label><textarea class="rlh-edit-content">${escapeHtml(item.content || '')}<\/textarea><\/div>
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
                if (isEnabling) {
                    currentBooks.add(bookName);
                } else {
                    currentBooks.delete(bookName);
                }
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
                    const entry = appState.lorebookEntries.get(bookName)?.find(e => e.uid === Number(id));
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

            showSuccessTick();
            $elementToSort.toggleClass('enabled', isEnabling);

            // Re-sort items in the list
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
                updatedEntry.content = $container.find('.rlh-edit-content').val();
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
                
                const entry = appState.lorebookEntries.get(bookName)?.find(e => e.uid === Number(id));
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
            showSuccessTick();
        });
        
        const handleRename = errorCatched(async (event) => {
            event.stopPropagation();
            const $container = $(event.currentTarget).closest('.rlh-item-container');
            if ($container.hasClass('renaming')) return;

            const $header = $container.find('.rlh-item-header');
            const $nameSpan = $header.find('.rlh-item-name');
            const oldName = $nameSpan.text().trim();
            const renameUIHtml = `<div class="rlh-rename-ui"><div class="rlh-rename-input-wrapper"><input type="text" class="rlh-rename-input" value="${escapeHtml(oldName)}" /><button class="rlh-action-btn-icon rlh-rename-save-btn" title="确认"><i class="fa-solid fa-check"></i></button><button class="rlh-action-btn-icon rlh-rename-cancel-btn" title="取消"><i class="fa-solid fa-times"></i></button></div></div>`;
            
            $container.addClass('renaming');
            $header.append(renameUIHtml);
            $header.find('.rlh-rename-input').focus().select();
        });

        const exitRenameMode = ($container, newName = null) => {
            const $header = $container.find('.rlh-item-header');
            const $nameSpan = $header.find('.rlh-item-name');
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
            const oldName = $container.find('.rlh-item-name').text().trim();

            if (!newName || newName === oldName) {
                exitRenameMode($container);
                return;
            }
            
            const id = Number($container.data('id'));
            const bookName = $container.data('book-name');
            
            await TavernAPI.setLorebookEntries(bookName, [{ uid: id, comment: newName }]);
            const entry = appState.lorebookEntries.get(bookName)?.find(e => e.uid === id);
            if (entry) {
                entry.comment = newName;
            }
            
            exitRenameMode($container, newName);
            showSuccessTick();
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
                showSuccessTick();
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
                appState.lorebookEntries.delete(bookName);
                $bookGroup.slideUp(300, () => $bookGroup.remove());
                showSuccessTick();
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
                appState.lorebookEntries.set(bookName, result.entries);
                const $newEntryElement = createItemElement(newEntry, 'lore', bookName);
                $button.parent('.rlh-entry-actions').after($newEntryElement);
                $newEntryElement.hide().slideDown(200, () => {
                    const $header = $newEntryElement.find('.rlh-item-header');
                    if (!$header.hasClass('renaming')) {
                        $header.click();
                    }
                });
                showSuccessTick();
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
                appState.lorebookEntries.set(bookName, result.entries);
                $item.slideUp(300, () => $item.remove());
                showSuccessTick();
            } else {
                await showModal({ type: 'alert', title: '删除失败', text: '删除条目时发生错误，请检查控制台。' });
            }
        });

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
            const entries = appState.lorebookEntries.get(bookName);
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
            
            showSuccessTick();
        });

        const handleFixKeywords = errorCatched(async (event) => {
            const bookName = $(event.currentTarget).data('book-name');
            const entries = appState.lorebookEntries.get(bookName);
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

                await showModal({ type: 'alert', title: '操作完成', text: `成功修复了 ${changedCount} 个条目的关键词。` });
                showSuccessTick();
            } else {
                await showModal({ type: 'alert', title: '提示', text: '所有条目的关键词格式都正确，无需修复。' });
            }
        });

        // --- UI 创建与初始化 ---
        function initializeScript() {
            console.log('[RegexLoreHub] Initializing UI and button...');
            
            if ($(`#${PANEL_ID}`, parentDoc).length > 0) {
                console.log('[RegexLoreHub] Panel already exists. Skipping UI creation.');
                return;
            }
            
            const styles = `<style id="regex-lore-hub-styles">
                * { text-shadow: none !important; }
                :root {
                    --rlh-border-color: var(--SmartThemeBorderColor, #7EB7D5);
                    --rlh-text-color: var(--SmartThemeBodyColor, #2C3E50);
                    --rlh-bg-color: var(--SmartThemeBlurTintColor, #FAF5D5);
                    --rlh-item-bg: var(--SmartThemeChatTintColor, #DAEEF5);
                    --rlh-shadow-color: rgba(0,0,0,0.1);
                    --rlh-header-bg: var(--SmartThemeChatTintColor, #DAEEF5);
                    --rlh-hover-bg: rgba(126, 183, 213, 0.15);
                    --rlh-em-color: var(--SmartThemeEmColor, #34495E);
                    --rlh-accent-color: var(--SmartThemeQuoteColor, #6B9BC2);
                    --rlh-input-bg: #fff;
                    --rlh-selected-bg: rgba(107, 155, 194, 0.15);
                    --rlh-selected-border: var(--rlh-accent-color); 
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
                #${SEARCH_INPUT_ID} {
                    width: 100%; flex-grow: 1; padding: 10px; border: 1px solid var(--rlh-border-color);
                    border-radius: 8px; box-sizing: border-box; background-color: var(--rlh-input-bg); color: black !important;
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
                    cursor: pointer; border-radius: 8px; background-color: var(--rlh-item-bg);
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
                .rlh-item-container { background-color: var(--rlh-item-bg); border: 1px solid var(--rlh-border-color); border-radius: 12px;} 
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
                .rlh-multi-select-mode .rlh-item-container.selected, .rlh-multi-select-mode .rlh-book-group.selected { background-color: var(--rlh-selected-bg); border-color: var(--rlh-selected-border); box-shadow: 0 0 0 1px var(--rlh-selected-border);} 
                .rlh-multi-select-mode .rlh-item-name { user-select: none;} 
                .rlh-item-container, .rlh-book-group { transition: background-color 0.2s, border-color 0.2s, box-shadow 0.2s;} 
                .rlh-item-header, .rlh-global-book-header { transition: cursor 0.2s;} 
                .rlh-rename-ui { position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; background-color: var(--rlh-bg-color); padding: 6px 15px;} 
                .rlh-rename-input-wrapper { position: relative; flex-grow: 1;} 
                .rlh-rename-input { 
                    width: 100%; height: 100%; box-sizing: border-box; padding: 6px 64px 6px 8px; border-radius: 6px; 
                    font-weight: 600; color: var(--rlh-text-color); background-color: var(--rlh-input-bg); 
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
                    background-color: var(--rlh-input-bg); color: var(--rlh-text-color);
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
                    background-color: var(--rlh-input-bg); color: var(--rlh-text-color); height: 38px; box-sizing: border-box;
                } 
                .rlh-depth-container { display: none; } 
                .rlh-select-nudge { position: relative; top: 4.5px; } 
                .rlh-editor-options-row { display: flex; flex-wrap: nowrap; gap: 10px; align-items: center;} 
                .rlh-editor-option-item { display: flex; align-items: center; cursor: pointer; font-size: 0.9em; flex-shrink: 1; white-space: nowrap;} 
                .rlh-editor-option-item input[type=checkbox] { margin-right: 5px; accent-color: var(--rlh-border-color); flex-shrink: 0;} 
                .rlh-depth-inputs { display: flex; gap: 10px;} 
                .rlh-depth-inputs input[type=number] { 
                    width: 100%; padding: 8px; border: 1px solid var(--rlh-border-color); border-radius: 6px; 
                    background-color: var(--rlh-input-bg); color: var(--rlh-text-color);
                }
                .rlh-edit-keys, .rlh-edit-content, .rlh-edit-position, .rlh-select-nudge, .rlh-edit-order, .rlh-edit-probability {
                    color: black !important;
                }
                .rlh-success-indicator {
                    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                    display: flex; justify-content: center; align-items: center;
                    z-index: 10002; pointer-events: none;
                } 
                .rlh-success-tick { 
                    width: 60px; height: 60px; border-radius: 50%; display: block; stroke-width: 3; 
                    stroke-miterlimit: 10; animation: fade-out-slow 0.8s ease-in-out 1.3s forwards;
                } 
                .rlh-success-tick-circle { 
                    stroke-dasharray: 166; stroke-dashoffset: 166; stroke: var(--rlh-green, #28a745); 
                    animation: stroke-slow 0.8s cubic-bezier(0.65, 0, 0.45, 1) forwards;
                } 
                .rlh-success-tick-check { 
                    transform-origin: 50% 50%; stroke-dasharray: 48; stroke-dashoffset: 48; 
                    stroke: var(--rlh-green, #28a745); 
                    animation: stroke-slow 0.5s cubic-bezier(0.65, 0, 0.45, 1) 0.7s forwards;
                } 
                @keyframes stroke-slow { 100% { stroke-dashoffset: 0; } } 
                @keyframes fade-out-slow { 100% { opacity: 0; } } 
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
                    background-color: var(--rlh-input-bg); color: var(--rlh-text-color);
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
                    <div class="rlh-tab" data-tab="global-regex"><span class="rlh-tab-text-full">全局正则</span><span class="rlh-tab-text-short">全局正则</span></div>
                    <div class="rlh-tab" data-tab="char-regex"><span class="rlh-tab-text-full">角色正则</span><span class="rlh-tab-text-short">角色正则</span></div>
                    
                </div>
                <div class="rlh-search-container">
                    <div class="rlh-search-controls">
                        <input type="search" id="${SEARCH_INPUT_ID}" placeholder="搜索...">
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
                .on('click.rlh', '.rlh-item-header, .rlh-global-book-header', handleMultiSelectHeaderClick)
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
                .on('click.rlh', '.rlh-delete-book-btn', handleDeleteLorebook)
                .on('click.rlh', '.rlh-create-entry-btn', handleCreateEntry)
                .on('click.rlh', '.rlh-delete-entry-btn', handleDeleteEntry)
                .on('click.rlh', '.rlh-batch-recursion-btn', handleBatchSetRecursion)
                .on('click.rlh', '.rlh-fix-keywords-btn', handleFixKeywords)
                .on('click.rlh', '.rlh-rename-btn', handleRename)
                .on('click.rlh', '.rlh-rename-save-btn', handleConfirmRename)
                .on('click.rlh', '.rlh-rename-cancel-btn', handleCancelRename)
                .on('keydown.rlh', '.rlh-rename-input', handleRenameKeydown)
                .on('change.rlh', '.rlh-edit-position', handlePositionChange);
            console.log('[RegexLoreHub] All UI and events initialized.');
        }

        initializeScript();
    }

    onReady(main);

})();