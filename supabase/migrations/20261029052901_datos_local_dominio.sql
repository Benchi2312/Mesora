-- Datos del local: dominio opcional para identificar al personal.
-- No modifica usuarios, contraseñas, suscripciones ni documentos existentes.
alter table public.restaurantes
  add column if not exists dominio text;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.restaurantes'::regclass
      and conname = 'restaurantes_dominio_valido'
  ) then
    alter table public.restaurantes
      add constraint restaurantes_dominio_valido check (
        dominio is null or (
          char_length(dominio) <= 253
          and dominio = lower(btrim(dominio))
          and dominio ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?([.][a-z0-9]([a-z0-9-]*[a-z0-9])?)*[.][a-z]{2,}$'
        )
      );
  end if;
end;
$$;

comment on column public.restaurantes.dominio is
  'Dominio opcional de login del personal. Cambiarlo no renombra usuarios existentes.';

-- Se conserva la policy existente: solo el admin de su propio local activo
-- puede actualizar. El grant es columnario; no habilita modificar suscripciones.
grant update (dominio) on public.restaurantes to authenticated;
