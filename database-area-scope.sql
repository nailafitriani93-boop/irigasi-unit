ALTER TABLE public.managed_users
  ADD COLUMN IF NOT EXISTS area_scope text NOT NULL DEFAULT 'PG1';

ALTER TABLE public.master_pekerja
  ADD COLUMN IF NOT EXISTS area text;

ALTER TABLE public.managed_users
  DROP CONSTRAINT IF EXISTS managed_users_area_scope_check;

ALTER TABLE public.managed_users
  ADD CONSTRAINT managed_users_area_scope_check
  CHECK (area_scope IN ('PG1', 'Lakop', 'Kijung', 'Divisi 2'));

ALTER TABLE public.master_pekerja
  DROP CONSTRAINT IF EXISTS master_pekerja_area_check;

ALTER TABLE public.master_pekerja
  ADD CONSTRAINT master_pekerja_area_check
  CHECK (area IS NULL OR area IN ('Lakop', 'Kijung', 'Divisi 2'));
