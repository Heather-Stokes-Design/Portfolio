// Site-wide tweak applied on top of the Claude Design export (survives new exports).
// Images below the first screen are marked to load late so the page opens fast.
// Once the page has finished loading, fetch them all in the background so they're
// ready before the visitor scrolls to them (no grey placeholders while scrolling).
(function () {
  var eager = function () {
    [].forEach.call(document.querySelectorAll('img[loading="lazy"]'), function (img) { img.loading = 'eager'; });
  };
  var start = function () {
    setTimeout(function () {
      eager();
      // Images added later (carousels, re-renders) load straight away too.
      new MutationObserver(eager).observe(document.body, { childList: true, subtree: true });
    }, 300);
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start);
})();
