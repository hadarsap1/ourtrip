-- Deny matrix: every public table x every outside-ish role x select / insert /
-- update / delete. Seeds one generic row per table (as superuser, owned by the
-- probe trip), then tries each operation as each role inside a subtransaction
-- that is always rolled back. Results land in rls_matrix; 90_matrix.sql
-- asserts the rules, and `scripts/rls/run.sh scripts/rls/probes/90_matrix.sql`
-- prints the whole grid.
--
-- Included by probes/90_matrix.sql after seed.sql, inside its transaction.

-- a second trip with its own owner: "a parent of another family"
insert into trips (id, name) values ('00000000-0000-0000-0000-0000000000a2', 'other trip');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000aa06', 'other@probe.test');
insert into members (id, trip_id, auth_user_id, email, display_name, role) values
  ('00000000-0000-0000-0000-0000000000b6', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000aa06', 'other@probe.test', 'Other owner', 'owner');
create or replace function rls.as_other_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000aa06","email":"other@probe.test","role":"authenticated"}', true) $$;
grant execute on function rls.as_other_owner() to anon, authenticated;

create temp table rls_seeded (tbl text primary key, pk_col text, pk_val text, insert_sql text);
create temp table rls_matrix (who text, tbl text, op text, result text, detail text);
grant all on rls_seeded, rls_matrix to anon, authenticated;

-- a value for one column, by FK target, type, and a few known-name rules
create or replace function rls.gen_value(p_tbl text, p_col text, p_type regtype, p_udt text, p_attempt int)
returns text language plpgsql as $$
declare
  ref_tbl text;
  ref_id text;
  enum_first text;
begin
  select ccu.table_name into ref_tbl
    from information_schema.key_column_usage kcu
    join information_schema.referential_constraints rc on rc.constraint_name = kcu.constraint_name and rc.constraint_schema = kcu.constraint_schema
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = rc.unique_constraint_name and ccu.constraint_schema = rc.unique_constraint_schema
   where kcu.table_schema = 'public' and kcu.table_name = p_tbl and kcu.column_name = p_col
   limit 1;
  -- a group can only be linked to a kid (00063 guard)
  if p_tbl = 'guest_group_kids' and p_col = 'member_id' then
    return quote_literal('00000000-0000-0000-0000-0000000000b2');
  end if;
  if ref_tbl = 'trips' then return quote_literal('00000000-0000-0000-0000-0000000000a1');
  elsif ref_tbl = 'members' then return quote_literal('00000000-0000-0000-0000-0000000000b1');
  elsif ref_tbl = 'users' then return quote_literal('00000000-0000-0000-0000-00000000aa01');
  elsif ref_tbl is not null then
    select pk_val into ref_id from rls_seeded where tbl = ref_tbl;
    if ref_id is null then return null; end if;  -- dependency not seeded yet
    return quote_literal(ref_id);
  end if;

  if p_col = 'trip_id' then return quote_literal('00000000-0000-0000-0000-0000000000a1'); end if;
  if p_col = 'country_code' then return quote_literal('TH'); end if;
  if p_col like '%currency%' then return quote_literal('THB'); end if;
  if p_col like '%email%' then return quote_literal('probe' || p_attempt || '@probe.test'); end if;
  if p_col = 'slug' then return 'null'; end if;
  if p_col like '%token_hash%' then return quote_literal(repeat('a', 64)); end if;
  if p_col like '%lang%' or p_col = 'locale' then return quote_literal('th'); end if;

  select e.enumlabel into enum_first from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = p_udt order by e.enumsortorder limit 1;
  if enum_first is not null then return quote_literal(enum_first); end if;

  return case
    when p_type in ('uuid'::regtype) then 'gen_random_uuid()'
    when p_type in ('text'::regtype, 'character varying'::regtype) then quote_literal(case when p_attempt > 1 then 'probe-' || p_col else 'x' end)
    when p_type in ('integer'::regtype, 'bigint'::regtype, 'smallint'::regtype) then '1'
    when p_type in ('numeric'::regtype, 'double precision'::regtype, 'real'::regtype) then '1'
    when p_type = 'boolean'::regtype then 'false'
    when p_type = 'date'::regtype then 'current_date'
    when p_type in ('timestamp with time zone'::regtype, 'timestamp without time zone'::regtype) then 'now()'
    when p_type = 'time without time zone'::regtype then quote_literal('10:00')
    when p_type in ('jsonb'::regtype, 'json'::regtype) then quote_literal('{}')
    when p_type = 'bytea'::regtype then quote_literal('\x00')
    when p_udt like '\_%' then quote_literal('{}')
    else quote_literal('x')
  end;
end $$;

-- seed: several passes so FK dependencies resolve
do $$
declare
  t record; col record;
  cols text; vals text; v text; pk text; pkv text; sql text; ok boolean;
  pass int; attempt int; pending int;
begin
  for pass in 1..6 loop
    pending := 0;
    for t in select c.relname as tbl from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind = 'r'
                and c.relname not in (select tbl from rls_seeded) order by 1 loop
      ok := false;
      for attempt in 1..2 loop
        cols := ''; vals := '';
        pk := null; pkv := null;
        for col in select a.attname as col, a.atttypid::regtype as typ, ty.typname as udt, a.attnotnull as notnull,
                        (pg_get_expr(d.adbin, d.adrelid)) as def,
                        exists (select 1 from pg_index i where i.indrelid = a.attrelid and i.indisprimary and a.attnum = any(i.indkey)) as is_pk
                   from pg_attribute a
                   join pg_type ty on ty.oid = a.atttypid
                   left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
                  where a.attrelid = ('public.' || quote_ident(t.tbl))::regclass and a.attnum > 0 and not a.attisdropped
                    and a.attgenerated = '' loop
          if col.is_pk and pk is null then pk := col.col; end if;
          -- fill required columns, and trip_id / member-ish FKs even when nullable
          if (col.notnull and col.def is null) or col.col in ('trip_id', 'member_id', 'author_id', 'uploaded_by', 'sender_id', 'created_by', 'recorded_by')
             or (col.col = 'post_id' and t.tbl in ('comments', 'reactions')) then
            v := rls.gen_value(t.tbl, col.col, col.typ, col.udt, attempt);
            if v is null then cols := null; exit; end if;
            if col.is_pk and v = 'gen_random_uuid()' then v := quote_literal(gen_random_uuid()::text); end if;
            if col.is_pk then pkv := v; end if;
            cols := cols || case when cols = '' then '' else ', ' end || quote_ident(col.col);
            vals := vals || case when vals = '' then '' else ', ' end || v;
          end if;
        end loop;
        if cols is null then pending := pending + 1; exit; end if;
        sql := format('insert into public.%I (%s) values (%s) returning %I::text', t.tbl, cols, vals, coalesce(pk, 'ctid'));
        begin
          execute sql into pkv;
          insert into rls_seeded values (t.tbl, pk, pkv, format('insert into public.%I (%s) values (%s)', t.tbl, cols, vals));
          ok := true;
          exit;
        exception when others then
          if attempt = 2 then raise notice 'SEED-SKIP % : % (%)', t.tbl, sqlerrm, sql; end if;
        end;
      end loop;
    end loop;
    exit when pending = 0;
  end loop;
end $$;

-- try every op as every role, always rolled back
create or replace function rls.try_ops(p_who text) returns void language plpgsql as $$
declare
  s record; n int; res text; det text; new_sql text;
begin
  for s in select * from rls_seeded order by tbl loop
    -- select
    begin
      execute format('select count(*) from public.%I where %I::text = %L', s.tbl, s.pk_col, s.pk_val) into n;
      insert into rls_matrix values (p_who, s.tbl, 'select', case when n > 0 then 'VISIBLE' else 'hidden' end, null);
    exception when others then
      insert into rls_matrix values (p_who, s.tbl, 'select', 'error', sqlstate || ' ' || sqlerrm);
    end;
    -- insert (a copy with a fresh primary key)
    new_sql := s.insert_sql;
    if s.pk_col is not null then
      new_sql := regexp_replace(new_sql, quote_literal(s.pk_val), quote_literal(gen_random_uuid()::text));
    end if;
    begin
      execute new_sql;
      raise exception using errcode = 'P0001', message = 'RLS_ROLLBACK';
    exception
      when sqlstate 'P0001' then
        if sqlerrm = 'RLS_ROLLBACK' then insert into rls_matrix values (p_who, s.tbl, 'insert', 'ALLOWED', null);
        else insert into rls_matrix values (p_who, s.tbl, 'insert', 'denied', sqlerrm); end if;
      when others then
        insert into rls_matrix values (p_who, s.tbl, 'insert', case when sqlstate = '42501' then 'denied' else 'blocked' end, sqlstate || ' ' || left(sqlerrm, 80));
    end;
    -- update (touch the primary key column to itself)
    begin
      execute format('update public.%I set %I = %I where %I::text = %L', s.tbl, s.pk_col, s.pk_col, s.pk_col, s.pk_val);
      get diagnostics n = row_count;
      res := case when n > 0 then 'ALLOWED' else 'denied' end;
      raise exception using errcode = 'P0001', message = 'RLS_ROLLBACK:' || res;
    exception
      when sqlstate 'P0001' then
        insert into rls_matrix values (p_who, s.tbl, 'update', split_part(sqlerrm, ':', 2), null);
      when others then
        insert into rls_matrix values (p_who, s.tbl, 'update', case when sqlstate = '42501' then 'denied' else 'blocked' end, sqlstate || ' ' || left(sqlerrm, 80));
    end;
    -- delete
    begin
      execute format('delete from public.%I where %I::text = %L', s.tbl, s.pk_col, s.pk_val);
      get diagnostics n = row_count;
      res := case when n > 0 then 'ALLOWED' else 'denied' end;
      raise exception using errcode = 'P0001', message = 'RLS_ROLLBACK:' || res;
    exception
      when sqlstate 'P0001' then
        insert into rls_matrix values (p_who, s.tbl, 'delete', split_part(sqlerrm, ':', 2), null);
      when others then
        insert into rls_matrix values (p_who, s.tbl, 'delete', case when sqlstate = '42501' then 'denied' else 'blocked' end, sqlstate || ' ' || left(sqlerrm, 80));
    end;
  end loop;
end $$;
grant execute on function rls.try_ops(text) to anon, authenticated;

set local role anon;          select rls.as_anon();        select rls.try_ops('anon');        reset role;
set local role authenticated; select rls.as_outsider();    select rls.try_ops('outsider');    reset role;
set local role authenticated; select rls.as_revoked();     select rls.try_ops('revoked');     reset role;
set local role authenticated; select rls.as_other_owner(); select rls.try_ops('other_owner'); reset role;
set local role authenticated; select rls.as_guest();       select rls.try_ops('guest');       reset role;
set local role authenticated; select rls.as_kid();         select rls.try_ops('kid');         reset role;
set local role authenticated; select rls.as_owner();       select rls.try_ops('owner');       reset role;
