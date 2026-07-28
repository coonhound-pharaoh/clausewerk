-- 0033 · The session table answers only to sign-in
--
-- WHAT THIS FIXES
-- Audit finding A-1. 0032 gave the session table to `cw_viewer` with a policy
-- of `using (true)`, explaining the grant as being for "the lookup role". On the
-- sign-in path that is exactly what cw_viewer is. But cw_viewer is not ONLY
-- that: it is one of the six real application roles — 0001 describes it as
-- "read contracts and clause text; change nothing" — and db.py binds any person
-- holding `viewer` in cw.effective_role to precisely this database role.
--
-- So the table could not tell "the doorway looking somebody up" apart from "a
-- signed-in viewer going about their day". They are the same database role.
--
-- Verified before this migration was written, by probe: an ordinary viewer read
-- the administrator's session key in the clear and deleted every session in the
-- system. A session key is not data ABOUT a person, it is the credential
-- itself — a stolen one is indistinguishable from its real holder and leaves no
-- audit trail. `select` also gave a viewer a live roster of who is signed in;
-- `delete` gave any viewer a one-statement way to sign the whole company out.
--
-- This was contained rather than safe. reads.py and writes.py hold fixed whole
-- statements with nothing caller-supplied composed in, so a browser could not
-- steer a statement at cw.session. That is containment by absence of a door,
-- not by a wall — and the viewer role is the one handed to outside suppliers.
--
-- WHY THE POLICY AND NOT THE GRANT
-- The grant cannot be the control here, because there is only one role to grant
-- to: sign-in and an ordinary viewer arrive as the same `cw_viewer`. What tells
-- them apart is the ACTOR stamped on the connection — `as_person(LOOKUP_ACTOR,
-- LOOKUP_ROLE)` in sessions.py sets it to `__signin__`, while a signed-in
-- viewer carries their own name. So the policy reads the actor, and the grant
-- is left alone.
--
-- cw.app_actor() and not bare current_setting(): the bare form RAISES when the
-- setting is unset, so an owner or maintenance path touching this table would
-- error rather than simply match nothing, surfacing as a 500. app_actor() is
-- the house form (0001:93) and coalesces to 'unattributed'.
--
-- WHY 0033 AND NOT AN EDIT TO 0032
-- migrate.py ledgers by filename with no checksum and no re-application path.
-- Any database where prepare() has run since 0032 was written already holds
-- that row and would SILENTLY SKIP an edited file, while a fresh test database
-- reported green. Owner decision, 2026-07-28: 0032 is never edited; anything
-- that changes it takes a new number. Written defensively (`if exists`) so it
-- applies cleanly whether or not 0032 is still being revised.

drop policy if exists viewer_manages_sessions on cw.session;

create policy signin_manages_sessions on cw.session
  for all to cw_viewer
  using (cw.app_actor() = '__signin__')
  with check (cw.app_actor() = '__signin__');

comment on table cw.session is
  'Active sign-ins. Stored here so sessions survive a service restart. Reachable '
  'only by the sign-in path: the rows hold credentials, not facts about people, '
  'so the policy asks WHICH ACT is in progress rather than which role is asking.';

-- ── The name the policy trusts is now a name nobody can take ────────────────
--
-- Without this the fix above is forgeable, and that was the specific reason the
-- smaller option was nearly rejected. cw.account.person is an unconstrained
-- `text primary key` (0013:117) and POST /accounts takes the person straight
-- from the request body. An administrator who created an account literally
-- named `__signin__` with role `viewer` would satisfy the policy and read every
-- session key — turning a fixed hole back into an open one, through the front
-- door, with no error anywhere.
--
-- A namespace rather than the single name, because the next lookup identity
-- would otherwise reopen the same question: leading double underscore is
-- reserved for identities the SYSTEM uses, and can never be a person. Real
-- people here are email addresses, so nothing existing is affected.
alter table cw.account
  add constraint person_is_not_a_reserved_identity
  check (person not like '\_\_%' escape '\');

comment on constraint person_is_not_a_reserved_identity on cw.account is
  'Names beginning with two underscores belong to the system, not to people. '
  'cw.session''s policy trusts the actor name __signin__; an account able to '
  'hold that name could read every live session key.';
