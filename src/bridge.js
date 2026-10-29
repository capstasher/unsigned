/*
 * Unsigned — settings bridge (isolated world, document_start).
 * The page hook can't read extension storage, so this relays settings in and copy notices out.
 */
(() => {
  'use strict';

  const ext = globalThis.browser ?? globalThis.chrome;
  const EVT_SETTINGS = 'unsigned:settings';
  const EVT_HELLO = 'unsigned:hello';
  const EVT_DID = 'unsigned:did';

  const alive = () => { try { return !!ext.runtime?.id; } catch { return false; } };

  async function push() {
    if (!alive()) return;
    try {
      const { settings = {} } = await ext.storage.sync.get('settings');
      document.dispatchEvent(new CustomEvent(EVT_SETTINGS, { detail: JSON.stringify(settings) }));
    } catch { /* extension reloaded underneath us */ }
  }

  document.addEventListener(EVT_HELLO, push);
  ext.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) push();
  });
  push();

  document.addEventListener(EVT_DID, (e) => {
    if (!alive()) return;
    try {
      Promise.resolve(ext.runtime.sendMessage({ type: 'unsigned:did', detail: e.detail })).catch(() => {});
    } catch { /* ignore */ }
  });
})();
