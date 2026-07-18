-- Per-document lock (end-to-end encryption). An owner marks a sensitive
-- document (e.g. a passport) as pin_protected: the client encrypts the file
-- with AES-GCM under a key derived (PBKDF2) from the family Documents PIN
-- BEFORE upload, so the storage bucket only ever holds ciphertext. Opening
-- decrypts in-browser with the PIN. The server never sees the PIN or plaintext;
-- a finder with the device cannot read a locked document without the PIN.
--
-- enc_mime preserves the original content type so the decrypted blob opens
-- correctly. document_pin holds the per-trip PBKDF2 salt and a verifier
-- (ciphertext of a known token) so any owner device can validate the PIN.
-- Forgotten PIN = unrecoverable by design (owner-confirmed).

alter table documents add column pin_protected boolean not null default false;
alter table documents add column enc_mime text;

create table document_pin (
  trip_id uuid primary key references trips(id),
  salt text not null,
  verifier_iv text not null,
  verifier_ct text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table document_pin enable row level security;

-- owners only — the salt/verifier reveal nothing without the PIN, and kids/
-- guests never touch documents anyway
create policy document_pin_owner_all on document_pin
  for all using (public.is_owner_of(trip_id))
  with check (public.is_owner_of(trip_id));

create trigger document_pin_set_updated_at
  before update on document_pin
  for each row execute function public.set_updated_at();
