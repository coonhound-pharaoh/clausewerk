-- 0024 · Owner decision U13 — the Administrator gets the FLAG, not the reason.
--
-- THE OWNER'S WORDS (2026-07-27): "The Administrator will just need to be
-- someone who has that level of confidence. It just needs to be flagged, it
-- doesn't need to explain why."
--
-- THE QUESTION THIS ANSWERS, and it was put as a choice between two changes.
--
-- U9 made the Administrator the only role that may destroy a record at the end
-- of its retention. A record under legal hold must not be destroyed, so the
-- Administrator has to know a hold exists. `0022` granted them `select` on
-- `cw.agreement_retention` and `cw.legal_hold` for exactly that reason, saying
-- "a destruction refused for a reason the actor cannot see is a refusal nobody
-- can act on."
--
-- THAT GRANT NEVER WORKED, and the way it failed is the interesting part.
-- Neither table's read policy admits `administrator` (`0010`, and `0013`'s
-- additive `administrator_reads` list omits both). Because the GRANT existed,
-- row-level security FILTERED instead of REFUSING: the Administrator got
-- `0 rows` where a viewer got a clean refusal. The screen therefore said "No
-- holds are open" while a hold was open — telling the person who holds the
-- destruction authority that nothing stood in their way. An empty list is a
-- worse answer than a refusal, because a refusal sends somebody to ask.
--
-- The choice offered was: widen the two read policies to admit the
-- Administrator, or revoke the inert grant so the answer is at least honest.
--
-- THE OWNER CHOSE NEITHER, and the answer is smaller than both: the
-- Administrator needs to know THAT a record is held, not WHY. The matter
-- reference — which lawsuit, which investigation — is not theirs to read, and
-- the trust the role carries is a matter of who is appointed to it rather than
-- something the schema should try to compensate for.
--
-- So the grant goes, and the flag stays. `cw.retention_due` is an owner-rights
-- view, so it answers the flag (`under_hold`) without either table being
-- readable by the caller — which is why nothing needs widening. The endpoint
-- feeding the Administrator's screen stops selecting the matter references, and
-- the screen stops showing them.
--
-- WHAT THIS COSTS, stated rather than buried: an Administrator who is refused a
-- destruction cannot see which matter blocked it, and must ask Legal. That is
-- the owner's intent, not an oversight — and the refusal `cw.retention_destroy`
-- raises still names the matters to the caller, because the function runs with
-- owner rights. So the reason is available at the moment it matters, from the
-- act itself, to the person performing it. What is withdrawn is browsing the
-- holds at leisure.

-- ── The inert grant, removed ────────────────────────────────────────────────
-- Revoked rather than left: a grant that admits a role to a table its policies
-- refuse produces a silent empty result, and this schema's whole discipline is
-- that a refusal and an empty result must never look alike. If a future screen
-- asks these tables as the Administrator, it now gets an answer it can render.
revoke select on cw.agreement_retention, cw.legal_hold from cw_administrator;

-- `cw.agreement_under_hold(text)` KEEPS its execute grant, deliberately. It
-- answers exactly the question U13 says the Administrator may ask — is this
-- held, yes or no — and answers it without naming a matter. It is the flag, as
-- a function.

comment on view cw.retention_due is
  'What the retention sweep would consider today. `under_hold` is the flag the
   Administrator acts on; `matters` names the holds and is NOT shown to them
   (owner decision U13, 2026-07-27 — the flag is enough, the reason is Legal''s).
   Held rows stay listed on purpose: "nothing is due" and "everything due is
   frozen by litigation" are different facts and a person needs to see both.
   This view runs with its owner''s rights, which is what lets it answer the
   flag to a role that may read neither table underneath it.';
