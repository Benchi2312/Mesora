-- Lanzar este archivo simultáneamente desde dos sesiones PostgreSQL separadas.
set request.jwt.claim.sub = 'aa000000-0000-4000-8000-000000000002';
set request.jwt.claims = '{"role":"authenticated"}';
set role authenticated;
select public.crear_pedido(
  'aa000000-0000-4000-8000-000000000001',
  'aa000000-0000-4000-8000-000000000004',
  '[{"producto_id":"aa000000-0000-4000-8000-000000000005","cantidad":1,"nota":""}]'::jsonb,
  'aa000000-0000-4000-8000-000000000006'
);
