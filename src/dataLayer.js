import {
  PANEL_ID,
  REFRESH_BTN_ID,
  PREFETCH_INDICATOR_ID,
  PREFETCH_PROGRESS_BAR_ID,
  PREFETCH_PROGRESS_TEXT_ID,
  appState,
  safeClearLorebookEntries,
  safeSetLorebookEntries,
  safeHasLorebookEntries,
  safeGetLorebookEntries,
  errorCatched,
  get$,
  getParentDoc,
  getParentWin,
  getTavernHelper,
} from './core.js';
import { renderContent } from './ui/render/index.js';
import { renderSaveStatus } from './ui/render/shared.js';

const LOGIC_STRING_TO_ENUM = Object.freeze({
  and_any: 0,
  not_all: 1,
  not_any: 2,
  and_all: 3,
});

const LOGIC_ENUM_TO_STRING = Object.freeze({
  0: 'and_any',
  1: 'not_all',
  2: 'not_any',
  3: 'and_all',
});

const ROLE_NAME_TO_ENUM = Object.freeze({
  system: 0,
  user: 1,
  assistant: 2,
});

const ROLE_ENUM_TO_NAME = Object.freeze({
  0: 'system',
  1: 'user',
  2: 'assistant',
});

const POSITION_UI_TO_STRUCT = Object.freeze({
  before_character_definition: { type: 'before_character_definition' },
  after_character_definition: { type: 'after_character_definition' },
  before_example_messages: { type: 'before_example_messages' },
  after_example_messages: { type: 'after_example_messages' },
  before_author_note: { type: 'before_author_note' },
  after_author_note: { type: 'after_author_note' },
  at_depth_as_system: { type: 'at_depth', role: 'system' },
  at_depth_as_assistant: { type: 'at_depth', role: 'assistant' },
  at_depth_as_user: { type: 'at_depth', role: 'user' },
});

const POSITION_NUMERIC_TO_UI = Object.freeze({
  0: 'before_character_definition',
  1: 'after_character_definition',
  2: 'before_author_note',
  3: 'after_author_note',
  4: 'at_depth_as_system',
  5: 'before_example_messages',
  6: 'after_example_messages',
});

const LEGACY_POSITION_ALIASES = Object.freeze({
  before_char: 'before_character_definition',
  after_char: 'after_character_definition',
  before_an: 'before_author_note',
  after_an: 'after_author_note',
  before_em: 'before_example_messages',
  after_em: 'after_example_messages',
  at_depth: 'at_depth_as_system',
  depth_system: 'at_depth_as_system',
  depth_character: 'at_depth_as_assistant',
  depth_user: 'at_depth_as_user',
});

const cloneEntry = source => (source ? JSON.parse(JSON.stringify(source)) : {});

const sanitizeKeyArray = keys =>
  Array.isArray(keys)
    ? keys
        .map(key => {
          if (typeof key === 'string') return key.trim();
          if (key instanceof RegExp) return key.source;
          if (key && typeof key === 'object') {
            if (typeof key.pattern === 'string') return key.pattern.trim();
            if (typeof key.source === 'string') return key.source.trim();
          }
          if (key !== null && key !== undefined && typeof key.toString === 'function') {
            const str = key.toString();
            return typeof str === 'string' ? str.trim() : '';
          }
          return '';
        })
        .filter(Boolean)
    : [];

// 按顺序为正则写入顺序字段，确保宿主界面能够读取到最新的执行顺序
const ORDER_FIELD_KEYS = ['order', 'displayIndex', 'display_index', 'sort_order', 'script_order'];

export const updateRegexOrderMetadata = (regexList = []) => {
  if (!Array.isArray(regexList) || regexList.length === 0) return;
  regexList.forEach((regex, index) => {
    if (!regex || typeof regex !== 'object' || regex.source === 'card') return;
    ORDER_FIELD_KEYS.forEach(key => {
      regex[key] = index;
    });
    if (regex?.position && typeof regex.position === 'object' && 'order' in regex.position) {
      regex.position.order = index;
    }
  });
};

const normalizeRegexPayloadOrder = regexes => {
  if (!Array.isArray(regexes) || regexes.length === 0) return regexes;
  const buckets = new Map([
    ['global', []],
    ['character', []],
  ]);

  regexes.forEach(regex => {
    if (!regex || typeof regex !== 'object' || regex.source === 'card') return;
    const scope = regex.scope === 'character' ? 'character' : 'global';
    buckets.get(scope).push(regex);
  });

  buckets.forEach(list => updateRegexOrderMetadata(list));
  return regexes;
};

const toBooleanStrict = value => {
  if (value === true || value === false) return value;
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(normalized);
  }
  return Boolean(value);
};

const parseOptionalNumber = value => {
  if (value === '' || value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? null : numeric;
};

const normalizeLogicString = value => {
  if (value === null || value === undefined) return 'and_any';
  if (typeof value === 'number' && !Number.isNaN(value)) {
    const mapped = LOGIC_ENUM_TO_STRING[value] ?? LOGIC_ENUM_TO_STRING[value.toString()];
    return mapped ?? 'and_any';
  }
  const str = value.toString().trim().toLowerCase();
  if (LOGIC_STRING_TO_ENUM[str] !== undefined) return str;
  if (LOGIC_ENUM_TO_STRING[str] !== undefined) return LOGIC_ENUM_TO_STRING[str];
  return 'and_any';
};

const mapEnumLogicToUi = value => normalizeLogicString(value);

const mapUiLogicToEnum = value => LOGIC_STRING_TO_ENUM[normalizeLogicString(value)] ?? LOGIC_STRING_TO_ENUM.and_any;

const normalizeRoleName = value => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (ROLE_NAME_TO_ENUM[normalized] !== undefined) return normalized;
  }
  if (typeof value === 'number' && !Number.isNaN(value)) {
    const mapped = ROLE_ENUM_TO_NAME[value] ?? ROLE_ENUM_TO_NAME[value.toString()];
    if (mapped) return mapped;
  }
  return null;
};

const resolveUiPositionKey = (positionValue, roleValue) => {
  if (positionValue === undefined || positionValue === null) {
    return 'before_character_definition';
  }
  if (typeof positionValue === 'object' && positionValue !== null) {
    if (typeof positionValue.type === 'string' && positionValue.type) {
      const normalizedType = (LEGACY_POSITION_ALIASES[positionValue.type] ?? positionValue.type).trim();
      if (normalizedType === 'at_depth' || normalizedType === 'at_depth_as_system') {
        const roleName = normalizeRoleName(positionValue.role ?? roleValue) ?? 'system';
        if (roleName === 'assistant') return 'at_depth_as_assistant';
        if (roleName === 'user') return 'at_depth_as_user';
        return 'at_depth_as_system';
      }
      if (normalizedType.startsWith('at_depth_as_')) {
        return normalizedType;
      }
      return normalizedType;
    }
    if (typeof positionValue.position === 'number' && !Number.isNaN(positionValue.position)) {
      return resolveUiPositionKey(positionValue.position, positionValue.role ?? roleValue);
    }
  }
  if (typeof positionValue === 'string') {
    const normalized = (LEGACY_POSITION_ALIASES[positionValue] ?? positionValue).trim();
    if (normalized === 'at_depth') {
      const roleName = normalizeRoleName(roleValue) ?? 'system';
      if (roleName === 'assistant') return 'at_depth_as_assistant';
      if (roleName === 'user') return 'at_depth_as_user';
      return 'at_depth_as_system';
    }
    return normalized;
  }
  if (typeof positionValue === 'number' && !Number.isNaN(positionValue)) {
    if (positionValue === 4) {
      const roleName = normalizeRoleName(roleValue) ?? 'system';
      if (roleName === 'assistant') return 'at_depth_as_assistant';
      if (roleName === 'user') return 'at_depth_as_user';
      return 'at_depth_as_system';
    }
    const mapped = POSITION_NUMERIC_TO_UI[positionValue];
    if (mapped) return mapped;
  }
  return 'before_character_definition';
};

const mapPositionToUiString = (positionValue, roleValue) => resolveUiPositionKey(positionValue, roleValue);

const extractPositionDetails = (positionValue, { fallbackRole = null, fallbackDepth = null, fallbackOrder = null } = {}) => {
  const fallbackRoleName = normalizeRoleName(fallbackRole);
  const details = {
    type: 'before_character_definition',
    role: null,
    depth: null,
    order: parseOptionalNumber(fallbackOrder),
    uiKey: 'before_character_definition',
  };

  const setOrder = value => {
    const parsed = parseOptionalNumber(value);
    if (parsed !== null) details.order = parsed;
  };
  const setDepth = value => {
    const parsed = parseOptionalNumber(value);
    if (parsed !== null) details.depth = parsed;
  };

  setOrder(fallbackOrder);
  setDepth(fallbackDepth);

  if (positionValue && typeof positionValue === 'object') {
    if (typeof positionValue.type === 'string' && positionValue.type) {
      const normalizedType = (LEGACY_POSITION_ALIASES[positionValue.type] ?? positionValue.type).trim();
      details.type = normalizedType === 'at_depth_as_system' ? 'at_depth' : normalizedType;
      const roleName = normalizeRoleName(positionValue.role) ?? fallbackRoleName;
      if (details.type === 'at_depth') {
        details.role = roleName ?? 'system';
        setDepth(positionValue.depth);
        details.uiKey =
          details.role === 'assistant'
            ? 'at_depth_as_assistant'
            : details.role === 'user'
              ? 'at_depth_as_user'
              : 'at_depth_as_system';
      } else {
        details.role = null;
        details.depth = null;
        details.uiKey = details.type;
      }
      setOrder(positionValue.order);
      return details;
    }
    if (typeof positionValue.position === 'number' && !Number.isNaN(positionValue.position)) {
      const roleName = normalizeRoleName(positionValue.role) ?? fallbackRoleName;
      const uiKey = resolveUiPositionKey(positionValue.position, roleName);
      details.uiKey = uiKey;
      if (uiKey.startsWith('at_depth')) {
        details.type = 'at_depth';
        details.role = roleName ?? 'system';
        setDepth(positionValue.depth);
      } else {
        details.type = uiKey;
        details.role = null;
        details.depth = null;
      }
      setOrder(positionValue.order);
      return details;
    }
  }

  const uiKey = resolveUiPositionKey(positionValue, fallbackRoleName);
  details.uiKey = uiKey;

  if (uiKey.startsWith('at_depth')) {
    details.type = 'at_depth';
    details.role = uiKey === 'at_depth_as_assistant' ? 'assistant' : uiKey === 'at_depth_as_user' ? 'user' : 'system';
    if (details.depth === null) {
      details.depth = parseOptionalNumber(fallbackDepth);
    }
  } else {
    details.type = uiKey;
    details.role = null;
    details.depth = null;
  }

  return details;
};

const buildRawPosition = (uiKeyInput, { depth, order, basePosition } = {}) => {
  const baseDetails = extractPositionDetails(basePosition ?? null);
  const normalizedKey = (LEGACY_POSITION_ALIASES[uiKeyInput] ?? uiKeyInput ?? baseDetails.uiKey)
    .toString()
    .trim() || baseDetails.uiKey || 'before_character_definition';
  const mapping =
    POSITION_UI_TO_STRUCT[normalizedKey] ??
    POSITION_UI_TO_STRUCT[baseDetails.uiKey] ??
    POSITION_UI_TO_STRUCT.before_character_definition;

  const result = { type: mapping.type };
  const parsedOrder = parseOptionalNumber(order);
  const resolvedOrder =
    parsedOrder !== null
      ? parsedOrder
      : baseDetails.order !== null && baseDetails.order !== undefined
        ? baseDetails.order
        : 0;
  result.order = resolvedOrder;

  if (mapping.type === 'at_depth') {
    const role = mapping.role ?? baseDetails.role ?? 'system';
    result.role = role;
    const parsedDepth = parseOptionalNumber(depth);
    const resolvedDepth =
      parsedDepth !== null
        ? parsedDepth
        : baseDetails.depth !== null && baseDetails.depth !== undefined
          ? baseDetails.depth
          : 0;
    result.depth = resolvedDepth;
  }

  return result;
};

export const normalizeWorldbookEntry = entry => {
  if (!entry || typeof entry !== 'object') return entry;
  const clone = cloneEntry(entry);

  if (!clone.strategy || typeof clone.strategy !== 'object') {
    clone.strategy = {};
  }
  const strategy = clone.strategy;

  const keys = sanitizeKeyArray(strategy.keys ?? clone.keys ?? clone.key ?? clone.keywords);
  strategy.keys = [...keys];
  clone.keys = [...keys];
  clone.key = [...keys];
  clone.keywords = [...keys];

  const secondaryKeys = sanitizeKeyArray(
    strategy.keys_secondary?.keys ?? clone.keysecondary ?? clone.key_secondary ?? [],
  );
  if (!strategy.keys_secondary || typeof strategy.keys_secondary !== 'object') {
    strategy.keys_secondary = { logic: 'and_any', keys: [] };
  }
  strategy.keys_secondary.keys = [...secondaryKeys];
  clone.keysecondary = [...secondaryKeys];

  const logicString = normalizeLogicString(strategy.keys_secondary.logic ?? clone.logic ?? clone.selectiveLogic);
  strategy.keys_secondary.logic = logicString;
  clone.logic = logicString;
  clone.selectiveLogic = LOGIC_STRING_TO_ENUM[logicString];

  const positionDetails = extractPositionDetails(clone.position, {
    fallbackRole: clone.role,
    fallbackDepth: clone.depth,
    fallbackOrder: clone.order ?? clone.insertion_order ?? clone.displayIndex,
  });
  clone.position = positionDetails.uiKey;
  clone.depth = positionDetails.type === 'at_depth' ? (positionDetails.depth ?? 0) : null;
  clone.order = positionDetails.order ?? 0;
  clone.role = positionDetails.role;

  const probability = parseOptionalNumber(clone.probability);
  clone.probability = probability === null ? 100 : probability;

  if (!clone.recursion || typeof clone.recursion !== 'object') {
    clone.recursion = { prevent_incoming: false, prevent_outgoing: false, delay_until: null };
  }
  clone.prevent_recursion = toBooleanStrict(
    clone.prevent_recursion ?? clone.preventRecursion ?? clone.recursion.prevent_outgoing,
  );
  clone.exclude_recursion = toBooleanStrict(
    clone.exclude_recursion ?? clone.excludeRecursion ?? clone.recursion.prevent_incoming,
  );
  clone.recursion.prevent_outgoing = clone.prevent_recursion;
  clone.recursion.prevent_incoming = clone.exclude_recursion;

  clone.case_sensitive = toBooleanStrict(clone.case_sensitive ?? clone.caseSensitive ?? false);
  clone.caseSensitive = clone.case_sensitive;

  clone.match_whole_words = toBooleanStrict(clone.match_whole_words ?? clone.matchWholeWords ?? false);
  clone.matchWholeWords = clone.match_whole_words;

  clone.enabled = clone.disable !== undefined ? !clone.disable : clone.enabled ?? true;

  return clone;
};

const convertUiEntryToRaw = (uiEntry, baseEntry = {}) => {
  const raw = cloneEntry(baseEntry);
  const uiClone = cloneEntry(uiEntry);

  const numericUid = parseOptionalNumber(uiClone.uid);
  if (numericUid !== null) raw.uid = numericUid;

  if (uiClone.name !== undefined) raw.name = uiClone.name;
  if (uiClone.comment !== undefined) raw.comment = uiClone.comment;
  if (uiClone.content !== undefined) raw.content = uiClone.content;

  if (!raw.strategy || typeof raw.strategy !== 'object') {
    raw.strategy = {};
  }
  const strategy = raw.strategy;

  const keys = sanitizeKeyArray(uiClone.keys ?? strategy.keys ?? raw.keys ?? raw.key ?? raw.keywords);
  strategy.keys = [...keys];
  raw.keys = [...keys];
  raw.key = [...keys];
  raw.keywords = [...keys];

  const secondaryKeys = sanitizeKeyArray(
    uiClone.keysecondary ?? strategy.keys_secondary?.keys ?? raw.keysecondary,
  );
  if (!strategy.keys_secondary || typeof strategy.keys_secondary !== 'object') {
    strategy.keys_secondary = { logic: 'and_any', keys: [] };
  }
  strategy.keys_secondary.keys = [...secondaryKeys];
  raw.keysecondary = [...secondaryKeys];

  const logicString = normalizeLogicString(
    uiClone.logic ?? strategy.keys_secondary.logic ?? raw.logic ?? raw.selectiveLogic,
  );
  strategy.keys_secondary.logic = logicString;
  raw.logic = logicString;
  raw.selectiveLogic = LOGIC_STRING_TO_ENUM[logicString];

  if (uiClone.enabled !== undefined) {
    raw.enabled = Boolean(uiClone.enabled);
    raw.disable = !raw.enabled;
  }

  const probability = parseOptionalNumber(uiClone.probability);
  if (probability !== null) {
    raw.probability = probability;
    raw.useProbability = probability !== 100;
  } else if (raw.probability !== undefined) {
    raw.useProbability = raw.probability !== 100;
  }

  const order = parseOptionalNumber(uiClone.order);
  const depth = parseOptionalNumber(uiClone.depth);
  const positionStruct = buildRawPosition(uiClone.position ?? raw.position, {
    depth,
    order,
    basePosition: raw.position,
  });
  raw.position = positionStruct;
  if (positionStruct.type === 'at_depth') {
    raw.depth = positionStruct.depth ?? 0;
    raw.role = positionStruct.role ?? 'system';
  } else {
    raw.depth = null;
    raw.role = null;
  }
  if (positionStruct.order !== undefined) {
    raw.order = positionStruct.order;
    raw.insertion_order = positionStruct.order;
    raw.displayIndex = positionStruct.order;
  }

  if (!raw.recursion || typeof raw.recursion !== 'object') {
    raw.recursion = { prevent_incoming: false, prevent_outgoing: false, delay_until: null };
  }
  const recursion = raw.recursion;
  if (uiClone.prevent_recursion !== undefined) {
    recursion.prevent_outgoing = Boolean(uiClone.prevent_recursion);
  }
  if (uiClone.exclude_recursion !== undefined) {
    recursion.prevent_incoming = Boolean(uiClone.exclude_recursion);
  }
  raw.preventRecursion = recursion.prevent_outgoing;
  raw.prevent_recursion = recursion.prevent_outgoing;
  raw.excludeRecursion = recursion.prevent_incoming;
  raw.exclude_recursion = recursion.prevent_incoming;

  const resolveBool = (uiValue, currentValue) => {
    if (uiValue === undefined) return currentValue;
    return toBooleanStrict(uiValue);
  };

  const caseSensitiveValue = resolveBool(uiClone.case_sensitive, raw.caseSensitive ?? raw.case_sensitive);
  if (caseSensitiveValue !== undefined) {
    raw.caseSensitive = caseSensitiveValue;
    raw.case_sensitive = caseSensitiveValue;
  }

  const matchWholeWordsValue = resolveBool(uiClone.match_whole_words, raw.matchWholeWords ?? raw.match_whole_words);
  if (matchWholeWordsValue !== undefined) {
    raw.matchWholeWords = matchWholeWordsValue;
    raw.match_whole_words = matchWholeWordsValue;
  }

  return raw;
};


const resolveNumericUid = value => {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
};

const sanitizeKeysForUpdate = keys => sanitizeKeyArray(keys);

const isCharacterNotFoundError = (error) => {
  if (!error) return false;
  const message = String(error?.message ?? error ?? '').toLowerCase();
  return message.includes('未找到名为') || (message.includes('character') && message.includes('not found'));
};

export const TavernAPI = {
  createWorldbook: errorCatched(async name => await getTavernHelper().createWorldbook(name, [])),
  deleteWorldbook: errorCatched(async name => await getTavernHelper().deleteWorldbook(name)),
  getWorldbooks: errorCatched(async () => await getTavernHelper().getWorldbookNames()),
  getCharData: errorCatched(async () => await getTavernHelper().getCharData()),
  getRegexes: errorCatched(async () => await getTavernHelper().getTavernRegexes({ scope: 'all' })),
  replaceRegexes: errorCatched(async (regexes, options = {}) => {
    const scope = options?.scope ?? 'all';
    const payload = Array.isArray(regexes) ? regexes : [];
    normalizeRegexPayloadOrder(payload);
    await getTavernHelper().replaceTavernRegexes(payload, { scope });
  }),
  getGlobalWorldbookNames: errorCatched(async () => await getTavernHelper().getGlobalWorldbookNames()),
  rebindGlobalWorldbooks: errorCatched(async bookNames => await getTavernHelper().rebindGlobalWorldbooks(bookNames)),
  getCharWorldbookNames: errorCatched(async charData => {
    try {
      const characterName = charData?.name;
      if (!characterName) {
        console.warn('[RegexLoreHub] getCharWorldbookNames 调用缺少角色名称。');
        return null;
      }
      return await getTavernHelper().getCharWorldbookNames(characterName);
    } catch (error) {
      if (isCharacterNotFoundError(error)) {
        console.warn('[RegexLoreHub] 未找到指定角色卡，跳过角色世界书加载。', error);
        return null;
      }
      throw error;
    }
  }),
  getCurrentCharWorldbookNames: errorCatched(async () => {
    try {
      return await getTavernHelper().getCharWorldbookNames('current');
    } catch (error) {
      if (isCharacterNotFoundError(error)) {
        console.warn('[RegexLoreHub] 未找到当前角色卡，跳过角色世界书加载。', error);
        return null;
      }
      throw error;
    }
  }),
  getChatWorldbookName: errorCatched(async () => await getTavernHelper().getChatWorldbookName('current')),
  getOrCreateChatWorldbook: errorCatched(async name => await getTavernHelper().getOrCreateChatWorldbook('current', name)),
  rebindChatWorldbook: errorCatched(async name => await getTavernHelper().rebindChatWorldbook('current', name)),
  getWorldbook: errorCatched(async name => await getTavernHelper().getWorldbook(name)),
  updateWorldbookWith: errorCatched(async (name, updater) => await getTavernHelper().updateWorldbookWith(name, updater)),
  replaceWorldbook: errorCatched(async (name, entries) => await getTavernHelper().replaceWorldbook(name, entries)),
  createWorldbookEntries: errorCatched(async (name, entries) => await getTavernHelper().createWorldbookEntries(name, entries)),
  deleteWorldbookEntries: errorCatched(async (name, uids) => {
    const uidsSet = new Set(uids);
    return await getTavernHelper().deleteWorldbookEntries(name, entry => uidsSet.has(entry.uid));
  }),
  saveSettings: errorCatched(async () => await getTavernHelper().builtin.saveSettings()),
  rebindCharWorldbooks: errorCatched(async lorebooks => await getTavernHelper().rebindCharWorldbooks('current', lorebooks)),
  get Character() {
    return getTavernHelper().Character;
  },
};

export const updateWorldbookEntries = errorCatched(async (bookName, entryUpdates) => {
  if (!Array.isArray(entryUpdates) || entryUpdates.length === 0) return;

  const updatesByUid = new Map();
  const pendingUidSet = new Set();

  entryUpdates.forEach(update => {
    if (!update || typeof update !== 'object') return;
    const uid = parseOptionalNumber(update.uid);
    if (uid === null) return;
    pendingUidSet.add(uid);
    const existing = updatesByUid.get(uid) ?? {};
    updatesByUid.set(uid, { ...existing, ...update });
  });

  if (pendingUidSet.size === 0) return;

  const localEntries = safeGetLorebookEntries(bookName);
  const localEntryMap = new Map(
    localEntries
      .map(entry => [parseOptionalNumber(entry?.uid), entry])
      .filter(([uid]) => uid !== null),
  );

  const updater = currentEntries =>
    currentEntries.map(entry => {
      const uid = parseOptionalNumber(entry?.uid);
      if (uid === null || !pendingUidSet.has(uid)) return entry;
      const localEntry = localEntryMap.get(uid);
      if (!localEntry) return entry;
      const mergedLocal = cloneEntry(localEntry);
      const partialUpdate = updatesByUid.get(uid);
      if (partialUpdate && typeof partialUpdate === 'object') {
        // 先将调用方传入的增量数据合并到本地条目，再统一交给转换函数处理
        Object.entries(partialUpdate).forEach(([key, value]) => {
          if (key === 'uid' || key === 'tempUid') return;
          if (Array.isArray(value)) {
            mergedLocal[key] = value.map(item => (typeof item === 'object' && item !== null ? cloneEntry(item) : item));
          } else if (value && typeof value === 'object') {
            mergedLocal[key] = cloneEntry(value);
          } else {
            mergedLocal[key] = value;
          }
        });
      }
      return convertUiEntryToRaw(mergedLocal, entry);
    });

  const updatedEntries = await TavernAPI.updateWorldbookWith(bookName, updater);

  const normalizedEntries = Array.isArray(updatedEntries)
    ? updatedEntries.map(normalizeWorldbookEntry)
    : [];
  safeSetLorebookEntries(bookName, normalizedEntries);
  updateBookSummary(bookName);

  await TavernAPI.saveSettings();
  return updatedEntries;
});


const ensurePendingLorebookUpdateMap = bookName => {
  if (!appState.pendingLorebookUpdates.has(bookName)) {
    appState.pendingLorebookUpdates.set(bookName, new Map());
  }
  return appState.pendingLorebookUpdates.get(bookName);
};

export const queueLorebookEntryUpdate = (bookName, entryIdentifier, partialUpdate = {}) => {
  if (!bookName || !partialUpdate || typeof partialUpdate !== 'object') return;
  const numericUid = resolveNumericUid(entryIdentifier);
  const key = String(entryIdentifier);
  const updatesMap = ensurePendingLorebookUpdateMap(bookName);
  const existing =
    updatesMap.get(key) ??
    {
      uid: numericUid,
      tempUid: numericUid == null ? key : null,
      data: {},
    };

  if (numericUid != null) {
    existing.uid = numericUid;
  }

  if (!existing.data || typeof existing.data !== 'object') {
    existing.data = {};
  }

  const payload = { ...partialUpdate };
  if (Array.isArray(payload.keys)) {
    payload.keys = sanitizeKeysForUpdate(payload.keys);
  }

  Object.entries(payload).forEach(([field, value]) => {
    if (value !== undefined) {
      existing.data[field] = value;
    }
  });

  updatesMap.set(key, existing);
};

export const queueRegexUpdate = regexId => {
  if (regexId === undefined || regexId === null) return;
  appState.pendingRegexUpdates.add(regexId);
};

const migratePendingLorebookUpdate = (bookName, tempUid, newUid) => {
  const numericUid = resolveNumericUid(newUid);
  if (!bookName || tempUid == null || numericUid == null) return;
  const updatesMap = appState.pendingLorebookUpdates.get(bookName);
  if (!updatesMap || !(updatesMap instanceof Map)) return;

  const tempKey = String(tempUid);
  const record = updatesMap.get(tempKey);
  if (!record) return;

  updatesMap.delete(tempKey);

  const newKey = String(numericUid);
  const target =
    updatesMap.get(newKey) ??
    {
      uid: numericUid,
      tempUid: null,
      data: {},
    };

  target.uid = numericUid;
  if (!target.data || typeof target.data !== 'object') {
    target.data = {};
  }
  if (record.data && typeof record.data === 'object') {
    target.data = { ...record.data, ...target.data };
  }

  updatesMap.set(newKey, target);
};

let loadAllDataPromise = null;

const performLoadAllData = async () => {
  const $ = get$();
  const parentDoc = getParentDoc();
  const parentWin = getParentWin();
  const TavernHelper = getTavernHelper();
  const $content = $(`#${PANEL_ID}-content`, parentDoc);

  syncContextWithAppState(); // <--- 在此处添加调用

  const createLoadingUI = () => {
    const html = `
      <div class="rlh-loading">
        <div class="rlh-loading-spinner" aria-hidden="true"></div>
        <div class="rlh-loading-text">
          <p class="rlh-loading-title">正在加载数据...</p>
          <p class="rlh-loading-status">初始化...</p>
          <div class="rlh-loading-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
            <div class="rlh-loading-bar-inner"></div>
          </div>
          <div class="rlh-loading-progress">0%</div>
          <p class="rlh-loading-detail"></p>
        </div>
      </div>
    `;
    $content.html(html);
    const $status = $content.find('.rlh-loading-status');
    const $detail = $content.find('.rlh-loading-detail');
    const $progress = $content.find('.rlh-loading-progress');
    const $bar = $content.find('.rlh-loading-bar-inner');
    const $barContainer = $content.find('.rlh-loading-bar');

    let total = 1;
    let current = 0;

    const updateBar = () => {
      const safeTotal = Math.max(1, total);
      const ratio = Math.min(current / safeTotal, 1);
      const percent = Math.round(ratio * 100);
      $bar.css('width', `${percent}%`);
      $barContainer.attr('aria-valuenow', percent);
      $progress.text(`${percent}%`);
    };

    updateBar();

    return {
      setProgress(currentValue, totalValue, status, detail) {
        total = Math.max(1, totalValue);
        current = Math.max(0, Math.min(currentValue, total));
        if (status) $status.text(status);
        if (detail !== undefined) $detail.text(detail);
        updateBar();
      },
      setStatus(status, detail) {
        if (status) $status.text(status);
        if (detail !== undefined) $detail.text(detail);
      },
    };
  };

  const loading = createLoadingUI();
  let totalSteps = 4;
  let progressCurrent = 0;

  const advanceProgress = (status, detail) => {
    progressCurrent = Math.min(progressCurrent + 1, totalSteps);
    loading.setProgress(progressCurrent, totalSteps, status, detail);
  };

  loading.setProgress(progressCurrent, totalSteps, '准备加载数据...', '正在检查运行环境');

  try {
    // 防御性检查：确保SillyTavern API可用
    if (!parentWin.SillyTavern || !parentWin.SillyTavern.getContext) {
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

    advanceProgress('获取基础数据...', '正在向 SillyTavern 请求数据');
    const context = parentWin.SillyTavern?.getContext?.() || {};
    const allCharacters = Array.isArray(context.characters) ? context.characters : [];
    const hasActiveCharacter = context.characterId !== undefined && context.characterId !== null;
    const hasActiveChat = context.chatId !== undefined && context.chatId !== null;

    let charData = null,
      charLinkedBooks = null,
      chatLorebook = null;

    // 使用Promise.allSettled来避免单个失败影响整体
    const promises = [
      TavernAPI.getRegexes().catch(() => []),
      TavernAPI.getGlobalWorldbookNames().catch(() => ([])),
      TavernAPI.getWorldbooks().catch(() => []),
    ];

    if (hasActiveCharacter) {
      promises.push(TavernAPI.getCharData().catch(() => null));
      promises.push(TavernAPI.getCurrentCharWorldbookNames().catch(() => null));
    } else {
      promises.push(Promise.resolve(null), Promise.resolve(null));
    }

    if (hasActiveChat) {
      // 只有在确实有活跃聊天时才尝试获取聊天世界书
      promises.push(
        TavernAPI.getChatWorldbookName().catch(error => {
          console.warn('[RegexLoreHub] Failed to get chat worldbook:', error);
          return null;
        }),
      );
    } else {
      promises.push(Promise.resolve(null));
    }

    const results = await Promise.allSettled(promises);

    advanceProgress('解析数据结构...', `检测到 ${allCharacters.length} 个角色，正在整理数据`);


    // 安全提取结果
    const allUIRegexes = results[0].status === 'fulfilled' ? results[0].value : [];
    const enabledGlobalBookNames = results[1].status === 'fulfilled' ? results[1].value : [];
    const allBookFileNames = results[2].status === 'fulfilled' ? results[2].value : [];
    charData = results[3]?.status === 'fulfilled' ? results[3].value : null;
    charLinkedBooks = results[4]?.status === 'fulfilled' ? results[4].value : null;
    chatLorebook = results[5]?.status === 'fulfilled' ? results[5].value : null;

    syncContextWithAppState({ charData }); // 确保角色名在初次渲染前已就绪

    appState.regexes.global = Array.isArray(allUIRegexes) ? allUIRegexes.filter(r => r.scope === 'global') : [];
    updateRegexOrderMetadata(appState.regexes.global);
    updateCharacterRegexes(allUIRegexes, charData);

    

    safeClearLorebookEntries();
    if (!(appState.pendingLorebookUpdates instanceof Map)) {
      appState.pendingLorebookUpdates = new Map();
    } else {
      appState.pendingLorebookUpdates.clear();
    }
    if (!(appState.pendingRegexUpdates instanceof Set)) {
      appState.pendingRegexUpdates = new Set();
    } else {
      appState.pendingRegexUpdates.clear();
    }
    appState.lorebookUsage.clear();
    const knownBookNames = new Set(Array.isArray(allBookFileNames) ? allBookFileNames : []);

    // 安全处理角色世界书
    if (Array.isArray(allCharacters) && allCharacters.length > 0) {
      try {
        await Promise.all(
          allCharacters.map(async char => {
            if (!char || !char.name) return;
            try {
              let books = null;
              try {
                const result = TavernHelper.getCharWorldbookNames(char.name);
                // 检查是否为 Promise
                if (result && typeof result.then === 'function') {
                  books = await result;
                } else {
                  books = result;
                }
              } catch (error) {
                console.warn(`[RegexLoreHub] Error getting worldbooks for character "${char.name}":`, error);
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
                    console.log(`[RegexLoreHub] Character "${char.name}" uses worldbook "${bookName}"`);
                  }
                });
              }
            } catch (charError) {
              console.warn(`[RegexLoreHub] Error processing character ${char.name}:`, charError);
            }
          }),
        );
      } catch (charProcessingError) {
        console.warn('[RegexLoreHub] Error processing characters:', charProcessingError);
      }
    }

    const enabledGlobalBooks = new Set(Array.isArray(enabledGlobalBookNames) ? enabledGlobalBookNames : []);
    appState.allLorebooks = (Array.isArray(allBookFileNames) ? allBookFileNames : []).map(name => ({
      name: name,
      enabled: enabledGlobalBooks.has(name),
      entryCount: 0,
      enabledEntryCount: 0,
      entriesLoaded: false,
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
    appState.chatLorebook = typeof chatLorebook === 'string' ? chatLorebook : null;
    if (typeof chatLorebook === 'string') {
      knownBookNames.add(chatLorebook);
    }

    advanceProgress('构建索引...', '世界书列表已加载');

    

    appState.isDataLoaded = true;
    advanceProgress('渲染界面...', '数据加载完成');
    renderContent();

    prefetchGlobalBookSummaries();
  } catch (error) {
    console.error('[RegexLoreHub] Error in loadAllData:', error);
    // 发生严重错误时，显示友好的错误信息
    $content.html(`
                <div class="rlh-error-wrapper">
                    <p class="rlh-error-title">
                        <i class="fa-solid fa-exclamation-triangle"></i> 数据加载失败
                    </p>
                    <p class="rlh-error-text">
                        请检查开发者控制台获取详细信息，或尝试刷新页面。
                    </p>
                    <button class="rlh-modal-btn rlh-error-retry-btn" onclick="$('#${REFRESH_BTN_ID}').click()">
                        <i class="fa-solid fa-refresh"></i> 重试
                    </button>
                </div>
            `);
    throw error; // 让errorCatched捕获并显示通用错误消息
  }
};

export const loadAllData = errorCatched(async (force = false) => {
  if (force) {
    appState.isDataLoaded = false;
  } else if (appState.isDataLoaded) {
    return;
  }

  if (loadAllDataPromise) {
    await loadAllDataPromise;
    if (!force) {
      return;
    }
  }

  loadAllDataPromise = performLoadAllData();
  try {
    await loadAllDataPromise;
  } finally {
    loadAllDataPromise = null;
  }
});



let isPrefetchingGlobalSummaries = false;
const PREFETCH_MAX_CONCURRENCY = 3;

// 简单的延迟工具，用于在大量请求间留出呼吸空间
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 获取顶部预加载进度条相关的 DOM 元素
const getPrefetchElements = () => {
  const $ = get$();
  const parentDoc = getParentDoc();
  if (!$ || !parentDoc) return {};
  const $indicator = $(`#${PREFETCH_INDICATOR_ID}`, parentDoc);
  if (!$indicator.length) return {};
  const $text = $indicator.find(`#${PREFETCH_PROGRESS_TEXT_ID}`);
  const $bar = $indicator.find(`#${PREFETCH_PROGRESS_BAR_ID}`);
  const $barContainer = $indicator.find('.rlh-prefetch-bar');
  return { $indicator, $text, $bar, $barContainer };
};

const setPrefetchIndicatorVisibility = visible => {
  const { $indicator, $bar, $barContainer } = getPrefetchElements();
  if (!$indicator) return;
  $indicator.attr('data-visible', visible ? 'true' : 'false');
  $indicator.attr('aria-hidden', visible ? 'false' : 'true');
  if (!visible) {
    if ($bar?.length) $bar.css('width', '0%');
    if ($barContainer?.length) $barContainer.attr('aria-valuenow', 0);
  }
};

const updatePrefetchIndicatorContent = (current, total) => {
  const { $indicator, $text, $bar, $barContainer } = getPrefetchElements();
  if (!$indicator) return;
  const safeTotal = total > 0 ? total : 1;
  const clamped = Math.min(current, total);
  const percent = Math.round((clamped / safeTotal) * 100);
  const message = `后台加载世界书 (${clamped}/${total})，不影响其他操作`;
  if ($text?.length) $text.text(message);
  if ($bar?.length) $bar.css('width', `${Math.min(percent, 100)}%`);
  if ($barContainer?.length) $barContainer.attr('aria-valuenow', Math.min(percent, 100));
};

const hidePrefetchIndicator = () => {
  setPrefetchIndicatorVisibility(false);
};

// 根据加载结果即时刷新列表中的条目统计
const updateGlobalBookStatsDisplay = bookName => {
  const $ = get$();
  const parentDoc = getParentDoc();
  if (!$ || !parentDoc) return;
  const $panel = $(`#${PANEL_ID}`, parentDoc);
  if (!$panel.length) return;
  const $group = $panel.find('.rlh-book-group').filter((_, el) => $(el).data('book-name') === bookName);
  if (!$group.length) return;
  const book = appState.allLorebooks.find(b => b.name === bookName);
  if (!book) return;
  $group.find('.rlh-book-stats').text(`条目: ${book.enabledEntryCount} / ${book.entryCount}`);
};

const showPrefetchIndicator = total => {
  if (total <= 0) {
    hidePrefetchIndicator();
    return;
  }
  setPrefetchIndicatorVisibility(true);
  updatePrefetchIndicatorContent(0, total);
};

// 后台逐本加载全局世界书条目，以填充统计数据，不阻塞主界面
export const prefetchGlobalBookSummaries = errorCatched(async () => {
  if (isPrefetchingGlobalSummaries) return;
  const booksToPrefetch = appState.allLorebooks.filter(book => !book.entriesLoaded);
  if (booksToPrefetch.length === 0) {
    hidePrefetchIndicator();
    return;
  }

  isPrefetchingGlobalSummaries = true;
  showPrefetchIndicator(booksToPrefetch.length);

  try {
    let completed = 0;
    const queue = [...booksToPrefetch];

    const worker = async () => {
      while (queue.length > 0) {
        const book = queue.shift();
        if (!book) break;

        try {
          await loadLorebookEntriesIfNeeded(book.name);
          updateGlobalBookStatsDisplay(book.name);
        } finally {
          completed += 1;
          updatePrefetchIndicatorContent(completed, booksToPrefetch.length);
        }

        await sleep(30);
      }
    };

    // 使用有限并发，避免一次性触发过多 API 请求
    const workerCount = Math.min(PREFETCH_MAX_CONCURRENCY, queue.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  } finally {
    await sleep(260);
    hidePrefetchIndicator();
    isPrefetchingGlobalSummaries = false;
  }
});

export const refreshCharacterData = errorCatched(async () => {
  // 检查是否有活跃的聊天
  const parentWin = getParentWin();
  const context = parentWin.SillyTavern?.getContext?.() || {};
  const hasActiveChat = context.chatId !== undefined && context.chatId !== null;

  const promises = [TavernAPI.getCharData(), TavernAPI.getCurrentCharWorldbookNames(), TavernAPI.getRegexes()];

  // 只有在有活跃聊天时才获取聊天世界书
  if (hasActiveChat) {
    promises.push(
      TavernAPI.getChatWorldbookName().catch(error => {
        console.warn('[RegexLoreHub] Failed to get chat worldbook in refreshCharacterData:', error);
        return null;
      }),
    );
  } else {
    promises.push(Promise.resolve(null));
  }

  const [charData, charBooks, allUIRegexes, chatWorldbook] = await Promise.all(promises);

  updateCharacterRegexes(allUIRegexes, charData);
  syncContextWithAppState({ charData }); // 刷新时补齐角色名称
  updateCharacterLorebooks(charBooks);
  appState.chatLorebook = chatWorldbook;
  const newBooksToLoad = appState.lorebooks.character.filter(name => !safeHasLorebookEntries(name));
  if (newBooksToLoad.length > 0) {
    await Promise.all(
      newBooksToLoad.map(async name => {
        const entries = await TavernAPI.getWorldbook(name); // 使用新的API
        safeSetLorebookEntries(name, entries.map(normalizeWorldbookEntry));
      }),
    );
  }
});

export function updateCharacterRegexes(allUIRegexes, charData) {
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
        source: 'card',
      }));
    } catch (e) {
      console.warn('无法解析角色卡正则脚本:', e);
    }
  }
  const uiRegexIdentifiers = new Set(
    characterUIRegexes.map(r => `${r.script_name}::${r.find_regex}::${r.replace_string}`),
  );
  const uniqueCardRegexes = cardRegexes.filter(r => {
    const identifier = `${r.script_name}::${r.find_regex}::${r.replace_string}`;
    return !uiRegexIdentifiers.has(identifier);
  });
  appState.regexes.character = [...characterUIRegexes, ...uniqueCardRegexes];
  updateRegexOrderMetadata(appState.regexes.character);
}

export function updateCharacterLorebooks(charBooks) {
  let characterBookNames = [];
  if (charBooks) {
    if (charBooks.primary) characterBookNames.push(charBooks.primary);
    if (charBooks.additional) characterBookNames.push(...charBooks.additional);
  }
  appState.lorebooks.character = [...new Set(characterBookNames)];
}

/**
 * 计算并更新指定世界书的条目总数和启用条目数。
 * @param {string} bookName - 要更新的世界书的名称。
 */
export const updateBookSummary = bookName => {
  const entries = safeGetLorebookEntries(bookName);
  const book = appState.allLorebooks.find(b => b.name === bookName);
  if (book) {
    book.entryCount = entries.length;
    book.enabledEntryCount = entries.filter(entry => entry.enabled).length;
  }
};

/**
 * 在内存中创建一个新的 Lorebook entry 对象，并将其添加到 appState 的条目列表顶部。
 * @param {string} bookName - 所属世界书的名称。
 * @returns {object} 新创建的临时 entry 对象。
 */
export const createInMemoryEntry = bookName => {
  const newEntry = {
    uid: `temp-${Date.now()}`, // 临时唯一ID
    name: '新条目',
    comment: '',
    content: '',
    keys: [],
    key: [],
    keysecondary: [],
    enabled: true,
    disable: false,
    is_temp: true, // 标记为临时条目
    // 根据 WorldbookEntry 类型定义添加其他默认字段
    selective: true,
    selectiveLogic: LOGIC_STRING_TO_ENUM.and_any,
    logic: 'and_any',
    constant: false,
    position: 'before_character_definition',
    depth: null,
    order: 0,
    probability: 100,
    useProbability: false,
    case_sensitive: false,
    match_whole_words: false,
    prevent_recursion: false,
    exclude_recursion: false,
  };

  const entries = safeGetLorebookEntries(bookName);
  entries.unshift(newEntry);
  safeSetLorebookEntries(bookName, entries);

  return newEntry;
};

/**
 * 使用从服务器获取的真实数据更新内存中的临时 entry。
 * @param {string} bookName - 所属世界书的名称。
 * @param {string} tempId - 要更新的条目的临时ID。
 * @param {object} serverData - 从服务器返回的真实 entry 数据。
 */
export const updateInMemoryEntry = (bookName, tempId, serverData) => {
  const entries = safeGetLorebookEntries(bookName);
  const entryIndex = entries.findIndex(e => e.uid === tempId);

  if (entryIndex !== -1) {
    // 合并服务器数据，同时移除临时标记
    const normalizedServerData = normalizeWorldbookEntry(serverData);
    const updatedEntry = { ...entries[entryIndex], ...normalizedServerData, is_temp: false };
    entries[entryIndex] = updatedEntry;
    safeSetLorebookEntries(bookName, entries);
    migratePendingLorebookUpdate(bookName, tempId, updatedEntry.uid);
  } else {
    console.warn(`[RegexLoreHub] 在更新时找不到临时条目: ${tempId}`);
  }
};
/**
 * 按需加载指定世界书的条目，如果尚未加载或需要强制刷新。
 * @param {string} bookName - 要加载条目的世界书名称。
 * @param {boolean} [force=false] - 是否强制重新加载，即使用户数据已存在。
 */
export const loadLorebookEntriesIfNeeded = errorCatched(async (bookName, force = false) => {
  const book = appState.allLorebooks.find(b => b.name === bookName);

  // 使用 safeHasLorebookEntries 检查真实数据是否存在，而不是依赖可能被预取行为污染的 entriesLoaded 标志
  if (!book || (safeHasLorebookEntries(bookName) && !force)) {
    return;
  }

  try {
    let entries = await TavernAPI.getWorldbook(bookName);

    // 统一归一化字段，兼容新旧世界书结构
    entries = entries.map(normalizeWorldbookEntry);

    safeSetLorebookEntries(bookName, entries);
    book.entriesLoaded = true;
    updateBookSummary(bookName);
  } catch (error) {
    console.error(`[RegexLoreHub] Failed to load entries for worldbook "${bookName}":`, error);
    // 即使失败，也标记为已加载，以避免重复尝试，除非用户手动刷新
    book.entriesLoaded = true;
    // 可以选择在这里设置一个错误状态
  }
});

/**
 * 统一的保存函数，负责将所有待办的修改（如世界书条目、正则等）一次性提交。
 * 内置了UI状态更新和自动重试逻辑。
 */
export const saveAllChanges = errorCatched(async (options = {}) => {
  const { silent = false } = options;
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 3000; // 3秒

  let attempts = 0;

  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  const triggerUIUpdate = () => {
    if (silent) renderSaveStatus();
    else renderContent();
  };

  const flushLorebookUpdates = async () => {
    if (!(appState.pendingLorebookUpdates instanceof Map)) {
      appState.pendingLorebookUpdates = new Map();
      return false;
    }

    let didSave = false;

    for (const [bookName, updatesMap] of [...appState.pendingLorebookUpdates.entries()]) {
      if (!(updatesMap instanceof Map) || updatesMap.size === 0) continue;

      const payload = [];
      const processedKeys = [];

      for (const [key, record] of updatesMap.entries()) {
        const uid = record?.uid;
        if (typeof uid !== 'number' || Number.isNaN(uid)) continue;

        const data = record?.data;
        if (!data || Object.keys(data).length === 0) {
          processedKeys.push(key);
          continue;
        }

        payload.push({ uid, ...data });
        processedKeys.push(key);
      }

      if (payload.length === 0) {
        processedKeys.forEach(k => updatesMap.delete(k));
        if (updatesMap.size === 0) {
          appState.pendingLorebookUpdates.delete(bookName);
        }
        continue;
      }

      const result = await updateWorldbookEntries(bookName, payload);
      if (result) {
        didSave = true;
        processedKeys.forEach(k => updatesMap.delete(k));
        if (updatesMap.size === 0) {
          appState.pendingLorebookUpdates.delete(bookName);
        }
      }
    }

    return didSave;
  };

  const flushRegexUpdates = async () => {
    if (!(appState.pendingRegexUpdates instanceof Set)) {
      appState.pendingRegexUpdates = new Set();
      return false;
    }
    if (appState.pendingRegexUpdates.size === 0) {
      return false;
    }

    updateRegexOrderMetadata(appState.regexes.global);
    updateRegexOrderMetadata(appState.regexes.character);
    const allRegexes = [...appState.regexes.global, ...appState.regexes.character];
    await TavernAPI.replaceRegexes(allRegexes.filter(r => r.source !== 'card'));
    await TavernAPI.saveSettings();
    appState.pendingRegexUpdates.clear();
    return true;
  };

  const performSave = async () => {
    console.log('[RegexLoreHub] 执行统一保存操作...');
    const loreSaved = await flushLorebookUpdates();
    const regexSaved = await flushRegexUpdates();
    if (!loreSaved && !regexSaved) {
      console.log('[RegexLoreHub] 没有待保存的更改。');
    } else {
      console.log('[RegexLoreHub] 保存操作完成。');
    }
    return true;
  };

  while (attempts < MAX_RETRIES) {
    try {
      appState.saveRetryAttempt = attempts + 1;
      appState.saveStatus = attempts === 0 ? 'saving' : 'retrying';
      triggerUIUpdate();

      await performSave();

      appState.saveStatus = 'success';
      appState.saveRetryAttempt = 0;
      triggerUIUpdate();

      await delay(1500);
      appState.saveStatus = 'idle';
      triggerUIUpdate();

      console.log('[RegexLoreHub] 所有更改已成功保存。');
      return;
    } catch (error) {
      attempts++;
      console.error(`[RegexLoreHub] 保存失败，尝试次数 ${attempts}/${MAX_RETRIES}:`, error);

      if (attempts >= MAX_RETRIES) {
        appState.saveStatus = 'failed';
        triggerUIUpdate();
        console.error('[RegexLoreHub] 所有重试均失败，已停止保存。');
        throw new Error('自动保存失败，请检查连接或手动保存。');
      }

      await delay(RETRY_DELAY);
    }
  }
});

/**
 * 同步 SillyTavern 的上下文信息到 appState。
 * 这是确保UI层总能获取到最新、最可靠角色信息的关键。
 */
const normalizeCharacterName = value => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const extractNameFromCharacter = character => {
  if (!character || typeof character !== 'object') return null;
  return (
    normalizeCharacterName(character.name) ||
    normalizeCharacterName(character.display_name) ||
    normalizeCharacterName(character.title) ||
    normalizeCharacterName(character.metadata?.name) ||
    normalizeCharacterName(character.filename) ||
    normalizeCharacterName(character.external_id)
  );
};

const extractNameFromCharData = data => {
  if (!data || typeof data !== 'object') return null;
  return (
    normalizeCharacterName(data.name) ||
    normalizeCharacterName(data.char_name) ||
    normalizeCharacterName(data.display_name) ||
    normalizeCharacterName(data.metadata?.name) ||
    normalizeCharacterName(data.data?.name) ||
    normalizeCharacterName(data.data?.char_name) ||
    normalizeCharacterName(data.data?.display_name)
  );
};

const matchCharacterById = (character, targetId) => {
  if (!character || targetId === undefined || targetId === null) return false;
  const normalizedTarget = String(targetId);
  const candidateIds = [
    character.id,
    character.characterId,
    character.metadata?.characterId,
    character.metadata?.id,
    character.external_id,
    character.filename,
  ].map(value => (value === undefined || value === null ? null : String(value)));
  return candidateIds.some(id => id && id === normalizedTarget);
};

export const syncContextWithAppState = ({ charData = null } = {}) => {
  const parentWin = getParentWin();
  const context = parentWin.SillyTavern?.getContext?.() || {};
  const characters = Array.isArray(context.characters) ? context.characters : [];
  const characterId =
    context.characterId !== undefined && context.characterId !== null ? context.characterId : null;

  // 优先使用上下文提供的角色名
  let characterName =
    normalizeCharacterName(context.name) ||
    extractNameFromCharacter(context.character);

  // 根据角色ID在角色列表中查找名称
  if (!characterName && characterId !== null) {
    const matchedCharacter = characters.find(char => matchCharacterById(char, characterId));
    if (matchedCharacter) {
      characterName = extractNameFromCharacter(matchedCharacter);
    }
  }

  // 如果已经拿到角色数据，尝试从角色数据中提取名称
  if (!characterName && charData) {
    characterName = extractNameFromCharData(charData);
  }

  // 兜底：仅有一个角色时直接使用其名称
  if (!characterName && characters.length === 1) {
    characterName = extractNameFromCharacter(characters[0]);
  }

  appState.characterContext.name = characterName ?? null;
  appState.characterContext.id = characterId;
  console.log('[RegexLoreHub] Context synced with appState:', appState.characterContext);
};
