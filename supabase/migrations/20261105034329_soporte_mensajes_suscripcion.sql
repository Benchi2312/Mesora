-- La suscripción vencida bloquea también las escrituras del módulo de soporte.
drop policy if exists soporte_tickets_insert on public.soporte_tickets;
create policy soporte_tickets_insert on public.soporte_tickets
  for insert to authenticated with check (
    public.puedo_escribir_en(restaurante_id, array['admin_restaurante'])
    and usuario_id = (select auth.uid())
  );

drop policy if exists soporte_mensajes_insert on public.soporte_mensajes;
create policy soporte_mensajes_insert on public.soporte_mensajes
  for insert to authenticated with check (
    autor_id = (select auth.uid())
    and autor_super_admin = (select public.soy_super_admin())
    and exists (
      select 1 from public.soporte_tickets t
      where t.id = ticket_id and t.estado <> 'cerrado'
        and (public.soy_super_admin() or
          public.puedo_escribir_en(t.restaurante_id, array['admin_restaurante']))
    )
  );
