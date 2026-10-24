// Injected into every page of the app's window (see windows/arbodat.rs), but only active on
// ArboDat+ pages, not on the app's own (Control Center). Small gaps of the system webview that the
// ArboDat+ web pages would otherwise fall into, and the way into the Control Center:
//   1. target="_blank" links (macOS ignores a plain left-click on them),
//   2. alert() (a silent no-op in WKWebView),
//   3. a toast for "saved to Downloads" (called from Rust),
//   4. a message that the address behind this window stopped answering (called from Rust),
//   5. the cog that opens the Control Center (and a warning first if something was typed).
(function () {
  if (window !== window.top || window.__arbodatShims) return;
  // The app's own pages (the Control Center) need none of this.
  if (window.__ARBODAT_APP_URL && String(location.href).indexOf(window.__ARBODAT_APP_URL) === 0) return;
  window.__arbodatShims = true;

  // 1. wry on macOS never inspects the click's target frame: such a click is "allowed" by the
  // navigation handler and then silently dropped by WebKit. Turn it into an ordinary navigation
  // before WebKit sees it: same-origin stays in this window, anything else reaches the Rust
  // navigation handler, which opens the browser. Modified and middle clicks are left alone (they
  // reach the new-window handler, which does the same).
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href][target]') : null;
    if (!a || a.target.toLowerCase() !== '_blank' || a.hasAttribute('download')) return;
    e.preventDefault();
    window.location.assign(a.href);
  }, true);

  var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var font = '14px -apple-system, "Segoe UI", system-ui, sans-serif';
  var panel = dark ? 'background:#2b2d31;color:#f2f3f5' : 'background:#fff;color:#111';

  function whenBodyExists(fn) {
    if (document.body) fn(); else document.addEventListener('DOMContentLoaded', fn);
  }

  // 2. Not blocking like the native one, which is fine: the pages only use it to tell the user
  // something. Several alerts queue up in one overlay; Enter, Escape or OK dismisses the newest.
  window.alert = function (message) {
    whenBodyExists(function () {
      var previous = document.activeElement;
      var overlay = document.createElement('div');
      overlay.setAttribute('role', 'alertdialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.4);font:' + font;
      var box = document.createElement('div');
      box.style.cssText = panel + ';max-width:min(520px,90vw);max-height:80vh;overflow:auto;padding:20px 24px;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.35)';
      var text = document.createElement('div');
      text.style.whiteSpace = 'pre-wrap';
      text.textContent = message === undefined ? '' : String(message);
      var ok = document.createElement('button');
      ok.textContent = 'OK';
      ok.style.cssText = 'display:block;margin:16px 0 0 auto;padding:6px 20px;font:' + font;
      function close() {
        overlay.remove();
        document.removeEventListener('keydown', onKey, true);
        if (previous && previous.focus) previous.focus();
      }
      function onKey(e) {
        if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close(); }
      }
      ok.addEventListener('click', close);
      document.addEventListener('keydown', onKey, true);
      box.appendChild(text);
      box.appendChild(ok);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      ok.focus();
    });
  };

  // 4. The address behind this window stopped answering (called from Rust every few seconds
  // while that's the case; one message that stays until __arbodatBannerClear is called).
  window.__arbodatBanner = function (message) {
    whenBodyExists(function () {
      var banner = document.getElementById('__arbodat_banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = '__arbodat_banner';
        banner.setAttribute('role', 'alert');
        banner.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:min(420px,90vw);padding:12px 16px;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.3);font:' + font + ';' + (dark ? 'background:#5c1f1b;color:#ffe3e0' : 'background:#fdecea;color:#7a1712') + ';border:1px solid #d9534f';
        document.body.appendChild(banner);
      }
      banner.textContent = String(message);
    });
  };
  window.__arbodatBannerClear = function () {
    var banner = document.getElementById('__arbodat_banner');
    if (banner) banner.remove();
  };

  // 3. Downloads end up in the Downloads folder without any visible sign; say so.
  window.__arbodatToast = function (message) {
    whenBodyExists(function () {
      var toast = document.createElement('div');
      toast.setAttribute('role', 'status');
      toast.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:min(420px,90vw);padding:12px 16px;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.3);font:' + font + ';' + panel;
      toast.textContent = String(message);
      document.body.appendChild(toast);
      setTimeout(function () { toast.remove(); }, 6000);
    });
  };

  // 5. The cog: the page's only way to the Control Center. It "navigates" to an address that the
  // app recognises (and cancels), because a web page has no other way to reach the app, and needs
  // none. Opening the Control Center unloads this page, so something typed and not saved gets a
  // warning first.
  var CONTROL_URL = 'arbodat-desktop://control-center';
  var isMigration = /migration\.html$/.test(location.pathname);
  var dirty = false;
  var typedAt = 0;

  function typedInto(e) {
    if (!e.isTrusted) return; // the page filling in its own fields doesn't count
    var t = e.target;
    if (!t || !t.matches || !t.matches('input, textarea, select')) return;
    if (/^(button|submit|reset|image)$/.test(t.type)) return;
    dirty = true;
    typedAt = Date.now();
  }
  document.addEventListener('input', typedInto, true);
  document.addEventListener('change', typedInto, true);

  // A write that went through (the page's own create, update or submit) after the last typing means
  // nothing is left unsaved. Not on the migration page: there the page itself holds the progress
  // (chosen files, steps done, results), and it stays at risk until the page is left.
  function wrote(startedAt, ok) {
    if (!isMigration && ok && startedAt >= typedAt) dirty = false;
  }
  try {
    var xhrOpen = XMLHttpRequest.prototype.open;
    var xhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method) {
      this.__arbodatWrite = !/^(GET|HEAD|OPTIONS)$/i.test(String(method));
      return xhrOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      if (this.__arbodatWrite) {
        var xhr = this;
        var startedAt = Date.now();
        if (isMigration) dirty = true;
        xhr.addEventListener('loadend', function () { wrote(startedAt, xhr.status >= 200 && xhr.status < 300); });
      }
      return xhrSend.apply(this, arguments);
    };
    var nativeFetch = window.fetch;
    if (nativeFetch) {
      window.fetch = function (input, init) {
        var method = (init && init.method) || (input && input.method) || 'GET';
        var promise = nativeFetch.apply(this, arguments);
        if (!/^(GET|HEAD|OPTIONS)$/i.test(String(method))) {
          var startedAt = Date.now();
          if (isMigration) dirty = true;
          promise.then(function (r) { wrote(startedAt, r.ok); }, function () {});
        }
        return promise;
      };
    }
  } catch (e) { /* the warning is a courtesy; never break the page for it */ }

  function confirmLeave(message, onLeave) {
    whenBodyExists(function () {
      var previous = document.activeElement;
      var overlay = document.createElement('div');
      overlay.setAttribute('role', 'alertdialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.4);font:' + font;
      var box = document.createElement('div');
      box.style.cssText = panel + ';max-width:min(520px,90vw);padding:20px 24px;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.35)';
      var text = document.createElement('div');
      text.style.whiteSpace = 'pre-wrap';
      text.textContent = message;
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:16px';
      var stay = document.createElement('button');
      stay.textContent = 'Stay on this page';
      stay.style.cssText = 'padding:6px 16px;font:' + font;
      var leave = document.createElement('button');
      leave.textContent = 'Open the Control Center';
      leave.style.cssText = 'padding:6px 16px;font:' + font;
      function close() {
        overlay.remove();
        document.removeEventListener('keydown', onKey, true);
        if (previous && previous.focus) previous.focus();
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      }
      stay.addEventListener('click', close);
      leave.addEventListener('click', function () { close(); onLeave(); });
      document.addEventListener('keydown', onKey, true);
      row.appendChild(stay);
      row.appendChild(leave);
      box.appendChild(text);
      box.appendChild(row);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      stay.focus(); // Enter must not throw anything away
    });
  }

  // Also called from Rust (menu, Dock) so that it gets the same warning.
  window.__arbodatOpenControl = function () {
    var go = function () { window.location.assign(CONTROL_URL); };
    if (!dirty) { go(); return; }
    confirmLeave(
      isMigration
        ? 'Opening the Control Center closes this page and loses the whole migration: the chosen files, the steps done and the results.'
        : 'Something you typed here may not be saved yet. Opening the Control Center closes this page and loses it.',
      go
    );
  };

  // The gear is drawn here (a ring of teeth, a ring, a hub), no icon set involved.
  whenBodyExists(function () {
    if (document.getElementById('__arbodat_cog')) return;
    var style = document.createElement('style');
    style.textContent =
      '#__arbodat_cog{position:fixed;top:10px;right:10px;width:38px;height:38px;border-radius:50%;z-index:2147483646;' +
      'border:1px solid rgba(128,128,128,.45);cursor:pointer;display:flex;align-items:center;justify-content:center;' +
      'opacity:.55;padding:0;transition:opacity .15s,transform .35s;' +
      (dark ? 'background:rgba(43,45,49,.85);color:#f2f3f5' : 'background:rgba(255,255,255,.85);color:#2b2d31') + '}' +
      '#__arbodat_cog:hover,#__arbodat_cog:focus-visible{opacity:1;transform:rotate(30deg)}' +
      '@media print{#__arbodat_cog{display:none}}';
    document.head.appendChild(style);
    var cog = document.createElement('button');
    cog.id = '__arbodat_cog';
    cog.type = 'button';
    cog.title = 'Control Center';
    cog.setAttribute('aria-label', 'Open the ArboDat+ Control Center');
    cog.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">' +
      '<path d="M9.71 4.75 L10.14 1.97 L13.86 1.97 L14.29 4.75 L15.51 5.26 L17.78 3.59 L20.41 6.22 L18.74 8.49 L19.25 9.71 L22.03 10.14 L22.03 13.86 L19.25 14.29 L18.74 15.51 L20.41 17.78 L17.78 20.41 L15.51 18.74 L14.29 19.25 L13.86 22.03 L10.14 22.03 L9.71 19.25 L8.49 18.74 L6.22 20.41 L3.59 17.78 L5.26 15.51 L4.75 14.29 L1.97 13.86 L1.97 10.14 L4.75 9.71 L5.26 8.49 L3.59 6.22 L6.22 3.59 L8.49 5.26 Z"/>' +
      '<circle cx="12" cy="12" r="3.3"/></svg>';
    cog.addEventListener('click', function () { window.__arbodatOpenControl(); });
    document.body.appendChild(cog);

    // A fixed element sits left of a vertical scrollbar, so the cog would jump when a page starts
    // or stops scrolling. Keep it where it is with a scrollbar (10 px left of it), always.
    var probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;width:60px;height:60px;overflow:scroll';
    document.body.appendChild(probe);
    var barWidth = probe.offsetWidth - probe.clientWidth;
    probe.remove();
    function placeCog() {
      var showing = window.innerWidth - document.documentElement.clientWidth;
      cog.style.right = (10 + Math.max(0, barWidth - showing)) + 'px';
    }
    placeCog();
    window.addEventListener('resize', placeCog);
    if (window.ResizeObserver) new ResizeObserver(placeCog).observe(document.documentElement);
  });
})();
