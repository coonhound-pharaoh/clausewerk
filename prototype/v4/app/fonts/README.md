# The typefaces live here, not on someone else's server

## Why

Clausewerk used to fetch its type from Google's font CDN on every page load. Two
consequences, both bad for a contract system:

1. **It told a third party who was using the product.** Every page view sent the
   customer's IP address to Google. No contract text or names leaked — but
   "why does your contract vault call out to Google" is a question that gets
   asked in a buyer's security review, and it is a bad question to have to
   answer.
2. **It failed silently behind a strict firewall.** If the call was blocked or
   slow, the page still worked, but the typography fell back to whatever the
   machine had. The product's whole visual argument is that it *looks like a
   system of record*; that impression was the first thing to go, on the machine
   of the most security-conscious customer.

Both are gone now. The application makes no third-party request for type.

## What is here

Eighteen `.woff2` files — the `latin` and `latin-ext` subsets of five families:

| Family | Used for |
|---|---|
| Source Serif 4 | running text under the parchment theme |
| Courier Prime | the legal-typewriter face: identifiers, ages, counts, buttons |
| Instrument Serif | display headings, both themes |
| Inter | body text in **dark mode only** |
| JetBrains Mono | the data face in **dark mode only** |

Inter and JetBrains Mono are not dead weight. `S95` (2026-07-28) made dark mode
one deleted line away — remove the `parchment.css` link and the interface
returns to it exactly. That only works if its typefaces are still here.

A file ending `-var` is one **variable font** covering every weight of that
family, which is why six weights of Inter cost one file rather than six.
Deduplicating these took the set from 1,816 KB to 645 KB.

## What is deliberately NOT here

The `cyrillic`, `cyrillic-ext`, `greek`, `greek-ext` and `vietnamese` subsets.
English plus Western and Central European accented characters are covered; a
Cyrillic or Greek character will render in a system fallback face instead.

If a customer ever needs them, add the subset name to `KEEP` in
`fetch-fonts.py` and re-run it. That is a regeneration, not a redesign.

## Licensing

All five families are published under the **SIL Open Font License 1.1**, which
permits redistribution — including bundling copies like these — provided the
licence travels with the fonts. It does: [`OFL.txt`](OFL.txt).

The OFL also forbids selling the font files on their own, which we are not
doing, and requires that any *modified* version be renamed. These files are
unmodified copies as served by Google Fonts.

Worth a lawyer's glance before the product ships to a paying customer, on the
principle that a contract-governance company should be able to account for its
own licences.

## Regenerating

`fetch-fonts.py` takes a Google Fonts CSS file, downloads each distinct `woff2`
once, and writes `../fonts.css` with every `src` pointed at a local path.

```bash
curl -s -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&family=Instrument+Serif:ital@0;1&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&family=Courier+Prime:ital,wght@0,400;0,700;1,400&display=swap" -o gf.css
python prototype/v4/app/fonts/fetch-fonts.py gf.css prototype/v4/app/fonts prototype/v4/app/fonts.css
```

The browser user-agent matters: without it Google serves an older format and the
files come back several times larger.

## Still outstanding

The application also loads **React, ReactDOM and Babel from `unpkg.com`**
(`index.html`). Those have integrity hashes, so they cannot be tampered with
undetected — but they are still an outbound call to a third party on every page
load, and unlike the fonts, the application does **not** work at all if the call
fails. Fixing that is the same job as this one and has not been done.
