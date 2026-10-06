-- 081 · Un día de trabajo no siempre es un día entero.
--
-- La asistencia se anotaba en días: entero, medio, o falta. Alcanza para la
-- mayoría y se queda corta en lo que pasa seguido: alguien entra a las diez
-- porque fue al médico y trabaja cinco horas. Eso no es medio día ni un día, y
-- redondearlo a cualquiera de los dos le paga de menos o de más —poco, todos
-- los días, hasta que alguien hace la cuenta y reclama con razón.
--
-- `horas` son las normales de ese día. El sueldo se sigue calculando por días,
-- como en la planilla de la oficina: las horas se convierten dividiendo por la
-- jornada. Cambiar la fórmula del sueldo sería cambiar un número que el
-- trabajador reconoce en su recibo, y eso no se hace por una mejora de
-- precisión.
--
-- La jornada va en los ajustes y no escrita en el código: ocho horas es lo
-- normal, pero una obra puede trabajar jornadas de diez y el cálculo tiene que
-- seguirla.

alter table public.obra_asistencia add column if not exists horas numeric(5,2);
alter table public.ajustes_oficina add column if not exists nomina_jornada numeric(4,1);
