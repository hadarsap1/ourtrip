-- B1 (backlog): share a specific document with kids — e.g. a boarding pass.
-- Documents stay owner-only by default; an owner opts a single document in via
-- shared_with_kids. Kids get read-only access to those rows and their bytes.
-- Kids have no INSERT/UPDATE/DELETE policy on documents, so they can never
-- flip the flag or alter a document — read only (CLAUDE.md rule #2).

alter table documents add column shared_with_kids boolean not null default false;

create index if not exists idx_documents_shared_with_kids
  on documents(trip_id) where shared_with_kids;

-- kids read only documents explicitly shared with them
create policy documents_kid_select on documents
  for select using (
    public.is_kid_of(trip_id) and shared_with_kids = true
  );

-- storage: a kid may read the bytes of a kid-shared document. SECURITY DEFINER
-- so the lookup can see the documents row; is_kid_of() still resolves the
-- CALLER (request JWT claims are request-local), so a non-kid gets false.
create or replace function public.document_shared_with_current_kid(p_path text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from documents d
    where d.file_path = p_path
      and d.shared_with_kids = true
      and public.is_kid_of(d.trip_id)
  );
$$;

revoke execute on function public.document_shared_with_current_kid(text)
  from public, anon;
grant execute on function public.document_shared_with_current_kid(text)
  to authenticated;

create policy documents_kid_read on storage.objects
  for select using (
    bucket_id = 'documents'
    and public.document_shared_with_current_kid(name)
  );
