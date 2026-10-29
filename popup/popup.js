/* Unsigned — popup */
(() => {
  'use strict';

  const R = globalThis.__UNSIGNED_REWRITE__;
  const $ = (id) => document.getElementById(id);
  const SAMPLE = 'https://x.com/jack/status/20?s=12&t=dHJhY2tlZC10b2tlbg';

  let settings = { ...R.DEFAULTS };

  // Populate embed services.
  const select = $('embedHost');
  for (const host of R.EMBED_HOSTS) {
    const opt = document.createElement('option');
    opt.value = host;
    opt.textContent = host;
    select.append(opt);
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function render() {
    $('enabled').checked = settings.enabled;
    document.body.classList.toggle('off', !settings.enabled);
    for (const radio of document.querySelectorAll('input[name="mode"]')) radio.checked = radio.value === settings.mode;
    select.value = settings.embedHost;
    $('shiftFlip').checked = settings.shiftFlip;
    $('scrubHtml').checked = settings.scrubHtml;

    const [base, query] = SAMPLE.split('?');
    $('pvBefore').innerHTML = `${escapeHtml(base)}<s>?${escapeHtml(query)}</s>`;
    $('pvAfter').textContent = R.rewriteText(SAMPLE, settings);
  }

  async function save(patch) {
    settings = { ...settings, ...patch };
    render();
    await chrome.storage.sync.set({ settings });
  }

  $('enabled').addEventListener('change', (e) => save({ enabled: e.target.checked }));
  for (const radio of document.querySelectorAll('input[name="mode"]')) {
    radio.addEventListener('change', (e) => { if (e.target.checked) save({ mode: e.target.value }); });
  }
  select.addEventListener('change', (e) => save({ embedHost: e.target.value, mode: 'vx' }));
  select.addEventListener('click', (e) => e.stopPropagation());
  $('shiftFlip').addEventListener('change', (e) => save({ shiftFlip: e.target.checked }));
  $('scrubHtml').addEventListener('change', (e) => save({ scrubHtml: e.target.checked }));

  function renderTally(count) {
    $('tally').textContent = count
      ? `${count.toLocaleString()} link${count === 1 ? '' : 's'} unsigned so far.`
      : 'No links unsigned yet.';
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.count) renderTally(changes.count.newValue || 0);
  });

  (async () => {
    const [{ settings: stored = {} }, { count = 0 }] = await Promise.all([
      chrome.storage.sync.get('settings'),
      chrome.storage.local.get({ count: 0 })
    ]);
    settings = { ...R.DEFAULTS, ...stored };
    render();
    renderTally(count);
  })();
})();
