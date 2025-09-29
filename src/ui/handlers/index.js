import { get$, getParentDoc, getParentWin } from '../../core.js';
import { createLorebookHandlers } from './lorebook.js';
import { createItemHandlers } from './item.js';
import { createUIHandlers } from './ui.js';

// --- 统一导出 ---
export function createHandlers() {
  const $ = get$();
  const parentDoc = getParentDoc();
  const parentWin = getParentWin();

  const sharedDeps = { $, parentDoc, parentWin };

  const lorebookHandlers = createLorebookHandlers(sharedDeps);
  const itemHandlers = createItemHandlers(sharedDeps);
  const uiHandlers = createUIHandlers({ ...sharedDeps, lorebookHandlers, itemHandlers });

  return {
    ...lorebookHandlers,
    ...itemHandlers,
    ...uiHandlers,
  };
}
