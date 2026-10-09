-- Store the selected route color and photo marker coordinates with each project.
-- Coordinates are normalized from 0 to 1 so they remain aligned at any display size.
alter table public.projects
  add column if not exists hold_color text;

alter table public.projects
  add column if not exists hold_markers jsonb not null default '[]'::jsonb;
