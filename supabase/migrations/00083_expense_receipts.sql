-- Receipt photos on expenses (DECISIONS #53).
--
-- Hadar 02/11/2026: photograph receipts and keep them with the expense. Any
-- number per expense (a long receipt in two shots, an invoice plus the card
-- slip). Taken from the full expense form; a receipt taken offline is kept on
-- the phone and uploaded on reconnect, with the expense it belongs to.
--
-- One row per photo, the same shape as booking_files (00037), plus trip_id so
-- the budget screen lists a trip's receipts in one plain query. The client
-- picks the row id and the object path, so a replay from the offline queue
-- that already went through is recognised instead of saved twice.
--
-- RLS coverage: expense_receipts_owner_all - owners only, and a row may only
-- point at an expense of the same trip. Kids and guests get no policy, so
-- they read and write nothing (CLAUDE.md rule 2: budget is owners only).
-- Storage: the private `expense-receipts` bucket with four owner-only
-- policies on storage.objects, the same as booking-files (00003); photos are
-- opened through short-lived signed URLs, which pass the SELECT policy.

create table if not exists public.expense_receipts (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  -- Path inside the 'expense-receipts' bucket: <trip>/<expense>/<id>.jpg.
  -- Unique: two rows on one object would make "delete this receipt" delete
  -- the other one's photo too.
  file_path text not null unique,
  mime_type text,
  size_bytes bigint,
  created_by uuid references public.members(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_expense_receipts_expense_id
  on public.expense_receipts (expense_id, created_at);
create index if not exists idx_expense_receipts_trip_id
  on public.expense_receipts (trip_id);
create index if not exists idx_expense_receipts_created_by
  on public.expense_receipts (created_by);

alter table public.expense_receipts enable row level security;

drop policy if exists expense_receipts_owner_all on public.expense_receipts;
create policy expense_receipts_owner_all on public.expense_receipts
  for all
  using (trip_id = (select public.member_trip_as('owner')))
  with check (
    public.is_owner_of(trip_id)
    and exists (
      select 1 from public.expenses e
      where e.id = expense_receipts.expense_id
        and e.trip_id = expense_receipts.trip_id
    )
  );

-- the other phone sees a new receipt on the budget screen (subscribeBudget);
-- realtime admits a row only to subscribers the SELECT policy above admits
alter publication supabase_realtime add table public.expense_receipts;

-- ============ STORAGE: expense-receipts (owners only) ============
-- Photos are compressed on the phone (~1600px JPEG, lib/images.ts) before
-- upload; the original is kept only when the browser cannot decode it (HEIC).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'expense-receipts',
  'expense-receipts',
  false,
  10 * 1024 * 1024, -- 10MB
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do nothing;

drop policy if exists expense_receipts_owner_select on storage.objects;
create policy expense_receipts_owner_select on storage.objects
  for select using (
    bucket_id = 'expense-receipts' and public.current_member_role() = 'owner'
  );

drop policy if exists expense_receipts_owner_insert on storage.objects;
create policy expense_receipts_owner_insert on storage.objects
  for insert with check (
    bucket_id = 'expense-receipts' and public.current_member_role() = 'owner'
  );

drop policy if exists expense_receipts_owner_update on storage.objects;
create policy expense_receipts_owner_update on storage.objects
  for update using (
    bucket_id = 'expense-receipts' and public.current_member_role() = 'owner'
  ) with check (
    bucket_id = 'expense-receipts' and public.current_member_role() = 'owner'
  );

drop policy if exists expense_receipts_owner_delete on storage.objects;
create policy expense_receipts_owner_delete on storage.objects
  for delete using (
    bucket_id = 'expense-receipts' and public.current_member_role() = 'owner'
  );
