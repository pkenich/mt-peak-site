/* Vercel Web Analytics (cookieless, no personal data stored).
   Queue stub + beforeSend so nothing sensitive leaves the browser:
   - the back office is never tracked
   - query strings are dropped: they can carry reset / unsubscribe /
     cart-restore tokens and Stripe session ids. */
window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
window.va('beforeSend', function (event) {
  var url = new URL(event.url, location.origin);
  if (url.pathname.indexOf('/admin') === 0) return null;
  url.search = '';
  event.url = url.toString();
  return event;
});
