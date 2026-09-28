-- 050 · Quién llegó primero al presupuesto.
--
-- La presencia servía para avisar "Camila también lo tiene abierto", pero el
-- módulo la usaba como candado y el candado se cerraba para los dos: cada uno
-- veía al otro como "el otro" y ninguno podía trabajar.
--
-- Para que mande quien llegó primero hace falta saber cuándo llegó, y eso no se
-- guardaba: `visto_at` se refresca cada minuto con el latido, así que no dice
-- desde cuándo está, dice cuándo respiró por última vez.

alter table public.presupuesto_presencia
  add column if not exists desde_at timestamptz not null default now();
