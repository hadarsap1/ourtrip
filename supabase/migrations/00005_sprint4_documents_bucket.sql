-- Sprint 4: documents vault storage (owners only — CLAUDE.md hard rule #2:
-- kids and guests must never read documents).
--
-- Table access is covered by the pre-existing documents_owner_all policy
-- (00001). New policies below cover ONLY the documents storage bucket, same
-- owner-only pattern as booking-files (00003).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  20 * 1024 * 1024, -- 20MB
  array['application/pdf','image/jpeg','image/png','image/webp','image/heic']
)
on conflict (id) do nothing;

create policy documents_owner_select on storage.objects
  for select using (
    bucket_id = 'documents' and public.current_member_role() = 'owner'
  );

create policy documents_owner_insert on storage.objects
  for insert with check (
    bucket_id = 'documents' and public.current_member_role() = 'owner'
  );

create policy documents_owner_update on storage.objects
  for update using (
    bucket_id = 'documents' and public.current_member_role() = 'owner'
  ) with check (
    bucket_id = 'documents' and public.current_member_role() = 'owner'
  );

create policy documents_owner_delete on storage.objects
  for delete using (
    bucket_id = 'documents' and public.current_member_role() = 'owner'
  );
