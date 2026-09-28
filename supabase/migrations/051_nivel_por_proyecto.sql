-- 051 · Cada persona, en cada proyecto, con su nivel.
--
-- "Puede editar presupuestos" es una llave para toda la oficina: o los toca
-- todos o ninguno. Lo que hace falta es más fino y más obvio: a Camila se le da
-- ESTE proyecto para editar, y ese otro solo para mirarlo.
--
-- El acceso al proyecto ya existía (`lead_accesos`); lo que faltaba era decir
-- con qué nivel. Los que ya estaban quedan en "editar", que es lo que venían
-- pudiendo hacer: una migración no debería quitarle permisos a nadie de
-- sorpresa.

alter table public.lead_accesos
  add column if not exists nivel text not null default 'editar';   -- ver | editar
