-- 00083: receipt photos on expenses. Owners only, in the table and in the
-- expense-receipts bucket; a receipt may only point at an expense of its trip.
begin;
\i scripts/rls/seed.sql

insert into trips (id, name) values ('00000000-0000-0000-0000-0000000000a2', 'other trip');
insert into budget_categories (id, trip_id, key, label_he) values
  ('00000000-0000-0000-0000-0000000083c1', '00000000-0000-0000-0000-0000000000a1', 'food', 'אוכל'),
  ('00000000-0000-0000-0000-0000000083c2', '00000000-0000-0000-0000-0000000000a2', 'food', 'אוכל');
insert into members (id, trip_id, display_name, role) values
  ('00000000-0000-0000-0000-0000000083b9', '00000000-0000-0000-0000-0000000000a2', 'Other', 'owner');
insert into expenses (id, trip_id, category_id, amount, currency, amount_ils, created_by) values
  ('00000000-0000-0000-0000-0000000083e1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000083c1',
   1000, 'ILS', 1000, '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000083e9', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000083c2',
   10, 'ILS', 10, '00000000-0000-0000-0000-0000000083b9');

select rls.check('bucket expense-receipts is private',
  (select not public from storage.buckets where id = 'expense-receipts'));

-- ---- a parent attaches a receipt and its photo ----
set local role authenticated; select rls.as_owner();
insert into storage.objects (bucket_id, name) values
  ('expense-receipts', '00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000083e1/r1.jpg');
insert into expense_receipts (id, trip_id, expense_id, file_path, created_by) values
  ('00000000-0000-0000-0000-0000000083f1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000083e1',
   '00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000083e1/r1.jpg', '00000000-0000-0000-0000-0000000000b1');
select rls.check('owner: reads the receipt and its photo',
  (select count(*) from expense_receipts) = 1
  and (select count(*) from storage.objects where bucket_id = 'expense-receipts') = 1);
do $$ begin
  insert into expense_receipts (trip_id, expense_id, file_path) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000083e9', 'x/other.jpg');
  raise exception 'FAIL  owner: attached a receipt to another trip''s expense';
exception when insufficient_privilege then raise notice 'PASS  owner: cannot attach to another trip''s expense';
end $$;
do $$ begin
  insert into expense_receipts (trip_id, expense_id, file_path) values
    ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000083e9', 'x/other2.jpg');
  raise exception 'FAIL  owner: wrote a receipt into a trip they do not own';
exception when insufficient_privilege then raise notice 'PASS  owner: cannot write into a trip they do not own';
end $$;
reset role;

-- ---- kid, guest, revoked guest, outsider, anon: nothing ----
set local role authenticated; select rls.as_kid();
select rls.check('kid: reads no receipts', not exists (select 1 from expense_receipts));
select rls.check('kid: reads no receipt photos', not exists (select 1 from storage.objects where bucket_id = 'expense-receipts'));
update expense_receipts set file_path = 'kid.jpg';
delete from expense_receipts;
delete from storage.objects where bucket_id = 'expense-receipts';
do $$ begin
  insert into storage.objects (bucket_id, name) values ('expense-receipts', 'kid.jpg');
  raise exception 'FAIL  kid: uploaded a receipt photo';
exception when insufficient_privilege then raise notice 'PASS  kid: cannot upload a receipt photo';
end $$;
reset role;

set local role authenticated; select rls.as_guest();
select rls.check('guest: reads no receipts', not exists (select 1 from expense_receipts));
select rls.check('guest: reads no receipt photos', not exists (select 1 from storage.objects where bucket_id = 'expense-receipts'));
update expense_receipts set file_path = 'guest.jpg';
delete from expense_receipts;
delete from storage.objects where bucket_id = 'expense-receipts';
do $$ begin
  insert into expense_receipts (trip_id, expense_id, file_path) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000083e1', 'guest.jpg');
  raise exception 'FAIL  guest: added a receipt';
exception when insufficient_privilege then raise notice 'PASS  guest: cannot add a receipt';
end $$;
do $$ begin
  insert into storage.objects (bucket_id, name) values ('expense-receipts', 'guest.jpg');
  raise exception 'FAIL  guest: uploaded a receipt photo';
exception when insufficient_privilege then raise notice 'PASS  guest: cannot upload a receipt photo';
end $$;
reset role;

set local role authenticated; select rls.as_revoked();
select rls.check('revoked guest: reads no receipts', not exists (select 1 from expense_receipts));
reset role;
set local role authenticated; select rls.as_outsider();
select rls.check('outsider: reads no receipts or photos',
  not exists (select 1 from expense_receipts)
  and not exists (select 1 from storage.objects where bucket_id = 'expense-receipts'));
reset role;
set local role anon; select rls.as_anon();
select rls.check('anon: reads no receipts', not exists (select 1 from expense_receipts));
reset role;

select rls.check('kid and guest changes and deletes did nothing',
  (select file_path from expense_receipts where id = '00000000-0000-0000-0000-0000000083f1')
    = '00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000083e1/r1.jpg'
  and (select count(*) from storage.objects where bucket_id = 'expense-receipts') = 1);

-- ---- deleting the expense takes its receipt rows with it ----
set local role authenticated; select rls.as_owner();
delete from expenses where id = '00000000-0000-0000-0000-0000000083e1';
select rls.check('owner: deleting the expense removes its receipts', not exists (select 1 from expense_receipts));
reset role;

rollback;
