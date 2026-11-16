/*
 * Runs before the page is drawn and sets <html data-theme="light|dark"> and
 * <html data-text-size="...">, so the page never flashes in the wrong theme or size.
 * It uses the visitor's last choices, or the system setting on a first visit.
 * It is a separate file (not inline) so a strict Content-Security-Policy can allow it.
 */
(function () {
  var theme = 'light';
  var size = 'default';
  try {
    var savedTheme = window.localStorage.getItem('oncurve.theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      theme = savedTheme;
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      theme = 'dark';
    }
    var savedSize = window.localStorage.getItem('oncurve.textSize');
    if (savedSize === 'small' || savedSize === 'large' || savedSize === 'larger') {
      size = savedSize;
    }
  } catch {
    // Storage can be blocked (private mode). The defaults are a safe fallback.
  }
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-text-size', size);
})();
