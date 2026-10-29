/*
 * Unsigned — page hook (MAIN world, document_start).
 * Rewrites tweet links at the moment X writes them to the clipboard, whichever API it uses:
 *   1. navigator.clipboard.writeText / write
 *   2. copy/cut event handlers calling clipboardData.setData
 *   3. a plain execCommand('copy') of a selected link (no handler involved)
 */
(() => {
  'use strict';

  const R = globalThis.__UNSIGNED_REWRITE__;
  try { delete globalThis.__UNSIGNED_REWRITE__; } catch { /* frozen global, ignore */ }
  if (!R || window.__unsignedHooked) return;
  Object.defineProperty(window, '__unsignedHooked', { value: true });

  const EVT_SETTINGS = 'unsigned:settings';
  const EVT_HELLO = 'unsigned:hello';
  const EVT_DID = 'unsigned:did';

  let settings = { ...R.DEFAULTS };

  document.addEventListener(EVT_SETTINGS, (e) => {
    try { settings = { ...R.DEFAULTS, ...JSON.parse(e.detail || '{}') }; } catch { /* keep current */ }
  });
  document.dispatchEvent(new CustomEvent(EVT_HELLO));

  // ── Shift-click flips the mode for that one copy ─────────────────────────────
  let flipUntil = 0;
  const noteGesture = (e) => {
    if (!e.isTrusted) return;
    flipUntil = e.shiftKey ? performance.now() + 2500 : 0;
  };
  window.addEventListener('pointerdown', noteGesture, true);
  window.addEventListener('click', noteGesture, true);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') noteGesture(e);
  }, true);

  const currentMode = () => {
    const flip = settings.shiftFlip && performance.now() < flipUntil;
    if (!flip) return settings.mode;
    return settings.mode === 'vx' ? 'clean' : 'vx';
  };

  const options = () => ({ mode: currentMode(), embedHost: settings.embedHost, scrubHtml: settings.scrubHtml });

  let lastAnnounce = 0;
  const announce = (mode) => {
    const now = performance.now();
    if (now - lastAnnounce < 250) return; // text/plain + text/html of one copy = one announcement
    lastAnnounce = now;
    document.dispatchEvent(new CustomEvent(EVT_DID, { detail: JSON.stringify({ mode }) }));
  };

  function plain(text) {
    if (!settings.enabled || typeof text !== 'string') return text;
    const opts = options();
    const out = R.rewriteText(text, opts);
    if (out !== text) announce(R.isSingleStatusUrl(text) ? opts.mode : 'clean');
    return out;
  }

  function html(markup) {
    if (!settings.enabled || typeof markup !== 'string') return markup;
    const out = R.rewriteHtml(markup, options());
    if (out !== markup) announce('clean');
    return out;
  }

  // Replace a prototype method while keeping its name, arity and property attributes.
  function patch(proto, name, makeReplacement) {
    const desc = proto && Object.getOwnPropertyDescriptor(proto, name);
    if (!desc || typeof desc.value !== 'function') return;
    const original = desc.value;
    const replacement = makeReplacement(original);
    Object.defineProperty(replacement, 'name', { value: original.name });
    Object.defineProperty(replacement, 'length', { value: original.length });
    Object.defineProperty(proto, name, { ...desc, value: replacement });
  }

  // ── 1. Async Clipboard API ───────────────────────────────────────────────────
  const ClipboardProto = window.Clipboard && window.Clipboard.prototype;

  patch(ClipboardProto, 'writeText', (original) => function (data) {
    return original.call(this, plain(String(data)));
  });

  patch(ClipboardProto, 'write', (original) => function (items) {
    if (!settings.enabled || !Array.isArray(items) || typeof window.ClipboardItem !== 'function') {
      return original.apply(this, arguments);
    }
    let rebuilt;
    try {
      rebuilt = items.map((item) => {
        if (!(item instanceof window.ClipboardItem)) return item;
        const types = item.types || [];
        if (!types.includes('text/plain') && !types.includes('text/html')) return item;
        const parts = {};
        for (const type of types) {
          const blob = item.getType(type);
          if (type === 'text/plain') {
            parts[type] = blob.then((b) => b.text()).then((t) => new Blob([plain(t)], { type }));
          } else if (type === 'text/html') {
            parts[type] = blob.then((b) => b.text()).then((t) => new Blob([html(t)], { type }));
          } else {
            parts[type] = blob;
          }
        }
        return new window.ClipboardItem(parts, { presentationStyle: item.presentationStyle });
      });
    } catch {
      return original.apply(this, arguments);
    }
    return original.call(this, rebuilt);
  });

  // ── 2. copy/cut handlers that call clipboardData.setData ─────────────────────
  let activeTransfer = null;
  const markCopy = (e) => {
    activeTransfer = e.clipboardData || null;
    setTimeout(() => { if (activeTransfer === e.clipboardData) activeTransfer = null; }, 0);
  };
  window.addEventListener('copy', markCopy, true);
  window.addEventListener('cut', markCopy, true);

  patch(window.DataTransfer && window.DataTransfer.prototype, 'setData', (original) => function (format, data) {
    if (this === activeTransfer && typeof data === 'string') {
      const f = String(format).toLowerCase();
      if (f === 'text/plain' || f === 'text' || f === 'text/uri-list') data = plain(data);
      else if (f === 'text/html') data = html(data);
    }
    return original.call(this, format, data);
  });

  // ── 3. Native copy of a selected bare link (execCommand on a hidden textarea) ─
  window.addEventListener('copy', (e) => {
    if (!settings.enabled || e.defaultPrevented || !e.clipboardData) return;
    let selected = '';
    const el = document.activeElement;
    if (el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|url|search)$/i.test(el.type)))) {
      try { selected = el.value.substring(el.selectionStart, el.selectionEnd); } catch { /* ignore */ }
    } else {
      selected = String(window.getSelection() || '');
    }
    // Only take over when the selection is a lone tweet link; leave ordinary text copies alone.
    if (!R.isSingleStatusUrl(selected)) return;
    const out = plain(selected.trim());
    if (out === selected.trim()) return;
    e.clipboardData.setData('text/plain', out);
    e.preventDefault();
  }, false);
})();
