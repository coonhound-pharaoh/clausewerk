# Assembly Connection — Work Package Package — 2026-07-27

**Status: APPROVED_WITH_NOTES at Gate 3 (work-package review). Ready for implementation.**

**What this is.** The work-package cut of
[`ASSEMBLY-CONNECTION-PLAN-2026-07-27.md`](ASSEMBLY-CONNECTION-PLAN-2026-07-27.md) (WS-1 of the
gap-closure plan): eight single-owner packages, WP-001 through WP-008, that connect the tested
assembly engine to the running service. Each package is written to be implementable by an
engineer holding only that package and the objective contract. No code was changed in producing
this document.

**How it was made.** An adversarial workflow on Opus 5 subagents: independent planners who
verified the plan against the repo before proposing a cut, three red-team reviewers (evidence,
architecture, testing lenses), an integrator who ruled on every disagreement at source, and a
work-package author/reviewer loop that ran four passes until the reviewer approved. Full
artifacts — objective contract, all role outputs, every gate verdict, and the evidence ledger —
are in `.adversarial-workflow-agentic/2026-07-27-assembly-wpp/`.

**Disclosures.**
- One of three planned planners never produced valid output (a structured-output failure, twice);
  the set was built from two independent planners plus three red-team reviews, and the reviewer
  loop verified every factual claim at source regardless.
- The reviewer and author disagreed twice about what the database actually grants; both disputes
  were settled by reading the migrations, once for each side. Every file-and-line claim in this
  document survived at least one adversarial check.

## What the review changed (the short version)

The source plan was Mike-approved, but four of its factual claims did not survive contact with
the repo, and the packages below are cut around the verified facts:

1. **The doorway cannot route a per-run request or send a file today.** The server discards query
   strings and speaks only JSON — so the "one server change" the plan expected is a small
   transport package of its own (WP-001), hoisted to the front so nothing else waits on it.
2. **The database does not yet enforce "a run belongs to a deal."** The settled owner decision
   has no rule behind it in the schema as it stands; honouring it without putting permission
   logic in an endpoint needs the set's one migration (WP-003).
3. **The run-summary views bypass row-level security.** Both run views answer with every run to
   anyone granted them. The same migration scopes them, in the database's own words.
4. **The audit chain already records runs by trigger.** The plan's endpoint-side audit step would
   have double-recorded the act; the packages use the trigger that exists.

## Decisions and heads-ups for Mike

None of these block starting WP-001. The first one must be answered before WP-003 begins.

1. **The 0024 question (answer before WP-003).** An untracked migration file
   `backend/db/migrations/0024_the_flag_is_enough.sql` — your U13 decision, dated today — sits in
   your working tree. Is it landing, and must it land before the run-scoping migration? The
   packages never name a migration number; WP-003 claims the next free number verified on disk at
   the moment it starts (0025 as the tree stands). Nothing in this set touches your file.
2. **The owner pre-brief for the migration (before WP-003).** The set's one migration carries
   three rules, not the two the integrated plan named: (a) a run can only be recorded against
   your own deal, (b) decisions and findings can only be appended to a run you could record, and
   (c) the two run-summary views answer only the runs the asker may see. Rule (b) exists because
   without it rule (a) is bypassable one table over. The full claim is in WP-003.
3. **Certificate bytes have no owner yet.** Filing an execution takes the document hash and the
   signatories — exactly your settled decision. Attaching a signature certificate's actual bytes
   afterwards belongs to nobody yet (the transport can't carry it and WS-8 owns byte storage).
   Carried as an open issue; blocks nothing in WS-1.
4. **A finding outside WS-1, found while checking this one:** five views the requester can read
   (the concession and position family) have the same shape this repo has paid for four times —
   granted but unscoped. They belong to WS-6's tables; they need an owner and their own
   migration. Recorded, not touched.
5. **The execution gate is slightly stricter than the plan asked.** The plan's expiry check can't
   be tested as written (expiry dates are immutable in the schema), so WP-006 checks clause
   currency instead — a run pinning a retired or hard-superseded clause is also refused at
   signature. This widens what gets refused; it is flagged as a deviation for your acknowledgement.
6. **An auditor cannot download a pre-execution contract.** Producing the document writes an
   audit row, and auditors may not write to the audit chain — the house pattern wins. Reversing
   this later is one schema grant, not endpoint code.

## Order of work

```
WP-001 (transport seam)
   └─ WP-002 (A1: POST /runs wired, refusing correctly)
        └─ WP-003 (A2: persistence + the migration)   ← owner question first
             └─ WP-004 (B: read runs back)
                  └─ WP-005 (C: the document + round trip)
                       ├─ WP-006 (D: execute, three gates)
                       └─ WP-007 (E1: requester screens)
                            └─ WP-008 (E2: reviewer execute screen; also needs WP-006)
```

A serial spine with one fork: WP-006 and WP-007 may run in parallel (they share no file);
everything else is strictly ordered. Tests live inside every package — there is no test package.
Every package ends with the full `npm run verify` green, all three mutation harnesses included,
and asserts `git diff --stat backend/engine/` is empty: the engine is never touched.

---
## WP-001 — Transport seam — the doorway learns to send bytes, and to see one query selector

**Objective.** Give backend/doorway/app.py a bytes-carrying response type and teach backend/doorway/server.py to send it, and stop server.py discarding the query string — both hoisted out of Part C so the two files every endpoint passes through have exactly one writer, before anything is built on top of them. Nothing consumes either capability in this package.

**Prerequisites:** none

**Scope**

- Add a second response type beside app.Response that carries bytes, a content type and a filename, plus the one MIME constant that names the .docx type.
- Add a bytes branch to server.Handler._respond plus a _send_download writer.
- Capture a single whitelisted query selector in do_GET and pass it into App.handle, where it is stored and consumed by nothing.
- Unit tests in test_server.py for the bytes path, the filename, the content length, the query capture, and byte-identity of every existing JSON response.
- One mutation row in doorway/mutation_check.py guarding the bytes branch.
- Record the decision that the document selector travels in the URL rather than in a POST body, with the body-carried alternative named.

**Out of scope**

- Any new route, any engine call, any SQL, any screen — this package adds capability, not behaviour.
- The .docx itself and GET /runs/contract (WP-005).
- A mutation row for the query capture: nothing consumes it here and both MISS and SKIP are fatal in doorway/mutation_check.py, so that row belongs to WP-005.
- WS-8: the document byte store, storage_uri semantics, e-signature provider transport, and any raising of MAX_BODY (server.py:56) for certificate bytes.
- Streaming, ranged requests, compression, or any change to do_POST, _read_body, _serve_static or MAX_BODY.

**Target files**

- `C:\Users\MimoMac\repo\clausewerk\backend\doorway\app.py (the Response dataclass at lines 48-51; App.handle's signature and return type at lines 100-141)`
- `C:\Users\MimoMac\repo\clausewerk\backend\doorway\server.py (imports at line 50; MAX_BODY at line 56; do_GET at lines 78-88; _respond at lines 178-185)`
- `C:\Users\MimoMac\repo\clausewerk\backend\doorway\test_server.py (new tests appended)`
- `C:\Users\MimoMac\repo\clausewerk\backend\doorway\mutation_check.py (one new row in MUTATIONS)`

**Required changes**

- app.py: add, immediately after the existing Response (app.py:48-51), a second frozen dataclass — `@dataclass(frozen=True)\nclass Download:\n    status: int\n    body: bytes\n    content_type: str\n    filename: str`. Response is NOT changed: its `body: dict` annotation stays exactly as written, so no existing endpoint's typing moves and isinstance() is the discriminator.
- app.py: add ONE module constant beside Download — `DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"`. THIS IS THE ONLY SPELLING OF THAT STRING IN THE REPOSITORY. app.py owns it because app.py owns the Download type; server.py does not learn about Word (it reads download.content_type), WP-001's test imports DOCX_TYPE rather than typing it, and WP-005 imports it rather than retyping it. Two spellings of one constant across two packages is how they drift.
- app.py: widen App.handle's return annotation to `Response | Download` and add a keyword parameter `query: dict[str, str] | None = None` after `body`. The parameter is bound to a local and used by nothing in this package, with a comment naming WP-005 as its first consumer.
- server.py: import Download alongside App and Response (server.py:50). Do NOT define a MIME constant for .docx here — the content type travels on the Download object.
- server.py: in _respond, make the first statement `if isinstance(response, Download):\n            self._send_download(response)\n            return`, leaving the existing json.dumps path (server.py:179-185) untouched below it.
- server.py: add `_send_download(self, download: Download) -> None` which calls send_response(download.status); send_header('content-type', download.content_type); send_header('content-disposition', f'attachment; filename="{download.filename}"'); send_header('content-length', str(len(download.body))); self._cors(); end_headers(); self.wfile.write(download.body). Its docstring states the rule that a filename containing a quote or a newline is refused by the caller, never sanitised here.
- server.py: add a module-level `QUERY_KEYS = ("run",)` beside MAX_BODY (server.py:56), with a comment that this is the complete list of what the browser may name in a query string, in the same spirit as reads.READS.
- server.py do_GET: after `parsed = urlparse(self.path)`, build `selector = {k: v[0] for k, v in parse_qs(parsed.query).items() if k in QUERY_KEYS and v}` and pass `query=selector` to self.app.handle. Import parse_qs from urllib.parse (server.py:48, which already imports unquote and urlparse). do_POST is not changed: a write's fields come from the body.
- test_server.py: add test_a_download_leaves_as_bytes_with_its_own_content_type — monkeypatch a route that returns Download(200, b'PK\\x03\\x04...', DOCX_TYPE, 'contract.docx') importing DOCX_TYPE from doorway.app, call it over the wire, and assert the raw response body is the exact bytes, the content-type header equals DOCX_TYPE, and nothing was JSON-encoded.
- test_server.py: add test_a_download_names_its_file_and_its_length — content-disposition carries attachment and the filename, content-length equals len(bytes).
- test_server.py: add test_a_query_string_reaches_the_app_and_is_consumed_by_nothing — a GET to an unknown path with ?run=RUN-1 arrives at App.handle with query == {'run': 'RUN-1'}, an unlisted parameter (?agreement=AG-1) does not, and the response is still the ordinary 404.
- test_server.py: add test_every_json_endpoint_still_answers_as_json — for GET /me, GET /deals, GET /clauses, GET /record and POST /sign-in, assert content-type is exactly 'application/json' and the parsed body equals what App.handle returns directly, so the new branch cannot have changed the old one.
- mutation_check.py: append exactly this 5-tuple to MUTATIONS — ("a download is serialised as JSON", "doorway/server.py", "        if isinstance(response, Download):\n            self._send_download(response)\n            return", "        pass", "test_server.py::test_a_download_leaves_as_bytes_with_its_own_content_type"). The find string must match the finished file byte for byte and appear exactly once — preflight refuses if it appears zero or more than once, and refuses if the named test function does not exist (mutation_check.py:334-367).

**Implementation notes**

- Observed: server._respond currently json.dumps unconditionally with 'application/json' (server.py:178-185), and do_GET/_endpoint pass only parsed.path (server.py:78-88, 106-110) — the query string is parsed and dropped today.
- Decision recorded in server.py's module docstring: the selector travels in the URL because ASSEMBLY-CONNECTION-PLAN section 2 Part C names GET /runs/contract and a document read is a read; writes.Write holds exactly one SQL string and one set of body Fields (writes.py:119-147), so filing a read under it would misclassify the one distinction those two files exist to draw. The live alternative is recorded beside it: POST /health-checks/rebuild and POST /health-checks/document already take run_id / agreement_id + doc_seq through Write.fields (writes.py:479-491), so a body-carried selector is technically available; if a later owner prefers it, this package collapses to the single bytes-out branch and the query half disappears.
- The whitelist is a tuple rather than a check inside a handler so that what the browser may name is one greppable line. A second key added later is a visible act.
- No mutation row is authored for the query capture. doorway/mutation_check.py treats MISS and SKIP alike as fatal (mutation_check.py:23-27), and a row guarding a capability no test consumes cannot report ok. WP-005 owns that row.
- Keep _cors() in the download path: the existing _respond calls it, and a download that skipped it would fail cross-origin during development in a way no test covers.
- Note on mutation harness verdicts, for the package close: doorway/mutation_check.py has FOUR verdicts, not three — ok, MISS, SKIP and IMPRECISE (mutation_check.py:44-49, added 2026-07-27 for a lane that dies in its fixture because `alter role` is cluster-wide and six concurrent rebuilds were observed to collide). All three non-ok verdicts are fatal. This package's row must report literally 'ok'; recording 'not MISS' would let a fixture collision read as a guarded guarantee.

**Validation checks**

- python -m pytest doorway/test_server.py -q — all four new tests pass and the existing 22 tests in the file are unchanged and green.
- python -m pytest doorway -q — the whole doorway suite green.
- python doorway/mutation_check.py — the new row reports 'ok'; the preflight reports no stale checks.
- node db/test/run-all.mjs — unchanged and green (no SQL, no screens touched).
- git diff --stat backend/engine/ is empty.
- backend/db/migrations/ gained no file from this package — asserted by comparing the listing against what WP-003 left behind, not by naming a number, since WP-003's migration number is resolved at ITS package start.
- npm run verify, run from backend/, is green end to end — node db/test/run-all.mjs, python -m pytest engine, python -m pytest doorway, and all THREE mutation harnesses (db/test/mutation-check.mjs, engine/mutation_check.py, doorway/mutation_check.py).

**Acceptance criteria**

- A bytes response leaves the server as bytes: the exact bytes, the content type carried on the Download object, a content-disposition naming the file, and a content-length equal to len(bytes).
- app.DOCX_TYPE exists in exactly one place and both the test and (later) WP-005 import it rather than retyping the string; server.py contains no Word-specific constant.
- Every existing JSON endpoint still answers with content-type 'application/json' and a body equal to App.handle's, proven by test rather than asserted.
- A query string reaches App.handle: ?run=RUN-1 arrives as {'run': 'RUN-1'}, ?agreement=AG-1 does not arrive at all, and nothing in this package consumes either.
- app.Response is unchanged — body is still typed dict and no existing call site was edited.
- The bytes-path mutation row reports 'ok' and its find string appears exactly once in doorway/server.py.
- The URL-versus-body decision and the body-carried alternative are both written down in server.py's docstring.
- npm run verify from backend/ is green, including all three mutation harnesses.

**Risks**

- This edits the one file every request passes through. A careless branch could serialise a dict as bytes or leak a stack trace through a path handle_one_request's last-resort 500 does not cover. Mitigated by: no endpoint consumes the new capability in this package, and every existing JSON response is asserted unchanged.
- The find string for the mutation row is three lines with exact indentation; a later reformat of server.py silently turns it into a SKIP, which is fatal. Mitigated by re-running the harness after any in-package edit to server.py and recording the observed 'ok' at package close.
- A filename containing a quote or a newline would break the content-disposition header. Mitigated by refusing such a filename at the caller (WP-005) rather than sanitising here, and by stating that rule in _send_download's docstring.

**Rollback / remediation**

- Revert exactly two source files (backend/doorway/app.py, backend/doorway/server.py) and remove the four tests and the one mutation row. Nothing depends on this package until WP-005, so a revert is complete and local.
- If the owner switches the selector to a POST body, delete QUERY_KEYS, the parse_qs import, the do_GET capture and App.handle's `query` parameter, and keep the Download type, DOCX_TYPE and _send_download — WP-005 then reads the selector from a body instead. Record the switch in server.py's docstring rather than deleting the paragraph that explains the original choice.

---

## WP-002 — Part A1 — POST /runs wired, refusing correctly, storing nothing

**Objective.** Stand up POST /runs as a real endpoint with its FINAL request shape, which takes a manifest and an agreement_id, loads the library and the rule catalogue as the caller, resolves and validates, and answers with the engine's own sentences — while writing no run at all. The refusal boundary, the audit-first uniformity rule and the loader SQL are proved here, before persistence exists to hide behind.

**Prerequisites:** WP-001

**Scope**

- A new module backend/doorway/runs.py in the manifests.py shape (not a writes.WRITES entry).
- One dispatch line in app.App.handle.
- Boundary validation of agreement_id and manifest_source, in runs.py, each returning a 400 that names the field. The request shape is FINAL in this package — WP-003 adds no field and removes none.
- The attempt row (run_attempted / run_refused) written through cw.audit FIRST, so the database refuses a viewer before the engine's answer is ever reported.
- Loading clauses, ladders and rules through the caller's own Request using engine/loader.py's own CLAUSE_SQL, LADDER_SQL and RULE_SQL.
- resolve() then validate(), and an answer that states how many rules were consulted.
- test_runs.py, including a synthetic library seeded as development data under the placeholder-content rule.
- Extending backend/db/test/loader-sql.test.mjs to run all three loader queries as each of the SIX signed-in roles, with the administrator's outcome stated separately because it differs.
- One mutation row guarding the audit-first ordering.

**Out of scope**

- Any INSERT into cw.snapshot, cw.ruleset, cw.run, cw.run_decision or cw.run_finding — that is WP-003, and this package must leave cw.run empty.
- The run-scoping migration and the database rule that decides WHOSE deal an agreement_id names (WP-003). This package validates that the field is PRESENT and well-formed; it never checks ownership, and says so in a comment citing hard constraint 2.
- Any run_recorded event: cw.audit_run() already emits it on insert into cw.run (0005_run_store.sql:251-263). This endpoint writes run_attempted / run_refused only.
- Reading runs back (WP-004), the document (WP-005), execution (WP-006), screens (WP-007/008).
- WS-2: no intake interview, no classifier, no AI. The manifest arrives composed, exactly as POST /manifests/check accepts it today.
- WS-7: no conflict-rule authoring endpoint. Synthetic rules are seeded in test fixtures through cw.conflict_rule as legal_admin, not through a new endpoint.
- Changing manifests.manifest_from, manifests.check or POST /manifests/check's live behaviour in any way.

**Target files**

- `C:\Users\MimoMac\repo\clausewerk\backend\doorway\runs.py (NEW)`
- `C:\Users\MimoMac\repo\clausewerk\backend\doorway\app.py (one dispatch branch beside the POST /manifests/check branch at lines 137-139)`
- `C:\Users\MimoMac\repo\clausewerk\backend\doorway\test_runs.py (NEW)`
- `C:\Users\MimoMac\repo\clausewerk\backend\doorway\mutation_check.py (one new row)`
- `C:\Users\MimoMac\repo\clausewerk\backend\db\test\loader-sql.test.mjs (extend; it already extracts CLAUSE_SQL, LADDER_SQL and RULE_SQL)`

**Required changes**

- runs.py: module docstring in the manifests.py idiom stating what is adapted and which way round, and naming the corrections carried from the plan — the engine's rule query reads cw.active_conflict_rule, not cw.conflict_rule (loader.py:50-54); the loader's public snapshot entry is build_snapshot (loader.py:133); and cw.run.engine_version is NOT NULL with no default (0005_run_store.sql:97-108) and is absent from the plan's Part A step 5 list, so WP-003 supplies it.
- runs.py: `@dataclass(frozen=True) class Answer: status: int; body: dict` with a `refused` property, copied from manifests.Answer (manifests.py:116-123) so app.py's dispatch shape is identical.
- runs.py: `def run(db: Database, caller: Caller, body: dict | None) -> Answer` performing, in this order: (1) the two boundary checks below; (2) manifests.manifest_from(body or {}) with manifests.Malformed → Answer(400, {'error':'refused','reason':str(wrong),'kind':'rejected'}); (3) open `with db.as_person(caller.person, caller.role) as request:`; (4) the attempt row; (5) categories and check_manifest; (6) the three loader queries; (7) resolve and validate; (8) the answer.
- runs.py boundary check 1 — agreement_id, REQUIRED FROM THIS PACKAGE ONWARDS: `agreement_id = (body or {}).get("agreement_id")`; absent, non-string or blank is `Answer(400, {'error':'refused','reason':'name the deal this run belongs to (agreement_id)','kind':'rejected'})`. The field is required here even though nothing is persisted yet, so the endpoint's request contract is fixed by the package that introduces the route and no test, script or screen written against WP-002 breaks in WP-003. The comment states plainly: this checks PRESENCE only; whose deal it is, is a database rule that arrives with WP-003's run-scoping migration, because hard constraint 2 forbids an endpoint deciding it. Until then the value is carried into the run_attempted payload and used for nothing else.
- runs.py boundary check 2 — manifest source: `if manifest.source not in ("llm", "fallback", "manual"): return Answer(400, {'error':'refused','reason':"manifest_source must be one of 'llm', 'fallback' or 'manual'",'kind':'rejected'})`. manifests.manifest_from is NOT tightened (manifests.py:100 defaults source to 'llm' and accepts any string), so POST /manifests/check's live behaviour is unchanged. cw.run.manifest_source's check constraint (0005:88) is the reason and the comment says so — a bad source must be a 400 naming the field, never a late 409 IntegrityError that refusals.classify would label 'refused_on_merits' (refusals.py:91-94).
- runs.py attempt row, FIRST statement inside the transaction: `request.write("select cw.audit('run_attempted', %(agreement_id)s, %(payload)s::jsonb)", {...})` with a payload carrying vendor, agreement_id, risks_submitted, source and 'checked_by': 'engine.resolution.resolve'. cw.audit is `language sql` and not SECURITY DEFINER (0001_foundation.sql:328-335), and INSERT on cw.audit_event is granted to cw_requester, cw_legal_reviewer, cw_legal_admin and cw_administrator only (0001:339-346; 0013_administrator.sql:257) — so a viewer and an auditor are refused here, by the database, in its own words, before any engine answer exists. The comment cites the manifests.py uniformity argument (manifests.py:203-222) rather than restating it.
- runs.py: `categories = manifests.categories_for(request)`; `checked = check_manifest(manifest, categories)`; UnknownCategory → write a run_refused audit row and return Answer(409, {'error':'refused','reason':str(refused),'kind':'unknown_category','dropped':[...]}) in exactly the shape manifests.check returns (manifests.py:154-180), so the pre-flight and the enforcement refuse identically.
- runs.py: load as the caller — `clause_rows = request.rows(loader.CLAUSE_SQL)`, `ladder_rows = request.rows(loader.LADDER_SQL)`, `rule_rows = request.rows(loader.RULE_SQL)`; then `snapshot = loader.build_snapshot(clause_rows, ladder_rows)` and `ruleset = loader.build_ruleset(rule_rows)`. The queries are imported from engine.loader, never retyped.
- runs.py: `resolution = resolve(checked, snapshot)`; `validation = validate(resolution.decisions, ruleset)`.
- runs.py: the 200 answer body — vendor, agreement_id, snapshot_id, ruleset_id, result_hash, gate_open, `rules_consulted: len(ruleset.rules)`, `decisions`, `findings` (each with rule, rule_version, severity, title, detail, refs), `dropped`, `coerced`, `unresolved`, and `"recorded": false` so a screen cannot mistake a preview for a record. No run_id.
- runs.py: `except psycopg.Error as error:` → `refused = classify(error); return Answer(refused.status, refused.as_body())`, byte-identical to manifests.check (manifests.py:182-186). refusals.py is not changed.
- app.py: add, immediately after the POST /manifests/check branch, `if key == "POST /runs":\n            answered = runs.run(self._db, caller, body)\n            return Response(answered.status, answered.body)` and import runs alongside manifests. It is NOT a writes.WRITES entry: writes.Write holds exactly one sql string and run() executes exactly one statement (writes.py:119-147).
- test_runs.py: a `library` fixture that builds a synthetic catalogue as a legal_admin through db.as_person — categories, clause + clause_version rows, a cw.ladder with two cw.ladder_rung rows (one is_floor), cw.clause_tag rows, and two cw.conflict_rule rows. legal_admin holds insert on cw.ladder / cw.ladder_rung (0003:671) and on cw.conflict_rule / cw.clause_tag (0004:239). The fixture lives in test_runs.py and NOT in doorway/seed_demo.py, whose stated promise is that it creates no deals, tickets or clauses (seed_demo.py:12-16, 131-134).
- test_runs.py: test_a_viewer_is_refused_by_the_database_before_the_engine_answers — a viewer's POST /runs returns 403 with the database's own sentence and kind 'not_permitted', and the response carries no decisions, no snapshot id and no findings.
- test_runs.py: test_a_run_without_an_agreement_is_a_400_naming_the_field — and the same body succeeds once agreement_id is supplied, so the required field is proven required rather than merely documented.
- test_runs.py: test_a_dropped_category_refuses_with_the_engine_s_own_sentence — the reason string equals what POST /manifests/check returns for the same body, compared directly.
- test_runs.py: test_a_manifest_source_outside_the_three_is_a_400_naming_the_field, plus test_the_preflight_still_accepts_an_unusual_source proving manifests.manifest_from was not tightened.
- test_runs.py: test_an_empty_library_reports_a_coverage_gap_and_invents_nothing — every decision comes back with clause_id null and reason 'No clause available in Ledger' (resolution.py:198), unresolved equals the number of risks, rules_consulted is 0, and the answer is a 200 report rather than a refusal. See the implementation note: this deliberately replaces the plan's 'refuses with SnapshotIncomplete's words'.
- test_runs.py: test_zero_rules_reads_as_zero and its opposite test_seeded_rules_are_counted_and_can_fire — with the synthetic catalogue in place, rules_consulted is 2 and a High finding closes the gate.
- test_runs.py: test_nothing_lands_in_cw_run — after a successful call, `select count(*) from cw.run` as an auditor is 0, and no run_recorded event exists in cw.audit_event.
- test_runs.py: test_every_call_is_recorded_whether_it_succeeded_or_not — a run_attempted row exists for the accepted case and a run_refused row for the dropped-category case, both attributed to the caller by cw.audit's own actor binding.
- mutation_check.py: append the 5-tuple ("the attempt is recorded after the engine has already answered", "doorway/runs.py", <the exact `request.write("select cw.audit('run_attempted', …` statement as written in the finished file>, "        pass", "test_runs.py::test_a_viewer_is_refused_by_the_database_before_the_engine_answers"). This guarantee is the package's central claim and no existing row guards it: the manifests.py reword row and the db.py identity rows all stay green if the audit write moves below the engine call. WP-003 rewrites runs.py and re-runs the harness, and preflight fails loudly rather than quietly if this find string goes stale.
- loader-sql.test.mjs: import the role helpers from db/test/roles.mjs and add a block that runs CLAUSE_SQL, LADDER_SQL and RULE_SQL as each of the SIX signed-in roles. FIVE of them — viewer, requester, legal_reviewer, legal_admin, auditor — see identical row counts (cw_viewer holds select on cw.clause_version_state and cw.selectable_clause at 0002:352-354, the ladder tables at 0003:669-670 and cw.active_conflict_rule at 0004:237-238), which is precisely why the refusal has to come from the audit write and not from the read. THE SIXTH IS DIFFERENT AND IS ASSERTED AS SUCH: cw_administrator is absent from every one of those grant lines and is refused the loader queries outright — 0002:352-354 names five roles, and 0018_library_and_ladder_views.sql:170-190 records in the repo's own words that this is a deliberate unresolved boundary for that role and not an oversight. Assert the refusal rather than skipping the role, so the absence is visible in the harness. THE SAME FACT GOVERNS THE ENDPOINT TEST: because the loader queries run before the answer is composed, an administrator calling POST /runs is refused here and not in WP-003.
- test_runs.py: test_an_administrator_is_refused_at_the_clause_library — the endpoint answers an administrator with a 403 'not_permitted' carrying the database's own permission-denied sentence, and the response carries NO decisions, NO snapshot id, NO result hash and no engine sentence of any kind: the refusal lands before the engine is ever consulted. The test names the three ungranted reads in a comment — cw.clause_version_state (0002:352-354), cw.ladder_health (0003:669-670), cw.active_conflict_rule (0004:237-238), each granted to five roles and never to cw_administrator — so whoever later grants them has to change this test on purpose. THIS REPLACES the earlier test that asserted an administrator receives an answer; that test would have failed the moment it was written.

**Implementation notes**

- Correction to the plan, settled from source: an empty library does NOT raise. engine.snapshot.Snapshot.build accepts an empty clause list (snapshot.py:53-99) and engine.run.SnapshotIncomplete (run.py:35) is raised only by snapshot_from_rows on the READ side. A rungless ladder cannot arrive either, because LADDER_SQL inner-joins cw.ladder_rung (loader.py:56-67), as engine/run.py:113-118 records. So the honest write-side behaviour is a coverage-gap report in the engine's own words, not a refusal. The 'refuse loudly' case that genuinely exists at write time is snapshot_rows()'s ValueError (run.py:113-122) and WP-003 handles it explicitly.
- The request shape is final in this package: {agreement_id, vendor, value?, source?, risks[]}. WP-003 changes the RESPONSE (adding run_id and flipping recorded to true) and nothing about the request. That asymmetry is stated here so an implementer of WP-003 does not reopen the body.
- CORRECTED, AND THE CORRECTION COMES FROM THIS PACKAGE'S OWN LOADER SWEEP — THERE IS NO 'ADMINISTRATOR GAP'. The earlier note said an administrator passes the audit gate, receives an answer from this endpoint, and is refused only once WP-003 makes it persist. That is false, and the six-role loader block above disproves it. An administrator is refused BY THE DATABASE INSIDE THIS PACKAGE, at the clause-library read, before any engine answer exists: cw_administrator holds no SELECT on cw.clause_version_state (granted to the five roles at 0002_clause_registry.sql:352-354), none on cw.ladder_health (0003_ladders_and_concessions.sql:669-670 — 0013:291-292 grants only the base tables cw.ladder and cw.ladder_rung), and none on cw.active_conflict_rule (0004_conflict_rules.sql:237-238). CLAUSE_SQL, LADDER_SQL and RULE_SQL read exactly those three, and this package's own ordering runs them BEFORE the answer is composed — so refusals.classify turns INSUFFICIENT_PRIVILEGE into a 403 'not_permitted' (refusals.py:88-89) and the caller gets the database's own sentence. The role does hold INSERT on cw.audit_event (0013:257, policy at :275), so it passes the attempt row and is refused one step later; the audit gate is simply not the gate that stops it. This is the same absence 0018_library_and_ladder_views.sql:170-190 records for this role in the repo's own words, and the same owner question. Nothing here is temporary and nothing is time-boxed to WP-003.
- The audit vocabulary introduced here is permanent: cw.audit_event has no UPDATE or DELETE grant for any role (0001:337-346), so 'run_attempted' and 'run_refused' are fixed in this package deliberately and must not be renamed later.
- Note on mutation harness verdicts, for the package close: doorway/mutation_check.py has FOUR verdicts, not three — ok, MISS, SKIP and IMPRECISE (mutation_check.py:44-49, added 2026-07-27 for a lane that dies in its fixture because `alter role` is cluster-wide). All three non-ok verdicts are fatal. This package's row must report literally 'ok'; an IMPRECISE read as a pass would record a fixture collision as a guarded guarantee.
- Note on where the administrator's refusal is NOT decided: not in runs.py. Nothing in this package tests, branches on or mentions a role in code. The endpoint asks the database for the clause library through the caller's own connection and hands back what comes out, refusal included — hard constraint 2 holds exactly as it does for every other role.

**Validation checks**

- python -m pytest doorway/test_runs.py -q — all named tests pass.
- python -m pytest doorway -q — the whole suite green, including test_manifests.py unchanged (POST /manifests/check's behaviour must be byte-identical).
- node db/test/loader-sql.test.mjs — the three queries run as all six roles against the migrated schema, with the administrator's refusal asserted rather than skipped.
- node db/test/run-all.mjs — green.
- python doorway/mutation_check.py — the new row reports 'ok'; the preflight reports no stale checks (app.py gained a dispatch branch, so confirm the existing app.py row still matches exactly once).
- git diff --stat backend/engine/ is empty; backend/db/migrations/ gained no file from this package — asserted by comparing the listing against what WP-003 left behind, not by naming a number, since WP-003's migration number is resolved at ITS package start.
- npm run verify from backend/ is green, including all three mutation harnesses.

**Acceptance criteria**

- A viewer calling POST /runs is refused by the database, in the database's own words, before the engine's answer is ever reported — proven by the absence of any decision or snapshot id in the refusal body, and guarded by the new mutation row, which reports 'ok'.
- POST /runs requires agreement_id from this package onwards: absent is a 400 naming the field, and the endpoint's request shape does not change again in WP-003.
- A manifest with a dropped category refuses with check_manifest's own sentence, character for character the same sentence POST /manifests/check returns for the same body.
- A manifest source outside ('llm','fallback','manual') is a 400 naming the field, not a 409, and manifests.manifest_from is unchanged — proven by a test that the pre-flight still accepts an unusual source.
- The answer states how many rules were consulted, and zero reads as zero.
- An empty library produces a 200 coverage-gap report in the engine's own words ('No clause available in Ledger'), with clause_id null on every decision and nothing invented.
- Nothing lands in cw.run, cw.run_decision, cw.run_finding, cw.snapshot or cw.ruleset, and no run_recorded event exists.
- Every call is recorded as run_attempted or run_refused, attributed by cw.audit from the connection.
- loader-sql.test.mjs runs CLAUSE_SQL, LADDER_SQL and RULE_SQL as each of the SIX signed-in roles against the migrated schema: five see identical row counts, and the administrator is refused, asserted with 0002:352-354 and 0018:170-190 cited.
- An administrator calling POST /runs is refused BY THE DATABASE at the clause-library read, with a 403 'not_permitted' in the database's own words and no decisions, snapshot id, result hash or engine sentence in the answer — asserted by a named test citing the three grant lines (0002:352-354, 0003:669-670, 0004:237-238). No 'administrator gap' is claimed anywhere in this package, because there is none: the role is refused here, not later.
- npm run verify from backend/ is green, including all three mutation harnesses.

**Risks**

- The administrator's outcome was recorded backwards in an earlier draft — 'the endpoint answers an administrator until WP-003 lands' — and a test was specified against it. The verified answer is the opposite: the refusal arrives inside THIS package, at the loader read, because the role holds no SELECT on any of the three views the loader queries name. Mitigated by the named refusal test, by the six-role loader sweep that asserts the same absence one layer down, and by both citing the grant lines so the claim is checkable rather than remembered.
- A synthetic library seeded in a fixture can drift from what the engine expects (the category label/key distinction is the historic trap — run.py:127-129). Mitigated by building the fixture through cw.category and letting manifests.categories_for do the translation, never hand-mapping.
- Someone will be tempted to tighten manifests.manifest_from instead of validating in runs.py, which would silently change POST /manifests/check. Mitigated by an explicit test that the pre-flight still accepts a manifest with an unusual source.
- The new mutation row keys on a line inside a file WP-003 rewrites. Mitigated by WP-003's standing commitment to re-run the harness after refactoring runs.py, and by preflight failing loudly on a stale pattern.

**Rollback / remediation**

- Delete backend/doorway/runs.py and backend/doorway/test_runs.py, remove the dispatch branch and the runs import from app.py, remove the mutation row, and revert the loader-sql.test.mjs block. No schema object was created and no row shape changed.
- The audit event names are the one thing a revert cannot undo: any run_attempted / run_refused rows already written stay in an append-only chain with no UPDATE or DELETE grant. That is intended — the names are fixed in this package on purpose — and the rollback note says so rather than implying the chain can be cleaned.

---

## WP-003 — Part A2 — persistence, the run-scoping migration, and audit reconciliation

**Objective.** Make POST /runs record what it produced, through the caller's own connection in one transaction, and close the three database rules the record depends on: a run belongs to the caller's deal, decisions and findings belong to a run the caller can see, and the two run views scope themselves. This is the only package in the set that touches backend/db/migrations/, and it claims ONE migration — THE NEXT FREE NUMBER, RE-VERIFIED AT THE MOMENT THE PACKAGE BEGINS AND NOT HARD-CODED HERE — with all three reasons and the number actually claimed recorded in the file header.

**Prerequisites:** WP-002

> **Precondition (not a package):** THE OWNER PRE-BRIEF, CORRECTED TO THREE RULES, PUT IN FRONT OF THE OWNER BEFORE THIS PACKAGE BEGINS. The approved plan's final_actions item 2 names TWO rules for migration 0024; this package ships THREE. The third — rule (b), the cw.run_decision and cw.run_finding INSERT policies — must be in the claim the owner sees, with its source line and its argument: 0005_run_store.sql:281-286 shows both INSERT policies checking role only (`with check (cw.app_role() in ('requester','legal_reviewer','legal_admin'))`), so without rule (b) rule (a) is bypassable one table over — a requester refused a run row on somebody else's deal can still append decisions and findings to that run, permanently, into tables with no UPDATE or DELETE grant. Hard constraint 4 authorises carrying it; hard constraint 2 forbids fixing it in an endpoint; and this migration is the only file in the set that may carry a database rule. The claim must be complete before the migration is written, not corrected after it lands.

> **Precondition (not a package):** THE MIGRATION NUMBER, RE-VERIFIED ON DISK AT THE MOMENT THIS PACKAGE BEGINS — AND ONE QUESTION TO THE OWNER FIRST. backend/db/migrations/ is NOT 0001-0023 any more: it holds an untracked 0024_the_flag_is_enough.sql, whose header reads '0024 · Owner decision U13 — the Administrator gets the FLAG, not the reason', dated 2026-07-27, and whose body revokes select on cw.agreement_retention and cw.legal_hold from cw_administrator. `git status --short backend/db/migrations/` reports it as `??`. It is the owner's working file, in his tree, and this package neither lands it nor deletes it. THE QUESTION, put before the package starts: is 0024_the_flag_is_enough.sql landing, and does it need to land before this migration? Then, whatever the answer, RUN THE LISTING AGAIN and claim the next free number — 0025 as the tree stands, 0024 only if the owner has discarded his file. Write the number actually claimed into the migration's own header and into the package's completion note. Two files sharing a number is the exact failure the set's single-claim guarantee exists to prevent, and the bootstrap applies migrations in filename order with no gate against a duplicate, so a collision would not announce itself.

**Scope**

- Persistence of snapshot, ruleset and run rows through the caller's Request, in one transaction, with content-addressed rows inserted only when absent.
- One migration — the run-scoping migration — carrying three discovered rules, all three mandatory in this package. Its NUMBER is resolved at package start, not written into this plan: backend/db/migrations/ currently holds 0001 through 0023 PLUS an untracked 0024_the_flag_is_enough.sql (owner decision U13, dated 2026-07-27), so the next free number is 0025 as things stand and 0024 only if the owner discards that file.
- The run id scheme, the provenance-count decision, the document-date decision and the idempotency rule, each recorded in the package with its alternative.
- Explicit handling of engine.run.snapshot_rows()'s ValueError as a refusal rather than a 500.
- Repairing the four existing tests that read the two run views as the database owner, which the scoping necessarily breaks.
- A named standing assertion in views-are-not-policies.test.mjs that both run views consult who is asking.
- Extensions to run-store.test.mjs, writer-sql.test.mjs and test_runs.py.

**Out of scope**

- Reading runs back through endpoints (WP-004) — this package proves the rows are there and are scoped, using existing test harnesses only.
- Any second migration. This package creates exactly ONE file under backend/db/migrations/ and no other, whatever number it turns out to claim.
- Widening views-are-not-policies.test.mjs's catalogue query beyond cw_viewer — see the recorded decision and the open issue; the five unscoped requester-readable views it would drag in (cw.concession_in_force, cw.concession_state, cw.position_current, cw.position_revival, cw.renewal_drift) belong to WS-6 and the concession family, not to WS-1.
- WS-6: nothing in cw.negotiation, cw.negotiation_position or cw.position_movement is touched, scoped or inventoried here.
- The document (WP-005) and execution (WP-006).
- Any endpoint-side run_recorded event: cw.audit_run() owns it (0005_run_store.sql:251-263).
- Any change to POST /runs' REQUEST shape: agreement_id was already required in WP-002. This package changes only the response and what happens behind it.

**Target files**

- `C:\Users\MimoMac\repo\clausewerk\backend\db\migrations\<NNNN>_runs_belong_to_the_callers_deal_and_the_run_views_scope_themselves.sql (NEW — the only migration in the whole set; <NNNN> is the next free number as verified at package start, 0025 as the tree stands today, 0024 only if the owner's untracked 0024_the_flag_is_enough.sql is discarded)`
- `C:\Users\MimoMac\repo\clausewerk\backend\doorway\runs.py (the persistence half, added after WP-002's resolve/validate)`
- `C:\Users\MimoMac\repo\clausewerk\backend\doorway\test_runs.py`
- `C:\Users\MimoMac\repo\clausewerk\backend\db\test\run-store.test.mjs (the tests at lines 296-304, 306-312 and 314-318 read the views with no role set; the role section begins at line 327)`
- `C:\Users\MimoMac\repo\clausewerk\backend\db\test\writer-sql.test.mjs (the SHARED set at lines 126-131; the cw.run_contract test at lines 264-270)`
- `C:\Users\MimoMac\repo\clausewerk\backend\db\test\executed.test.mjs (line 279 reads cw.run_contract with no role set; rowsAsLegal is already in the file)`
- `C:\Users\MimoMac\repo\clausewerk\backend\db\test\views-are-not-policies.test.mjs (a new named test beside the existing four; the REVIEWED inventory is NOT widened)`
- `C:\Users\MimoMac\repo\clausewerk\backend\doorway\mutation_check.py (one new row)`

**Required changes**

- MIGRATION HEADER: state the NUMBER THIS FILE ACTUALLY CLAIMED and how it was verified (the listing, run at package start, and the owner's answer on 0024_the_flag_is_enough.sql), then all three discovered facts in full, with their sources and the constraint that authorises the file. (a) cw.run's write_scoped INSERT policy checks role only — `with check (cw.app_role() in ('requester','legal_reviewer','legal_admin'))` (0005_run_store.sql:276-277) — deliberately unlike the read_scoped policy three lines above it, which does call cw.owns_agreement. The settled owner decision of 2026-07-27 ('every assembly run belongs to a deal') says the database's existing row rules decide whose deal a requester may run against; they do not, and hard constraint 2 forbids fixing it in an endpoint. (b) cw.run_decision's and cw.run_finding's INSERT policies check role only in the same way (0005:281-286), so a requester could append decisions and findings to another requester's run, permanently, into immutable tables. (c) cw.run_summary and cw.run_contract carry no scoping expression of their own, are not security_invoker, and are granted to cw_requester, cw_legal_reviewer and cw_legal_admin (0005:231-248, 296-298) — a view runs with its owner's rights and row-level security here is ENABLED not FORCED, so cw.run's read policy is never consulted through them. That is the failure this repo has paid for three times (0017_reading_room.sql:160-186).
- RULE (a): `drop policy write_scoped on cw.run;` then `create policy write_scoped on cw.run for insert with check (cw.app_role() in ('legal_reviewer','legal_admin') or (cw.app_role() = 'requester' and agreement_id is not null and cw.owns_agreement(agreement_id)));`. DROP+CREATE by name rather than ALTER POLICY, so the rollback is symmetrical and the prior text is quotable verbatim. The two-branch shape is the house shape (0005:271-275, 0006_executed_agreements.sql:276-279); the single-condition form is refused because cw.owns_agreement resolves to `a.requester = cw.app_actor()` (0003_ladders_and_concessions.sql:626-631) and would lock out legal_reviewer and legal_admin, who never appear in cw.agreement.requester.
- RULE (b), MANDATORY in this package and not conditional: `drop policy write_scoped on cw.run_decision;` / `create policy write_scoped on cw.run_decision for insert with check (exists (select 1 from cw.run r where r.run_id = run_decision.run_id));` and the identical pair for cw.run_finding. The subquery is evaluated under row-level security, so it means 'a run this caller can see', which is exactly the read_scoped policy above it. It ships with (a) because without it rule (a) is bypassable one table over: a requester refused a run row on somebody else's deal can still append decisions and findings to that run, into tables with no UPDATE or DELETE grant. Fixing that in an endpoint is forbidden by hard constraint 2, and this migration is the only file in the set that may carry a database rule.
- RULE (c): `create or replace view cw.run_summary as ... from cw.run r where cw.app_role() in ('legal_reviewer','legal_admin','auditor') or (cw.app_role() = 'requester' and (r.created_by = cw.app_actor() or (r.agreement_id is not null and cw.owns_agreement(r.agreement_id))));` — the same words as cw.run's read_scoped policy (0005:271-275), stated in the view, in the style of cw.run_drift (0022:196-200), cw.override_passes (0019:95-105) and cw.reading_room. The existing select list (0005:240-248) is preserved exactly, so CREATE OR REPLACE is sufficient. 'administrator' IS DELIBERATELY ABSENT FROM THE WHERE CLAUSE, and the migration says why in a comment: cw_administrator holds no SELECT grant on cw.run_summary or cw.run_contract — 0005:293-297 grants both views to cw_auditor and to cw_requester / cw_legal_reviewer / cw_legal_admin, and nothing in 0001-0023 adds the administrator — so an 'administrator' branch would be text that can never be reached, which is exactly the reassuring fiction backend/db/test/views-are-not-policies.test.mjs exists to prevent, written into a new migration. The gap is real (0013:321 gives the administrator a read policy on cw.run and 0013:296 a grant on the three base tables) and is carried as a named follow-on in open issues, recorded in WP-004 with its one-line closure; it is an owner decision about the boundary of a role, which is the same reason 0018_library_and_ladder_views.sql:170-190 gave for refusing to close it in a joined-view migration.
- RULE (c) continued: `create or replace view cw.run_contract as ...` with `join cw.run r on r.run_id = d.run_id` added and the SAME WHERE clause as cw.run_summary — including the same deliberate absence of 'administrator', for the same reason and with the same comment — preserving the existing column list and its `order by d.run_id, d.seq` (0005:231-238). The join is required because the view selects from cw.run_decision and has no run row to scope against otherwise. NOT security_invoker — 0017:175-185 and 0019:46 already record, in this repo's own words, why that is the wrong tool for a view joining tables the caller may not hold SELECT on.
- runs.py: after validate(), inside the SAME `with db.as_person(...)` block WP-002 opened, insert in this order — cw.snapshot, cw.snapshot_member, cw.snapshot_ladder_rung, cw.ruleset, cw.ruleset_member, cw.run, cw.run_decision, cw.run_finding — using engine.run.snapshot_rows(snapshot, categories), engine.run.ruleset_rows(ruleset) and engine.run.run_rows(...). db.Request exposes no executemany (db.py:92-146), so the loop is hand-written; the whole block is one transaction and a partial failure rolls the entire run back.
- runs.py: wrap the snapshot_rows() call in `except ValueError as wrong:` and return `Answer(409, {'error':'refused','reason':str(wrong),'kind':'refused_on_merits'})` after writing a run_refused audit row. snapshot_rows raises ValueError for a ladder that is hashed into the snapshot id but has no row to be stored in (run.py:113-122) — 'the snapshot would not rebuild'. Unhandled it is a 500 with a stack trace; this is the write-side 'refuse loudly' guarantee the plan asked for, in the one place it actually exists.
- runs.py idempotency, IN TWO LAYERS — the guard AND the conflict clause, and the reason for each is recorded in-package. LAYER ONE, the skip-when-present guard: before the snapshot block, `if request.one("select 1 from cw.snapshot where snapshot_id = %s", (snapshot.snapshot_id,)) is None:` insert snapshot, snapshot_member and snapshot_ladder_rung; otherwise skip all three. The same guard for cw.ruleset covering ruleset and ruleset_member. This is the rule writer-sql.test.mjs:126-131 already states, and its SHARED set omits snapshot_member and snapshot_ladder_rung, which is why the whole BLOCK is skipped rather than three ON CONFLICT clauses being added. NOTE ON one(): it returns a plain tuple or None (db.py:108-113, no row factory), so it is used here ONLY as an existence test and never subscripted by column name. LAYER TWO, the parent inserts carry `on conflict (snapshot_id) do nothing` and `on conflict (ruleset_id) do nothing`. Reason recorded: the guard is a read-then-insert, cw.snapshot carries no row-level security at all (0005:265-268 enables RLS on cw.run, cw.run_decision and cw.run_finding only) so the read is unfiltered and honest — but two concurrent FIRST runs against the same new library both see None, both insert, and the loser takes a unique violation that refusals.classify turns into a 409 'refused_on_merits' (refusals.py:91-94): the exact refusal-that-is-not-a-refusal the guard exists to prevent, moved into a narrower window rather than closed. ON CONFLICT degrades that race to a no-op. STATE EXPLICITLY, in the code comment and in the package record, that the MEMBER tables (cw.snapshot_member, cw.snapshot_ladder_rung, cw.ruleset_member) are governed by the block skip and NOT by ON CONFLICT — they carry no content-addressed key to conflict on, and adding one would be a second rule where the block skip is already the rule. Underlying reason for both layers: cw.snapshot and cw.ruleset are content-addressed primary keys (0005:64-76), so a second run against an unchanged library re-derives the same ids.
- runs.py run id: `run_id = uuid.uuid4().hex`. Decision recorded: NOT a content hash, because two runs of an unchanged manifest against an unchanged library would collide, and cw.run.run_id is a text primary key with no default (0005:80), so the server must supply it.
- runs.py: `engine_version=ENGINE_VERSION` imported from engine.model, passed explicitly to run_rows. cw.run.engine_version is NOT NULL with no default (0005:97-108) and is missing from the plan's Part A step 5 list.
- runs.py provenance counts: build the document in memory with `engine.docx.build_docx(checked, resolution)` solely to compute `ai_origin_chars = engine.docx.ai_originated_characters(data, [d.selected for d in resolution.decisions if d.selected])`, and pass `authored_chars=0`. The bytes are discarded and never stored. DOCUMENT-DATE NOTE, recorded beside the call and cross-referenced from WP-005: build_docx stamps `Dated: <today>` from `today or date.today()` (docx.py:113-123), so this in-memory build is date-dependent — but ai_originated_characters matches whole paragraphs against AI-drafted clause BODIES (docx.py:390-400), and the date paragraph is never one, so the stamp cannot move the number. This build therefore takes the default date deliberately and the bytes are never compared with anything. WP-005, which returns bytes to a caller, does NOT take the default — it passes today from cw.run.created_at.
- runs.py answer: the 200 body now carries `run_id` and `"recorded": true`, and keeps every field WP-002 established. The REQUEST body is unchanged.
- runs.py audit: the endpoint continues to write run_attempted / run_refused ONLY. cw.audit_run() emits run_recorded on insert (0005:251-263); an endpoint copy would put two disagreeing entries per act into an append-only chain with no UPDATE or DELETE grant.
- run-store.test.mjs: the tests at lines 296-318 currently read cw.run_contract and cw.run_summary with no role set — the owner, for whom cw.app_role() answers null (0013:84-94) — so after this migration they see nothing. Each must first become a role that may see the run (auditor is the honest choice for 'the run summary counts what matters'), using the `set role` idiom already used at lines 328-360, or the helpers in db/test/roles.mjs.
- executed.test.mjs:279 and writer-sql.test.mjs:264-270 read cw.run_contract with no role set and must likewise become a role first. executed.test.mjs already has a rowsAsLegal helper — use it.
- run-store.test.mjs: add — a requester recording a run against another requester's deal is refused BY THE DATABASE (both directions); legal_reviewer and legal_admin CAN record runs on deals they do not own (both directions); a requester inserting a run_decision or a run_finding onto another requester's run is refused; cw.run's read_scoped and 0013's administrator_reads policies are unchanged after this migration (asserted by reading pg_policy, not by inference); each of the SIX signed-in roles is asserted against cw.run_summary and cw.run_contract, AND THEY SPLIT FOUR AND TWO, NOT FIVE AND ONE. FOUR are scoped by the new WHERE clause and see exactly the rows cw.run's read policy would give them — requester, legal_reviewer, legal_admin, auditor. TWO are refused by GRANT and never reach the WHERE clause at all: VIEWER and ADMINISTRATOR. cw.run_summary and cw.run_contract are granted only at 0005_run_store.sql:293-296 (cw_auditor) and 0005:297 (cw_requester, cw_legal_reviewer, cw_legal_admin), and nowhere else in the tree — cw_viewer is as absent as cw_administrator. Assert BOTH of those two as refusals with words in them, matching what WP-004 asserts for GET /runs, and NOT as empty result sets: a test expecting zero rows would fail against a permission-denied refusal. The administrator half is also what keeps the deliberate absence of 'administrator' from the migration's WHERE clause honest rather than merely untested.
- writer-sql.test.mjs: extend for the two-run idempotency case — two runs against an unchanged library leave one cw.snapshot row, one cw.ruleset row and two cw.run rows.
- views-are-not-policies.test.mjs: add a named test — "the two run views scope themselves in their own WHERE clause" — iterating ['run_summary','run_contract'], fetching pg_get_viewdef and asserting /app_role\(\)|app_actor\(\)|owns_agreement/ matches, with a comment stating why the REVIEWED inventory was not widened (see open issues). This is the standing guard against the rewrite silently regressing.
- test_runs.py: a requester recording a run against another requester's deal is refused, in the database's words, through the endpoint; exactly one run_recorded event exists per run and it is the trigger's; cw.run.engine_version equals engine.model.ENGINE_VERSION; two runs against an unchanged library leave one snapshot row and two run rows; a mid-insert failure leaves cw.run empty; a snapshot carrying a rungless ladder is a 409 in run.py's own sentence and leaves cw.run empty (construct it by calling the persistence helper with a hand-built Snapshot, since LADDER_SQL's inner join means the registry cannot produce one); the administrator's refusal is UNCHANGED by this package and is asserted as such — WP-002 already establishes that an administrator is refused at the clause-library read (no SELECT on cw.clause_version_state, cw.ladder_health or cw.active_conflict_rule: 0002:352-354, 0003:669-670, 0004:237-238), which happens before the engine answers and therefore before anything this package added. After this package a second refusal also becomes possible at the cw.run insert, but the EARLIER one is the one a test will ever see, and the test says so. There is no 'gap' here to close; the earlier draft's claim that there was one is withdrawn.
- doorway/mutation_check.py: append the 5-tuple ("the snapshot block is re-inserted instead of skipped when it already exists", "doorway/runs.py", <the exact `if request.one("select 1 from cw.snapshot …` guard line as written>, "        if True:", "test_runs.py::test_two_runs_against_an_unchanged_library_share_one_snapshot"). Copy the find string out of the finished file, and re-run the harness — including WP-002's attempt-ordering row, whose file this package rewrites — after every edit to runs.py.
- test_runs.py: add test_a_concurrent_first_run_does_not_report_a_merits_refusal — two runs against the same brand-new library with the snapshot row inserted between the guard's read and the guard's insert (drive it by inserting the cw.snapshot row directly as a role that may, immediately before calling the persistence helper, which reproduces the loser's exact position). The run records normally: one cw.snapshot row, no 409, no 'refused_on_merits'. This is what layer two buys and it is otherwise untested.

**Implementation notes**

- The run-scoping migration carries THREE rules and all three are mandatory. Rule (b) was not in the plan's authorised list and is settled here rather than left conditional: without it rule (a) is bypassable one table over, hard constraint 2 forbids the endpoint fix, and this migration is the only file in the set that may carry a database rule. It is two policy pairs and two tests. The header records it as a discovered fact alongside (a) and (c), with its source line (0005:281-286), so the owner reads the reason in the migration rather than in a package note. THE OWNER PRE-BRIEF MUST SAY THREE, NOT TWO, AND MUST SAY IT BEFORE THIS PACKAGE BEGINS — see the prerequisite. The integrated plan's final_actions item 2 instructs putting 'migration 0024's TWO rules in front of the owner as a claim' (and it names the number as well as the count; both are now wrong, and the pre-brief carries the corrected number too); the owner would be briefed on two and shipped three, and a claim that is incomplete when it is made is not a claim.
- Provenance-count decision, recorded with BOTH alternatives so no implementer has to guess. engine.docx.provenance_counts(data, resolution, structural) (docx.py:403-415) requires an explicit `structural` list of the document's own literal strings, and the only thing that builds one is test code. Having the doorway build it would put a second copy of build_docx's literals in another file — the drift this repo has paid for repeatedly. So ai_origin_chars is computed honestly, and authored_chars is recorded as 0 by construction, justified by the engine's own standing assertion that build_docx emits zero authored characters rather than by not having looked. Alternative A: duplicate the structural vocabulary in the doorway and compute both figures. Alternative B: record both as zero, which engine/run.py:214-219 blesses only for 'a run that emitted no document' and which would make the plan's Part C sentence void. Either costs one function in runs.py and no migration.
- Decision recorded: the views-are-not-policies catalogue query is NOT widened. Measured against the migrated schema: cw_viewer can read 21 views, cw_requester 29, and the eight requester-only views are cw.concession_in_force, cw.concession_state, cw.position_current, cw.position_revival, cw.renewal_drift, cw.run_contract, cw.run_drift and cw.run_summary. cw.run_drift already scopes itself, and FIVE of the remaining six read person-scoped tables without scoping. Widening would fail the harness on five views owned by WS-6 and the concession family, inside a WS-1 package. The plan's own contingency is triggered and the named targeted test above is the narrow form.
- Note for whoever picks up that follow-on: the harness's reverse check would NOT have flagged cw.run_contract even after widening, because its risky-table set is textual and cw.run_decision's read policy scopes transitively through cw.run rather than naming app_actor or owns_agreement itself. The check has a blind spot for one-hop scoping.
- The migration must not touch cw.run's read_scoped policy or 0013's administrator_reads. Drop by name, create by name, and assert the survivors.
- Ordering inside the transaction matters: cw.run's insert fires cw.audit_run() (0005:251-263), which writes to cw.audit_event through cw.audit — a caller with no audit INSERT grant is refused there, which is the correct answer. NOTE, corrected: this is NOT why an administrator is refused. cw_administrator DOES hold INSERT on cw.audit_event (0013:257, policy at :275); it is refused far earlier, at WP-002's clause-library read, for want of SELECT on cw.clause_version_state, cw.ladder_health and cw.active_conflict_rule (0002:352-354, 0003:669-670, 0004:237-238). This package changes nothing about that.
- cw.run.created_at is a timestamptz defaulting to now() and run_rows does not emit it (run.py:154-219), so the database sets it. WP-005 reads it back to date-stabilise the document; nothing here needs to change for that.
- Note on mutation harness verdicts, for the package close: doorway/mutation_check.py has FOUR verdicts, not three — ok, MISS, SKIP and IMPRECISE (mutation_check.py:44-49, added 2026-07-27 for a lane that dies in its fixture because `alter role` is cluster-wide). All three non-ok verdicts are fatal. This package's new row AND WP-002's re-run row must each report literally 'ok'; an IMPRECISE read as a pass would record a fixture collision as a guarded guarantee, which matters most here because this package re-runs a row it did not author.
- Two roles never reach the new WHERE clause and it matters for how the tests are written: cw_viewer and cw_administrator hold no SELECT on cw.run_summary or cw.run_contract (0005:293-297 grants them to cw_auditor and to requester / legal_reviewer / legal_admin, and to nobody else). Their outcome is a permission-denied refusal, not a filtered empty set, so an assertion of `rows.length === 0` would be green for the wrong reason today and red for the right one the day somebody adds a grant. Assert the refusal.

**Validation checks**

- python -m pytest doorway/test_runs.py -q and python -m pytest doorway -q — green.
- node db/test/run-store.test.mjs — green, including the repaired owner-reads-the-view tests and the new both-directions policy tests.
- node db/test/writer-sql.test.mjs, node db/test/executed.test.mjs, node db/test/views-are-not-policies.test.mjs — all green.
- node db/test/run-all.mjs — green.
- python doorway/mutation_check.py — the new row reports 'ok' AND WP-002's attempt-ordering row still reports 'ok' after runs.py was rewritten; preflight reports no stale checks.
- node db/test/mutation-check.mjs — green.
- `ls backend/db/migrations/` shows that the directory gained EXACTLY THE ONE FILE THIS PACKAGE CLAIMS and no other, and that no two files in it share a number prefix — check the prefixes, not a hard-coded name, because an untracked owner file (0024_the_flag_is_enough.sql) is already in the directory and may or may not still be there. The number in the claimed file's name matches the number recorded in its header and in the package's completion note.
- git diff --stat backend/engine/ is empty.
- npm run verify from backend/ is green, including all three mutation harnesses.

**Acceptance criteria**

- A requester recording a run against another requester's deal is refused BY THE DATABASE, proven both through the endpoint in test_runs.py and directly in run-store.test.mjs; a legal_reviewer and a legal_admin CAN record runs on deals they do not own. Both directions, all three writing roles.
- A requester cannot append a run_decision or a run_finding to a run they cannot see — the run-scoping migration's rule (b), proven in run-store.test.mjs.
- Exactly one run_recorded event exists per run and it is the trigger's; the endpoint's own events remain run_attempted / run_refused.
- cw.run.engine_version equals engine.model.ENGINE_VERSION on every recorded run.
- Two runs against an unchanged library leave one cw.snapshot row, one cw.ruleset row and two cw.run rows, and the idempotency mutation row reports 'ok'.
- A failure part way through the inserts leaves cw.run empty — no half-written run exists.
- A snapshot whose ladder has no rungs refuses with engine/run.py's own sentence as a 409, never a 500, and leaves cw.run empty.
- Exactly one migration file exists that this package created; its number was re-verified against the directory listing at package start rather than taken from this plan; the number is recorded inside the migration header AND in the package's completion note; no two files under backend/db/migrations/ share a number prefix; and the migration records all three discovered facts and the constraint authorising it.
- cw.run's read_scoped policy and 0013's administrator_reads survive the migration unchanged, asserted against pg_policy.
- cw.run_summary and cw.run_contract are asserted for all SIX signed-in roles, split FOUR and TWO: requester, legal_reviewer, legal_admin and auditor are scoped by the new WHERE clause and see only their own rows; VIEWER and ADMINISTRATOR are refused both views by GRANT before the clause is consulted (0005:293-297 names four roles and neither of them), asserted as refusals with words in them and never as empty results. views-are-not-policies.test.mjs carries a named standing assertion that both views consult who is asking.
- The four existing owner-reads-a-run-view tests (run-store.test.mjs ×2, writer-sql.test.mjs, executed.test.mjs) now become a role first and are green.
- The provenance-count decision, the document-date note, the run-id scheme, the idempotency rule and the not-widening decision are each recorded in the package with their alternatives.
- WP-002's attempt-ordering mutation row still reports 'ok' after this package rewrites runs.py.
- npm run verify from backend/ is green, including all three mutation harnesses.
- The idempotency rule is TWO layers and both are recorded: the skip-when-present block guard (writer-sql.test.mjs:126-131's rule) and `on conflict do nothing` on the cw.snapshot and cw.ruleset parent inserts, so a concurrent first run degrades to a no-op instead of a false 409 'refused_on_merits'. The package states explicitly that the member tables are governed by the block skip and not by ON CONFLICT, and a named test covers the race.
- The run-scoping migration contains no unreachable role branch: 'administrator' appears in neither view's WHERE clause, the comment records the missing grant (0005:293-297) and the real gap (0013:296, 0013:321) as a named follow-on, and the owner pre-brief put THREE rules in front of the owner before the package began.
- The owner was asked, before the package began, whether 0024_the_flag_is_enough.sql is landing and whether it must land first, and his answer is recorded in the package alongside the number claimed. Neither this package nor any other landed, moved, renamed or deleted that file.

**Risks**

- The migration replaces policies on three tables, one of which also carries immutability triggers and 0013's administrator_reads. A wrong drop leaves a table momentarily without a write policy — which fails closed but surfaces as a confusing refusal. Mitigated by asserting both directions for all three writing roles AND asserting the other policies survive, plus a rollback note carrying the prior policy text verbatim.
- Recreating cw.run_contract adds a join to cw.run, changing the plan of a view four test sites already read. Mitigated by grepping for consumers before the rewrite (four found and all repaired in this package) and by asserting an auditor still sees every run through both views.
- POST /runs becomes a long multi-insert transaction with no executemany. A partial failure must roll the whole run back. Mitigated by one transaction and a named test that a mid-insert failure leaves cw.run empty.
- Content-addressed ids repeat across runs, so a naive insert produces a 409 that reads as a merits refusal. Mitigated by the skip-when-present guard, its named two-run test, and a mutation row that breaks the guard.
- Building the .docx inside POST /runs adds a document build to every run for one integer. Accepted and stated; the alternative is recorded and costs one function to switch.
- This package rewrites the file WP-002's mutation row keys on. Mitigated by re-running the harness after every edit and recording both rows' observed 'ok' at package close.
- Writing 'administrator' into the migration's view WHERE clause would look like completeness and would be unreachable text, since the role holds no grant on either view. Mitigated by leaving it out on purpose, commenting the missing grant in the migration, asserting the administrator's refusal in run-store.test.mjs, and carrying the gap as a named follow-on rather than closing a role boundary inside a scoping migration.
- THE NUMBER COLLISION IS TRUE ON DISK TODAY, NOT HYPOTHETICAL. backend/db/migrations/0024_the_flag_is_enough.sql exists and is untracked; a package that hard-codes 0024 would put two files under the same number, the bootstrap applies them in filename order with no gate against a duplicate, and the failure would surface as a migration that silently did not run or ran in the wrong order. Mitigated by resolving the number at package start rather than in this plan, by asking the owner first, by recording the number claimed in two places, and by a validation check that reads the directory's number prefixes instead of a hard-coded filename.

**Rollback / remediation**

- The migration is additive-by-replacement and destroys no data. The rollback note in the file states, verbatim, the prior policy text — `create policy write_scoped on cw.run for insert with check (cw.app_role() in ('requester','legal_reviewer','legal_admin'));` and the two identical run_decision / run_finding policies — and the prior definitions of cw.run_summary (0005:240-248) and cw.run_contract (0005:231-238), so a single follow-on migration can restore all five objects exactly.
- Doorway rollback: remove the persistence half of runs.py and revert the answer to WP-002's shape. Rows already recorded stay: cw.run is immutable with no DELETE grant and DELETE raises (0005:188-214). The rollback note says so rather than implying test data can be removed.
- If the two run views must be reverted without reverting the policies, restore them from the quoted text and re-point WP-004's reads at the base tables cw.run, cw.run_decision and cw.run_finding — the fallback the plan already names.
- If the owner's 0024_the_flag_is_enough.sql lands AFTER this package has claimed 0024, the remedy is to rename this package's migration to the next free number and re-run the bootstrap against a fresh schema — which is why the number is claimed as late as possible and recorded in two places. Nothing in this package's rollback touches the owner's file.

---

## WP-004 — Part B — read runs back: GET /runs, GET /runs/decisions, GET /runs/findings

**Objective.** Add exactly three parameterless read endpoints so a caller can see the runs the database says are theirs, each naming the policy or view clause it defers to, and move the read-count assertion in the same package so the surface cannot grow unnoticed.

**Prerequisites:** WP-003

**Scope**

- Three new entries in reads.READS.
- The mandatory move of test_reads.py's read-count assertion from 29 to 32.
- Per-role tests for all SIX signed-in roles — viewer, requester, legal_reviewer, legal_admin, auditor and administrator — on each of the three reads. The system has six roles, not five: cw_administrator is created at 0013_administrator.sql:52, cw.app_role() answers 'administrator' at 0013:92, and 0013:57-59 says 'Six application roles' in the schema comment itself.
- Recording why the reads take no parameter, and what the size consequence of that choice is.
- Recording the administrator's read contradiction — it holds an explicit read policy on cw.run and a SELECT grant on the three base tables, but no grant on either run view — and naming it as a follow-on rather than closing it here.

**Out of scope**

- A fourth 'drift' read over cw.run_drift. It would make the read-count assertion indeterminate and hide a decision inside a package; cw.run_drift is consumed by WP-006's currency gate and a drift read for the screens is a named follow-on.
- Any prototype/ file. api.jsx is owned by WP-007 and WP-008 only, so no file ships here without its test.
- Any parameterised read, and any bound or paging parameter. The reading-room control at reads.py:277-290 is preserved, not broken; the size consequence is recorded rather than solved.
- The document (WP-005) and execution (WP-006).
- WS-6: no negotiation reads.

**Target files**

- `C:\Users\MimoMac\repo\clausewerk\backend\doorway\reads.py (the READS dict)`
- `C:\Users\MimoMac\repo\clausewerk\backend\doorway\test_reads.py (the count assertion at line 100; the parametrised sweeps at lines 109-196)`

**Required changes**

- reads.py: add "GET /runs" = Read(sql="""select run_id, vendor, agreement_id, manifest_source, snapshot_id, ruleset_id, result_hash, engine_version, gate_open, overridden, created_by, created_at, decisions, unresolved, findings, blocking from cw.run_summary order by created_at desc""", rule="cw.run_summary scopes itself in its own WHERE clause, in the same words as cw.run's read_scoped policy (WP-003's run-scoping migration) — a view does not inherit the policy underneath it"). The column list is exactly cw.run_summary's own (0005:240-248).
- reads.py: add "GET /runs/decisions" = Read(sql="""select run_id, seq, category, severity, reason, baseline, clause_id, version, title, body, warning, suppressed from cw.run_contract order by run_id, seq""", rule="cw.run_contract scopes itself in its own WHERE clause via its join to cw.run (WP-003's run-scoping migration)"). The view already carries the same ORDER BY (0005:238); do not sort differently.
- reads.py: add "GET /runs/findings" = Read(sql="""select run_id, seq, rule_id, rule_version, severity, title, detail, refs from cw.run_finding order by run_id, seq""", rule="cw.run_finding read_scoped policy — visible exactly when its run is"). This one reads the RLS-bearing base table, not a view, because cw.run_finding carries its own policy (0005:283-286).
- reads.py: above the three, a comment recording TWO things. First the parameterless decision — the scoping is 'these runs, this person' and comes from the identity already bound to the connection; a run_id parameter is the same shape as the agreement_id parameter WP-U14 refused (reads.py:277-290), and a caller who wants one run filters what the policy already returned. Second the consequence, stated rather than discovered: these answers are unbounded, and for an auditor GET /runs/decisions is every decision of every run ever recorded in one JSON body. When that becomes a problem the answer is a bound written into the SQL here — a default `limit` with the most recent runs first — and never a caller-supplied filter, because the parameter is the thing being avoided.
- test_reads.py: change the assertion at line 100 from `assert len(READS) == 29` to `assert len(READS) == 32` and update the message from '25 ported plus 4 added on purpose' to name the three run reads added by WP-004. Same package, or npm run verify closes Part B red.
- test_reads.py: add test_the_run_reads_answer_for_every_signed_in_role — parametrised over ALL SIX signed-in roles (viewer, requester, legal_reviewer, legal_admin, auditor, administrator) × the three new keys, asserting the expected outcome per pair rather than naming one exemplar. The existing sweeps cover only administrator and requester, so nothing is inherited. The six expected outcomes for the administrator are NOT uniform and each is written into the table by hand with its source line: GET /runs is REFUSED (cw.run_summary is granted at 0005_run_store.sql:297 to cw_requester, cw_legal_reviewer and cw_legal_admin and at 0005:293-296 to cw_auditor, and to no other role in 0001-0023 — the refusal is a permission-denied from the database, in its own words); GET /runs/decisions is REFUSED for the same reason (cw.run_contract, same grant lines); GET /runs/findings ANSWERS, and answers with EVERY run's findings — 0013_administrator.sql:290-306 grants cw_administrator SELECT on cw.run, cw.run_decision and cw.run_finding, and cw.run_finding's read_scoped policy is `exists (select 1 from cw.run r where r.run_id = run_finding.run_id)` (0005:283-284), evaluated under row-level security where 0013:321's administrator_reads policy hands the administrator every run.
- reads.py: record the administrator contradiction in the READS rule notes, beside the three entries, as a stated fact rather than a discovered one. The database says two things at once: 0013:321 gives the administrator an explicit read policy on cw.run and 0013:296 gives it SELECT on cw.run, cw.run_decision and cw.run_finding, so it may read every run's rows — but neither cw.run_summary nor cw.run_contract is granted to it anywhere in 0001-0023, so the two view-backed reads refuse it. An administrator can therefore see every finding and no run summary. DECISION RECORDED IN THIS PACKAGE: this set does NOT close it. Closing it would be one line — `grant select on cw.run_summary, cw.run_contract to cw_administrator` in WP-003's run-scoping migration — and that is precisely the shape 0018_library_and_ladder_views.sql:170-190 already refused for this same role, in the repo's own words: the administrator's read boundary is an owner decision about the boundary of a role, and closing it inside a convenience migration would put a new control in the one place nobody would look for it. It is therefore a NAMED FOLLOW-ON in open issues, and the tests assert today's behaviour explicitly so that whoever closes it has to change a test on purpose.
- test_reads.py: add test_an_auditor_sees_every_run_and_a_requester_sees_only_theirs — with two requesters and two runs seeded through WP-003's path, the auditor's GET /runs returns both and each requester's returns one.
- test_reads.py: add test_a_viewer_is_refused_the_run_reads_and_never_gets_an_empty_list — the outcome is a refusal with words in it, in the shape test_reads.py already guards.
- test_reads.py: add test_an_administrator_sees_every_finding_and_neither_run_view — the two refusals and the one answer asserted together in one test, with the grant lines quoted in the test's own comment, so the contradiction is legible from the test rather than only from the package. The refusals are refusals with words in them and never empty lists.

**Implementation notes**

- These three reads are only safe because WP-003's run-scoping migration scoped the two views. If that migration is ever reverted, GET /runs and GET /runs/decisions must be re-pointed at cw.run and cw.run_decision (with the category label join re-done in reads.py) before the revert lands — the fallback the plan names. Say this in the comment above the entries so the dependency is visible from the file that depends on it.
- GET /runs/findings deliberately does not go through a view: there is none, and cw.run_finding's own policy already answers the question.
- No mutation row is added. The guarantee these endpoints carry — a refusal is never an empty list — is already guarded by the existing reads.py row, and the scoping guarantee is guarded in the database by WP-003's views-are-not-policies assertion.
- Six roles, not five, and the count is the schema's own: 0013_administrator.sql:57-59 comments cw as 'Six application roles: viewer, requester, legal_reviewer, legal_admin, auditor, administrator', and cw.app_role() (0013:84-94) answers all six and answers null for the database owner. Any sweep in this set that says 'five' is wrong; WP-002's loader-sql.test.mjs block and WP-003's per-role view assertions carry the same correction.
- Note on mutation harness verdicts, for the package close: doorway/mutation_check.py has FOUR verdicts, not three — ok, MISS, SKIP and IMPRECISE (mutation_check.py:44-49, added 2026-07-27 for a lane that dies in its fixture because `alter role` is cluster-wide). All three non-ok verdicts are fatal. This package adds no row, but its close reads the harness output, and 'not MISS' is not the same as 'ok'.

**Validation checks**

- python -m pytest doorway/test_reads.py -q — the count assertion is 32 and every new per-role test passes.
- python -m pytest doorway -q — green.
- python doorway/mutation_check.py — the existing reads.py row still matches exactly once; preflight clean.
- node db/test/run-all.mjs — green.
- git diff --stat prototype/ is empty; git diff --stat backend/engine/ is empty; backend/db/migrations/ gained no file from this package — asserted by comparing the listing against what WP-003 left behind, not by naming a number, since WP-003's migration number is resolved at ITS package start.
- npm run verify from backend/ is green, including all three mutation harnesses.

**Acceptance criteria**

- GET /runs, GET /runs/decisions and GET /runs/findings answer as the caller with no parameter of any kind.
- An auditor sees every run; a requester sees only runs they created or runs on their own deals; a viewer is refused.
- A refusal is a refusal and never an empty list, asserted for each of the three.
- Every one of the SIX signed-in roles — viewer, requester, legal_reviewer, legal_admin, auditor, administrator — has a stated expected outcome for each of the three reads, tested, not one exemplar role. The administrator's three outcomes are stated individually and are not uniform: refused on GET /runs and GET /runs/decisions (no grant on either view), answered on GET /runs/findings with every run's findings (0013:296 grant plus 0013:321's read policy on cw.run).
- test_reads.py's read-count assertion has moved from 29 to 32 in this package, with its message updated to name what was added.
- Each new entry names the policy or view clause it defers to, and passes the existing test that every read names the rule that decides who sees it.
- The unbounded-answer consequence and the bound-in-the-SQL remedy are recorded beside the parameterless decision.
- No prototype/ file is touched.
- npm run verify from backend/ is green, including all three mutation harnesses.
- The administrator's read contradiction — an explicit read policy on cw.run and a grant on all three base tables, no grant on either run view — is recorded in reads.py beside the entries, asserted by a named test, and carried as a named follow-on in open issues with the one-line closure written down and the reason it is not taken here (0018:170-190's own precedent for this role).

**Risks**

- Adding a fourth read later without moving the count assertion closes the bar red. Mitigated by the message naming exactly what the 32 is made of.
- The administrator run-view contradiction is an absence of a test rather than a failure of one, so nothing in the bar would have surfaced it. Mitigated by the six-role sweep, the named administrator test and the follow-on in open issues. Separately: someone will want a run_id parameter for the screens. Mitigated by the recorded decision above the entries and by WP-007 filtering what the policy already returned.
- The answers grow without limit, and an auditor's decisions read is the largest. Recorded with its remedy rather than left to be discovered as an unexplained payload.
- If WP-003's run-scoping migration is reverted, these reads silently return every run to every reader. Mitigated by the dependency note in reads.py and by WP-003's standing assertion, which fails first.

**Rollback / remediation**

- Remove the three READS entries, restore the count assertion to 29 and its original message, and delete the three new tests. Nothing else depends on this package except WP-005's round trip and WP-007's screens, both of which are later in the order.
- If the views must be abandoned rather than the reads, re-point GET /runs at cw.run and GET /runs/decisions at cw.run_decision joined to cw.category and cw.clause_version, and record in the rule note that the scoping is now the base table's policy.

---

## WP-005 — Part C — GET /runs/contract as a .docx download, and the service-level round trip

**Objective.** Produce the contract from a stored run and hand it back as a .docx, but only from a run that has just proved it reproduces — and prove, through the service and as the caller, that a run recorded through POST /runs rebuilds to the same snapshot id and the same result hash through GET /runs/contract.

**Prerequisites:** WP-001, WP-004

**Scope**

- A new module backend/doorway/documents.py and one dispatch line in app.py.
- Resolving the caller's selector to a run through the RLS-bearing cw.run, treating zero rows as a refusal.
- Rebuilding the stored snapshot from the base tables and refusing on SnapshotIncomplete or an id mismatch.
- Re-resolving from the stored manifest and refusing on a result-hash mismatch.
- build_docx for the bytes with a date taken from the run, a document_produced audit row carrying the SHA-256 of exactly those bytes, and nothing stored.
- The service-level round trip, named distinctly from db/test/writer-sql.test.mjs, with non-vacuity assertions.
- Two mutation rows: the rebuild-before-build guard, and the query selector deferred from WP-001.

**Out of scope**

- Storing the produced bytes anywhere. A pre-execution document is deterministic output of an immutable run, and this package makes that literally true by fixing the date it stamps.
- WS-8: the byte store, storage_uri, checkpoint signing. Nothing here writes a storage location.
- Calling POST /health-checks/rebuild from this endpoint. It merely makes real runs available to it.
- Execution (WP-006) and any change to cw.executed_document.
- Screens (WP-007) — api.jsx is not touched here.
- Reading cw.run_snapshot, which is granted to cw_auditor alone (0005:292-296).

**Target files**

- `C:\Users\MimoMac\repo\clausewerk\backend\doorway\documents.py (NEW)`
- `C:\Users\MimoMac\repo\clausewerk\backend\doorway\app.py (one dispatch branch beside WP-002's)`
- `C:\Users\MimoMac\repo\clausewerk\backend\doorway\test_documents.py (NEW)`
- `C:\Users\MimoMac\repo\clausewerk\backend\doorway\mutation_check.py (two new rows)`

**Required changes**

- app.py: add `if key == "GET /runs/contract":\n            return documents.contract(self._db, caller, query or {})` — this branch returns the Download or Response documents.py built, rather than re-wrapping a body, because a Download carries bytes and a content type that Response cannot hold.
- documents.py: `contract(db, caller, query) -> Response | Download`. Step 1 — read the selector: `run_id = (query or {}).get("run")`; absent or blank is Response(400, {'error':'refused','reason':'name the run to build','kind':'rejected'}). A run id containing a quote or a newline is refused the same way, because WP-001's _send_download quotes the filename and does not sanitise it.
- documents.py step 2 — resolve the run through the RLS-bearing table, never through a view and never through a snapshot table. USE rows(), NOT one(): db.Request.one() returns a plain tuple with no row factory (db.py:108-113) and cannot be subscripted by column name, while rows() labels from cursor.description (db.py:99-107). Write `found = request.rows("select run_id, agreement_id, vendor, value, manifest, snapshot_id, ruleset_id, result_hash, engine_version, created_at from cw.run where run_id = %s", (run_id,))` and take `run = found[0]` after the emptiness check. An empty list is a REFUSAL — Response(403, {'error':'refused','reason':'no run by that name is yours to build','kind':'not_permitted'}) — never an empty body and never partial bytes. State this rule once in the module docstring: one() is an existence test, rows() is how columns come back.
- documents.py step 3 — rebuild from the BASE tables: `select clause_id, version, selectable from cw.snapshot_member where snapshot_id = %s`; the matching clause rows from cw.clause_version joined to cw.clause and cw.category for the label; and `select category_key, severity, rung, clause_id, version, is_floor from cw.snapshot_ladder_rung where snapshot_id = %s`. Then engine.run.snapshot_from_rows(member_rows, clause_rows, ladder_rung_rows, categories=manifests.categories_for(request)).
- documents.py step 4 — the guard this package exists for: `if rebuilt.snapshot_id != run["snapshot_id"]: return Response(409, {'error':'refused','reason':f"this run does not rebuild: stored {run['snapshot_id']}, rebuilt {rebuilt.snapshot_id}",'kind':'refused_on_merits'})`, and catch engine.run.SnapshotIncomplete → 409 carrying str(incomplete) unchanged. NO BYTES are produced on either path.
- documents.py step 5 — RECONSTRUCT THE MANIFEST EXACTLY THIS WAY AND NO OTHER: `manifest = manifests.manifest_from(run["manifest"])`, which reads only vendor, value, source and risks (manifests.py:70-102). cw.run.manifest stores the ALREADY-CHECKED manifest — risks filtered, severities coerced, with `dropped` and `coerced` recorded alongside as history (run.py:170-202). check_manifest is NOT re-run on the reconstruction, AND THE REASON MATTERS BECAUSE THE OBVIOUS ONE IS WRONG. It is NOT that re-checking empties the coerced set: engine.resolution.resolve reads only manifest.risks and manifest.vendor (resolution.py:70-99) and result_hash is content_hash over each decision's category, severity, selected, reason and suppressed — manifest.coerced never enters the hash at all, so an emptied coerced set would change nothing. THE REAL HAZARD IS THE REGISTRY MOVING UNDERNEATH A STORED RUN: check_manifest REMOVES a risk whose category the registry no longer defines (manifest.py:88-116, which drops it into `dropped` and never lets it reach resolution). Re-running it against TODAY's cw.category would therefore drop a risk that was legitimate when the run was recorded, change the decision set, and change result_hash — so the rebuild would fail for a library change rather than for tampering, which is the one thing this endpoint's refusal must never mean. Keep the instruction; this is its reason. State it in the comment beside the call. Then `resolution = engine.resolution.resolve(manifest, rebuilt)` and `if resolution.result_hash != run["result_hash"]:` refuse with a 409 naming both hashes and produce no bytes — the same guarantee POST /health-checks/rebuild checks on demand (writes.py:487-491), enforced at the moment somebody asks for paper.
- documents.py step 6 — `data = engine.docx.build_docx(manifest, resolution, today=run["created_at"].date())`; `digest = engine.docx.sha256_of(data)`. The explicit `today` is load-bearing and commented: build_docx stamps `Dated: <today>` from `today or date.today()` (docx.py:113-123), so without it the same immutable run would produce different bytes and a different digest on two different days, and two document_produced rows for one run would legitimately disagree in an append-only chain. Taking the date from cw.run.created_at makes a run's paper byte-stable forever.
- documents.py step 7 — audit BEFORE returning, inside the same transaction: `request.write("select cw.audit('document_produced', %(run_id)s, %(payload)s::jsonb)", ...)` with a payload carrying sha256 = digest, byte_size = len(data), snapshot_id, result_hash, 'dated' = the stamped date, and 'pre_execution': true. If the audit insert is refused, the transaction rolls back and no bytes are returned.
- documents.py step 8 — return Download(200, data, DOCX_TYPE, f'{run_id}.docx'), importing DOCX_TYPE from doorway.app rather than retyping the MIME string.
- documents.py: `except psycopg.Error as error:` → classify(error) and return Response(refused.status, refused.as_body()), unchanged.
- test_documents.py: THE SERVICE-LEVEL ROUND TRIP — test_a_run_recorded_through_the_service_rebuilds_through_the_service. Named in the docstring as distinct from db/test/writer-sql.test.mjs's engine-level namesake ('the round-tripped snapshot id is unchanged'): this one goes through POST /runs and GET /runs/contract over the wire, as the same caller, with the doorway's own connections. It asserts the snapshot id in the download's audit payload equals the one POST /runs answered with, AND that the recomputed result_hash equals cw.run.result_hash, AND asserts non-vacuity first — at least one cw.snapshot_member row, at least one cw.snapshot_ladder_rung row, and rules_consulted >= 1 — so it cannot pass against a thin snapshot.
- test_documents.py: test_two_downloads_of_one_run_are_byte_identical — the same run downloaded twice returns the same bytes and the same digest, which is what the explicit date buys.
- test_documents.py: test_a_caller_naming_a_run_that_is_not_theirs_is_refused_with_no_bytes.
- test_documents.py: test_a_snapshot_that_does_not_rebuild_produces_no_document — force a mismatch by inserting an extra cw.snapshot_member row as the owner, and assert the refusal names BOTH the stored and the rebuilt id and the response carries no bytes.
- test_documents.py: test_a_stored_member_with_no_clause_row_refuses_with_the_engine_s_sentence — assert the reason is exactly what SnapshotIncomplete raised.
- test_documents.py: test_document_produced_carries_the_digest_of_the_exact_bytes_returned — hash the response body in the test and compare to the audit payload.
- test_documents.py: test_when_the_audit_is_refused_no_bytes_are_returned — an auditor, who holds SELECT on every run but no INSERT on cw.audit_event (0001:339-346, 0013:257), is refused the download by the chain.
- test_documents.py: test_nothing_is_stored — cw.executed_document and every other table are unchanged after a download.
- mutation_check.py: append ("the rebuild is not checked before the document is built", "doorway/documents.py", <the exact snapshot-id mismatch guard block as written>, "        if False:", "test_documents.py::test_a_snapshot_that_does_not_rebuild_produces_no_document").
- mutation_check.py: append ("the query selector is discarded before it reaches the app", "doorway/server.py", <the exact selector-building line WP-001 wrote in do_GET>, "        selector = {}", "test_documents.py::test_a_run_recorded_through_the_service_rebuilds_through_the_service") — the row WP-001 deferred, now that something consumes it.

**Implementation notes**

- Decision recorded — WHICH HASH GOES WHERE, written down so no implementer conflates them. The document digest (engine.docx.sha256_of over the returned bytes, docx.py:167) goes ONLY into the document_produced audit payload and identifies THIS RENDERING. POST /health-checks/rebuild takes the run's RECOMPUTED result_hash, because writes.py:487-491 states cw.record_rebuild_spot_check() compares against cw.run.result_hash, which is Resolution.result_hash over decisions. This endpoint does not call the spot check; it makes real runs available to it for the first time. With the date fixed from cw.run.created_at the rendering and the run coincide in practice, but the two hashes still answer different questions and the docstring says so.
- Decision recorded — AN AUDITOR CANNOT DOWNLOAD. The audit row is written through the caller's own connection, and cw_auditor holds no INSERT on cw.audit_event. The house pattern wins: auditing outside the caller's transaction would reintroduce the privileged path db.py exists to make impossible. Recorded with its named test rather than discovered in an acceptance sweep; the owner may reverse it later and the reversal is a schema grant, not endpoint code.
- Decision recorded — the rebuild reads BASE TABLES. cw.snapshot, cw.snapshot_member, cw.snapshot_ladder_rung, cw.ruleset and cw.ruleset_member carry NO row-level security at all (0005:265-268 enables it on cw.run, cw.run_decision and cw.run_finding only) while holding select+insert grants to three roles (0005:288-296). All scoping of a rebuild therefore rests on resolving run_id through cw.run FIRST — which is exactly why zero rows there is a refusal rather than a filter, and why a negative test for another caller's run is named.
- Decision recorded — after execution, this endpoint still rebuilds from the immutable run, and both the response body and the audit payload name it a pre-execution rebuild. The signed instrument's bytes remain authoritative, as 0006_executed_agreements.sql states in its own words.
- test_documents.py uses the running-server client pattern from test_manifests.py so the round trip genuinely crosses the socket, the query string and WP-001's transport.
- Note on mutation harness verdicts, for the package close: doorway/mutation_check.py has FOUR verdicts, not three — ok, MISS, SKIP and IMPRECISE (mutation_check.py:44-49, added 2026-07-27 for a lane that dies in its fixture because `alter role` is cluster-wide). All three non-ok verdicts are fatal. Both of this package's rows must report literally 'ok'.

**Validation checks**

- python -m pytest doorway/test_documents.py -q — every named test passes, the round trip and the byte-stability test included.
- python -m pytest doorway -q — green.
- python doorway/mutation_check.py — both new rows report 'ok'; preflight clean.
- node db/test/run-all.mjs — green (nothing in db/ changed).
- git diff --stat backend/engine/ is empty; backend/db/migrations/ gained no file from this package — asserted by comparing the listing against what WP-003 left behind, not by naming a number, since WP-003's migration number is resolved at ITS package start; git diff --stat prototype/ is empty.
- npm run verify from backend/ is green, including all three mutation harnesses.

**Acceptance criteria**

- No document is produced from a run that did not just prove it reproduces: a forced id mismatch refuses with BOTH the stored and the rebuilt id in the sentence and returns no bytes at all, and a result-hash mismatch refuses naming both hashes.
- A caller naming a run that is not theirs is refused in the database's terms with no bytes; a run lookup returning zero rows is a refusal, never an empty or partial document.
- A stored member with no clause row refuses with SnapshotIncomplete's own sentence, unchanged.
- The rebuild reads cw.snapshot_member, cw.snapshot_ladder_rung and cw.clause_version, and never cw.run_snapshot.
- Two downloads of the same run return byte-identical documents, because build_docx is given today=cw.run.created_at.date() rather than the default.
- The manifest is reconstructed with manifest_from over the stored risks and check_manifest is NOT re-run, with the correct reason written beside the call — re-checking against today's cw.category would DROP a risk whose category has since been removed (manifest.py:88-116) and so change the decision set and result_hash, making the rebuild fail for a library change rather than for tampering; the coerced set is NOT the reason, because manifest.coerced never enters result_hash (resolution.py:70-99). The round trip asserts the recomputed result_hash equals cw.run.result_hash.
- Columns are read with rows(), never by subscripting one()'s tuple, and the rule is stated once in the module docstring.
- document_produced carries the SHA-256 of the exact bytes returned plus the stamped date, and nothing is stored.
- When the audit insert is refused the transaction rolls back and no bytes are returned — proven with an auditor.
- The value that would be fed to POST /health-checks/rebuild is the recomputed result_hash and never the document digest, with both named side by side in documents.py.
- The service-level round trip exists, is named as distinct from db/test/writer-sql.test.mjs, runs as the caller through both endpoints over the wire, asserts the snapshot ids and the result hashes match, and asserts non-vacuity (at least one snapshot member, at least one ladder rung, at least one rule consulted).
- Both mutation rows report 'ok'.
- npm run verify from backend/ is green, including all three mutation harnesses.

**Risks**

- This is the first place a caller-supplied identifier reaches tables with no row-level security, and the audit chain would record any resulting download as legitimate. Mitigated by resolving through cw.run first, treating zero rows as a refusal, and a named negative test for another caller's run.
- The two hashes are easy to confuse and one of them is fed to a health check that would then always disagree. Mitigated by naming both in the module docstring and by the decision recorded above.
- db.Request.one() returns an unlabelled tuple, and every column read by name through it is a TypeError. Mitigated by using rows() throughout and stating the rule once.
- Recording document_produced through the caller's connection denies the download to auditors. Recorded as a decision with a test, not discovered later.
- documents.py returns two different types from one function; a careless refactor could return a Download where a Response is expected, which server._respond would then try to json.dumps. Mitigated by WP-001's isinstance branch being first and by the byte-identity test in test_server.py.
- A wrong rationale is worse than none: an implementer who checks 'the coerced set would be empty' will find it false against resolution.py:70-99 and may 'fix' it by re-running check_manifest, which introduces the very hazard the instruction was protecting against — a download refusing because the category registry moved, reported as a run that does not reproduce. Mitigated by carrying the true reason (manifest.py:88-116) in the package and in the code comment.

**Rollback / remediation**

- Delete backend/doorway/documents.py and backend/doorway/test_documents.py, remove the dispatch branch, and remove the two mutation rows. WP-001's transport stays in place, unused, until WP-007.
- If the owner switches to a body-carried selector, this package changes shape rather than reverting: documents.contract reads the run id from the body, the query-selector mutation row is deleted with its reason recorded, and WP-001's do_GET capture is removed.
- Nothing produced by this package is stored, so there is no data to unwind — only the document_produced rows in the append-only chain, which stay by design.

---

## WP-006 — Part D — POST /agreements/execute, with the deal binding, the currency gate and the validation gate

**Objective.** Turn filing an executed agreement — today only the database owner can do it — into a governed endpoint that inserts exactly what the hand-inserted demo row inserted, through the caller's own connection, with the run bound to the agreement and both gates evaluated before the insert that freezes the record.

**Prerequisites:** WP-005

**Scope**

- A new module backend/doorway/executions.py and one dispatch line in app.py.
- The insert set: cw.executed_agreement, cw.executed_document at doc_seq 0 with kind 'agreement', and cw.executed_signatory rows.
- The deal-binding check, the currency gate and the validation gate, all evaluated BEFORE the cw.executed_agreement insert.
- execution_attempted / execution_refused audit events — and no endpoint-side agreement_executed.
- test_executions.py and extensions to backend/db/test/executed.test.mjs.
- Four mutation rows, including the two the plan mandates by name.
- The first true GET /reading-room/clauses rows, against a real executed agreement with a live share.

**Out of scope**

- cw.signature_certificate. THIS ENDPOINT NEVER WRITES IT — see the recorded decision. The certificate is bytea NOT NULL with octet_length > 0 (0006:312-330) and server.py reads JSON only under MAX_BODY = 1_000_000 (server.py:56); settled decision 2 requires only the hash and the signatories at filing and makes the certificate a later attachment. The whole act, including its byte transport, is the subject of the named follow-on in open issues. executions.py refuses a body carrying a `certificate` field with a 400 saying so, rather than silently ignoring it.
- Any UPDATE of cw.agreement.status. cw.agreement_execute() owns it (0006:194-212) and cw.agreement has no UPDATE policy or grant for any role.
- Any endpoint-side agreement_executed or document_frozen event: cw.audit_executed() emits both (0006:249-268).
- Any change to the override apparatus itself. This endpoint READS cw.override_passes and writes nothing there; approving, socialising and deciding stay in the existing WRITES entries (writes.py:295-320).
- WS-8: the byte store, the e-signature provider, obtaining certificates automatically. What storage_uri carries before WS-8 exists is recorded here, not solved.
- WS-4: no scheduler and no clock. The currency gate is a check at an act.
- WS-6: no negotiation close-out act.
- Amendments, exhibits and counterparts (doc_seq > 0). This endpoint files the agreement itself; the agreement_is_first constraint (0006:81-83) keeps the door open.
- Screens (WP-008).

**Target files**

- `C:\Users\MimoMac\repo\clausewerk\backend\doorway\executions.py (NEW)`
- `C:\Users\MimoMac\repo\clausewerk\backend\doorway\app.py (one dispatch branch)`
- `C:\Users\MimoMac\repo\clausewerk\backend\doorway\test_executions.py (NEW)`
- `C:\Users\MimoMac\repo\clausewerk\backend\doorway\mutation_check.py (four new rows)`
- `C:\Users\MimoMac\repo\clausewerk\backend\db\test\executed.test.mjs (extend; role helpers and rowsAsLegal are already in the file)`

**Required changes**

- executions.py: `execute(db, caller, body) -> Answer`, in the manifests.py/runs.py shape and NOT a writes.WRITES entry (writes.Write runs exactly one statement, writes.py:119-147).
- executions.py: field validation at the boundary, each missing field a 400 naming it — agreement_id, run_id, executed_on, effective_on, filename, byte_size, sha256, storage_uri, signed_on, and signatories (a non-empty list of {name, party, method, signed_on, title?}). term_end, agreement_kind (default 'standalone') and parent_agreement_id are optional. A `certificate` field is refused with a 400 naming the follow-on, per out_of_scope.
- executions.py: write the attempt row FIRST — `select cw.audit('execution_attempted', %(agreement_id)s, %(payload)s::jsonb)` — so the audit grant decides who may use the endpoint, uniformly, exactly as manifests.py:203-222 argues.
- executions.py: READ THE RUN WITH rows(), NOT one(). db.Request.one() returns an unlabelled tuple (db.py:108-113); rows() labels columns from cursor.description (db.py:99-107). `found = request.rows("select run_id, agreement_id, gate_open, overridden from cw.run where run_id = %s", (run_id,))`; an empty list is a refusal in the database's terms — the run is not visible to this caller.
- executions.py DEAL BINDING, evaluated before every other gate: refuse with 409 when `run["agreement_id"] is None` — 'this run is not tied to a deal, so it cannot be filed against one' — and refuse with 409 naming BOTH when `run["agreement_id"] != agreement_id` — 'run {run_id} was recorded against {run_agreement}, not {agreement_id}'. cw.executed_agreement.run_id is a plain nullable FK to cw.run with no constraint tying it to agreement_id (0006:20-25), and after WP-003's run-scoping migration a legal_reviewer or legal_admin may record a run against any deal or none, so without this check Legal could file AG-2 citing a run recorded against AG-1, permanently, with cw.audit_executed recording it as legitimate. Refusing a null-agreement run is the settled decision of 2026-07-27 ('every assembly run belongs to a deal') applied at the only act that consumes one; the rule is stated in the module docstring with that decision named.
- executions.py CURRENCY GATE (the plan's 'expiry re-check'), evaluated BEFORE any insert into cw.executed_agreement. THE PREDICATE IS `s.selectable = false` AND NOT `s.state <> 'active'` — READ THIS BEFORE WRITING THE QUERY. cw.clause_version_state carries BOTH columns and they disagree on purpose: `state` answers 'superseded' the moment ANY cw.supersession row exists, while `selectable` — the column cw.selectable_clause is defined from, and therefore the one the resolution engine's own pool is drawn from — stays TRUE for a run-off predecessor until it expires on its own (0002_clause_registry.sql:253-258, whose comment two lines above says it in the schema's own words: 'A run-off predecessor is superseded but still usable until it expires on its own'). A gate written on `state` would refuse execution of a run whose pinned clause the engine itself still considers selectable — a false refusal in the one act cw.executed_agreement's freeze triggers make irreversible. THE PRIMARY QUERY IS THEREFORE: `select d.clause_id, d.version, s.state, s.selectable from cw.run_decision d join cw.clause_version_state s on s.clause_id = d.clause_id and s.version = d.version where d.run_id = %s and d.clause_id is not null and s.selectable = false` — equivalently, if the enumeration is preferred for readability, `s.state in ('retired','expired') or (s.state = 'superseded' and s.selectable = false)`, which is the same set written out; pick one, comment which and why. cw.clause_version_state derives superseded, retired, expired and active in one place (the view opens at 0002:221; the `case … end as state` expression is 0002:247-252 and the `selectable` expression 0002:253-258) and computes selectability beside them, so this single query is the complete currency check. cw.run_drift is then consulted as CORROBORATION ONLY, for the successor_version detail it already computes (0022:173-208), and never as the gate: it inner-joins cw.agreement, filters `a.status <> 'executed'`, emits only rows already flagged, and declares itself REPORTING ONLY. Any row from the primary query refuses with 409 naming the clause and its state: 'this run carries {clause_id}@v{version}, which is {state} — it cannot be executed as it stands'.
- executions.py: the ordering constraint is load-bearing and must be commented — the cw.executed_agreement insert fires cw.agreement_execute(), which moves the agreement to 'executed' (0006:194-212), and cw.run_drift then returns nothing for that run. A gate evaluated after the insert passes vacuously, forever.
- executions.py VALIDATION GATE — READ THIS PARAGRAPH BEFORE WRITING THE CODE. cw.run.gate_open and cw.run.overridden are written once at insert and can NEVER change: cw.run carries run_immutable no_edit/no_delete/no_truncate triggers (0005:188-214) and holds select+insert grants only (0005:288-291), and nothing in migrations 0001-0023 updates cw.run. So `overridden` is NOT the answer to 'was this gate opened' — the human override apparatus lives entirely in 0015: an approval is one row per individually approved finding, and cw.override_passes is the load-bearing view of what an approval actually lets past (0015:364-374, rescoped at 0019:95-105). The gate is therefore: (1) `if run["gate_open"]:` proceed — gate_open is the trigger for consulting the override tables, never the answer; (2) otherwise read the blocking findings, `select seq, rule_id, rule_version, title from cw.run_finding where run_id = %s and severity = 'High' order by seq`; (3) read the passes, `select finding_ref from cw.override_passes where run_id = %s` — the view is already scoped to the caller (0019) and already requires decision = 'approved' plus a socialisation row, and cw.decide_override_finding refuses a decision before the review window closes (0015:314-318), so window closure is enforced upstream and this endpoint does not re-implement it; (4) refuse with 409 when ANY blocking finding has no matching pass, naming the finding: 'this run is blocked by {rule_id}@v{rule_version} ({title}) and no approved override covers it'.
- executions.py THE FINDING REFERENCE, stated because it is otherwise an unresolved decision hidden inside a package: cw.override_finding.finding_ref is free text (0015:78-99) and cw.run_finding has no ref column of its own, so the mapping must be fixed somewhere and this is the place. Define one module-level function — `def finding_ref(row) -> str: return f"{row['rule_id']}@v{row['rule_version']}"` — matching engine ConflictRule.ref (validation.py:49-51) and cw.conflict_rule's own audit vocabulary (0004:190). A pass matches when `finding_ref = %(ref)s or finding_ref like %(suffix)s` with suffix = '%:' || ref, which admits the optional `category:` prefix 0015's watcher matching relies on (0015:220-228); rule_id is constrained to `^[A-Z]{2,4}-[0-9]{3}$` (0004:40) and contains no colon, so the match is deterministic. Matching is fail-closed: a reference that does not match refuses. WP-007 makes the requester's override form emit this exact reference; the consequence for category-watcher matching is recorded in open issues with a named follow-on.
- executions.py inserts, in this order, all inside the caller's single transaction after all three gates have passed: (1) `insert into cw.executed_agreement (agreement_id, run_id, executed_on, effective_on, term_end, agreement_kind, parent_agreement_id, signature_evidence) values (...)`; (2) `insert into cw.executed_document (agreement_id, doc_seq, kind, filename, byte_size, sha256, storage_uri, signed_on) values (%(agreement_id)s, 0, 'agreement', ...)` — kind is NOT NULL against a closed set and the constraint agreement_is_first requires (kind='agreement') = (doc_seq=0) (0006:60-83), and both planners' insert sets omitted it; (3) one `insert into cw.executed_signatory (agreement_id, ordinal, name, party, method, signed_on, title)` per signatory.
- executions.py: the endpoint writes execution_attempted / execution_refused and NOTHING ELSE into the chain. cw.audit_executed() emits agreement_executed on insert into cw.executed_agreement and document_frozen on insert into cw.executed_document (0006:249-268); an endpoint copy would put two disagreeing entries per act into a chain with no UPDATE or DELETE grant.
- app.py: `if key == "POST /agreements/execute": answered = executions.execute(self._db, caller, body or {}); return Response(answered.status, answered.body)`.
- test_executions.py: test_a_requester_is_refused_by_the_database, test_a_viewer_is_refused, test_an_auditor_is_refused — all by the 0006 legal_writes policies and grants, not by endpoint logic; and test_a_legal_reviewer_can_file and test_a_legal_admin_can_file.
- test_executions.py: test_a_run_recorded_against_another_deal_cannot_be_filed_here — the refusal names both agreements and cw.executed_agreement stays empty.
- test_executions.py: test_a_run_with_no_deal_cannot_be_filed — the fixture inserts the run directly as a legal_reviewer with a null agreement_id, which after WP-003's run-scoping migration is the ONLY way such a run can exist (POST /runs requires agreement_id since WP-002, and that migration's requester branch demands ownership); the test says so in a comment.
- test_executions.py: test_a_run_carrying_a_superseded_clause_is_refused_naming_the_clause — fixture: a cw.supersession row with predecessor_disposition = 'retire_now' (0002:205-206) against a clause the run selected.
- test_executions.py: test_a_run_carrying_a_retired_clause_is_refused_naming_the_clause — fixture: retired = true on the selected clause_version.
- test_executions.py: test_a_run_off_supersession_does_not_refuse_execution — THE MANDATORY NEGATIVE DIRECTION of the currency gate, without which the gate is indistinguishable from one that refuses every superseded clause. Fixture: a cw.supersession row with predecessor_disposition = 'run_off' (0002:205-206) against a clause the run selected, whose version is not retired and whose expires_on is null or in the future — so cw.clause_version_state answers state = 'superseded' AND selectable = true (0002:247-252 for `state`, 0002:253-258 for `selectable`). The execution SUCCEEDS: cw.executed_agreement holds the row and no refusal is raised. The test comment states the reason in the schema's own words — a run-off predecessor is superseded but still usable until it expires on its own — so a later author cannot 'tighten' the predicate back to `state <> 'active'` without this test going red.
- test_executions.py: test_a_closed_gate_with_no_override_is_refused — the refusal names the blocking finding's rule and title.
- test_executions.py: THE POSITIVE DIRECTION, without which the gate is a dead end — test_a_closed_gate_with_every_blocking_finding_approved_is_admitted_and_filed. Fixture: record a run whose gate closes; open an override request as the requester through cw.open_override_request with finding_ref built by executions.finding_ref for each blocking finding; socialise it; wait out the window by setting the socialisation window in the fixture as the existing override.test.mjs fixtures do; approve every finding as a legal_reviewer other than the requester; then file. The execution succeeds, cw.executed_agreement holds the row, and cw.run.overridden is still false — proving the gate reads the override tables and not the immutable run column.
- test_executions.py: test_a_partially_approved_override_is_still_refused — two blocking findings, one approved, the other named in the refusal.
- test_executions.py: test_all_gates_run_before_the_agreement_is_filed — after each refusal, cw.executed_agreement holds no row and cw.agreement.status is unchanged.
- test_executions.py: test_exactly_one_agreement_executed_event_exists_per_execution and test_the_endpoint_writes_only_execution_attempted_and_execution_refused.
- test_executions.py: test_the_status_moves_by_the_trigger_and_never_by_the_endpoint — grep executions.py for 'update cw.agreement' and assert absence, and assert the status is 'executed' after filing.
- test_executions.py: test_a_certificate_in_the_body_is_refused_with_the_reason — the endpoint does not silently ignore it.
- test_executions.py: test_the_reading_room_returns_rows_for_the_first_time — the real precondition, not a shortcut: an executed agreement whose run_id is set (cw.reading_room_clause joins on e.run_id, 0017:207-215) PLUS a live cw.agreement_share row for a viewer (0017:186-196). The run is made by POST /runs; WP-U15's instruction stands and travels with this test — do not fake the run.
- executed.test.mjs: extend with the insert set this endpoint uses, executed as cw_legal_reviewer through the existing role helpers, asserting it matches what the hand-inserted demo row inserted and that cw.executed_document.kind = 'agreement' at doc_seq 0.
- mutation_check.py: append ("the expiry re-check at signature is not performed", "doorway/executions.py", <the exact currency-gate refusal block as written>, "        pass", "test_executions.py::test_a_run_carrying_a_superseded_clause_is_refused_naming_the_clause").
- mutation_check.py: append ("the validation gate is not checked at execution", "doorway/executions.py", <the exact blocking-finding refusal block as written>, "        pass", "test_executions.py::test_a_closed_gate_with_no_override_is_refused").
- mutation_check.py: append ("an approved override is never consulted", "doorway/executions.py", <the exact `select finding_ref from cw.override_passes where run_id = %s` statement as written>, "select finding_ref from cw.override_passes where false", "test_executions.py::test_a_closed_gate_with_every_blocking_finding_approved_is_admitted_and_filed"). Without this row the gate row above proves only the half that already works — a gate that refuses everything reports 'ok' for it.
- mutation_check.py: append ("the run is not bound to the agreement being filed", "doorway/executions.py", <the exact deal-binding refusal block as written>, "        pass", "test_executions.py::test_a_run_recorded_against_another_deal_cannot_be_filed_here").

**Implementation notes**

- Recorded, because it changes what the test can honestly claim: cw.clause_version.expires_on is IMMUTABLE — cw.clause_version_immutable() raises restrict_violation on any change to it and clause_version_no_edit fires before update (0002:126-158) — and an already-expired version is not selectable, so it is never pinned into a run in the first place. A date-based lapse between run and signature therefore cannot be induced in a test. The gate is specified against CURRENCY AS A WHOLE via cw.clause_version_state, reading its `selectable` column rather than its `state` column — `state` covers superseded, retired AND expired (0002:247-252) but over-answers on a run-off supersession, which `selectable` gets right (0002:253-258). The three inducible fixtures are named in the acceptance — retire_now refused, retired refused, run_off NOT refused — and the expired branch is checked in code but recorded as the branch no test can induce.
- Recorded — WHY THE VALIDATION GATE DOES NOT READ cw.run.overridden. Both cw.run.gate_open and cw.run.overridden are write-once (0005:110-114 with the immutability triggers at 188-214 and select+insert grants at 288-291); nothing in the schema updates them. cw.record_override_gate() (0015:396-409) records that a gate was opened by writing a human_override_gate audit event and opens nothing. The only durable statement of 'this finding was let past' is cw.override_passes. A gate written against cw.run.overridden would make every engine-blocked run permanently unexecutable no matter what Legal approved, and WP-U10's whole workflow would terminate in an audit row. This paragraph belongs in executions.py, not only in the package.
- Recorded — the window is not re-checked here. cw.override_passes joins the socialisation row and requires decision = 'approved', and cw.decide_override_finding refuses any decision taken before window_closes (0015:314-318), so an approved finding cannot exist before its window closed. Re-implementing the window in the endpoint would be a second copy of a rule the schema already enforces.
- Decision recorded — ENDPOINT OR TRIGGER for the gates: endpoint, with the comparison written down so the next author has a rule rather than a precedent. Hard constraint 2 governs WHO may act; these gates govern WHETHER an act is currently valid, which is business validity and not permission. The database still decides who may file (0006 legal_writes) and the endpoint adds nothing to that. If a later owner wants the gates in a trigger, the code moves wholesale and the tests move with it.
- Decision recorded — WHAT storage_uri CARRIES BEFORE WS-8. cw.executed_document.storage_uri is NOT NULL (0006:73) and no byte store exists. The endpoint requires the caller to supply it and writes it verbatim; the package records the synthetic scheme used in development under the placeholder-content rule, adds a comment beside the field list, and states explicitly that the POST /health-checks/document round trip is NOT claimed to work until WS-8 exists. Nothing here invents a location on the caller's behalf.
- Do not split this package. A half-built execute endpoint that files an agreement with one of its gates missing is a worse failure mode than a large package, and the freeze triggers make it unrecoverable.
- Note on mutation harness verdicts, for the package close: doorway/mutation_check.py has FOUR verdicts, not three — ok, MISS, SKIP and IMPRECISE (mutation_check.py:44-49, added 2026-07-27 for a lane that dies in its fixture because `alter role` is cluster-wide). All three non-ok verdicts are fatal. This package adds FOUR rows to that file — the most of any package — so it is the most exposed to a fixture collision; each of the four must report literally 'ok'.

**Validation checks**

- python -m pytest doorway/test_executions.py -q — every named test passes, including the positive-direction override admission.
- python -m pytest doorway -q — green.
- node db/test/executed.test.mjs — green, including the new insert-set assertions.
- node db/test/override.test.mjs — unchanged and green (this package reads cw.override_passes and changes nothing in the override machinery).
- node db/test/reading-room.test.mjs — green.
- node db/test/run-all.mjs — green.
- python doorway/mutation_check.py — all four new rows report 'ok'; preflight clean.
- git diff --stat backend/engine/ is empty; backend/db/migrations/ gained no file from this package — check that the listing is unchanged from what WP-003 left behind, rather than asserting the absence of a hard-coded number.
- npm run verify from backend/ is green, including all three mutation harnesses.

**Acceptance criteria**

- A requester, a viewer and an auditor calling POST /agreements/execute are refused BY THE DATABASE (0006 grants and legal_writes policies), not by the endpoint; a legal_reviewer and a legal_admin succeed.
- A run recorded against a different deal cannot be filed against this one — the refusal names both agreements — and a run with no deal cannot be filed at all, with the settled 'every assembly run belongs to a deal' decision named as the reason.
- Execution refuses a run carrying a clause the engine would no longer select, and ONLY such a run. The gate's predicate is cw.clause_version_state.selectable = false (equivalently: retired, expired, or superseded with selectable false), never state <> 'active'. Refused, naming the clause and its state: a retire_now supersession (0002:205-206) and a retired version. NOT refused, and tested as its own named case: a run-off predecessor still in force — superseded but selectable — which executes successfully. The gate's primary source is cw.clause_version_state; cw.run_drift is corroboration only and is never the gate.
- Execution refuses a run whose gate is closed and whose blocking findings are not all covered by approved rows in cw.override_passes, naming the uncovered finding — AND admits a run whose gate is closed but whose every blocking finding IS covered, filing it, with cw.run.overridden still false. Both directions are tested and both are guarded by their own mutation row.
- The mapping from a cw.run_finding row to an override_finding.finding_ref is stated in one function in executions.py as `{rule_id}@v{rule_version}`, matched with or without a leading `category:` prefix, and is fail-closed.
- All three gates are evaluated BEFORE the cw.executed_agreement insert, proven by a refusal leaving cw.executed_agreement empty and cw.agreement.status unchanged.
- The insert set matches what the hand-inserted demo row inserted and includes cw.executed_document.kind = 'agreement' at doc_seq 0; cw.signature_certificate is never written and a certificate in the body is refused with a reason.
- The agreement's status moves to 'executed' by the existing trigger and never by the endpoint; executions.py contains no update of cw.agreement.
- Exactly one agreement_executed event exists per execution and it is the trigger's; the endpoint writes only execution_attempted / execution_refused.
- GET /reading-room/clauses returns rows for the first time, against a real executed agreement whose run_id is set plus a live cw.agreement_share row for a viewer — and no fixture fakes the run.
- What storage_uri carries pre-WS-8 is recorded in the package and beside the field list, with an explicit non-claim about POST /health-checks/document; the endpoint-versus-trigger comparison is written down; the untestable expiry branch and the write-once nature of cw.run.gate_open / overridden are recorded in executions.py.
- All four mutation rows report 'ok'.
- npm run verify from backend/ is green, including all three mutation harnesses.

**Risks**

- The validation gate is the package's subtlest surface: read the wrong column and the endpoint is either permanently closed (cw.run.overridden) or vacuously open. Mitigated by the recorded paragraph, the positive-direction test, and the mutation row that breaks the override lookup specifically.
- The finding-reference mapping is a convention, not a foreign key, so a mismatch between what the override form writes and what the gate expects refuses a legitimate execution. Mitigated by fail-closed matching, one function owning the spelling, WP-007 emitting the same reference, and the positive test constructing the reference through that function rather than by hand.
- cw.run_drift is documented REPORTING ONLY, inner-joins cw.agreement, filters status <> 'executed' and emits only already-flagged rows. Mitigated by demoting it to corroboration and making the direct cw.clause_version_state query the gate.
- Evaluating a gate after the insert would make it vacuous forever, and the failure is invisible. Mitigated by the ordering comment, the mutation rows, and the after-refusal emptiness assertion.
- Everything this endpoint files is frozen by trigger (0006). A wrong insert cannot be corrected, only superseded. Mitigated by validating every field at the boundary and by running the whole flow against a throwaway schema in tests.
- storage_uri will look like a real location to every later reader including cw.execution_evidence_gap. Mitigated by recording the value's shape and meaning in the package and in a comment, and by explicitly not claiming the document hash check round-trips.
- Four new mutation rows key on code inside the same file this package writes; an in-package refactor turns them into fatal SKIPs. Mitigated by copying the find strings out of the finished file and re-running the harness at package close.
- The currency gate's two candidate predicates read almost identically and one of them is wrong in a direction that cannot be undone: `state <> 'active'` refuses a run-off predecessor the engine would still select, and the refusal lands on the one act the freeze triggers make permanent. Mitigated by naming `selectable` as the predicate in required_changes, by the mandatory negative test test_a_run_off_supersession_does_not_refuse_execution, and by quoting the schema's own sentence in the test comment so a later 'tightening' goes red.

**Rollback / remediation**

- Code-only rollback: delete backend/doorway/executions.py and backend/doorway/test_executions.py, remove the dispatch branch and the four mutation rows, and revert the executed.test.mjs additions.
- Nothing filed can be unfiled. cw.executed_agreement, cw.executed_document and cw.executed_signatory all carry frozen/no_delete/no_truncate triggers (0006), so any test filings must live in throwaway schemas — which the doorway fixtures already guarantee (the schema is rebuilt per test) and which the JS suites do by using PGlite.
- If the gates must move into triggers later, the endpoint's gate code and its mutation rows move together; a trigger plus an endpoint check is two copies of one rule and is the drift this repo names as the vulnerability.

---

## WP-007 — Part E1 — the requester's screens: manifest panel, run view, document download

**Objective.** Give the requester the panes the pipeline rail has been promising: compose a manifest, pre-flight it through the existing POST /manifests/check, submit it through POST /runs, see the run with its decisions, findings and gate state, download the document, and raise an override request whose finding references are the ones the execute gate actually matches — with the screen-side test suites moved in the same package.

**Prerequisites:** WP-005

**Scope**

- prototype/v4/app/api.jsx: the three run reads, the record-run write, the pre-flight call and one download helper.
- prototype/v4/app/requester.jsx: the manifest panel, the run view, the download, the override form's finding references, and the retirement of the stub caption and the NotBuiltYet that named them.
- backend/db/test/shell.test.mjs: the assertions this change necessarily moves, and new ones for what it adds.
- backend/db/test/mutation-check.mjs: repointing the shell rows this change invalidates, and one new row.
- A recorded manual browser walk, labelled manual.

**Out of scope**

- The reviewer's execute screen (WP-008) — reviewer.jsx is not touched.
- WS-2: the intake interview and any classifier. The manifest panel takes a manifest composed by hand, which is exactly what the trust boundary accepts from anywhere; the 'intake' tab stays a NotBuiltYet.
- WS-6: the 'negotiate' and 'negotiations' tabs stay NotBuiltYet.
- Any new workspace tab, unless the decision below is reversed — and if it is, all three edits (shell.jsx, shell.test.mjs's independent copy, mutation-check.mjs's shell block) land in this package or the bar goes red.
- Any export path for the viewer. ADR-0008 stands and viewer.jsx is not touched.
- Any generic get(path) in api.jsx.
- Any change to the override endpoints or to how cw.override_finding is decided — this package changes only what the requester's form puts in finding_ref.

**Target files**

- `C:\Users\MimoMac\repo\clausewerk\prototype\v4\app\api.jsx (the read list at lines 84-129; the write list at lines 131-156)`
- `C:\Users\MimoMac\repo\clausewerk\prototype\v4\app\requester.jsx (the override finding rows at lines 27, 74-77, 100, 150; the typed run-id input at lines 321-333; the caption at lines 334-339; the NotBuiltYet at lines 342-346; MyDealsPane at line 354)`
- `C:\Users\MimoMac\repo\clausewerk\prototype\v4\app\workspaces.jsx (the PANES table at lines 50-84, only if a route changes)`
- `C:\Users\MimoMac\repo\clausewerk\backend\db\test\shell.test.mjs (the 'not built yet' assertion at line 861, inside the test 'nothing invents findings or runs to make the form look finished', which opens at :857 — cite the TEST NAME, not the number, since this anchor has moved twice; the viewer-export test 'the viewer has no export path of any kind' opens at :992; the broad-fetch tests at :221-240)`
- `C:\Users\MimoMac\repo\clausewerk\backend\db\test\mutation-check.mjs (the shell block, including the canned-rows row and the broad-fetch row keyed on requester.jsx source)`
- `C:\Users\MimoMac\repo\clausewerk\backend\doorway\test_server.py (the WORKSPACE_READS table at lines 36-51 — the requester row)`

**Required changes**

- api.jsx: add to the read list — `runs: () => call('GET', '/runs')`, `runDecisions: () => call('GET', '/runs/decisions')`, `runFindings: () => call('GET', '/runs/findings')`. All three take no argument, matching the endpoints and the reading-room precedent.
- api.jsx: add to the write list — `recordRun: (b) => call('POST', '/runs', b)` AND `checkManifest: (b) => call('POST', '/manifests/check', b)`. NOTE, and say so in the package record: POST /manifests/check appears nowhere in api.jsx today (verified against the write list at lines 131-156), so this package is that endpoint's FIRST live consumer and the first exercise of its refusal rendering. That makes six new entries in api.jsx, not four.
- api.jsx: add ONE download helper, `contract: (runId) => download('/runs/contract?run=' + encodeURIComponent(runId))`, plus a private `download(path)` beside `call` that fetches with the bearer token, and on a non-ok response parses the JSON refusal and returns the same {ok:false, status, reason, expired} shape `call` returns — so a refusal never arrives as a broken file. On ok it returns {ok:true, blob, filename} read from content-disposition. THE SPLIT IS EXPLICIT AND LOAD-BEARING: api.jsx owns TRANSPORT AND REFUSAL-SHAPING ONLY — fetch, the bearer token, reading the blob and the filename, and turning a non-ok response into `call`'s refusal shape. requester.jsx owns THE ACTUAL DOWNLOAD — createElement('a'), URL.createObjectURL, the `.download` filename and URL.revokeObjectURL. Two reasons, both of them checkable. First, the helper's stated return shape {ok:true, blob, filename} only makes sense if somebody else turns it into a file; an anchor built inside api.jsx would make the return value dead. Second, this package adds a test asserting that api.jsx's download helper is named by requester.jsx and by no other screen — an assertion about which SCREEN downloads, which is meaningless if api.jsx does the downloading itself. shell.test.mjs's 'the viewer has no export path of any kind' (opening at :992) forbids those same three tokens in viewer.jsx (verified: the test is scoped to stripComments(viewSrc()) and checks createElement('a'), URL.createObjectURL, new Blob( and .download), and ADR-0008's rule survives precisely because the DOM step lives in the requester's screen and nowhere else.
- api.jsx: argue the run-id argument once, in a comment beside the helper, and say exactly why it does not breach rule 2 — a run is the caller's own artefact named by a server-generated id that the database's own policy already decides they may see, not a share scoped by identity as in WP-U14's case. The comment must also state that the reading-room helpers still take no argument and that this is not a precedent for them.
- requester.jsx: a manifest panel inside the open-deal view — compose risks (category, severity, justification), pre-flight through API.checkManifest, show dropped and coerced categories in the engine's own sentences, then submit through API.recordRun with the deal's agreement_id taken from the open deal and never typed.
- requester.jsx: a run view showing each decision with its reason, each finding with its severity and title, the gate state, and how many rules were consulted — every string coming from the endpoint, none composed on screen.
- requester.jsx: a download control calling API.contract(run.run_id) and then performing the DOM download itself from the returned {ok:true, blob, filename} — createElement('a'), URL.createObjectURL, the .download filename, and URL.revokeObjectURL after the click. This is the ONLY file in the shell that does any of that. A refusal ({ok:false}) is rendered in the database's or the engine's own words, exactly as every other pane does, and no file is saved.
- requester.jsx OVERRIDE FORM — the one change that makes WP-006's gate reachable from the screens. The finding rows (line 27 onwards) currently start with a blank `finding_ref` the requester types by hand against the placeholder 'data:F1'. Replace the hand-typed reference with a selection from the run's own blocking findings (API.runFindings() filtered to severity High for the chosen run), and set finding_ref to `${f.rule_id}@v${f.rule_version}` — the exact reference executions.finding_ref builds in WP-006, so an approved override matches at execution instead of failing closed. The severity and summary fields still come from the finding. State in a comment that the reference is the rule's identity and that WP-006's gate matches it with or without a leading category prefix.
- shell.test.mjs: the assertion `assert(/not built yet/.test(reqSrc()))` — at line 861 as the file stands, inside the test 'nothing invents findings or runs to make the form look finished' (which opens at :857; :859 is the SIBLING example-findings assertion in the same test, and is not the one being moved) — FIND IT BY THE TEST NAME AND THE ASSERTION TEXT, NOT BY THE LINE NUMBER, which has moved twice already, currently passes on the caption this package deletes. Move it deliberately in the same package: keep the test and re-point it at the intake NotBuiltYet's text. Do not delete the assertion — the honest fact it guards (the screen says which parts do not exist) is still true and still needs guarding.
- shell.test.mjs: the viewer-export test 'the viewer has no export path of any kind' — it opens at :992 as the file stands, and is best found by that name — is scoped to viewer.jsx and asserts no createElement('a'), no URL.createObjectURL and no .download. A download helper in api.jsx necessarily uses those, so DO NOT extend that assertion literally — it would be unsatisfiable. Extend it correctly instead: add a new named test asserting that viewer.jsx still calls only its two reading-room reads AND that api.jsx's download helper is named by requester.jsx and by no other screen — grep every .jsx except api.jsx for `API.contract(` and assert requester.jsx is the only file that names it. AND add a one-line assertion in the same test that api.jsx itself contains no `createElement('a')` — the anchor belongs in requester.jsx, so api.jsx failing that check means the split has collapsed and the 'which screen downloads' assertion above it has quietly stopped meaning anything. Together these preserve ADR-0008's rule with checks that can actually pass, unlike the plan's literal wording.
- shell.test.mjs: add a test that the manifest panel pre-flights before it submits — API.checkManifest is called and its result rendered before API.recordRun is reachable.
- shell.test.mjs: add a test that the run view renders decisions, findings and the gate from the endpoint's fields and holds no example rows.
- shell.test.mjs: add a test that the override form's finding_ref is derived from a finding's rule_id and rule_version rather than typed, and that no literal example reference remains in the source.
- requester.jsx: delete the typed run-id input at lines 324-326 and the caption at lines 337-339, and replace the runId state with a selection from the run list. The override request pane keeps working — it now receives a run id chosen from real runs instead of typed.
- requester.jsx: delete the NotBuiltYet at lines 343-345 and replace its `what` text only for the parts now built; the intake interview remains unbuilt (WS-2), so leave a NotBuiltYet naming only intake, so the pane still says which kind of empty it is.
- mutation-check.mjs: re-point the canned-rows row and the broad-fetch row if this package moves the exact lines they key on; both are keyed on requester.jsx source and both are fatal as SKIPs.
- mutation-check.mjs: add one row in the existing object shape {target:'shell', suite:'shell.test.mjs', name, find, repl, expect} that reintroduces the retired stub — find the new run view's API.runs() call, replace with a NotBuiltYet — expecting the new run-view test by its test NAME string (this harness matches test names, not pytest node ids).
- test_server.py: extend WORKSPACE_READS['requester'] (test_server.py:36-51) with the three run paths — '/runs', '/runs/decisions', '/runs/findings' — and assert they answer 200 with 'rows' for that role, in the shape the table's existing sweep already uses. THE REASON IS THE TABLE'S OWN COMMENT: it says it is 'What each workspace actually asks for when it opens. Taken from the shell's own API client (prototype/v4/app/api.jsx), not invented here.' It is an independent copy of api.jsx's read list, and the test iterates only the paths listed — so adding reads to api.jsx does NOT turn it red, and the copy silently drifts from the thing it claims to be taken from. That is the exact failure mode this repo's other duplicated specifications are guarded against (shell.test.mjs's independent copy of the tab table, mutation-check.mjs's shell block), both of which this package already handles; this is the third and it was missed. FILE-OWNERSHIP CONSEQUENCE, stated so it is not discovered: backend/doorway/test_server.py is now written by WP-001 and again by WP-007. The existing spine WP-001 → WP-002 → WP-003 → WP-004 → WP-005 → WP-007 is an unconditional directed path, so the two writers are never in flight together and single ownership at any moment still holds.

**Implementation notes**

- Decision recorded in requester.jsx: the new panes hang off the existing my-deals open-deal view rather than adding a workspace tab. shell.jsx's tab table describes itself as the specification and shell.test.mjs holds an independent copy of it; adding a tab means three coordinated edits in one package. Not adding one keeps the tab-to-pane bijection untouched and keeps this package to the files it already owns.
- Recorded honestly: shell.test.mjs is static analysis over source, not a rendering test — it says so in its own opening. This package therefore also carries a recorded manual browser walk at the same bar WP-U07 met — sign in as a requester, open a deal, compose a manifest, pre-flight it, submit it, read the run, download the document, raise an override on a blocked run — written down in the package record and explicitly NOT claimed to be automated.
- The download path is the first place the shell handles something that is not JSON. Keep it inside api.jsx: a pane calling fetch directly would fail shell.test.mjs:221-231, which is the point of that rule.
- Nothing on screen decides permissions. The buttons are affordances; the database refuses regardless, and every refusal is rendered in its own words.
- On citing shell.test.mjs: cite the TEST NAME, not the line number. The three anchors this package depends on have moved in each of the last two passes ('not built yet' :843 → :859 → :861; the viewer-export test :973 → :990 → :992) while the test names have not moved at all. Every instruction in this package can be followed from the names alone; the numbers are given as of 2026-07-27 and are a convenience, not the address.

**Validation checks**

- node db/test/shell.test.mjs — green, including the moved 'not built yet' assertion, the new API.contract-scoping test, the new run-view tests and the finding-reference test.
- node db/test/mutation-check.mjs — green; every re-pointed row reports ok and no row reports SKIP.
- node db/test/run-all.mjs — green.
- python -m pytest doorway -q — green, including the extended WORKSPACE_READS sweep. No backend file other than backend/doorway/test_server.py is touched, and that one is a test-side copy of api.jsx's read list, not endpoint code.
- The recorded manual browser walk, performed and written into the package record, labelled manual.
- git diff --stat backend/engine/ is empty; backend/db/migrations/ gained no file from this package — asserted by comparing the listing against what WP-003 left behind, not by naming a number, since WP-003's migration number is resolved at ITS package start; the only file this package changes under backend/doorway/ is test_server.py, and no doorway module (app.py, reads.py, writes.py, runs.py, documents.py, executions.py, server.py) is touched.
- npm run verify from backend/ is green, including all three mutation harnesses.
- python -m pytest doorway/test_server.py -q — green, with the requester workspace's three new run paths answering 200 with 'rows'. This package therefore does touch backend/doorway/, in exactly one file and for exactly this reason; the 'backend/doorway/ is untouched' check below is narrowed to every file except test_server.py.

**Acceptance criteria**

- The manifest panel pre-flights via POST /manifests/check — its first consumer anywhere in the shell — and submits via POST /runs, with the agreement_id taken from the open deal and never typed.
- The run view shows each decision with its reason, each finding and the gate state, all from endpoint fields.
- The document downloads, and a refused download renders the refusal's own sentence rather than saving a broken file.
- The override form's finding_ref is `{rule_id}@v{rule_version}` derived from a real blocking finding, matching what WP-006's gate looks for, and no reference is typed by hand.
- The NotBuiltYet at requester.jsx:343 and the caption at :338 are gone, no run id is typed by hand, and the remaining NotBuiltYet names only what is genuinely still unbuilt.
- shell.test.mjs's 'not built yet' assertion — the one inside 'nothing invents findings or runs to make the form look finished', at :861 as the file stands, not the sibling example-findings assertion at :859 — was moved deliberately in this package rather than deleted, and the tab-to-pane bijection still holds.
- A new named test asserts that api.jsx's download helper is called from requester.jsx and from nowhere else, that api.jsx contains no createElement('a'), and that viewer.jsx still calls only its two reading-room reads — so ADR-0008's rule is preserved by checks that can pass. The split is stated in the package and in the code: api.jsx owns transport and refusal-shaping; requester.jsx owns the anchor, the object URL, the .download filename and the revoke.
- mutation-check.mjs's shell rows still catch a reintroduced stub, every re-pointed row reports ok, and no row reports SKIP.
- api.jsx exposes no generic get(path); the three run reads take no argument; the run-id rationale is argued once in the file.
- No canned data is added anywhere.
- The browser walk is recorded and labelled manual.
- npm run verify from backend/ is green, including all three mutation harnesses.
- test_server.py's WORKSPACE_READS['requester'] names the three run paths and asserts each answers 200 with 'rows', so the independent copy of api.jsx's read list is moved in the same package that grows api.jsx — the third duplicated specification, alongside shell.test.mjs's tab table and mutation-check.mjs's shell block.

**Risks**

- Screens have no rendering test. shell.test.mjs is static analysis and mutation-check.mjs mutates sources rather than a running app, so this package can be green while a pane is broken in a browser. Mitigated by the recorded manual walk, which is not claimed to be automated.
- mutation-check.mjs's shell rows key on exact lines in requester.jsx that this package edits. A SKIP is fatal and reads as protection until somebody looks. Mitigated by re-running the harness after every edit and re-pointing rows in the same package.
- Changing what the override form writes into finding_ref changes what cw.override_socialisation's category-watcher matching sees (0015:220-228 splits on ':'). Recorded in open issues with a named follow-on; the deal owner and always-watchers are unaffected, so socialisation still resolves an audience.
- The literal reading of 'extend the viewer-export assertion to api.jsx' is unsatisfiable once a download helper exists. Mitigated by the corrected form above; the rule is preserved, not weakened.
- A download helper is the natural place for a generic fetch to reappear. Mitigated by the single-path helper, the run-id-only signature, and shell.test.mjs:233-240.
- WORKSPACE_READS is an independent copy that cannot go red on its own: the test iterates the listed paths, so a copy that falls behind api.jsx reads as coverage. Mitigated by moving it in this package and by naming it in the acceptance beside the other two duplicated specifications, so a future author looking for the copies finds all three named together.
- The DOM half of a download is the natural thing to bury inside the transport helper, and doing so would satisfy neither the helper's stated {ok:true, blob, filename} return nor the intent of the 'which screen downloads' test — while still passing it. Mitigated by stating the split in required_changes and by the api.jsx-has-no-createElement assertion, which is the half of the check that can actually detect the collapse.

**Rollback / remediation**

- Revert prototype/v4/app/api.jsx and requester.jsx together with backend/db/test/shell.test.mjs and backend/db/test/mutation-check.mjs — the four files move as one unit or the bar goes red in a way that looks like a different fault.
- The doorway endpoints stay live and unused after a revert; nothing in the backend depends on the screens. Reverting the override form's finding_ref restores hand-typed references, which WP-006's gate will then refuse — state that in the revert note so the consequence is not discovered at an execution.
- If the panes must move to their own tab after all, the follow-on edits are shell.jsx's tab table, shell.test.mjs's independent copy and mutation-check.mjs's shell block — named here so the cost is known before it is paid.

---

## WP-008 — Part E2 — the reviewer's execute screen

**Objective.** Give Legal the run view from their side and the execute action carrying the evidence settled decision 2 requires, with every refusal shown in the database's or the engine's own words and no permission decision made on screen.

**Prerequisites:** WP-006, WP-007

**Scope**

- prototype/v4/app/reviewer.jsx: a run view and the execute action inside the existing review-desk pane.
- prototype/v4/app/api.jsx: exactly one new call.
- backend/db/test/shell.test.mjs and backend/db/test/mutation-check.mjs: the assertions and rows this adds.
- A recorded manual browser walk, labelled manual.

**Out of scope**

- Any new workspace tab. The reviewer's tab set is unchanged and the bijection holds.
- The 'negotiations' NotBuiltYet — that is WS-6 and its endpoint is not live, so the stub stays exactly as it is.
- WS-8: no certificate upload, no byte store, no storage-location picker. The certificate is not part of WP-006's endpoint and must not appear on this screen; the storage reference is a plain field the person fills in, with the pre-WS-8 meaning WP-006 recorded.
- Amendments, exhibits and counterparts.
- Any re-opening of the api.jsx no-broad-fetch rule, which WP-007 argued once.

**Target files**

- `C:\Users\MimoMac\repo\clausewerk\prototype\v4\app\reviewer.jsx (ReviewDeskPane at line 359; the override decision surface at lines 206-357 for the established idiom)`
- `C:\Users\MimoMac\repo\clausewerk\prototype\v4\app\api.jsx (one new entry in the write list)`
- `C:\Users\MimoMac\repo\clausewerk\backend\db\test\shell.test.mjs`
- `C:\Users\MimoMac\repo\clausewerk\backend\db\test\mutation-check.mjs`
- `C:\Users\MimoMac\repo\clausewerk\backend\doorway\test_server.py (the WORKSPACE_READS table at lines 36-51 — the legal_reviewer row)`

**Required changes**

- api.jsx: add exactly one entry — `executeAgreement: (b) => call('POST', '/agreements/execute', b)`. No other change to api.jsx; WP-007 already argued the run-id and download rationale and this package does not re-open it.
- reviewer.jsx: inside ReviewDeskPane, a runs section reading API.runs(), API.runDecisions() and API.runFindings() — the same three parameterless reads the requester uses, scoped by the database to what Legal may see.
- reviewer.jsx: an execute form carrying the fields settled decision 2 requires and WP-006's endpoint accepts — the run being executed (chosen from the run list, never typed), agreement_id from the open deal, the document's fingerprint (sha256), byte size, filename, storage reference, signed_on, executed_on, effective_on, optional term_end, and one row per signatory (name, party, method, signed_on, optional title). There is NO certificate field: WP-006's endpoint refuses one, and its absence is shown as a known gap in the idiom cw.execution_evidence_gap already uses (0006:355-371), with the follow-on named.
- reviewer.jsx: refusals rendered in the database's or the engine's own words — the deal-binding refusal naming both agreements, the currency refusal naming the clause, the validation-gate refusal naming the uncovered finding, and the 0006 policy refusal — with no rewording, exactly as OverrideDecisions already does.
- reviewer.jsx: no permission decision on screen. The execute button is an affordance and is offered to whoever is looking at the pane; the database refuses a requester, a viewer and an auditor regardless, and the refusal is what the screen shows. State this in a comment beside the button, in the idiom workspaces.jsx already uses.
- shell.test.mjs: add a test that the execute form sends no actor and no role — the body has no field for a person, mirroring the existing deal test.
- shell.test.mjs: add a test that the reviewer's run section calls only API.runs, API.runDecisions, API.runFindings and API.executeAgreement, and that reviewer.jsx contains no fetch of its own.
- shell.test.mjs: add a test that a refusal is rendered rather than replaced — the execute surface shows the reason string from the response and composes no sentence of its own.
- shell.test.mjs: extend the pane and tab assertions only if a route changed; the tab table must be unchanged and the bijection must still hold.
- mutation-check.mjs: add one row in the existing {target, suite, name, find, repl, expect} shape that replaces the reviewer's execute surface with a NotBuiltYet, expecting the new reviewer run-section test by its test NAME string.
- mutation-check.mjs: re-point any existing shell row whose find string this package moves in reviewer.jsx, and re-run the harness — a SKIP is fatal.
- test_server.py: extend WORKSPACE_READS['legal_reviewer'] (test_server.py:36-51) with '/runs', '/runs/decisions' and '/runs/findings' and assert each answers 200 with 'rows' for that role — the same correction WP-007 made for the requester row, for the same reason: the table's own comment says it is taken from prototype/v4/app/api.jsx and not invented, but the test iterates only the paths listed, so the copy drifts silently as this package adds the reviewer's run section. FILE-OWNERSHIP CONSEQUENCE: test_server.py is written by WP-001, WP-007 and WP-008; the unconditional edges WP-001 → … → WP-007 → WP-008 keep all three serial.

**Implementation notes**

- Decision recorded in reviewer.jsx: the execute act lives in the existing review-desk pane rather than a new tab, for the same reason WP-007 gave — shell.jsx's tab table is the specification and shell.test.mjs holds an independent copy, so a tab costs three coordinated edits. No NotBuiltYet is retired on the reviewer side: reviewer.jsx contains none, and the only reviewer stub is workspaces.jsx's 'negotiations' route, whose endpoint is WS-6 and is not live.
- api.jsx has exactly one new call in this package. It is the second writer of that file after WP-007, and the prerequisite edge is unconditional so the two are never in flight together.
- The override decision surface already in reviewer.jsx (lines 206-357) now decides findings whose references WP-007 derives from real runs. Nothing in that surface changes; it is worth reading before adding the execute form, because a run refused at execution for an uncovered finding is resolved there.
- Recorded honestly, as in WP-007: shell.test.mjs proves source shape, not rendering. This package carries a recorded manual browser walk — sign in as a legal_reviewer, open the review desk, read a run, approve the blocking findings of a gated run, file an execution with a hash and two signatories, see the reading room populate for the viewer — written into the package record and labelled manual.
- The reading-room consequence is WP-006's acceptance criterion, not this package's; here it is only the screen that shows it.

**Validation checks**

- node db/test/shell.test.mjs — green, including the three new reviewer tests and the unchanged tab-to-pane bijection.
- node db/test/mutation-check.mjs — green; the new row reports ok and no row reports SKIP.
- node db/test/run-all.mjs — green.
- python -m pytest doorway -q — green, including the extended WORKSPACE_READS sweep for legal_reviewer. No backend file other than backend/doorway/test_server.py is touched.
- The recorded manual browser walk, performed and written into the package record, labelled manual.
- git diff --stat backend/engine/ is empty; backend/db/migrations/ gained no file from this package — asserted by comparing the listing against what WP-003 left behind, not by naming a number, since WP-003's migration number is resolved at ITS package start; the only file this package changes under backend/doorway/ is test_server.py, and no doorway module is touched.
- npm run verify from backend/ is green, including all three mutation harnesses.
- python -m pytest doorway/test_server.py -q — green, with the legal_reviewer workspace's three new run paths answering 200 with 'rows'.

**Acceptance criteria**

- The reviewer's execute action carries the evidence fields settled decision 2 requires — the document's fingerprint and the named signatories together — and carries no certificate field, with its absence shown as a known gap and the follow-on named.
- Every refusal is shown in the database's or the engine's own words, unchanged, including the deal-binding, currency and validation-gate refusals.
- No permission decision is made on screen; the button is an affordance and the database refuses regardless, stated in a comment beside it.
- api.jsx has exactly one new call and still exposes no generic get(path).
- The reviewer's tab set and the tab-to-pane bijection are unchanged.
- reviewer.jsx opens no transport of its own and calls only the four API functions named.
- mutation-check.mjs's new row catches a reintroduced stub, and no row reports SKIP.
- The browser walk is recorded and labelled manual.
- npm run verify from backend/ is green, including all three mutation harnesses.
- test_server.py's WORKSPACE_READS['legal_reviewer'] names the three run paths and asserts each answers 200 with 'rows', so the reviewer half of the independent copy moves in the package that gives the reviewer those reads.

**Risks**

- api.jsx is written by WP-007 then WP-008 and is the file the no-broad-fetch rule lives in. Mitigated by the unconditional prerequisite edge and by this package adding exactly one line to it.
- The execute form has many fields and every one of them is frozen the moment it lands. A typo files a permanent wrong fact. Mitigated by a confirmation step showing exactly what will be filed, in the idiom shell.test.mjs already requires of the verify act, and by the endpoint validating every field at the boundary.
- Static analysis cannot see a broken form. Mitigated by the recorded manual walk, not claimed as automated.
- A well-meaning author may hide the execute button from non-Legal roles and call it a control. Mitigated by the comment and by the test that the body carries no actor or role.

**Rollback / remediation**

- Revert prototype/v4/app/reviewer.jsx and api.jsx together with backend/db/test/shell.test.mjs and backend/db/test/mutation-check.mjs — all four move as one unit.
- The POST /agreements/execute endpoint stays live and unused after a revert.
- Nothing filed through the screen can be unfiled: the freeze triggers in 0006 make a mistaken filing permanent. Rollback of this package removes the way to file, not anything filed — and any development filings live in throwaway schemas.

---

## Open issues (complete register)

1. OWNER HEADS-UP, needing nothing from us but an answer — backend/db/migrations/0024_the_flag_is_enough.sql is in the working tree, untracked. Its header reads '0024 · Owner decision U13 — the Administrator gets the FLAG, not the reason' (2026-07-27), and it revokes select on cw.agreement_retention and cw.legal_hold from cw_administrator so the Administrator sees a hold flagged without being told why. It is Mike's file, in Mike's tree, and NOTHING IN THIS SET LANDS IT, MOVES IT, RENAMES IT OR DELETES IT — that is his call, not ours. It is surfaced here for one reason only: it occupies migration number 0024, which WP-003 previously claimed. WP-003 no longer hard-codes a number; it re-verifies the next free number at package start (0025 as things stand, 0024 only if this file is discarded) and records the number it claimed in the migration header and in its completion note. THE ONE QUESTION FOR THE OWNER, to be answered before WP-003 begins: is this file landing, and does it need to land before WP-003's run-scoping migration? Two files sharing a number is the one thing the set's single-claim guarantee exists to prevent, and the bootstrap applies migrations in filename order with no gate against a duplicate.

2. UNRESOLVED, carried, needs an owner (EV-418, widened by this revision): byte transport for a signature certificate. WP-006 now never writes cw.signature_certificate at all — the field list, the encoding and the 1MB cap were an unresolved decision sitting inside required_changes, in the one package whose every insert is frozen by trigger the moment it lands, so the whole act is moved out rather than half-specified. cw.signature_certificate.certificate is bytea NOT NULL with octet_length > 0 and requires provider, envelope_id, completed_at, byte_size and sha256 (0006_executed_agreements.sql:320-330); backend/doorway/server.py reads JSON only under MAX_BODY = 1_000_000 (server.py:56); GAP-CLOSURE-PLAN scopes WS-8 as the byte store and the e-signature provider. Settled decision 2 requires only the hash and the signatories at filing, which WP-006 delivers, so this blocks nothing in WS-1. Whether the act belongs to WS-8, to a new package, or to a later WS-1 addendum is a scope question only the owner can answer. Note the degree of freedom already in the schema: cw.signature_certificate.storage_uri is nullable (0006:322), unlike cw.executed_document's.

3. NEW FINDING requiring an owner and a named follow-on — five requester-readable views have the exact shape this repo has paid for four times: cw.concession_in_force, cw.concession_state, cw.position_current, cw.position_revival and cw.renewal_drift are granted to cw_requester, carry no scoping expression of their own, are not security_invoker, and read tables whose read policies scope by person. Discovered while sizing WP-003's catalogue widening; verified against the migrated schema. It is outside WS-1 (WS-6 and the concession family own those tables) and no package in this set touches it. It needs an owner and its own migration.

4. NEW FINDING requiring an owner, with its one-line closure written down — the administrator can read every run's rows and neither run view. 0013_administrator.sql:321 creates `administrator_reads on cw.run for select` and 0013:290-306 grants cw_administrator SELECT on cw.run, cw.run_decision and cw.run_finding, so GET /runs/findings answers an administrator with every run's findings. But cw.run_summary and cw.run_contract are granted only to cw_auditor (0005_run_store.sql:293-296) and to cw_requester / cw_legal_reviewer / cw_legal_admin (0005:297), and to nothing else in 0001-0023 — so GET /runs and GET /runs/decisions refuse the same role. Closing it is one line, `grant select on cw.run_summary, cw.run_contract to cw_administrator`, which could sit in WP-003's run-scoping migration. IT IS DELIBERATELY NOT TAKEN HERE, for the reason 0018_library_and_ladder_views.sql:170-190 already gave about this same role: the administrator's read boundary is an owner decision about the boundary of a role, and settling it inside a scoping migration would put a new control in the one place nobody would look for it. Consequence inside this set: WP-003 leaves 'administrator' OUT of its migration's two view WHERE clauses rather than writing a branch no grant can reach, and WP-004 asserts all three of today's outcomes so the closure has to change a test on purpose. Related and part of the same owner question: cw_administrator also holds no select on the clause library (0002:352-354, recorded at 0018:170-190), so WP-002's loader sweep asserts its refusal too.

5. DEVIATION from the approved integrated plan, needing owner acknowledgement — WP-003 does NOT widen views-are-not-policies.test.mjs's catalogue query from cw_viewer to cw_viewer + cw_requester. The plan said the widening's size could not be known without running the harness (EV-419); it can, and it was measured: cw_viewer reads 21 views, cw_requester 29, and five of the eight requester-only views are the unscoped ones named above, all owned by WS-6 and the concession family. Widening would fail the harness on five views inside a WS-1 package, so the plan's own contingency is triggered and WP-003 takes the narrow form — a named standing assertion over pg_get_viewdef that cw.run_summary and cw.run_contract consult who is asking, plus the follow-on above.

6. DEVIATION from the approved integrated plan, needing owner acknowledgement — WP-006 implements the plan's EXPIRY gate as a CURRENCY gate, and that WIDENS what is refused. The plan's Part D item 3 (ASSEMBLY-CONNECTION-PLAN-2026-07-27.md:139-143) names a gate consulting 'the same computed state (expires_soon / expiry dates) the library already exposes'. WP-006 substitutes cw.clause_version_state.selectable, which covers retirement and supersession as well as expiry. The substitution is well-evidenced — cw.clause_version.expires_on is immutable (cw.clause_version_immutable() raises restrict_violation and clause_version_no_edit fires before update, 0002:126-158) and an already-expired version is never selectable, so it can never have been pinned into a run; the plan's literal case is untestable. But the consequence is a widening, not a translation: RUNS PINNING A RETIRED OR RETIRE_NOW-SUPERSEDED CLAUSE ARE NOW REFUSED AT EXECUTION, WHICH THE PLAN DID NOT ASK FOR, AND THE EXPIRY BRANCH THE PLAN NAMED IS CHECKED IN CODE BUT CANNOT BE INDUCED IN A TEST. Run-off predecessors are deliberately NOT refused (see WP-006's negative test), so the widening stops short of everything cw.clause_version_state calls non-active. Listed here beside the views-are-not-policies narrowing and the provenance-count correction because it is the same kind of thing: a defensible departure the owner should acknowledge rather than discover. WP-006 keeps the implementation note as well; this entry does not replace it.

7. SECOND FINDING inside the same harness — its reverse check would not have caught cw.run_contract even after widening. views-are-not-policies.test.mjs builds its risky-table set by matching policy text for app_actor / owns_agreement / is_shared_with / was_notified, and cw.run_decision's read policy scopes transitively through cw.run (0005_run_store.sql:279-280) without naming any of them. The check has a blind spot for one-hop scoping. Recorded, not fixed in this set.

8. NEW FOLLOW-ON created by WP-006's finding-reference rule, needing an owner — cw.override_socialisation resolves category watchers by matching `split_part(finding_ref, ':', 1)` against cw.override_watcher.category_key (0015_override_request.sql:220-228). WP-006 fixes the canonical reference for a run finding as `{rule_id}@v{rule_version}` (the engine's own ConflictRule.ref, and the only stable identity cw.run_finding carries), and WP-007 makes the requester's form emit it, so a reference with no category prefix will not match a category watcher. The deal owner and always-watchers are still resolved, so socialisation still produces an audience and nothing fails closed. Whether the canonical reference should carry a category prefix — and which category, given a finding may implicate several — is a question for whoever owns the override workflow. Both packages match with or without the prefix so a later prefixed form needs no code change here.

9. CORRECTION to an acceptance criterion the plan carried from its Part A prose — 'an empty library refuses loudly with SnapshotIncomplete's words' is unimplementable at write time. engine.run.SnapshotIncomplete (run.py:35) is raised only by snapshot_from_rows on the READ side; Snapshot.build accepts an empty clause list (snapshot.py:53-99); and a rungless ladder cannot arrive from the registry because LADDER_SQL inner-joins cw.ladder_rung (loader.py:56-67). WP-002 therefore tests the honest behaviour: an empty library is a 200 coverage-gap report in the engine's own words ('No clause available in Ledger'), with nothing invented and rules_consulted = 0. The refuse-loudly case that genuinely exists is snapshot_rows()'s ValueError (run.py:113-122) and WP-003 now handles it explicitly as a 409 with a named test, rather than leaving the guarantee in prose.

10. CORRECTION to WP-003's provenance-count decision (EV-420) — 'build the document in memory to compute provenance_counts' cannot be done without duplicating engine internals. engine.docx.provenance_counts requires an explicit `structural` list of build_docx's own literal strings (docx.py:403-415), and the only thing that constructs one is test code. WP-003 therefore computes ai_origin_chars honestly (ai_originated_characters needs no structural list, docx.py:390-400) and records authored_chars = 0 by construction, justified by the engine's standing assertion that build_docx emits zero authored characters. Both alternatives — duplicate the structural vocabulary, or record both as zero — are recorded in WP-003 and switching costs one function, no migration. The owner may reverse it.

11. CORRECTION to WP-007's acceptance criterion — 'extend the viewer-has-no-export-path assertion from viewer.jsx to api.jsx' is unsatisfiable as literally worded. shell.test.mjs's 'the viewer has no export path of any kind', which opens at :992, asserts no createElement('a'), no URL.createObjectURL and no .download, and any real download helper uses all three. WP-007 preserves ADR-0008's rule with a check that can pass: viewer.jsx still calls only its two reads, and a new test asserts api.jsx's download helper is named by requester.jsx and by no other screen.

12. FOUR EXISTING TESTS BREAK BY CONSTRUCTION when WP-003's run-scoping migration scopes the two run views, and WP-003 owns all four — run-store.test.mjs:296-304 and :314-318, writer-sql.test.mjs:264-270, and executed.test.mjs:279 all read cw.run_contract or cw.run_summary with no role set, i.e. as the owner, for whom cw.app_role() answers null (0013_administrator.sql:84-94). Each must become a role first. This also means backend/db/test/executed.test.mjs is written by WP-003 and again by WP-006; the prerequisite chain WP-003 → WP-004 → WP-005 → WP-006 keeps them serial.

13. SETTLED IN THIS SET, listed so the owner sees a consequence they may wish to reverse — an auditor cannot download a pre-execution contract. The document_produced row is written through the caller's own connection and cw_auditor holds no INSERT on cw.audit_event (0001_foundation.sql:339-346; 0013:257). The house pattern wins; the alternative reintroduces the privileged path db.py exists to make impossible. WP-005 records it with a named test, and reversing it is a schema grant rather than endpoint code.

14. SETTLED IN THIS SET, with its collapse path recorded — the document selector travels in the URL (GET /runs/contract?run=…) rather than in a POST body. If the owner prefers the body, WP-001 collapses to the bytes-out branch alone, WP-005 reads the id from the body, and the query-selector mutation row is deleted with its reason written down.

15. SETTLED IN THIS SET, recorded because it fixes a rendering fact rather than a design one — GET /runs/contract passes `today=cw.run.created_at.date()` to build_docx, so a run's paper is byte-stable forever. build_docx stamps `Dated: <today>` from `today or date.today()` (docx.py:113-123); without the explicit date the same immutable run would produce different bytes and a different SHA-256 on two different days, and two document_produced rows for one run would legitimately disagree in an append-only chain. WP-003's in-memory provenance build takes the default date deliberately and inertly, because ai_originated_characters matches only AI-drafted clause bodies and never the date paragraph.

## Reviewer notes at final approval

- FINAL VERDICT: APPROVED_WITH_NOTES. All four pass-3 findings are remedied at source, no blocking or major defect remains, and the nine pass-2 findings verified as remedied in pass 3 are untouched by this revision. The notes below are conditions and observations, not defects.

- CONDITION CARRIED INTO EXECUTION, NOT A DEFECT — WP-003 now cannot begin until the owner answers one question: is backend/db/migrations/0024_the_flag_is_enough.sql landing, and must it land before the run-scoping migration? That is the correct shape for this (the number is a fact about the tree at a moment, not a fact about the plan), but it is a real gate on a package deep in the serial spine. Whoever runs Gate 4 should confirm the answer and the claimed number are both recorded in the package's completion note, as its own acceptance criterion requires.

- OBSERVATION, NO ACTION — WP-003's `prerequisites` array now mixes one package id ('WP-002') with two prose paragraphs (the three-rule owner pre-brief and the migration-number re-verification). Any tool that reads prerequisites as a list of package ids will not parse it. The content belongs where it is and both items are genuine preconditions; if a downstream stage consumes the field mechanically, split it into ids plus a separate `preconditions` field rather than shortening the prose.

- REGRESSION RE-CHECK, ALL PREVIOUSLY PASSED ITEMS — clean. package_order unchanged (WP-001..WP-008); prerequisite edges unchanged and still a serial spine with one terminal fork (001->002->003->004->005, then {006,007} from 005, then 008 from both), acyclic, every edge unconditional; shared-file ownership unchanged, with test_server.py's three writers (WP-001, WP-007, WP-008) still on an unconditional directed path and the only concurrent pair (WP-006, WP-007) still sharing no file; coverage A-F unchanged with tests inside all eight packages and no trailing test package; the three mandated mutation rows and the deferred query-selector row still owned one each, and WP-006's fourth row still breaks the override lookup so the gate cannot pass by refusing everything; the service-level round trip still WP-005's alone with its non-vacuity assertions.

- REGRESSION RE-CHECK, THE NINE PASS-2 REMEDIES — all intact and unchanged by this pass. WP-006's predicate is still `selectable = false` with the mandatory run-off negative test; WP-005 still carries the manifest.py:88-116 rationale and not the false coerced-set one; WP-003's idempotency is still two layers with the member-table exclusion stated and the race test named; WP-007 still states the api.jsx/requester.jsx download split with the api.jsx-has-no-createElement assertion; WP-004 still runs six roles with the administrator's three non-uniform outcomes; migration rule (c) still leaves 'administrator' out of both view WHERE clauses; the three-rule owner pre-brief still precedes the package; test_server.py's WORKSPACE_READS still moves in WP-007 and WP-008; the currency-gate widening is still a named deviation in open_issues.

- STANDING CONSTRAINTS — all hold. Engine never modified (asserted per package). No permission logic in endpoints — WP-002's implementation note now says it explicitly for the administrator case: 'Nothing in this package tests, branches on or mentions a role in code. The endpoint asks the database for the clause library through the caller's own connection and hands back what comes out, refusal included.' The database refuses in its own words and refusal sentences pass through unchanged. Exactly one package creates a migration. Content is treated as placeholder throughout. WS-2/4/6/7/8 named by number in every out_of_scope that could reach them. IDs stable: WP-001..WP-008, no renumbering across four passes.

- ON THE OWNER'S FILE — nothing in this set touches backend/db/migrations/0024_the_flag_is_enough.sql, and the package text says so three times. That is the right call: it is untracked work in the owner's tree, and the set's only obligation is to stop colliding with it and to say that it is there.

## Evidence and traceability

Every substantive claim in these packages is tagged Observed / Inferred / Assumed / Unresolved
in the evidence ledger (49 items, EV-1xx planners through EV-548), kept with the full gate
record in `.adversarial-workflow-agentic/2026-07-27-assembly-wpp/`:
`objective-contract.md` (Gate 1), `workflow-result.json` (planners, red team, integrator with
Gate 2, first two author/review passes), `work-packages-final.json` (the approved set, machine-
readable), `gate3-pass3.json` and `gate3-final.json` (the last two review verdicts).
