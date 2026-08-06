"""Turn the Google Fonts CSS into a self-hosted font folder + stylesheet.

Keeps the latin and latin-ext subsets, downloads each distinct woff2 exactly
once (Google serves one variable file per family, repeated across weights), and
rewrites every @font-face src to a local relative path.
"""
import re, sys, urllib.request
from pathlib import Path

SRC = Path(sys.argv[1])
OUT_DIR = Path(sys.argv[2])
OUT_CSS = Path(sys.argv[3])
KEEP = {"latin", "latin-ext"}

OUT_DIR.mkdir(parents=True, exist_ok=True)
css = SRC.read_text(encoding="utf-8")
blocks = re.findall(r"/\*\s*([a-z-]+)\s*\*/\s*(@font-face\s*\{.*?\})", css, re.S)

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

def field(rule, name):
    m = re.search(rf"{name}:\s*([^;]+);", rule)
    return m.group(1).strip() if m else ""

# Pass 1 — group the kept rules by the file they point at.
rules, by_url = [], {}
for subset, rule in blocks:
    if subset not in KEEP:
        continue
    info = {
        "subset": subset,
        "rule": rule,
        "family": re.search(r"font-family:\s*'([^']+)'", rule).group(1),
        "style": field(rule, "font-style"),
        "weight": field(rule, "font-weight"),
        "url": re.search(r"url\((https://[^)]+)\)", rule).group(1),
    }
    rules.append(info)
    by_url.setdefault(info["url"], []).append(info)

# Pass 2 — name each distinct file, download it once.
names = {}
for url, group in by_url.items():
    g = group[0]
    weights = {i["weight"] for i in group}
    # One URL covering several weights is a variable font.
    tag = "var" if len(weights) > 1 else slug(g["weight"])
    name = f'{slug(g["family"])}-{g["subset"]}-{g["style"]}-{tag}.woff2'
    if name in names.values():
        raise SystemExit(f"name collision: {name}")
    names[url] = name

    dest = OUT_DIR / name
    if not dest.exists():
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            dest.write_bytes(r.read())

header = """/* Self-hosted typefaces — no third-party request at page load.
 *
 * WHY THESE ARE HERE AND NOT ON A CDN. Clausewerk is a contract system. Fetching
 * type from a third party told that third party, on every page view, that
 * somebody at the customer's firm was using it — an outbound call that shows up
 * in a buyer's security review, and that fails closed behind a strict firewall,
 * silently dropping the typeset look the product's credibility rests on.
 *
 * SUBSETS. latin and latin-ext only: English plus Western and Central European
 * accented characters. Cyrillic, Greek and Vietnamese are NOT bundled; those
 * characters fall back to a system face. Adding them is a re-run of the
 * generator, not a redesign.
 *
 * A "-var" file is one variable font serving every weight of that family, which
 * is why six Inter weights cost one file rather than six.
 *
 * GENERATED — regenerate with prototype/v4/app/fonts/fetch-fonts.py.
 * Do not hand-edit.
 */

"""

out = [header]
for info in rules:
    local = f'./fonts/{names[info["url"]]}'
    out.append(f'/* {info["subset"]} */\n{info["rule"].replace(info["url"], local)}\n\n')
OUT_CSS.write_text("".join(out), encoding="utf-8")

total = sum((OUT_DIR / n).stat().st_size for n in set(names.values()))
print(f"rules={len(rules)} distinct_files={len(set(names.values()))} "
      f"total={total/1024:.0f} KB")
for n in sorted(set(names.values())):
    print(f"  {n:52s} {(OUT_DIR / n).stat().st_size/1024:7.1f} KB")
