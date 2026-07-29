-- 0032 · Sessions live in the database
--
-- WHAT THIS IS FOR
-- Moves the session store from memory to the database, so a service restart
-- does not silently sign everyone out. This satisfies the Phase 2 (WS-3)
-- requirement to add session persistence while sticking to the fallback
-- accounts table.
--
-- The table holds the token, the person, and the expiry time.
-- The lookup role (`cw_viewer`) manages it. It needs insert, select, and delete,
-- because sign-in and session verification run as `cw_viewer` before the real
-- role is established.

create table cw.session (
    token text primary key,
    person text not null references cw.account(person) on delete cascade on update cascade,
    expires_at double precision not null
);

comment on table cw.session is
    'Active sign-ins. Stored here so sessions survive a service restart. '
    'Managed entirely by the doorway before the request is bound to a role.';

alter table cw.session enable row level security;

-- cw_viewer is the role used by the doorway for unauthenticated lookup acts.
-- We grant it full access to this table so it can issue, verify, and drop sessions.
grant select, insert, delete on cw.session to cw_viewer;

-- A single policy allowing cw_viewer to manage all sessions.
create policy viewer_manages_sessions on cw.session
    for all to cw_viewer using (true);
