// Sends the contact form to Netlify Forms.
// The design's own code shows the "sent" message; this file just delivers the message.
// It listens before the design does, so if any field is empty it does nothing and the
// design shows its "All fields are required" note as usual.
(function () {
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || !form.querySelector || !form.querySelector('input[name="first"]')) return;
    var get = function (n) { var el = form.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; };
    var msgEl = form.querySelector('[role="textbox"]');
    var data = {
      'form-name': 'contact',
      first: get('first'),
      last: get('last'),
      email: get('email'),
      message: msgEl ? msgEl.innerText.trim() : ''
    };
    if (!data.first || !data.last || !data.email || !data.message) return;
    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(data).toString()
    }).then(function (r) {
      if (!r.ok) throw new Error('Form service returned ' + r.status);
    }).catch(function (err) {
      console.error(err);
      alert('Sorry, your message could not be sent. Please email hello@heatherstokes.ca instead.');
    });
  }, true);
})();
