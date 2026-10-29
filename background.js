/*
 * Unsigned — background service worker.
 * Flashes a badge on the toolbar icon when a copied link was rewritten.
 */
const ext = globalThis.browser ?? globalThis.chrome;
const BADGE_MS = 1600;
const timers = new Map();

ext.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== 'unsigned:did' || !sender.tab) return;
  const tabId = sender.tab.id;

  let mode = 'clean';
  try { mode = JSON.parse(msg.detail || '{}').mode || 'clean'; } catch { /* default */ }

  ext.action.setBadgeBackgroundColor({ tabId, color: mode === 'vx' ? '#b08a3e' : '#7a1c1c' });
  if (ext.action.setBadgeTextColor) ext.action.setBadgeTextColor({ tabId, color: '#f4ead2' });
  ext.action.setBadgeText({ tabId, text: mode === 'vx' ? 'vx' : '✓' });

  clearTimeout(timers.get(tabId));
  timers.set(tabId, setTimeout(() => {
    Promise.resolve(ext.action.setBadgeText({ tabId, text: '' })).catch(() => {});
    timers.delete(tabId);
  }, BADGE_MS));
});
