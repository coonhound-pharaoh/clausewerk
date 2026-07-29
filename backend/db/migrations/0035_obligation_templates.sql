-- 0035 · Obligation templates — the third content type through the gate (OB-01)
--
-- OBLIGATIONS-ARCHITECTURE.md §2.1. An obligation template is a Legal-authored
-- declaration on a CLAUSE VERSION: what the clause obliges, who owes it, when it
-- falls due, what evidence satisfies it. Registration (OB-02) later turns these
-- into concrete obligation instances at execution — a lookup, never an analysis.
--
-- The discipline is the clause-version discipline applied verbatim:
--
--   · A template is born 'proposed'. It cannot be born approved — the
--     review_ticket_opens_pending lesson, applied on day one.
--   · Approval is a named human act by legal_admin, and never the proposer's
--     own (the 0028 rule: nobody approves their own request).
--   · An approved template is immutable except retirement. Registration reads
--     templates "as they stood" by date arithmetic over approved_on/retired_on,
--     so rewriting an approved row would rewrite what past registrations meant.
--   · Retired is terminal. A retired template never comes back by edit; author
--     a new one.
--   · Nothing is deleted, ever.
--
-- Template WORDING (`summary`) is content: placeholder until Legal writes the
-- real thing, and never tested for its words.

create table cw.obligation_template (
  template_id   bigserial primary key,
  clause_id     text not null,
  version       int  not null,
  kind          text not null check (kind in
                  ('deliver','pay','notify','maintain','refrain','permit')),
  -- Which PARTY owes it, as declared on the clause. Resolution to a named
  -- counterparty happens at registration, against the agreement record.
  obliged       text not null check (obliged in ('customer','vendor')),
  -- Content. Placeholder wording is expected during development.
  summary       text not null check (btrim(summary) <> ''),
  schedule_kind text not null check (schedule_kind in ('once','recurring','on_event')),
  -- The anchor is a named date on the executed record. 'termination' is the one
  -- event v1 recognises for on_event schedules: survival obligations measure
  -- from it. Its date is not known at execution, so instances anchored on it
  -- register unanchored (OB-02) and acquire a due date when termination is
  -- wired — stated there rather than smoothed over here.
  anchor        text not null check (anchor in
                  ('effective_on','executed_on','term_end','termination')),
  offset_days   int  not null default 0,
  every_months  int  check (every_months is null or every_months >= 1),
  evidence      text not null check (evidence in
                  ('document','attestation','system','counterparty_ack')),
  lead_days     int  not null default 30 check (lead_days >= 0),
  survives      boolean not null default false,
  entitlement   boolean not null default false,
  -- The gate.
  state         text not null default 'proposed'
                  check (state in ('proposed','approved','retired')),
  proposed_by   text,
  approved_by   text,
  approved_on   date,
  effective_on  date,
  retired_by    text,
  retired_on    date,
  retired_reason text,
  created_at    timestamptz not null default now(),
  foreign key (clause_id, version) references cw.clause_version(clause_id, version),
  constraint recurrence_is_whole check
    ((schedule_kind = 'recurring') = (every_months is not null)),
  constraint on_event_means_termination check
    (schedule_kind <> 'on_event' or anchor = 'termination'),
  constraint termination_means_on_event check
    (anchor <> 'termination' or schedule_kind = 'on_event'),
  constraint approval_is_whole check
    ((state = 'proposed') = (approved_by is null)),
  constraint retirement_is_whole check
    ((state = 'retired') = (retired_on is not null)),
  constraint retirement_needs_reason check
    (state <> 'retired' or coalesce(btrim(retired_reason), '') <> '')
);

create index on cw.obligation_template (clause_id, version);

comment on table cw.obligation_template is
  'What a clause version obliges, declared by Legal and approved through the
   gate. Registration (OB-02) reads these BY DATE — approved_on and retired_on
   are the record of what was in force when an agreement executed — so an
   approved row is immutable except retirement, and retirement is terminal.';

-- ── Born proposed ───────────────────────────────────────────────────────────
-- The ungoverned INSERT is how a state machine is walked past on day one: a row
-- born 'approved' with a hand-written approver never meets the transition
-- trigger. So birth is normalised here, whatever the caller wrote.
create or replace function cw.obligation_template_opens_proposed() returns trigger
language plpgsql as $$
begin
  if new.state <> 'proposed' or new.approved_by is not null
     or new.approved_on is not null or new.retired_on is not null then
    raise exception
      'an obligation template is born proposed; approval is a separate act '
      'by a named legal admin'
      using errcode = 'restrict_violation';
  end if;
  if cw.app_role() is not null then
    new.proposed_by := cw.app_actor();
    new.created_at  := now();
  end if;
  return new;
end $$;

create trigger obligation_template_opens_proposed
  before insert on cw.obligation_template
  for each row execute function cw.obligation_template_opens_proposed();

-- ── The transitions, and the immutability that makes the dates a record ─────
create or replace function cw.obligation_template_transition() returns trigger
language plpgsql as $$
begin
  -- Retired is terminal, whatever the edit.
  if old.state = 'retired' then
    raise exception
      'obligation template % is retired; a retired template never comes back '
      '— author a new one', old.template_id
      using errcode = 'restrict_violation';
  end if;

  -- What a template attaches to and declares is fixed once APPROVED.
  -- While proposed it may be reworked freely — that is what proposed is for.
  if old.state = 'approved'
     and (new.clause_id     is distinct from old.clause_id
       or new.version       is distinct from old.version
       or new.kind          is distinct from old.kind
       or new.obliged       is distinct from old.obliged
       or new.summary       is distinct from old.summary
       or new.schedule_kind is distinct from old.schedule_kind
       or new.anchor        is distinct from old.anchor
       or new.offset_days   is distinct from old.offset_days
       or new.every_months  is distinct from old.every_months
       or new.evidence      is distinct from old.evidence
       or new.lead_days     is distinct from old.lead_days
       or new.survives      is distinct from old.survives
       or new.entitlement   is distinct from old.entitlement
       or new.proposed_by   is distinct from old.proposed_by
       or new.approved_by   is distinct from old.approved_by
       or new.approved_on   is distinct from old.approved_on
       or new.effective_on  is distinct from old.effective_on) then
    raise exception
      'obligation template % is approved and immutable; retire it and author '
      'a new one', old.template_id
      using errcode = 'restrict_violation';
  end if;

  if old.state = 'proposed' and new.state = 'approved' then
    -- Nobody approves their own proposal — the 0028 rule. The check is on the
    -- recorded proposer, not the connection, so holding two roles does not
    -- open a way around it.
    if old.proposed_by is not distinct from cw.app_actor() then
      raise exception
        'nobody approves their own obligation template — % proposed this one',
        cw.app_actor() using errcode = 'insufficient_privilege';
    end if;
    new.approved_by  := cw.app_actor();
    new.approved_on  := current_date;
    new.effective_on := coalesce(new.effective_on, current_date);
  elsif old.state = 'approved' and new.state = 'retired' then
    new.retired_by := cw.app_actor();
    new.retired_on := current_date;
  elsif new.state is distinct from old.state then
    raise exception
      'obligation template state moves proposed -> approved -> retired, '
      'never % -> %', old.state, new.state
      using errcode = 'restrict_violation';
  end if;

  return new;
end $$;

create trigger obligation_template_transition
  before update on cw.obligation_template
  for each row execute function cw.obligation_template_transition();

-- ── Nothing is deleted ──────────────────────────────────────────────────────
create or replace function cw.obligation_template_no_delete() returns trigger
language plpgsql as $$
begin
  raise exception
    'an obligation template is never deleted; retire it with a reason '
    '(template %)', old.template_id using errcode = 'restrict_violation';
end $$;

create trigger obligation_template_no_delete
  before delete on cw.obligation_template
  for each row execute function cw.obligation_template_no_delete();

-- ── Every act lands on the chain ────────────────────────────────────────────
create or replace function cw.audit_obligation_template() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform cw.audit('obligation_template_proposed', new.template_id::text,
      jsonb_build_object('clause_id', new.clause_id, 'version', new.version,
                         'kind', new.kind, 'obliged', new.obliged));
  elsif new.state = 'approved' and old.state = 'proposed' then
    perform cw.audit('obligation_template_approved', new.template_id::text,
      jsonb_build_object('clause_id', new.clause_id, 'version', new.version,
                         'approved_by', new.approved_by));
  elsif new.state = 'retired' and old.state = 'approved' then
    perform cw.audit('obligation_template_retired', new.template_id::text,
      jsonb_build_object('reason', new.retired_reason));
  end if;
  return new;
end $$;

create trigger audit_obligation_template
  after insert or update on cw.obligation_template
  for each row execute function cw.audit_obligation_template();

-- ── Who may do what ─────────────────────────────────────────────────────────
-- Library content: readable by anybody signed in, the 0002 rule — and that
-- includes the Administrator, per U11's precedent (0022): the grant beside the
-- others, no policy narrowed, no write conferred.
alter table cw.obligation_template enable row level security;

create policy read_all on cw.obligation_template for select
  using (cw.app_role() is not null);

-- Legal proposes; legal_admin decides. The reviewer's INSERT is the proposing
-- half; every state move is an UPDATE and only legal_admin holds one.
create policy legal_proposes on cw.obligation_template for insert
  with check (cw.app_role() in ('legal_reviewer','legal_admin'));

create policy admin_decides on cw.obligation_template for update
  using      (cw.app_role() = 'legal_admin')
  with check (cw.app_role() = 'legal_admin');

revoke all on cw.obligation_template from public;
grant select on cw.obligation_template to
  cw_viewer, cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor,
  cw_administrator;
grant insert on cw.obligation_template to cw_legal_reviewer, cw_legal_admin;
grant update on cw.obligation_template to cw_legal_admin;
grant usage, select on sequence cw.obligation_template_template_id_seq to
  cw_legal_reviewer, cw_legal_admin;
