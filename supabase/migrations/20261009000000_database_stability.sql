-- Keep the relational tables small and index the queries used by the app.
-- Existing records are retained; older camelCase columns are renamed when present.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  grade text not null,
  angle integer not null default 0,
  total_moves integer not null default 0,
  status text not null default 'active',
  style text[] not null default '{}',
  notes text,
  image text,
  created_at timestamptz not null default now()
);

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  date timestamptz not null default now(),
  outcome text not null check (outcome in ('send', 'fall')),
  fall_move integer,
  progress integer not null default 0 check (progress between 0 and 100),
  failure_reason text
);

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'projects' and column_name = 'totalMoves')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'projects' and column_name = 'total_moves') then
    alter table public.projects rename column "totalMoves" to total_moves;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'attempts' and column_name = 'fallMove')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'attempts' and column_name = 'fall_move') then
    alter table public.attempts rename column "fallMove" to fall_move;
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'attempts' and column_name = 'failureReason')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'attempts' and column_name = 'failure_reason') then
    alter table public.attempts rename column "failureReason" to failure_reason;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.attempts'::regclass
      and confrelid = 'public.projects'::regclass
      and contype = 'f'
      and conkey = array[(
        select attnum
        from pg_attribute
        where attrelid = 'public.attempts'::regclass
          and attname = 'project_id'
          and not attisdropped
      )]::smallint[]
  ) then
    alter table public.attempts
      add constraint skalyk_attempts_project_id_fkey
      foreign key (project_id) references public.projects(id) on delete cascade not valid;
  end if;
end $$;

create index if not exists projects_user_created_idx
  on public.projects (user_id, created_at desc);
create index if not exists attempts_project_date_idx
  on public.attempts (project_id, date desc);
create index if not exists attempts_user_date_idx
  on public.attempts (user_id, date desc);

alter table public.projects enable row level security;
alter table public.attempts enable row level security;

drop policy if exists skalyk_projects_owner_access on public.projects;
create policy skalyk_projects_owner_access on public.projects
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists skalyk_attempts_owner_access on public.attempts;
create policy skalyk_attempts_owner_access on public.attempts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.projects
      where projects.id = attempts.project_id
        and projects.user_id = (select auth.uid())
    )
  );

-- Images are stored as small JPEG objects instead of large base64 database values.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-images', 'project-images', true, 3145728, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists skalyk_project_images_insert on storage.objects;
create policy skalyk_project_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'project-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists skalyk_project_images_update on storage.objects;
create policy skalyk_project_images_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'project-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'project-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists skalyk_project_images_delete on storage.objects;
create policy skalyk_project_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'project-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
