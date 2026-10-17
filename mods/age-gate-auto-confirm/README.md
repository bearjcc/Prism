# Age gate auto-confirm

Skips common "I am over 18" entry gates when you have already chosen to enter as an adult.

The extension sets remembered first-party consent where a site rule lists storage keys, clicks a declared confirm control, or hides a declared overlay. Sites without a rule use conservative text heuristics only.

## Per-site rules (`rules/sites.json`)

Add one object per origin. `match` is an `https` origin or URL. At least one of `localStorage`, `cookies`, `confirm`, or `overlay` is required.

```json
{
  "sites": [
    {
      "match": "https://www.example.com",
      "localStorage": { "ageVerified": "true" },
      "cookies": [{ "name": "age_gate", "value": "1", "maxAgeDays": 365 }],
      "confirm": "#enter-site",
      "overlay": "#age-modal"
    }
  ]
}
```

Selectors are plain CSS strings validated at pack time. No script.

Turn the mod off for one origin with **Disable on this site** in the popup.
