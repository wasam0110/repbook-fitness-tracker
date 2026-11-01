create table if not exists public.fitness_snapshots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  snapshot jsonb not null default '{"exercises":[],"workouts":[],"weighIns":[],"measurements":[],"photos":[],"updatedAt":"1970-01-01T00:00:00.000Z"}'::jsonb
    check (jsonb_typeof(snapshot) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.fitness_snapshots enable row level security;

create policy "fitness snapshots are readable by their owner"
  on public.fitness_snapshots for select to authenticated
  using (auth.uid() = user_id);

create policy "fitness snapshots are insertable by their owner"
  on public.fitness_snapshots for insert to authenticated
  with check (auth.uid() = user_id);

create policy "fitness snapshots are updatable by their owner"
  on public.fitness_snapshots for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.merge_tracker_record_arrays(p_local jsonb, p_remote jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(record order by record ->> 'id'), '[]'::jsonb)
  from (
    select distinct on (record ->> 'id') record
    from (
      select value as record, 0 as source_priority
      from jsonb_array_elements(coalesce(p_remote, '[]'::jsonb)) as remote_record(value)
      union all
      select value as record, 1 as source_priority
      from jsonb_array_elements(coalesce(p_local, '[]'::jsonb)) as local_record(value)
    ) as records
    order by record ->> 'id', (record ->> 'updatedAt')::timestamptz desc, source_priority desc
  ) as newest
$$;

revoke all on function public.merge_tracker_record_arrays(jsonb, jsonb) from public;
grant execute on function public.merge_tracker_record_arrays(jsonb, jsonb) to authenticated;

create or replace function public.sync_fitness_snapshot(p_local jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  merged_snapshot jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_local is null or jsonb_typeof(p_local) <> 'object' then
    raise exception 'Invalid fitness snapshot' using errcode = '22023';
  end if;
  if jsonb_typeof(p_local -> 'photos') = 'array' and exists (
    select 1
    from jsonb_array_elements(p_local -> 'photos') as photo_record(value)
    where coalesce(value ->> 'storageKey', '') !~ ('^users/' || current_user_id::text || '/[0-9a-f-]{36}\.jpg$')
  ) then
    raise exception 'Progress photo belongs to another account or has an invalid key' using errcode = '42501';
  end if;

  insert into public.fitness_snapshots as saved (user_id, snapshot, updated_at)
  values (current_user_id, p_local, now())
  on conflict (user_id) do update
  set snapshot = jsonb_build_object(
        'exercises', public.merge_tracker_record_arrays(coalesce(excluded.snapshot -> 'exercises', '[]'::jsonb), coalesce(saved.snapshot -> 'exercises', '[]'::jsonb)),
        'workouts', public.merge_tracker_record_arrays(coalesce(excluded.snapshot -> 'workouts', '[]'::jsonb), coalesce(saved.snapshot -> 'workouts', '[]'::jsonb)),
        'weighIns', public.merge_tracker_record_arrays(coalesce(excluded.snapshot -> 'weighIns', '[]'::jsonb), coalesce(saved.snapshot -> 'weighIns', '[]'::jsonb)),
        'measurements', public.merge_tracker_record_arrays(coalesce(excluded.snapshot -> 'measurements', '[]'::jsonb), coalesce(saved.snapshot -> 'measurements', '[]'::jsonb)),
        'photos', public.merge_tracker_record_arrays(coalesce(excluded.snapshot -> 'photos', '[]'::jsonb), coalesce(saved.snapshot -> 'photos', '[]'::jsonb)),
        'updatedAt', case
          when coalesce(excluded.snapshot ->> 'updatedAt', '') >= coalesce(saved.snapshot ->> 'updatedAt', '')
            then coalesce(excluded.snapshot ->> 'updatedAt', '1970-01-01T00:00:00.000Z')
          else coalesce(saved.snapshot ->> 'updatedAt', '1970-01-01T00:00:00.000Z')
        end
      ),
      updated_at = now()
  returning snapshot into merged_snapshot;

  return merged_snapshot;
end;
$$;

revoke all on function public.sync_fitness_snapshot(jsonb) from public;
grant execute on function public.sync_fitness_snapshot(jsonb) to authenticated;

grant select, insert, update on public.fitness_snapshots to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 6291456, array['image/jpeg'])
on conflict (id) do update
set public = false,
    file_size_limit = 6291456,
    allowed_mime_types = array['image/jpeg'];

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'progress photos owner read') then
    create policy "progress photos owner read" on storage.objects for select to authenticated
      using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'progress photos owner upload') then
    create policy "progress photos owner upload" on storage.objects for insert to authenticated
      with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'progress photos owner update') then
    create policy "progress photos owner update" on storage.objects for update to authenticated
      using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = auth.uid()::text)
      with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'progress photos owner delete') then
    create policy "progress photos owner delete" on storage.objects for delete to authenticated
      using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = auth.uid()::text);
  end if;
end
$$;
