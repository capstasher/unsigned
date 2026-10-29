/* Unsigned — popup */
(() => {
  'use strict';

  const ext = globalThis.browser ?? globalThis.chrome;
  const R = globalThis.__UNSIGNED_REWRITE__;
  const $ = (id) => document.getElementById(id);

  let settings = { ...R.DEFAULTS };

  // Populate embed services.
  const select = $('embedHost');
  for (const host of R.EMBED_HOSTS) {
    const opt = document.createElement('option');
    opt.value = host;
    opt.textContent = host;
    select.append(opt);
  }

  function render() {
    $('enabled').checked = settings.enabled;
    document.body.classList.toggle('off', !settings.enabled);
    for (const radio of document.querySelectorAll('input[name="mode"]')) radio.checked = radio.value === settings.mode;
    select.value = settings.embedHost;
    $('shiftFlip').checked = settings.shiftFlip;
    $('scrubHtml').checked = settings.scrubHtml;
  }

  async function save(patch) {
    settings = { ...settings, ...patch };
    render();
    await ext.storage.sync.set({ settings });
  }

  $('enabled').addEventListener('change', (e) => save({ enabled: e.target.checked }));
  for (const radio of document.querySelectorAll('input[name="mode"]')) {
    radio.addEventListener('change', (e) => { if (e.target.checked) save({ mode: e.target.value }); });
  }
  select.addEventListener('change', (e) => save({ embedHost: e.target.value, mode: 'vx' }));
  $('shiftFlip').addEventListener('change', (e) => save({ shiftFlip: e.target.checked }));
  $('scrubHtml').addEventListener('change', (e) => save({ scrubHtml: e.target.checked }));

  (async () => {
    const { settings: stored = {} } = await ext.storage.sync.get('settings');
    settings = { ...R.DEFAULTS, ...stored };
    render();
  })();
})();
