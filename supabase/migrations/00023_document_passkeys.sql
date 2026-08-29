-- Vault hardening: passphrase-grade KDF + biometric unlock (WebAuthn PRF).
--
-- Two changes that go together, both aimed at the same weakness (security
-- review 2026-08, finding M1): the vault key was derived from a 6-12 digit
-- PIN at PBKDF2-210k, and the salt + verifier are cached client-side so a
-- stolen device allowed an OFFLINE brute force. Six digits is 10^6 — the
-- whole space falls in well under a minute on a GPU.
--
-- 1. `document_pin.iterations` — the KDF cost is now recorded per vault
--    instead of being a hardcoded constant. Existing vaults keep 210000
--    (changing it would make their ciphertext undecryptable); new vaults are
--    created at 600000, the current OWASP guidance for PBKDF2-SHA256. The
--    client reads this column and derives with whatever the row says, so a
--    future bump is another default, not a re-encryption.
--
-- 2. `document_passkeys` — per-device biometric unlock. The device's
--    authenticator (Face ID / Touch ID / Android biometric) holds a
--    credential whose WebAuthn PRF extension yields a stable 256-bit secret;
--    that secret encrypts a copy of the vault key, stored here as
--    `wrapped_key_*`. Day-to-day unlocking then costs an attacker 2^256, not
--    10^6 — the passphrase is only needed to enrol a new device or to
--    recover one.
--
-- Why the wrapped key is safe to keep server-side: it is AES-GCM ciphertext
-- under a key that never leaves the device's secure enclave. Reading this
-- table — as an owner, or with the whole database — yields nothing without
-- the physical authenticator. That is the point: unlike the PIN's salt +
-- verifier, these rows are not brute-forceable.
--
-- Biometrics themselves never reach us. WebAuthn returns a signature and the
-- PRF output; no face or fingerprint template is transmitted or stored.

-- ============ 1. PER-VAULT KDF COST ============

alter table document_pin
  add column iterations int not null default 210000;

comment on column document_pin.iterations is
  'PBKDF2-SHA256 iteration count this vault''s key was derived with. Existing '
  'vaults stay at 210000; new ones are created at 600000. Never change it for '
  'an existing row — the derived key would no longer open its documents.';

-- The PRF input is per VAULT, not per credential: one WebAuthn get() call
-- evaluates a single salt across every allowed credential, so unlocking with
-- "whichever device is in your hand" needs the salt known up front. Sharing it
-- is sound — the authenticator derives from (credential key, salt), so each
-- device still gets a completely different secret. Null until the first
-- device is enrolled, which is also how vaults created before this migration
-- pick one up.
alter table document_pin
  add column prf_salt text;

-- ============ 2. DEVICE PASSKEYS ============

create table document_passkeys (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  -- base64url credential id, as returned by the authenticator
  credential_id text not null unique,
  -- the vault key, AES-GCM encrypted under this credential's PRF secret
  wrapped_key_iv text not null,
  wrapped_key_ct text not null,
  -- owner-facing device name ("הטלפון של הדר") so a lost device can be found
  -- in the list and removed
  label text not null,
  created_by uuid references members(id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table document_passkeys enable row level security;

-- Owners only, same posture as document_pin. Kids and guests have no policy
-- and no business here — they never reach documents at all (CLAUDE.md #2).
create policy document_passkeys_owner_all on document_passkeys
  for all using (public.is_owner_of(trip_id))
  with check (public.is_owner_of(trip_id));

create index idx_document_passkeys_trip_id on document_passkeys(trip_id);
create index idx_document_passkeys_created_by on document_passkeys(created_by);
