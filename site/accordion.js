// Site-wide tweak applied on top of the Claude Design export (survives new exports).
// On phones, opening an accordion closes any other open one on the page.
// While the other one animates shut, the tapped item is held in place on screen
// (iPhone Safari doesn't do this by itself, so content above closing would make it jump).
(function () {
  var PHONE = 768, SETTLE_MS = 500;
  var isAccordion = function (b) {
    return b && b.matches('#dc-root button[aria-expanded]') && !b.closest('nav') && b.getAttribute('aria-label') !== 'Menu';
  };
  document.addEventListener('click', function (e) {
    if (window.innerWidth >= PHONE || !e.isTrusted) return;
    var btn = e.target.closest && e.target.closest('button[aria-expanded]');
    if (!isAccordion(btn) || btn.getAttribute('aria-expanded') === 'true') return; // only when opening
    setTimeout(function () {
      var others = [].filter.call(document.querySelectorAll('#dc-root button[aria-expanded="true"]'), function (o) {
        return o !== btn && isAccordion(o);
      });
      if (!others.length) return;
      var top = btn.getBoundingClientRect().top, start = performance.now();
      document.documentElement.style.overflowAnchor = 'none';
      others.forEach(function (o) { o.click(); });
      (function hold() {
        var drift = btn.getBoundingClientRect().top - top;
        if (Math.abs(drift) > 0.5) window.scrollBy(0, drift);
        if (performance.now() - start < SETTLE_MS) requestAnimationFrame(hold);
        else document.documentElement.style.overflowAnchor = '';
      })();
    }, 0);
  }, true);
})();
