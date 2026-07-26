// Sessions: who is holding this connection, and for how long.
//
// THE ONE IDEA. A session stores a PERSON and nothing else about their
// authority. The role is resolved from `cw.effective_role` on EVERY request,
// never cached at sign-in.
//
// That is what makes revocation mean anything. If the role were captured when
// the session was issued, revoking somebody would take effect at their next
// SIGN-IN — which for a session that lasts a working day means "tomorrow, if
// they bother to sign out". The screen would say revoked while the person went
// on working, which is worse than not having the button.
//
// What is promised, exactly, and it is what the console must say: **revocation
// is honoured at the next request.** A request already in flight completes.
// That is a real gap and it is small; promising more would need the service to
// interrupt work in progress, and pretending it does is the failure class this
// whole effort is paying down.

import { randomUUID } from 'node:crypto';

// "8h", "30d", "45m" → milliseconds. The value comes from the `session_length`
// operational setting, which an Administrator can change.
export function parseDuration(text, fallbackMs) {
  const m = /^\s*(\d+)\s*([smhd])\s*$/.exec(text ?? '');
  if (!m) return fallbackMs;
  const n = Number(m[1]);
  return n * { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]];
}

const EIGHT_HOURS = 8 * 3_600_000;

export class Sessions {
  #byToken = new Map();
  #now;

  // Time is injected so expiry can be tested without sleeping. A test that
  // proves expiry by waiting eight hours is a test nobody runs.
  constructor({ now = () => Date.now() } = {}) { this.#now = now; }

  issue(person, lengthMs) {
    const token = randomUUID();
    const issuedAt = this.#now();
    this.#byToken.set(token, { person, issuedAt, expiresAt: issuedAt + lengthMs });
    return { token, expiresAt: issuedAt + lengthMs };
  }

  // Returns the person, or null. Deliberately returns no role: the caller must
  // go and ask the database what this person may do right now.
  personFor(token) {
    const s = this.#byToken.get(token);
    if (!s) return null;
    if (this.#now() >= s.expiresAt) { this.#byToken.delete(token); return null; }
    return s.person;
  }

  end(token) { this.#byToken.delete(token); }

  // Used when an account is revoked, to drop the token rather than wait for it
  // to expire. Belt and braces: the per-request role resolution already refuses
  // the revoked person, so this only shortens the window in which a doomed
  // token is still presented.
  endAllFor(person) {
    for (const [t, s] of this.#byToken) if (s.person === person) this.#byToken.delete(t);
  }

  get size() { return this.#byToken.size; }
}

export { EIGHT_HOURS };
