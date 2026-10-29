/*
 * Unsigned — shared URL rewriting logic.
 * Loaded into the page (MAIN world) ahead of hook.js, and into the popup for the live preview.
 */
(() => {
  'use strict';

  const DEFAULTS = Object.freeze({
    enabled: true,
    mode: 'clean',            // 'clean' | 'vx'
    embedHost: 'vxtwitter.com',
    shiftFlip: true,          // Shift-click "Copy link" uses the other mode for that copy
    scrubHtml: true           // drop hidden tracking markup from rich (HTML) copies
  });

  const EMBED_HOSTS = ['vxtwitter.com', 'fixvx.com', 'fxtwitter.com', 'fixupx.com'];

  const X_HOSTS = new Set([
    'x.com', 'www.x.com', 'mobile.x.com',
    'twitter.com', 'www.twitter.com', 'mobile.twitter.com'
  ]);

  // Candidate URLs on x.com / twitter.com (validated properly with URL() afterwards).
  const URL_RE = /https?:\/\/(?:[a-z0-9-]+\.)*(?:x|twitter)\.com(?:\/[^\s"'<>\\]*)?/gi;
  const STATUS_PATH_RE = /^\/(?:i\/web|i|[A-Za-z0-9_]{1,50})\/status(?:es)?\/\d+(?:\/[^?#]*)?$/;
  const TRAILING_PUNCT_RE = /[.,;:!?)\]}]+$/;

  // Query keys X (and friends) use to attribute a share. Everything else on non-tweet links is kept.
  const TRACKING_KEYS = new Set(['s', 't', 'ref_src', 'ref_url', 'src', 'twclid', 'cxt', 'fbclid', 'igshid']);

  function parseXUrl(raw) {
    let url;
    try { url = new URL(raw); } catch { return null; }
    if (!X_HOSTS.has(url.hostname.toLowerCase())) return null;
    return url;
  }

  function isStatusUrl(raw) {
    const url = parseXUrl(raw);
    return !!url && STATUS_PATH_RE.test(url.pathname);
  }

  function isSingleStatusUrl(text) {
    const t = String(text).trim();
    if (!t || /\s/.test(t)) return false;
    const m = t.match(URL_RE);
    return !!m && m.length === 1 && m[0] === t && isStatusUrl(t);
  }

  /** Rewrite one URL. mode 'vx' only applies to tweet (status) URLs. */
  function rewriteUrl(raw, mode, embedHost) {
    const url = parseXUrl(raw);
    if (!url) return raw;

    const host = url.hostname.toLowerCase().replace(/^(?:www|mobile)\./, '');
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (STATUS_PATH_RE.test(path)) {
      // A tweet link needs nothing but its path.
      const target = mode === 'vx' ? (EMBED_HOSTS.includes(embedHost) ? embedHost : DEFAULTS.embedHost) : host;
      return `https://${target}${path}`;
    }

    // Any other X link: strip only the tracking keys.
    let changed = host !== url.hostname;
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_KEYS.has(key) || key.startsWith('utm_')) { url.searchParams.delete(key); changed = true; }
    }
    if (!changed) return raw;
    url.hostname = host;
    return url.toString().replace(/\?$/, '');
  }

  function replaceUrls(text, mode, embedHost, htmlEscaped) {
    return text.replace(URL_RE, (match) => {
      const tail = (match.match(TRAILING_PUNCT_RE) || [''])[0];
      let core = tail ? match.slice(0, -tail.length) : match;
      if (htmlEscaped) core = core.replace(/&amp;/g, '&');
      let out = rewriteUrl(core, mode, embedHost);
      if (out === core) return match;
      if (htmlEscaped) out = out.replace(/&/g, '&amp;');
      return out + tail;
    });
  }

  /**
   * Plain text: strip tracking from every X link. Convert to an embed host only when the
   * whole copied payload is a single tweet link (i.e. "Copy link"), never inside prose.
   */
  function rewriteText(text, opts) {
    if (typeof text !== 'string' || !text) return text;
    const { mode = 'clean', embedHost = DEFAULTS.embedHost } = opts || {};
    const effective = mode === 'vx' && isSingleStatusUrl(text) ? 'vx' : 'clean';
    return replaceUrls(text, effective, embedHost, false);
  }

  const HIDDEN_STYLE_RE = /(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?:px|pt|em|rem)?\s*(?:;|$)|opacity\s*:\s*0(?:\.0+)?\s*(?:;|$))/i;

  function scrubHidden(html) {
    // Preferred: real DOM parse. Falls back to a regex pass if the page's Trusted Types policy blocks it.
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      let removed = 0;
      doc.querySelectorAll('[hidden], [style]').forEach((el) => {
        if (el.hasAttribute('hidden') || HIDDEN_STYLE_RE.test(el.getAttribute('style') || '')) {
          el.remove();
          removed++;
        }
      });
      if (!removed) return html;
      return /<html[\s>]/i.test(html) ? doc.documentElement.outerHTML : doc.body.innerHTML;
    } catch {
      return html.replace(
        /<(span|div|i|b|em|small|p)\b([^>]*)>[^<]*<\/\1>/gi,
        (whole, _tag, attrs) => (/\bhidden\b/i.test(attrs) || HIDDEN_STYLE_RE.test(attrs)) ? '' : whole
      );
    }
  }

  function htmlToText(html) {
    return html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  }

  function rewriteHtml(html, opts) {
    if (typeof html !== 'string' || !html) return html;
    const { mode = 'clean', embedHost = DEFAULTS.embedHost, scrubHtml = true } = opts || {};
    let out = scrubHtml ? scrubHidden(html) : html;
    const effective = mode === 'vx' && isSingleStatusUrl(htmlToText(out)) ? 'vx' : 'clean';
    return replaceUrls(out, effective, embedHost, true);
  }

  globalThis.__UNSIGNED_REWRITE__ = Object.freeze({
    DEFAULTS, EMBED_HOSTS, rewriteUrl, rewriteText, rewriteHtml, isSingleStatusUrl, isStatusUrl
  });
})();
