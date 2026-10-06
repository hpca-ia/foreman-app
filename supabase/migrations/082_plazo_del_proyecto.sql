-- 082 · El plazo del proyecto, en un solo lugar.
--
-- Hasta hoy la duración se escribía dos veces: al armar el cronograma de barras
-- y al armar el valorado. Dos campos para un solo hecho —cuánto dura la obra—
-- y nada que los obligue a coincidir. Alcanza con que alguien corrija uno para
-- que el Gantt diga ocho meses y la curva de plata diga seis, y entonces ya no
-- se sabe cuál de los dos está viejo.
--
-- Ahora el plazo vive en el proyecto y los dos lo leen. Cambiarlo en un lado
-- lo cambia para los dos, que es lo que uno espera al escribir "la obra dura
-- ocho meses": no se está configurando una pantalla, se está diciendo un hecho
-- del proyecto.
--
-- `crono_inicio` ya existía desde la 076 y hace lo mismo con la fecha de
-- arranque; esto le pone al lado la duración, que es la otra mitad.

alter table public.leads add column if not exists crono_meses int;
