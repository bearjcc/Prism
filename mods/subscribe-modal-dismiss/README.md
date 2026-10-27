# Subscribe modal dismiss

Closes newsletter and "subscribe to keep reading" overlays on publishing sites. This is not a paywall bypass: if member-only body text is not already in the page DOM, Prism only removes the nag.

## Per-site rules (`rules/sites.json`)

Each entry needs `match` (https origin) or `markup` (`medium` or `substack` for custom domains detected from page assets). `modal` is required. `backdrop` and `dismiss` are optional. Prefer `dismiss` when the site ships a close or "No thanks" control.

```json
{
  "sites": [
    {
      "match": "https://medium.com",
      "modal": "div[role='dialog']",
      "dismiss": "button[aria-label='close']"
    },
    {
      "markup": "substack",
      "modal": "#subscribe-popup",
      "backdrop": ".subscribe-popup-backdrop",
      "dismiss": "button.dismiss"
    }
  ]
}
```

The shipped list is empty until selectors are verified from saved live markup. Generic heuristics cover obvious subscribe dialogs elsewhere.

Turn the mod off for one origin with **Disable on this site** in the popup.
