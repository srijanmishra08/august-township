-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- plots: static footprint + dynamic status/price
create table plots (
  id           uuid primary key default uuid_generate_v4(),
  project_slug text not null,
  plot_number  text not null,
  geometry_ref text,
  area_sqft    numeric(10,2),
  type         text not null default 'residential',
  facing       text,
  status       text not null default 'available'
               check (status in ('available','reserved','sold','blocked')),
  price        numeric(12,2),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (project_slug, plot_number)
);

-- leads: interest submissions from public site
create table leads (
  id           uuid primary key default uuid_generate_v4(),
  project_slug text not null,
  plot_id      uuid references plots(id) on delete set null,
  name         text not null,
  phone        text not null,
  email        text,
  message      text,
  status       text not null default 'new'
               check (status in ('new','contacted','site_visit_scheduled','site_visit_done','negotiating','booked','lost')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- lead_notes: threaded comments per lead (admin only)
create table lead_notes (
  id         uuid primary key default uuid_generate_v4(),
  lead_id    uuid not null references leads(id) on delete cascade,
  author_id  uuid not null references auth.users(id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now()
);

-- audit_log: plot status/price change history
create table audit_log (
  id          uuid primary key default uuid_generate_v4(),
  entity_type text not null check (entity_type in ('plot','lead')),
  entity_id   uuid not null,
  field       text not null,
  old_value   text,
  new_value   text,
  changed_by  uuid references auth.users(id) on delete set null,
  changed_at  timestamptz not null default now()
);

-- updated_at auto-update trigger
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger plots_updated_at
  before update on plots for each row execute function update_updated_at();
create trigger leads_updated_at
  before update on leads for each row execute function update_updated_at();

-- RLS: enable on all tables
alter table plots      enable row level security;
alter table leads      enable row level security;
alter table lead_notes enable row level security;
alter table audit_log  enable row level security;

-- plots: public read (public site needs plot data), admin write
create policy "plots_select_public"
  on plots for select using (true);
create policy "plots_insert_admin"
  on plots for insert with check (auth.role() = 'authenticated');
create policy "plots_update_admin"
  on plots for update using (auth.role() = 'authenticated');
create policy "plots_delete_admin"
  on plots for delete using (auth.role() = 'authenticated');

-- leads: authenticated only (public INSERT goes via /api/leads → service_role, bypasses RLS)
create policy "leads_select_admin"
  on leads for select using (auth.role() = 'authenticated');
create policy "leads_insert_admin"
  on leads for insert with check (auth.role() = 'authenticated');
create policy "leads_update_admin"
  on leads for update using (auth.role() = 'authenticated');
create policy "leads_delete_admin"
  on leads for delete using (auth.role() = 'authenticated');

-- lead_notes: authenticated only
create policy "lead_notes_admin"
  on lead_notes using (auth.role() = 'authenticated');
create policy "lead_notes_insert_admin"
  on lead_notes for insert with check (auth.role() = 'authenticated');

-- audit_log: read by authenticated, no direct writes (application writes via service_role)
create policy "audit_log_admin_read"
  on audit_log for select using (auth.role() = 'authenticated');
