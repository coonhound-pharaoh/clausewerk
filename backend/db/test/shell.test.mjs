// The shell — six workspaces, honest and empty (WP-U07).
//
// WHAT THIS SUITE CAN AND CANNOT DO, said plainly, because the difference
// matters and a document claiming more would be the failure this whole effort
// is paying down.
//
// It CANNOT render React. There is no browser and no DOM here, so nothing below
// proves a pixel. The browser walk is a separate act, recorded in the package.
//
// What it CAN do is the half that regresses silently, and it is the more
// valuable half:
//
//   1. THE TAB SETS ARE THE SPECIFICATION. Architecture §3 gives six workspaces
//      and their exact tabs. If the shell's table and that table drift apart,
//      nobody notices — the screen still works, it just stops being what was
//      agreed. So the specification is written out here independently and
//      compared, rather than read from the same file it is meant to check.
//
//   2. EVERY TAB HAS A PANE, AND EVERY PANE HAS A TAB. A tab with no pane is a
//      dead end somebody reaches by clicking; a pane with no tab is code that
//      cannot be reached and therefore cannot be reviewed.
//
//   3. NO CANNED DATA. The critical anti-pattern for this package: carrying the
//      concept mockup's invented rows into the product "so it demos well". The
//      2026-07-25 review was precisely about surfaces claiming what the system
//      does not do.
//
//   4. NO PANE FETCHES BROADLY AND FILTERS ON SCREEN. The named leak from the
//      frontend handoff. Every call goes through API's fixed endpoint list.
//
//   node db/test/shell.test.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const V4 = join(HERE, '..', '..', '..', 'prototype', 'v4');
// Redirectable, so the mutation harness can point this suite at a mutated copy
// of the shell — the same reason service.test.mjs loads through CW_SERVICE.
// Without it, none of the guarantees below has ever been seen to fail.
const APPDIR = process.env.CW_SHELL || join(V4, 'app');

let pass = 0, fail = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; failures.push([name, e.message]); console.log(`  FAIL ${name}\n       ${e.message}`); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function eq(a, b, m) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${m || 'not equal'}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
}

const read = (f) => readFileSync(join(APPDIR, f), 'utf8');
const stripComments = (s) =>
  s.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')
    && !l.trim().startsWith('/*')).join('\n');

// ── The specification, written out independently ────────────────────────
// Transcribed from UI-AND-ADMINISTRATION-ARCHITECTURE.md §3. Deliberately NOT
// imported from shell.jsx: a check that reads its expectation from the thing it
// is checking agrees with itself no matter what either of them says.
const SPEC = {
  requester:      ['my deals', 'intake', 'negotiate', 'my record'],
  legal_reviewer: ['review desk', 'tickets', 'approvals', 'negotiations', 'holds'],
  legal_admin:    ['the library', 'ladders & rules', 'governance',
                   'holds & retention', 'review desk'],
  auditor:        ['the record', 'quality', 'origin mix', 'access history'],
  viewer:         ['reading room'],
  administrator:  ['people & access', 'settings', 'system health', 'watchers & notices'],
};

// Pull the WORKSPACES table out of shell.jsx by evaluating just that literal.
// Parsing rather than importing, because these files are JSX served to a
// browser and Node cannot import them.
function workspacesFromShell() {
  const src = read('shell.jsx');
  const start = src.indexOf('const WORKSPACES = {');
  assert(start >= 0, 'shell.jsx no longer defines WORKSPACES');
  // Walk braces to find the end of the literal.
  let i = src.indexOf('{', start), depth = 0, end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  assert(end > 0, 'could not find the end of the WORKSPACES literal');
  // eslint-disable-next-line no-new-func
  return new Function(`return ${src.slice(src.indexOf('{', start), end)}`)();
}

const WORKSPACES = workspacesFromShell();

console.log('\nthe tab sets are the specification');

await test('there are exactly six workspaces, one per role', async () => {
  eq(Object.keys(WORKSPACES).sort(), Object.keys(SPEC).sort());
});

for (const role of Object.keys(SPEC)) {
  await test(`${role}'s tabs match the architecture exactly`, async () => {
    const labels = WORKSPACES[role].tabs.map((t) => t.label);
    eq(labels, SPEC[role],
      `the shell and architecture §3 disagree about ${role}'s workspace`);
  });
}

await test('every workspace says what it opens on', async () => {
  for (const [role, ws] of Object.entries(WORKSPACES)) {
    assert(ws.workspace && ws.workspace.trim(), `${role} has no workspace name`);
    assert(ws.opensOn && ws.opensOn.trim(), `${role} does not say what it opens on`);
  }
});

await test('no role can reach another role\'s tab', async () => {
  // Every tab key belongs to a known set, and the shell renders a pane only
  // when the key is in the acting role's own set. The check here is that no two
  // roles share a key by ACCIDENT — the two that are shared are shared on
  // purpose, and naming them makes an accidental third visible.
  const deliberatelyShared = new Set(['review-desk']);
  const seen = new Map();
  for (const [role, ws] of Object.entries(WORKSPACES)) {
    for (const t of ws.tabs) {
      if (seen.has(t.key) && !deliberatelyShared.has(t.key))
        throw new Error(
          `${t.key} appears in both ${seen.get(t.key)} and ${role}; if that is `
          + 'intended, add it to deliberatelyShared with a reason');
      seen.set(t.key, role);
    }
  }
  // And the deliberate one is deliberate: a legal admin sees everything a
  // reviewer sees (architecture §3).
  assert(WORKSPACES.legal_admin.tabs.some((t) => t.key === 'review-desk')
      && WORKSPACES.legal_reviewer.tabs.some((t) => t.key === 'review-desk'),
    'the review desk is no longer shared between the two Legal roles');
});

console.log('\nevery tab has a pane, and every pane has a tab');

const panesSrc = read('workspaces.jsx');
// Panes take an optional identity argument — the people console shows a
// countersign button only to a Legal admin — so the pattern allows a parameter
// list. It did not at first, and two real panes were reported as missing.
const paneKeys = [...panesSrc.matchAll(/^\s*'([a-z-]+)':\s*\(\w*\)\s*=>/gm)].map((m) => m[1]);

await test('the pane table was actually found (guards a vacuous pass)', async () => {
  assert(paneKeys.length >= 20,
    `only ${paneKeys.length} panes found; the parser has drifted from the file`);
});

await test('every tab in every workspace has a pane behind it', async () => {
  const missing = [];
  for (const ws of Object.values(WORKSPACES))
    for (const t of ws.tabs) if (!paneKeys.includes(t.key)) missing.push(t.key);
  eq([...new Set(missing)], [], 'tabs a person can click that render nothing');
});

await test('every pane is reachable from some role\'s tab set', async () => {
  const allTabs = new Set(
    Object.values(WORKSPACES).flatMap((ws) => ws.tabs.map((t) => t.key)));
  const orphans = paneKeys.filter((k) => !allTabs.has(k));
  eq(orphans, [], 'panes nobody can reach, which means panes nobody reviews');
});

console.log('\nno canned data, anywhere');

await test('the concept mockup is not imported by the shell', async () => {
  const html = readFileSync(join(V4, 'index.html'), 'utf8');
  assert(!/v4-concept/i.test(html), 'index.html reaches into the concept mockup');
  assert(!/v3\/app/i.test(html), 'index.html loads the v3 prototype\'s modules');
  for (const f of readdirSync(APPDIR).filter((f) => f.endsWith('.jsx'))) {
    const src = read(f);
    assert(!/v4-concept|v3\/app|data\.jsx|baseline\.jsx/i.test(src),
      `${f} reaches into the mockup or the v3 seed data`);
  }
});

await test('no pane holds an array of example rows', async () => {
  // The shape canned data takes: a literal array of objects sitting in the
  // module, ready to render. Real rows arrive from usePane and are never
  // written down here.
  for (const f of readdirSync(APPDIR).filter((f) => f.endsWith('.jsx'))) {
    const src = stripComments(read(f));
    // An array literal containing an object with a quoted key that looks like a
    // record — agreement_id, person, clause_id and friends.
    const canned = src.match(
      /\[\s*\{[^}]*(agreement_id|clause_id|ticket_id|counterparty|display_name)\s*:/);
    assert(!canned,
      `${f} contains what looks like example data: ${canned && canned[0].slice(0, 60)}`);
  }
});

await test('the empty states are honest about which kind of empty they are', async () => {
  // Two different facts, and conflating them is the trap: "nothing is here yet"
  // is about the data; "this is not built" is about the system. A pane that
  // shows the first when the second is true is a surface claiming a capability.
  const src = read('common.jsx');
  assert(/function Empty\b/.test(src) && /function NotBuiltYet\b/.test(src),
    'the two kinds of empty state have been collapsed into one');
  assert(/no endpoint behind this pane/.test(src),
    'NotBuiltYet no longer says why it is empty');
});

await test('a pane that cannot load says so instead of rendering as empty', async () => {
  const src = read('common.jsx');
  assert(/function LoadFailed\b/.test(src), 'there is no failed-to-load state');
  assert(/could not ask/.test(src),
    'the failed state no longer distinguishes itself from an empty one');
  // And every pane uses it. A pane that treats a failure as an empty list is
  // how somebody misses a queue.
  const panes = stripComments(read('workspaces.jsx'));
  const usesPane = (panes.match(/usePane\(/g) ?? []).length;
  const handlesFailure = (panes.match(/status === 'failed'/g) ?? []).length;
  assert(handlesFailure >= usesPane - 2,
    `${usesPane} panes fetch but only ${handlesFailure} handle a failure`);
});

console.log('\nnothing fetches broadly and filters on screen');

await test('every call goes through the API module\'s fixed endpoint list', async () => {
  // The named leak. A pane doing its own fetch could ask for anything and hide
  // what it should not have; the whole point of routing through API is that the
  // list of what this page can ask for is short and in one place.
  for (const f of readdirSync(APPDIR).filter((f) => f.endsWith('.jsx') && f !== 'api.jsx')) {
    const src = stripComments(read(f));
    assert(!/\bfetch\s*\(/.test(src),
      `${f} calls fetch directly instead of going through API`);
    assert(!/XMLHttpRequest|axios/.test(src), `${f} opens its own transport`);
  }
});

await test('the API module exposes no general-purpose query', async () => {
  const src = stripComments(read('api.jsx'));
  // `call` is the internal worker; what must not exist is an exported escape
  // hatch a pane can point anywhere.
  assert(!/\bget:\s*\(path\)/.test(src) && !/\brequest:\s*\(/.test(src),
    'api.jsx exports a generic request function, which makes the endpoint list '
    + 'advisory rather than a list');
});

await test('the browser never sends a role or an actor', async () => {
  // The distinction this test has to get right, because the first version did
  // not: READING a role out of the sign-in response is correct and necessary —
  // the masthead renders it. SENDING one is the forgery the service already
  // ignores. So the assertion is about the request, not about the word.
  const src = stripComments(read('api.jsx'));

  // No header that asserts who the caller is. `authorization` names a SESSION,
  // which the service resolves to a person — that is the only identity signal
  // this page is allowed to send, and it is one the browser cannot forge into
  // somebody else without holding their token.
  const forbidden = ['x-role', 'x-cw-role', 'x-actor', 'x-user', 'x-person',
                     'x-on-behalf-of'];
  const found = forbidden.filter((h) => new RegExp(h, 'i').test(src));
  eq(found, [], 'api.jsx sends a header asserting who the caller is');
  assert(/authorization/.test(src),
    'api.jsx sends no authorization header, so no request is attributable at all');

  // And nothing puts a role or an actor into a body. Every write takes its body
  // straight from the caller, so the check is that api.jsx never composes one.
  assert(!/body:\s*JSON\.stringify\(\{[^}]*\b(role|actor)\b/.test(src),
    'api.jsx composes a request body containing a role or an actor');

  // The one place `role` appears must be reading the response.
  const sends = src.match(/\brole\b/g) ?? [];
  const reads = src.match(/payload\.role|identity\.role|\.role\b/g) ?? [];
  assert(reads.length >= sends.length - 1,
    'a mention of role in api.jsx is not a read of the response');
});

console.log('\nthe visual language is v3\'s, unchanged');

await test('base.css is v3\'s stylesheet, byte for byte', async () => {
  // Decision U8 keeps the visual language wholesale: this is a reorganisation,
  // not a restyling. Extracted rather than retyped so the claim is a fact about
  // the bytes, and checked here so it stays one.
  const v3 = readFileSync(
    join(HERE, '..', '..', '..', 'prototype', 'v3', 'Clausewerk V3.html'), 'utf8');
  const style = /<style>([\s\S]*?)<\/style>/.exec(v3)[1].trim();
  const base = read('base.css');
  assert(base.includes(style),
    'prototype/v4/app/base.css has diverged from v3\'s stylesheet — WP-U07 '
    + 'spends nothing on style, so a change here is out of scope by definition');
});

await test('v4.css adds no new colour and no new typeface', async () => {
  const v4 = read('v4.css');
  // Every colour must come from a token base.css already defines.
  const literals = v4.match(/#[0-9a-fA-F]{3,8}\b|\brgb\(|\boklch\(/g) ?? [];
  eq(literals.filter((l) => !/^rgba?\(/.test(l)), [],
    'v4.css introduces a literal colour instead of composing the tokens');
  const fonts = [...v4.matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1]);
  const allowed = new Set(['JetBrains Mono', 'Instrument Serif', 'Inter']);
  eq(fonts.filter((f) => !allowed.has(f)), [],
    'v4.css introduces a fourth typeface');
});

console.log('\nthe pipeline rail belongs to one deal');

await test('the rail takes its stage from the deal it is drawn for', async () => {
  // v3 rendered this as one global state, so two deals at two stages shared a
  // rail and the screen could only be telling the truth about one of them.
  const src = read('workspaces.jsx');
  const rail = /function PipelineRail[\s\S]*?\n\}/.exec(src)[0];
  assert(/\bdeal\b/.test(rail), 'the rail no longer takes a deal');
  assert(/stageOf\(deal\)/.test(rail),
    'the rail derives its stage from something other than the deal it is drawn for');
  assert(/data-deal=\{deal\.agreement_id\}/.test(rail),
    'the rail does not say which deal it belongs to, so a test cannot tell '
    + 'two rails apart');
});

await test('the stage is derived, never stored', async () => {
  const src = read('workspaces.jsx');
  assert(/function stageOf/.test(src), 'stageOf is gone');
  assert(!/deal\.stage\b/.test(src),
    'a pane reads a stored stage; a stored stage starts drifting the moment '
    + 'anything else changes');
});

// ── The people console (WP-U08) ─────────────────────────────────────────
console.log('\nthe people console keeps its three rules');

const consoleSrc = () => read('console-people.jsx');

await test('pending is decided by the queue, never inferred from the role', async () => {
  // The bug this test exists for, found by revoking a reviewer and looking at
  // the screen: reasoning "a Legal role with no effective grant must be
  // awaiting a countersign" renders a REVOKED person as awaiting a second name.
  // That reads as "almost there, somebody just needs to approve it" when the
  // truth is the exact opposite.
  const fn = /function accessChip[\s\S]*?\n\}/.exec(consoleSrc())[0];
  assert(/pendingPeople/.test(fn),
    'accessChip no longer consults the countersign queue, so it is inferring '
    + 'pending-ness from the role again');
  assert(!/LEGAL_ROLES\.has\(p\.declared_role\)/.test(fn),
    'accessChip infers pending-ness from whether the role is a Legal one');
  assert(/no access/.test(fn),
    'there is no state for "revoked or never granted", so those collapse into '
    + 'one of the others');
});

await test('a pending grant is amber and never green', async () => {
  const fn = /function accessChip[\s\S]*?\n\}/.exec(consoleSrc())[0];
  const pendingBranch = /awaiting countersign/.exec(fn);
  assert(pendingBranch, 'the pending state is gone');
  const around = fn.slice(Math.max(0, pendingBranch.index - 120), pendingBranch.index + 40);
  assert(/chip-pending/.test(around),
    'the awaiting-countersign chip is not chip-pending — a grant that looks '
    + 'effective before its countersign is the countersign rule undone in pixels');
  assert(!/chip-ok[^\n]*awaiting countersign/.test(fn));
});

await test('revoke says next request, and does not promise instant lockout', async () => {
  // WP-U05 delivers revocation at the next request; a request already in flight
  // completes. The screen must say exactly that and no more.
  const src = consoleSrc();
  assert(/at their next request/i.test(src),
    'the revoke dialog no longer says when the revocation bites');
  assert(!/immediately|at once|instantly/i.test(
    /function RevokeDialog[\s\S]*?\n\}/.exec(src)[0]),
    'the revoke dialog promises an immediate lockout the service does not deliver');
});

await test('the revoke reason is required by the screen, not just by the database', async () => {
  const dialog = /function RevokeDialog[\s\S]*?\n\}/.exec(consoleSrc())[0];
  assert(/disabled=\{busy \|\| !reason\.trim\(\)\}/.test(dialog),
    'revoke can be pressed with no reason — the reason is the whole value of '
    + 'the record');
});

await test('dormancy is never re-described as a sign-in', async () => {
  // Comments stripped first. The file's own header explains why "last seen" is
  // the wrong phrase, and the first version of this test failed on that
  // explanation — a check that cannot tell a warning from the thing it warns
  // about is a check that punishes writing the warning down.
  const src = stripComments(consoleSrc());
  assert(!/last seen|last sign-?in|last login/i.test(src),
    'the console describes dormancy as a sign-in, which is the measure the read '
    + 'model deliberately does not use');
  assert(/recorded act/i.test(src),
    'the console does not say what dormancy is actually measured from');
});

await test('the countersign queue is one component, used in both places', async () => {
  // A queue that lives only in the admin console — a screen Legal has no reason
  // to open — is a queue that does not get cleared, and the countersign rule's
  // whole cost is the wait it adds. Two copies would drift.
  assert(/function CountersignQueue/.test(consoleSrc()),
    'the countersign queue is not a shared component');
  // Looked for across the workspace files rather than in one: the review desk
  // moved from workspaces.jsx to reviewer.jsx in WP-U11, and a check naming one
  // file would have reported the queue as gone when it had only moved.
  const uses = readdirSync(APPDIR)
    .filter((f) => f.endsWith('.jsx') && f !== 'console-people.jsx')
    .flatMap((f) => read(f).match(/<CountersignQueue/g) ?? []);
  assert(uses.length >= 1,
    'no workspace outside the admin console shows the countersign queue, so '
    + 'Legal only sees it in a console they have no reason to open');
  const consoleUses = consoleSrc().match(/<CountersignQueue/g) ?? [];
  assert(consoleUses.length >= 1, 'the admin console no longer shows the queue');
});

await test('only a Legal admin is offered the countersign button', async () => {
  const fn = /function CountersignQueue[\s\S]*?\n\}/.exec(consoleSrc())[0];
  assert(/me\.role === 'legal_admin'/.test(fn),
    'the countersign button is offered to whoever is looking');
  // And the row shows BOTH names — a countersign is a second person's judgement
  // about a first person's proposal and cannot be given without seeing both.
  assert(/proposed by/.test(fn), 'the queue does not say who proposed the grant');
});

await test('creating an account and granting a role stay two acts', async () => {
  // Each recorded act is one act. Bundling blurs what was approved, and if the
  // grant is refused the account still exists — the screen has to be able to
  // say so rather than reporting one outcome for two things.
  const form = /function GrantForm[\s\S]*?\n\}/.exec(consoleSrc())[0];
  assert(/API\.createAccount/.test(form) && /API\.grant/.test(form),
    'the grant form no longer performs both acts');
  // Not merely that the refusal is NOTICED — that it STOPS. The first version
  // of this check looked for `if (!made.ok)` and passed happily against a body
  // that noticed the refusal and carried on to grant a role against an account
  // that was never created.
  assert(/if \(!made\.ok\)\s*\{[^}]*\breturn\b[^}]*\}/.test(form),
    'the grant form notices a refused account creation but does not stop, so it '
    + 'goes on to grant a role against an account that does not exist');
  assert(/onError\(made\.reason\)/.test(form),
    'a refused account creation is swallowed rather than shown');
});

await test('a Legal grant warns before the button, not after the fact', async () => {
  const form = /function GrantForm[\s\S]*?\n\}/.exec(consoleSrc())[0];
  assert(/LEGAL_ROLES\.has\(role\)/.test(form) && /confer/.test(form),
    'nothing warns that a Legal grant will confer nothing until countersigned — '
    + 'so the administrator tells the joiner they are set up, and they cannot '
    + 'sign in');
});

// ── Settings, health and watchers (WP-U09) ──────────────────────────────
console.log('\nthe boundary is taught by the screen, not only enforced behind it');

const restSrc = () => read('console-rest.jsx');

await test('an owner decision has NO edit affordance at all', async () => {
  // The critical rule for this package, and the distinction is the point: a
  // DISABLED input says "you could, but not now"; read-only text says "this was
  // never yours". The administrator is not being temporarily prevented from
  // changing an owner decision — it belongs to somebody else, and the screen
  // has to say which.
  //
  // So the check is not "no enabled input" but "no input element of any kind"
  // inside the owner-decision row.
  const row = /function OwnerDecisionRow[\s\S]*?\n\}/.exec(restSrc())[0];
  for (const tag of ['<input', '<select', '<textarea', '<button']) {
    assert(!row.includes(tag),
      `an owner decision row renders ${tag} — even a disabled one teaches the `
      + 'wrong boundary, and a failing save teaches it later and worse');
  }
  assert(/disabled/.test(row) === false,
    'the owner-decision row has a disabled control, which is the greyed-out '
    + 'editor this rule exists to forbid');
});

await test('an owner decision shows its reasoning, not just its value', async () => {
  const row = /function OwnerDecisionRow[\s\S]*?\n\}/.exec(restSrc())[0];
  assert(/rationale/.test(row),
    'the decision is shown without its why — and a value with no reasoning is '
    + 'a value somebody will "correct" later');
  assert(/decided_by/.test(row), 'the decision does not name who made it');
});

await test('undecided owner decisions are flagged, not hidden', async () => {
  const row = /function OwnerDecisionRow[\s\S]*?\n\}/.exec(restSrc())[0];
  assert(/undecided/.test(row) && /chip-pending/.test(row),
    'an undecided owner decision is not flagged amber — a question the system '
    + 'has answered provisionally must not look settled');
});

await test('operational settings are editable, and only those', async () => {
  const op = /function OperationalRow[\s\S]*?\n\}/.exec(restSrc())[0];
  assert(/<input/.test(op) && /API\.setSetting/.test(op),
    'operational settings are not editable, so the administrator has nothing to '
    + 'administer');
});

await test('never-ran renders as its own thing, not as pass or fail', async () => {
  const fn = /const chip = \(state\)[\s\S]*?\n  \};/.exec(restSrc())[0];
  assert(/chip-unknown/.test(fn) && /never run/.test(fn),
    'the never-ran state has no distinct rendering — absence of evidence shown '
    + 'as evidence is how a system reassures its operator into an incident');
  // And it must not fall through to the passing chip.
  assert(!/return <span className="chip chip-ok">.*<\/span>;\s*\}\s*$/.test(fn),
    'the default branch is the passing chip');
});

await test('the nudge notifies and cannot destroy', async () => {
  const src = restSrc();
  assert(/nudge Legal/.test(src), 'the nudge action is gone');
  assert(/API\.nudgeRetention/.test(src), 'the nudge calls something else');
  // What the pane CALLS, not what it says. Matching on the words "destroy" or
  // "delete" fails on the pane's own copy explaining that it destroys nothing —
  // a check that cannot tell a warning from the thing it warns about punishes
  // writing the warning down. So the assertion enumerates the calls instead.
  const pane = /function HealthPane[\s\S]*?\n\}/.exec(src)[0];
  const calls = [...pane.matchAll(/API\.(\w+)/g)].map((m) => m[1]).sort();
  const allowed = ['health', 'nudgeRetention', 'retentionDue', 'runCheck', 'takeCheckpoint'];
  eq([...new Set(calls)], allowed.filter((a) => calls.includes(a)),
    'the health pane calls something outside its list — the administrator holds '
    + 'no privilege to destroy anything, and this screen must not attempt it');
  const api = read('api.jsx');
  assert(!/retentionDestroy|destroyRetention/.test(api),
    'the API module offers a retention destroy, which the administrator holds '
    + 'no privilege for and must not be able to attempt');
});

await test('a held record renders as blocked BECAUSE held, naming the matter', async () => {
  // The matter has to be on the CHIP, not merely somewhere in the file. The
  // first version of this check looked for the word "matters" anywhere in the
  // source and passed against a chip that just said "blocked" — because the
  // matter was still mentioned in the row's subtitle. "Cannot be destroyed" and
  // "cannot be destroyed while this litigation is open" are different
  // sentences, and only the second tells anybody what to do about it.
  const src = restSrc();
  assert(/under_hold/.test(src), 'nothing distinguishes a held record');
  assert(/title=\{r\.matters\}/.test(src),
    'the held chip does not name the matter holding the record');
  assert(/>held</.test(src),
    'the chip does not say the record is HELD, only that something is wrong');
});

await test('an uncovered category is surfaced as a gap', async () => {
  const src = restSrc();
  assert(/watcher_count === 0/.test(src),
    'nothing computes which categories nobody is watching');
  assert(/socialised to nobody/.test(src),
    'the gap is not spelled out — an uncovered category is a hole in the '
    + 'socialisation, not "nobody to tell"');
});

await test('the watcher pane says what adding somebody does and does not give them', async () => {
  const src = restSrc();
  assert(/no vote/.test(src),
    'the watchers pane does not say that a watcher sees but does not decide');
});

await test('access history filters what the policy already returned', async () => {
  // The distinction between a filter and a leak: this narrows rows the database
  // chose to return, and never a fetch that was broader than the reader is
  // entitled to. There is one endpoint and it is scoped by the policy.
  const src = restSrc();
  assert(/pane\.rows\.filter/.test(src), 'the access history no longer filters');
  assert(!/fetch\(/.test(stripComments(src)),
    'the access history pane opens its own connection');
});

await test('the auditor can export, and the export is of what is on screen', async () => {
  const fn = /const csv = \(\)[\s\S]*?\n  \};/.exec(restSrc())[0];
  assert(/rows\.map/.test(fn),
    'the export writes something other than the filtered rows the auditor is '
    + 'looking at');
  assert(/replace\(\/"\/g/.test(fn),
    'the export does not escape quotes, so a reason containing one corrupts '
    + 'every column after it');
});

// ── The reviewer's desk (WP-U11) ────────────────────────────────────────
console.log('\nthe review desk is a review, not a rubber stamp');

const revSrc = () => read('reviewer.jsx');

await test('the AI candidate is NEVER pre-filled into the approval box', async () => {
  // The critical rule for this package. A box arriving with the proposal in it
  // turns "approve" into "confirm", and the measured unedited-approval rate
  // would then be measuring the form's design rather than Legal's judgement —
  // the screen would be creating the defect its own metric exists to watch.
  // Comments stripped, because the file's own header explains the mistake by
  // writing it out — and a check that cannot tell a warning from the thing it
  // warns about punishes writing the warning down. Third time this has caught
  // me; it is worth remembering as a rule about these checks generally.
  const fn = stripComments(/function TicketDesk[\s\S]*?\n\}/.exec(revSrc())[0]);
  const init = /const \[approved, setApproved\] = useState\(([^)]*)\)/.exec(fn);
  assert(init, 'the approval box no longer exists');
  eq(init[1].trim(), "''",
    'the approval box is pre-filled — it must start EMPTY, whatever it is '
    + 'pre-filled with');
  assert(!/useState\(ticket\.proposed_text/.test(fn),
    'the approval box is seeded from the proposal');
});

await test('the screen says why the box is empty', async () => {
  // An empty box looks like an oversight until somebody explains that it is the
  // point, and a reviewer who thinks it is a bug will paste the proposal in
  // every time — which is the pre-filled default arriving by another route.
  const fn = /function TicketDesk[\s\S]*?\n\}/.exec(revSrc())[0];
  assert(/Deliberately empty/.test(fn),
    'nothing explains the empty approval box');
});

await test('verify goes through a confirmation showing what will be minted', async () => {
  const fn = /function TicketDesk[\s\S]*?\n\}/.exec(revSrc())[0];
  assert(/confirming/.test(fn), 'there is no confirmation step before minting');
  assert(/This is what will be minted/.test(fn),
    'the confirmation does not show the wording that will exist forever');
  assert(/cannot be edited once it exists/.test(fn),
    'the confirmation does not say the minting is irreversible');
  // The confirmation renders the actual text, on the paper surface, so what is
  // agreed to is what will exist.
  assert(/paper/.test(fn) && /\{approved\.trim\(\)\}/.test(fn),
    'the confirmation does not render the approved wording itself');
});

await test('rejection needs a note and minting does not — friction where the irreversibility is', async () => {
  const fn = /function TicketDesk[\s\S]*?\n\}/.exec(revSrc())[0];
  assert(/disabled=\{busy \|\| !note\.trim\(\)\}/.test(fn),
    'a rejection can be recorded with no note');
});

await test('edited-before-approval is shown as the derived fact it is', async () => {
  const fn = /function TicketsPane[\s\S]*?\n\}/.exec(revSrc())[0];
  assert(/edited_before_approval === true/.test(fn)
      && /edited_before_approval === false/.test(fn),
    'the screen does not distinguish edited from unedited approvals');
  // Three states, not two: null means "not decided yet", and rendering that as
  // "unedited" would inflate the figure Legal watches.
  assert(!/edited_before_approval \?/.test(fn),
    'the screen treats the flag as a boolean, so an undecided ticket reads as '
    + 'unedited — which is the figure Legal watches, inflated');
});

await test('there is no approve-all on the override surface', async () => {
  // Per finding means the deciding person saw each finding. A single button
  // would be the blanket acknowledge button with a loop behind it.
  const fn = /function OverrideDecisions[\s\S]*?\n\}\n/.exec(revSrc())[0];
  assert(!/approve all|approveAll|decideAll|for \(const f of/i.test(fn),
    'the override surface offers a way to decide more than one finding at once');
  assert(/There is no approve-all/.test(fn),
    'the absence of an approve-all is not explained, so it reads as an omission');
});

await test('the override window state is visible before anybody tries', async () => {
  const fn = /function OverrideDecisions[\s\S]*?\n\}\n/.exec(revSrc())[0];
  assert(/window_closed/.test(fn), 'the window state is not shown');
  assert(/disabled=\{!r\.window_closed\}/.test(fn),
    'a reviewer can press approve inside the window and learn the rule from an '
    + 'error instead of from the screen');
});

await test('the justification is rendered in the established idiom', async () => {
  const fn = /function OverrideDecisions[\s\S]*?\n\}\n/.exec(revSrc())[0];
  assert(/“/.test(fn) && /var\(--accent\)/.test(fn),
    'the human justification is not wrapped in the oversized teal quotation '
    + 'marks the visual language uses for exactly this');
});

await test('the reviewer is not offered acts that are not theirs', async () => {
  // The reviewer/admin boundary, rendered. A greyed-out release button would be
  // the disabled-editor pattern the settings pane already refuses: a reviewer
  // does not merely lack permission today, releasing a hold is somebody else's
  // decision.
  const holds = /function HoldsPane[\s\S]*?\n\}/.exec(revSrc())[0];
  assert(!/releaseHold|API\.release/.test(holds),
    'the holds pane offers a release, which is legal admin\'s act');
  assert(/no release button here rather than a greyed-out one/.test(holds),
    'the pane does not say why release is absent');
  // And nothing in the reviewer's file reaches for library writes, rule edits,
  // or retention.
  const all = stripComments(revSrc());
  for (const forbidden of ['API.setSetting', 'API.decideSetting', 'API.nudgeRetention',
                           'API.createAccount', 'API.grant(', 'API.addCategory']) {
    assert(!all.includes(forbidden),
      `the reviewer's workspace calls ${forbidden}, which is not a reviewer's act`);
  }
});

// ── The requester's workspace (WP-U12) ──────────────────────────────────
console.log('\nasking is the only path past a blocking finding');

const reqSrc = () => read('requester.jsx');

await test('no acknowledge, override, or proceed-anyway affordance survives', async () => {
  // The critical anti-pattern for this package. The v3 button opened the gate
  // on one click with no record of who else should have known, and this is the
  // screen where undoing its retirement is most tempting — "just for the demo
  // flow" is exactly how it would come back.
  // Checked against what is CLICKABLE, not against the prose. The screen
  // explains what was retired by naming it, and the first version of this test
  // failed on that explanation — the fourth time a check has punished writing
  // the warning down. What matters is that no button, and no test hook, offers
  // the act.
  const src = stripComments(reqSrc());
  const clickable = [
    ...[...src.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1]),
    ...[...src.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1]),
  ].join(' | ').toLowerCase();

  for (const gone of ['acknowledge', 'proceed anyway', 'override anyway',
                      'skip validation', 'force']) {
    assert(!clickable.includes(gone),
      `the requester's workspace offers a control labelled "${gone}" — the `
      + 'blanket override button is retired by ADR-0008 and this screen is '
      + 'where it would return');
  }
  // And the only override-shaped button asks; it does not decide.
  assert(/request an override/.test(clickable),
    'there is no way to ask for an override at all');
  // And the only override call it makes is the REQUEST, never a gate opening.
  const calls = [...src.matchAll(/API\.(\w+)/g)].map((m) => m[1]);
  assert(!calls.includes('openOverrideGate'),
    'the requester opens the gate themselves, which is the whole thing this '
    + 'workflow exists to prevent');
  assert(calls.includes('requestOverride'), 'the request path is gone');
});

await test('the screen says asking is not being allowed', async () => {
  const src = reqSrc();
  assert(/opens no gate/i.test(src),
    'nothing tells the requester that asking does not open the gate');
  assert(/Until a finding is approved, it still blocks/i.test(src),
    'the screen does not say that an undecided finding still blocks');
});

await test('a rejected finding is shown as still blocking', async () => {
  // "Decided" is not "allowed". A rejected finding rendered as merely decided
  // would let somebody believe the deal can proceed.
  // The REJECTED branch specifically. A window of characters after the test
  // swept up the undecided branch too, which also says "still blocks" — so the
  // check passed against a rejected chip reading merely "decided".
  const src = reqSrc();
  const branch = /f\.decision === 'rejected'\s*\?\s*(<span[\s\S]*?<\/span>)/.exec(src);
  assert(branch, 'the rejected branch has changed shape; re-check this test');
  assert(/still blocks/.test(branch[1]),
    'a rejected finding does not say it still blocks — "decided" is not '
    + '"allowed", and somebody will read it as one');
});

await test('the request pane is reachable, not dead code', async () => {
  // It was dead on the first attempt: rendered only when `asking` was true, and
  // nothing ever set it. A pane nobody can reach is a pane nobody reviews, and
  // claiming the request path is built while it cannot be opened would be the
  // failure this whole effort is paying down.
  const src = reqSrc();
  assert(/setAsking\(true\)/.test(src),
    'nothing opens the override request pane, so it is unreachable');
  assert(/data-testid="ask-for-override"/.test(src),
    'the button that opens it is not addressable, so no test can press it');
});

await test('the justification floor is shown before the refusal, not after', async () => {
  const src = reqSrc();
  assert(/length >= 20/.test(src),
    'the screen does not know the schema refuses a boilerplate justification');
  assert(/more characters/.test(src),
    'the requester is told nothing until the database refuses them');
});

await test('commercial pressure is recorded separately from the reason', async () => {
  // "They threatened to walk" and "we accept this risk because X" are different
  // claims; one collapsed into the other lets pressure stand in for reasoning.
  const src = reqSrc();
  assert(/commercial_pressure/.test(src), 'commercial pressure is not captured');
  assert(/different things/.test(src),
    'the screen does not say why the two are separate fields');
});

await test('the deal is opened in the session person\'s name, with no field for it', async () => {
  const src = reqSrc();
  const form = /API\.openDeal\(\{[\s\S]{0,200}\}\)/.exec(src)[0];
  assert(!/requester/.test(form),
    'the open-deal form sends a requester, which the service would ignore and '
    + 'which implies somebody can open a deal for somebody else');
});

await test('nothing invents findings or runs to make the form look finished', async () => {
  const src = stripComments(reqSrc());
  assert(!/\[\s*\{[^}]*finding_ref:\s*['"]/.test(src.replace(/finding_ref: ''/g, '')),
    'the request form ships with example findings');
  assert(/not built yet/.test(reqSrc()),
    'the screen does not say which parts do not exist');
});

await test('my record says the scoping happens in the database', async () => {
  const fn = /function MyRecordPane[\s\S]*?\n\}/.exec(reqSrc())[0];
  assert(/never arrives/.test(fn),
    'the record pane does not say that other people\'s acts are not filtered '
    + 'out here — they are never sent');
});

// ── The auditor's workspace (WP-U14) ────────────────────────────────────
console.log('\nthe auditor reads everything and changes nothing');

const audSrc = () => read('auditor.jsx');

await test('the auditor is offered no act at all, not even a disabled one', async () => {
  // WP-U14's common anti-pattern: a disabled button standing in for an absent
  // right. A greyed-out control says "you could, but not now" and sends
  // somebody looking for the conditions that light it up. The truth is "this
  // was never yours", and its honest rendering is nothing at all.
  //
  // Checked by ENUMERATING WHAT EACH onClick DOES rather than searching for a
  // forbidden word — trap 5.3: an assertion that greps for the word trips on
  // the comment explaining why there is none.
  const src = stripComments(audSrc());
  const handlers = [...src.matchAll(/onClick=\{([^}]*)\}/g)].map((m) => m[1].trim());
  assert(handlers.length > 0, 'the auditor pane has no controls at all — did the file move?');
  for (const h of handlers) {
    const isRead = /^csv$/.test(h) || /^\(\) => set[A-Z]/.test(h);
    assert(isRead, `the auditor is offered an act that is not a read: ${h}`);
  }
  assert(!/\bdisabled\b/.test(src),
    'a control in the auditor workspace is rendered inert rather than absent');
});

await test('the auditor pane writes nothing through the API', async () => {
  // The same rule at the call site. A POST helper appearing here would be a
  // write affordance whatever the buttons looked like.
  const src = stripComments(audSrc());
  const calls = [...src.matchAll(/API\.([a-zA-Z]+)\(/g)].map((m) => m[1]);
  const READS = ['record', 'quality', 'originMix', 'health'];
  for (const c of calls) {
    assert(READS.includes(c), `the auditor pane calls API.${c}(), which is not a read`);
  }
  assert(calls.length >= 3, 'the auditor panes stopped fetching anything');
});

await test('the chain tile reports the health record rather than deciding for itself', async () => {
  // A page that marked its own reading as verified would be checking itself.
  const src = stripComments(audSrc());
  assert(/API\.health\(\)/.test(src),
    'the record pane no longer reads the health record');
  // Anchored on THE LOOKUP, not on the words 'audit chain' anywhere in the
  // file. The tile's own label contains that string, so a looser pattern
  // matched the display copy and went on passing while the lookup was broken —
  // trap 5.3 again, wearing UI text instead of a comment. The mutation harness
  // caught it: the check reported MISS on the first run.
  assert(/t\.tile === 'audit chain'/.test(src),
    'the chain tile looks for a tile name cw.health_summary does not publish; '
    + "it publishes 'audit chain', and a lookup that misses renders as a state");
  assert(/never_ran/.test(src),
    'never_ran is no longer its own case — a check nobody ran now reads as one that failed');
});

await test('an unmeasured approval rate is not rendered as zero', async () => {
  // cw.review_quality returns null when nothing has been verified: there is no
  // denominator. Rendering that as 0% reports perfect discipline from an empty
  // queue, which is the most flattering possible lie.
  const src = stripComments(audSrc());
  assert(/rate === null \|\| rate === undefined/.test(src),
    'the quality pane no longer separates "nothing verified yet" from a rate');
  // Whitespace-tolerant: this copy wraps, so a literal-space pattern matches
  // the sentence only until somebody reflows the paragraph.
  assert(/a rate of\s+zero/.test(audSrc()),
    'the screen no longer says out loud that an unmeasured rate is not zero');
});

await test('the auditor export is of the rows on screen, escaped', async () => {
  const fn = /const csv = \(\)[\s\S]*?\n  \};/.exec(audSrc())[0];
  assert(/rows\.map/.test(fn),
    'the export writes something other than the filtered rows on screen');
  assert(/replace\(\/"\/g/.test(fn),
    'the export does not escape quotes, so a payload containing one corrupts '
    + 'every column after it');
});

await test('the auditor panes are wired into the router, not still stubs', async () => {
  const panes = stripComments(read('workspaces.jsx'));
  for (const [tab, comp] of [['the-record', 'TheRecordPane'],
                             ['quality', 'QualityPane'],
                             ['origin-mix', 'OriginMixPane']]) {
    const line = new RegExp(`'${tab}':[^\\n]*`).exec(panes);
    assert(line, `the ${tab} route disappeared from the router`);
    assert(line[0].includes(comp), `${tab} does not render ${comp}`);
  }
});

// ── The viewer's reading room (WP-U14) ──────────────────────────────────
console.log('\nthe viewer sees what was shared and has no way to take it away');

const viewSrc = () => read('viewer.jsx');

await test('the reading room is wired to a real endpoint', async () => {
  const panes = stripComments(read('workspaces.jsx'));
  const line = /'reading-room':[^\n]*/.exec(panes);
  assert(line, 'the reading-room route disappeared');
  assert(line[0].includes('ReadingRoomPane'),
    'the reading room does not render its pane');
});

await test('the viewer fetches nothing broader than this share, this person', async () => {
  // WP-U14's critical anti-pattern. The two endpoints take NO parameters, and
  // that is the control rather than an omission: the moment the browser can
  // name an agreement, the scoping is a careful query instead of a rule.
  const api = stripComments(read('api.jsx'));
  for (const fn of ['readingRoom', 'readingRoomClauses']) {
    const line = new RegExp(`${fn}:[^\\n]*`).exec(api);
    assert(line, `api.jsx no longer exposes ${fn}`);
    assert(/\(\)\s*=>/.test(line[0]),
      `${fn} takes an argument, which is how "this share, this person" becomes `
      + 'a query the caller controls');
    assert(!/\$\{/.test(line[0]),
      `${fn} interpolates into its path, so the browser chooses what it asks for`);
  }
  // And the pane itself passes nothing.
  const src = stripComments(viewSrc());
  assert(!/API\.readingRoom\w*\([^)]+\)/.test(src),
    'the reading room pane passes an argument to its fetch');
});

await test('the viewer has no export path of any kind', async () => {
  // ADR-0008 withheld it deliberately: being shown a contract and taking a copy
  // away are different acts, and only the first was decided. Checked by what
  // the pane DOES rather than by searching for a word — the file explains at
  // length why there is no export, and a word search would trip on the
  // explanation (trap 5.3).
  const src = stripComments(viewSrc());
  assert(!/createElement\('a'\)/.test(src) && !/URL\.createObjectURL/.test(src),
    'the reading room builds a download link');
  assert(!/new Blob\(/.test(src), 'the reading room assembles a file to hand over');
  assert(!/\.download\b/.test(src), 'the reading room sets a download filename');
  assert(!/window\.print/.test(src), 'the reading room offers a print path');
  // No write helper either — a read-only role gets a read-only screen.
  const calls = [...src.matchAll(/API\.([a-zA-Z]+)\(/g)].map((m) => m[1]);
  const READS = ['readingRoom', 'readingRoomClauses'];
  for (const c of calls) {
    assert(READS.includes(c), `the reading room calls API.${c}(), which is not one of its two reads`);
  }
});

await test('an empty reading room reads as an answer, not a failure', async () => {
  // "Nothing has been shared with you" is a true fact about this person, not a
  // fault and not an unbuilt pane. Getting it wrong in the alarming direction
  // sends somebody chasing a problem that is not there.
  const src = viewSrc();
  assert(/shares\.rows\.length === 0/.test(stripComments(src)),
    'the reading room no longer distinguishes an empty room');
  assert(/Nothing has been shared with you/.test(src),
    'the empty reading room no longer says plainly that nothing was shared');
  assert(/<Empty/.test(src) && !/<NotBuiltYet/.test(src),
    'the empty room is rendered as unbuilt rather than as empty');
});

await test('the viewer is shown who approved each clause', async () => {
  // The one place a viewer sees an approval — WP-U14's SOW-departure
  // visibility rule. Being shown a contract is useless if you cannot see whose
  // language it is.
  const src = stripComments(viewSrc());
  assert(/c\.reviewer/.test(src), 'the clause render drops the approver');
  assert(/c\.origin/.test(src), 'the clause render drops where the wording came from');
  assert(/no approver recorded/.test(viewSrc()),
    'a clause with no approver renders blank rather than saying so');
});

await test('the viewer is offered no act, not even a disabled one', async () => {
  const src = stripComments(viewSrc());
  const handlers = [...src.matchAll(/onClick=\{([^}]*)\}/g)].map((m) => m[1].trim());
  for (const h of handlers) {
    assert(/^\(\) => set[A-Z]/.test(h), `the viewer is offered an act: ${h}`);
  }
  assert(!/\bdisabled\b/.test(src),
    'a control in the reading room is rendered inert rather than absent');
});

// ── The Legal admin's library and ladders (WP-U13) ──────────────────────
console.log('\nthe library surfaces gaps without owning them');

const libSrc = () => read('library.jsx');

await test('the library and ladders read real endpoints', async () => {
  const panes = stripComments(read('workspaces.jsx'));
  for (const [tab, comp] of [['library', 'LibraryPane'], ['ladders', 'LaddersPane']]) {
    const line = new RegExp(`'${tab}':[^\\n]*`).exec(panes);
    assert(line, `the ${tab} route disappeared`);
    assert(line[0].includes(comp), `${tab} does not render ${comp}`);
  }
});

await test('a coverage gap is surfaced, never framed as a system failure', async () => {
  // WP-U13's common anti-pattern, and the product boundary in pixel form: the
  // system's job ends at making the gap visible and naming who can act. The gap
  // itself belongs to the people who own the library.
  const src = libSrc();
  assert(/data-testid="coverage-gap"/.test(src), 'the coverage gap is no longer surfaced');
  assert(/Closing it is Legal's to do/.test(src),
    'the gap banner no longer names whose it is to close');
  // Checked by enumerating the words it uses, not by grepping for a ban — the
  // file's own comment explains the ban and a word search would trip on it.
  const banner = /data-testid="coverage-gap"[\s\S]*?\n        <\/div>/.exec(src);
  assert(banner, 'the coverage-gap banner changed shape; re-point this check');
  for (const blame of ['error', 'failed', 'misconfigur', 'invalid', 'broken']) {
    assert(!new RegExp(blame, 'i').test(banner[0]),
      `the coverage-gap banner calls the gap "${blame}", which makes it the `
      + "system's fault rather than the library owner's to close");
  }
});

await test('the library offers no way to edit approved wording', async () => {
  // WP-U13's critical anti-pattern: an in-place edit affordance would be the
  // mutation-surface invariant broken in the UI. Every change to approved
  // wording is a new version with its history intact.
  //
  // Enumerated by what each control does, not by searching for a word.
  const src = stripComments(libSrc());
  const handlers = [...src.matchAll(/onClick=\{([^}]*)\}/g)].map((m) => m[1].trim());
  for (const h of handlers) {
    assert(/^\(\) => set[A-Z]/.test(h),
      `the library offers an act that is not a filter or a drawer: ${h}`);
  }
  const calls = [...src.matchAll(/API\.([a-zA-Z]+)\(/g)].map((m) => m[1]);
  for (const c of calls) {
    assert(['library', 'ladders'].includes(c),
      `the library pane calls API.${c}(), which is not one of its two reads`);
  }
  assert(/<NotBuiltYet/.test(src),
    'the absent acts are no longer declared — a surface that is silent about '
    + 'what it cannot do reads as a surface that does everything');
});

await test('an empty ladder is rendered, not filtered away', async () => {
  // The guarantee 0018 was built around. cw.ladder_board LEFT JOINs its rungs so
  // a rungless ladder still arrives, as one row with a null rung. Dropping that
  // null here would undo it at the last possible moment and report a
  // configuration error as absence — which renders identically to health.
  const src = libSrc();
  assert(/data-testid="ladder-empty"/.test(src),
    'the empty ladder no longer has its own rendering');
  assert(/This ladder has no rungs/.test(src),
    'the empty ladder no longer says so in words');
  const grouping = stripComments(src);
  assert(/r\.rung !== null && r\.rung !== undefined/.test(grouping),
    'the null rung is no longer distinguished, so an empty ladder either '
    + 'vanishes or renders as a rung that does not exist');
});

await test('an unusable rung stays on the ladder rather than being hidden', async () => {
  // A board that filtered them would report a degraded ladder as a shorter
  // healthy one, and the rung somebody has to fix is the one removed.
  const src = libSrc();
  assert(/data-testid="rung-unusable"/.test(src),
    'an unusable rung is no longer marked');
  assert(/removing them would hide the problem/.test(src),
    'the screen no longer says why unusable rungs stay');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
