/*
 * Runs before the page is drawn and sets <html data-theme="light|dark">.
 * It uses the theme the visitor chose last time, or the system setting on a first visit.
 * It is a separate file (not inline) so a strict Content-Security-Policy can allow it.
 */
(function () {
  var theme = 'light';
  try {
    var saved = window.localStorage.getItem('oncurve.theme');
    if (saved === 'light' || saved === 'dark') {
      theme = saved;
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      theme = 'dark';
    }
  } catch {
    // Storage can be blocked (private mode). The light theme is a safe fallback.
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
