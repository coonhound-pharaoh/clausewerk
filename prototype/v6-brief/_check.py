"""Coherence check for the V6 screen set.

Looking at eight screens one at a time is how the rail/row contradiction got in.
This checks the things that must agree ACROSS screens, so drift is caught by
running it rather than by happening to notice.

    python prototype/v6-brief/_check.py

Exits non-zero if anything fails.
"""
import io, re, sys, glob, os

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)

# Areas per role, counted from the running app (prototype/v4/app/shell.jsx).
# THE RULE: six or more areas gets a rail; five or fewer keeps a tab row.
ROLE_AREAS = {
    'requester': 6, 'legal reviewer': 6, 'legal admin': 8,
    'auditor': 5, 'administrator': 4, 'viewer': 1,
}
SCREEN_ROLE = {
    '1 — The Front Door.html': None,              # the door belongs to no desk
    '2 — Intake.html': 'requester',
    '3 — My Deals and the Document.html': 'requester',
    '4 — The Review Desk.html': 'legal reviewer',
    '5 — The Library.html': 'legal admin',
    '6 — The Record.html': 'auditor',
    '7 — The Reading Room.html': 'viewer',
    '8 — People and Access.html': 'administrator',
}
INKS = {'s-ok', 's-wait', 's-err', 's-none', 's-gone'}
GLYPHS = {'g-lib', 'g-fall', 'g-model', 'g-mach', 'g-prop'}
# state fills — the same shape language, used where the thing is a state
STATE = {'sg-eff', 'sg-pend', 'sg-gone', 'sg-never'}

fails, notes = [], []
def fail(f, msg): fails.append(f'{f}: {msg}')
def note(f, msg): notes.append(f'{f}: {msg}')

css = io.open('v6.css', encoding='utf-8').read()

for f, role in SCREEN_ROLE.items():
    if not os.path.exists(f):
        fail(f, 'MISSING'); continue
    s = io.open(f, encoding='utf-8').read()

    # 1. no third-party requests, anywhere, ever
    for u in re.findall(r'(?:href|src)="(https?://[^"]+)"', s):
        fail(f, f'external request: {u}')

    # 2. every screen draws from the one stylesheet and the repo's own fonts
    if 'v6.css' not in s: fail(f, 'does not link v6.css')
    if '../v4/app/fonts.css' not in s: fail(f, 'does not link the local fonts')

    # 3. rail or row must follow the area count — no exemptions
    if role:
        n = ROLE_AREAS[role]
        rail, row = 'class="rail"' in s, 'class="tabs"' in s
        want = 'rail' if n >= 6 else 'row'
        got = 'rail' if rail else ('row' if row else 'neither')
        if got != want:
            fail(f, f'{role} has {n} areas -> expected {want}, found {got}')
        if rail and row:
            fail(f, 'has BOTH a rail and a tab row')
        # a rail must show a count beside every area
        if rail:
            areas = len(re.findall(r'class="rl(?: on)?"', s))
            counts = len(re.findall(r'class="n(?: zero)?"', s))
            if areas != n: fail(f, f'rail lists {areas} areas, role has {n}')
            if counts != areas: fail(f, f'{areas} areas but {counts} counts')

    # 4. no ink outside the five, and no raw colour smuggled into markup
    for cls in re.findall(r'class="([^"]*\bs-[\w-]+[^"]*)"', s):
        for c in cls.split():
            if c.startswith('s-') and c not in INKS:
                fail(f, f'ink outside the five: {c}')
    for st in re.findall(r'style="([^"]*)"', s):
        if re.search(r'(?<!border-)color\s*:\s*(#|rgb|oklch)', st):
            fail(f, f'hard-coded colour in markup: {st[:60]}')

    # 5. origin glyphs must be ones the system defines
    for cls in re.findall(r'class="([^"]*\bg-[\w-]+[^"]*)"', s):
        for c in cls.split():
            if c.startswith('g-') and c not in GLYPHS:
                fail(f, f'origin glyph outside the five: {c}')
    for cls in re.findall(r'class="([^"]*\bsg-[\w-]+[^"]*)"', s):
        for c in cls.split():
            if c.startswith('sg-') and c not in STATE:
                fail(f, f'state fill outside the shared set: {c}')

    # 6. the honesty footer — every screen must admit its data is invented
    if 'invented' not in s.lower():
        fail(f, 'no statement that the data is invented')

    # 7. red is for error only. If s-err appears, the screen should say why.
    if 's-err' in s and 'refus' not in s.lower() and 'unusable' not in s.lower():
        note(f, 'uses red without an obvious refusal/unusable context — check by eye')

# 8. every ink and glyph the system defines is actually exercised somewhere
allmarkup = ''.join(io.open(f, encoding='utf-8').read()
                    for f in SCREEN_ROLE if os.path.exists(f))
for c in sorted(INKS | GLYPHS | STATE):
    if not re.search(rf'\b{c}\b', allmarkup):
        note('set', f'{c} is defined but never used on any screen')
for c in sorted(INKS | GLYPHS | STATE):
    if f'.{c}' not in css:
        fail('v6.css', f'{c} used but not defined')

print('— V6 coherence check —')
for n in notes: print('  note   ', n)
for x in fails: print('  FAIL   ', x)
print(f'\n{len(SCREEN_ROLE)} screens · {len(fails)} failures · {len(notes)} notes')
sys.exit(1 if fails else 0)
