-- 190 · Una cotización contra varios rubros, y el precio real cargado a mano.
--
-- Hernán, 18/11/2026: «Tengo una cotización a la que la subo manualmente, la
-- podría comparar con un rubro del presupuesto o varios rubros del
-- presupuesto; al momento solo me deja comparar con uno. Posterior a eso sería
-- importante también poder ingresar precios o gastos manualmente para tener
-- una idea hasta que vaya todo a control de obra y tener ya el total de
-- beneficio real... o pérdida. Lo mismo sucede en el módulo Diferencias: solo
-- me permite escoger uno, y a veces la compra de material afecta a más de un
-- rubro».
--
-- Un beneficio guardaba un solo rubro (`obra_rubro_id`) y un solo número de lo
-- que costó (`real`). Lo que definió: contra varios rubros se compara el total
-- de la cotización contra la suma de ellos; el precio real es uno solo por
-- comparación, corregido a mano; y cuando Control de obra ya tiene todo, manda
-- Control.
--
--   · obra_beneficios.rubros           — los rubros contra los que va, cuando
--                                        son varios: [id, id, …]. Con uno solo
--                                        queda vacía y manda `obra_rubro_id`,
--                                        que sigue teniendo el primero.
--   · obra_beneficios.cotizado         — lo que decía la cotización, guardado
--                                        la primera vez que se le escribe
--                                        encima el precio real.
--   · obra_analisis_lineas.rubros      — lo mismo en Diferencias: los rubros
--                                        de una diferencia que salió de un
--                                        renglón que afecta a varios.
--
-- Las tres nacen vacías y ningún beneficio ni análisis existente cambia. Se
-- puede correr más de una vez.

alter table public.obra_beneficios
  add column if not exists rubros   jsonb,
  add column if not exists cotizado numeric;

alter table public.obra_analisis_lineas
  add column if not exists rubros jsonb;

comment on column public.obra_beneficios.rubros is
  'Los rubros del presupuesto contra los que se compara, cuando son varios: [id, …]. Null si es uno solo (obra_rubro_id). obra_rubro_id tiene siempre el primero.';
comment on column public.obra_beneficios.cotizado is
  'Lo que decía la cotización, cuando el precio real (real) se corrigió a mano después. Null si no se corrigió.';
comment on column public.obra_analisis_lineas.rubros is
  'Los rubros del contrato de una diferencia que salió de un renglón del papel que afecta a varios: [id, …]. Null si es uno solo (obra_rubro_id).';
