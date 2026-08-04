insert into storage.buckets (id, name, public, file_size_limit)
values ('crm-production-private', 'crm-production-private', false, 52428800)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "crm_production_authenticated_read" on storage.objects;
create policy "crm_production_authenticated_read"
on storage.objects for select to authenticated
using (bucket_id = 'crm-production-private');
