let jqInstance = null;
let tavernHelperInstance = null;

export function setEnv($, TavernHelper) {
  jqInstance = $;
  tavernHelperInstance = TavernHelper;
}

export function get$() {
  if (jqInstance) return jqInstance;
  const parentWin = window.parent || window;
  if (parentWin?.jQuery) return parentWin.jQuery;
  return null;
}

export function getTavernHelper() {
  if (tavernHelperInstance) return tavernHelperInstance;
  const parentWin = window.parent || window;
  if (parentWin?.TavernHelper) return parentWin.TavernHelper;
  return null;
}

function onReady(callback) {
  const domSelector = '#extensionsMenu';
  const maxRetries = 100; // 最多等待20秒
  let retries = 0;

  console.log(
    `[RegexLoreHub] Starting readiness check. Polling for DOM element "${domSelector}" AND core APIs (TavernHelper, jQuery).`,
  );

  const interval = setInterval(() => {
    const parentDoc = window.parent?.document;
    const parentWin = window.parent;

    const domReady = !!parentDoc && parentDoc.querySelector(domSelector) !== null;
    const apiReady =
      !!(parentWin && parentWin.TavernHelper) &&
      typeof parentWin.TavernHelper.getCharData === 'function' &&
      !!parentWin.jQuery;

    if (domReady && apiReady) {
      clearInterval(interval);
      console.log(
        `[RegexLoreHub] SUCCESS: Both DOM ("${domSelector}") and Core APIs are ready. Initializing script.`,
      );
      try {
        const result = callback(parentWin.jQuery, parentWin.TavernHelper);
        if (result?.catch) {
          result.catch(error => {
            console.error('[RegexLoreHub] FATAL: Error during main callback execution.', error);
          });
        }
      } catch (error) {
        console.error('[RegexLoreHub] FATAL: Error during main callback execution.', error);
      }
    } else {
      retries++;
      if (retries > maxRetries) {
        clearInterval(interval);
        console.error('[RegexLoreHub] FATAL: Readiness check timed out.');
        if (!domReady) console.error(`[RegexLoreHub] -> Failure: DOM element "${domSelector}" not found.`);
        if (!apiReady)
          console.error(
            `[RegexLoreHub] -> Failure: Core APIs not available. TavernHelper: ${!!parentWin?.TavernHelper}, jQuery: ${!!parentWin?.jQuery}`,
          );
      }
    }
  }, 150);
}

import { createHandlers } from './ui/handlers/index.js';
import { initializeUI } from './ui/shell.js';

async function main($, TavernHelper) {
  setEnv($, TavernHelper);

  try {
    await initializeUI(createHandlers);
  } catch (error) {
    console.error('[RegexLoreHub] FATAL: Failed to bootstrap application.', error);
  }
}

onReady(main);
