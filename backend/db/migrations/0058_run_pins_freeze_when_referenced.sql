-- A content-addressed pin is assembled before its first run references it, but
-- it must become closed the instant that run exists. The original append-only
-- guards prevented edits and deletes while still allowing a working role to
-- add a new member afterwards, permanently changing the replay input of every
-- run already pointing at the id.

create or replace function cw.freeze_referenced_pin_member() returns trigger
language plpgsql security definer
set search_path = pg_catalog, cw as $$
begin
  if tg_table_name = 'snapshot_member' then
    -- Leave shape errors to the named table constraints. The freeze guard is
    -- about otherwise-valid extensions and must not mask those diagnostics.
    if new.version < 1 or not exists (
        select 1 from cw.clause_version
         where clause_id = new.clause_id and version = new.version)
    then return new; end if;
    perform 1 from cw.snapshot where snapshot_id = new.snapshot_id for update;
    if exists (select 1 from cw.run where snapshot_id = new.snapshot_id) then
      if exists (select 1 from cw.snapshot_member
                  where snapshot_id = new.snapshot_id
                    and clause_id = new.clause_id and version = new.version
                    and selectable is not distinct from new.selectable) then
        return null; -- the writer's intentional ON CONFLICT idempotency
      end if;
      raise exception 'a referenced snapshot cannot gain or change members';
    end if;
  elsif tg_table_name = 'snapshot_ladder_rung' then
    if new.rung < 0 or new.version < 1
       or new.severity not in ('Standard','High','Baseline') then
      return new;
    end if;
    if not exists (select 1 from cw.category where key = new.category_key)
       or not exists (select 1 from cw.clause_version
                       where clause_id = new.clause_id and version = new.version)
    then return new; end if;
    perform 1 from cw.snapshot where snapshot_id = new.snapshot_id for update;
    if exists (select 1 from cw.run where snapshot_id = new.snapshot_id) then
      if exists (select 1 from cw.snapshot_ladder_rung
                  where snapshot_id = new.snapshot_id
                    and category_key = new.category_key
                    and severity = new.severity and rung = new.rung
                    and clause_id = new.clause_id and version = new.version
                    and is_floor is not distinct from new.is_floor) then
        return null;
      end if;
      raise exception 'a referenced snapshot cannot gain or change ladder rungs';
    end if;
  elsif tg_table_name = 'ruleset_member' then
    if new.version < 1 or not exists (
        select 1 from cw.conflict_rule
         where rule_id = new.rule_id and version = new.version)
    then return new; end if;
    perform 1 from cw.ruleset where ruleset_id = new.ruleset_id for update;
    if exists (select 1 from cw.run where ruleset_id = new.ruleset_id) then
      if exists (select 1 from cw.ruleset_member
                  where ruleset_id = new.ruleset_id
                    and rule_id = new.rule_id and version = new.version) then
        return null;
      end if;
      raise exception 'a referenced ruleset cannot gain members';
    end if;
  end if;
  return new;
end $$;

create trigger snapshot_member_freezes_when_referenced
  before insert on cw.snapshot_member
  for each row execute function cw.freeze_referenced_pin_member();
create trigger snapshot_ladder_freezes_when_referenced
  before insert on cw.snapshot_ladder_rung
  for each row execute function cw.freeze_referenced_pin_member();
create trigger ruleset_member_freezes_when_referenced
  before insert on cw.ruleset_member
  for each row execute function cw.freeze_referenced_pin_member();

-- Serialize the transition from open pin to referenced pin with the member
-- triggers above. A concurrent extension either commits first and is caught by
-- the doorway equality check, or waits here and sees the committed run.
create or replace function cw.lock_run_pins() returns trigger
language plpgsql security definer
set search_path = pg_catalog, cw as $$
begin
  perform 1 from cw.snapshot where snapshot_id = new.snapshot_id for update;
  perform 1 from cw.ruleset where ruleset_id = new.ruleset_id for update;
  return new;
end $$;

create trigger run_locks_pins_before_reference
  before insert on cw.run
  for each row execute function cw.lock_run_pins();

revoke all on function cw.freeze_referenced_pin_member() from public;
revoke all on function cw.lock_run_pins() from public;
