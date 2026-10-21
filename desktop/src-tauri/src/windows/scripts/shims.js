// Injected into every page of the ArboDat+ window (see windows/arbodat.rs). Three small gaps of
// the system webview that the ArboDat+ web pages would otherwise fall into:
//   1. target="_blank" links (macOS ignores a plain left-click on them),
//   2. alert() (a silent no-op in WKWebView),
//   3. a toast for "saved to Downloads" (called from Rust).
(function () {
  if (window !== window.top || window.__arbodatShims) return;
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
})();
