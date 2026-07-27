-- 0016 · The login the doorway connects as — and why it can do nothing.
--
-- WHAT THIS IS FOR
-- Every rule in this schema is enforced against the role a connection is
-- actually acting as. That works only if the serving path never connects as the
-- owner, who is exempt from row-level security by definition and holds every
-- table privilege. Until now nothing in the repository connected at all — the
-- database lived inside the test process and the owner was the only login there
-- was. The doorway changes that, so it needs a login of its own.
--
-- THE SHAPE, AND THE ONE WORD THAT MAKES IT SAFE
--
--   cw_app is a member of all six application roles, and NOINHERIT.
--
-- NOINHERIT is load-bearing and easy to leave out. Without it, membership of the
-- six roles would hand cw_app the SUM of all six roles' privileges on every
-- connection, before any request has said who it is — an administrator's writes
-- and a legal admin's authority available to anybody the doorway serves, with
-- every policy in the schema satisfied. With it, membership confers exactly
-- nothing until the connection says `set local role`, which is what binds a
-- request to one person's authority for the length of that request.
--
-- So a connection sitting idle in the pool holds no application role at all:
-- cw.app_role() answers null on it and every policy fails closed. Being useless
-- in that state is the whole point — it is what makes a leaked connection
-- harmless rather than catastrophic.
--
-- NO PASSWORD AND NO LOGIN ARE SET HERE, DELIBERATELY.
-- A credential in a file that is committed is a credential that is published.
-- The deployment grants LOGIN and sets a password (see doorway/setup.py for the
-- development version); this migration only establishes what the role may become
-- once it does.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cw_app') then
    -- nologin until a deployment says otherwise; noinherit always.
    create role cw_app noinherit nologin;
  else
    -- Idempotent, and it re-asserts noinherit rather than assuming: if somebody
    -- ever "fixes" this role by hand, the next migration run puts it back.
    alter role cw_app noinherit;
  end if;
end $$;

grant cw_viewer, cw_requester, cw_legal_reviewer, cw_legal_admin, cw_auditor,
      cw_administrator
  to cw_app;

comment on role cw_app is
  'The login the doorway connects as. A member of all six application roles and '
  'NOINHERIT, so it holds none of their privileges until a request binds one '
  'with SET LOCAL ROLE. An idle connection can do nothing.';

-- It needs to reach the schema to run anything at all once it has become a role
-- — but usage on the schema alone grants no access to any table, every one of
-- which is governed by its own grants and policies.
grant usage on schema cw to cw_app;

-- Deliberately NOT granted: any table privilege, any sequence, any function.
-- If a future migration needs the doorway to reach something before it knows who
-- the person is, that is a decision to argue for on its own merits, not a line
-- to add here quietly.
