/*
 * Unsigned — service worker.
 * Flashes a badge on the toolbar icon when a copied link was rewritten, and keeps a running tally.
 */
const BADGE_MS = 1600;
const timers = new Map();

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== 'unsigned:did' || !sender.tab) return;
  const tabId = sender.tab.id;

  let mode = 'clean';
  try { mode = JSON.parse(msg.detail || '{}').mode || 'clean'; } catch { /* default */ }

  chrome.action.setBadgeBackgroundColor({ tabId, color: mode === 'vx' ? '#b08a3e' : '#7a1c1c' });
  if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ tabId, color: '#f4ead2' });
  chrome.action.setBadgeText({ tabId, text: mode === 'vx' ? 'vx' : '✓' });

  clearTimeout(timers.get(tabId));
  timers.set(tabId, setTimeout(() => {
    chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
    timers.delete(tabId);
  }, BADGE_MS));

  chrome.storage.local.get({ count: 0 }).then(({ count }) => chrome.storage.local.set({ count: count + 1 }));
});
