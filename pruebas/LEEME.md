# Las pruebas de FOREMAN

    npm run pruebas

Corren con el runner de Node, sin dependencias. Importan el código REAL: si una
prueba pasa, es porque la función que usa la app hace lo que dice.

## Por qué existen

Casi todo lo que se prueba acá es plata o fechas, y los dos tienen la misma
propiedad incómoda: un error no se ve. Un cronograma con las etapas mal
encadenadas se dibuja igual de lindo; un comprometido que cuenta dos veces la
misma compra da un número perfectamente creíble. Nadie abre la pantalla y dice
"esto está mal" — lo descubre tres semanas después, discutiendo con un
proveedor.

Cada prueba de acá nació de un error que ya pasó en la obra. Están escritas
para que ese error no pueda volver sin que alguien se entere.

## Cómo escribir una

Importá el módulo real, nunca una copia. Si hace falta recortar el archivo con
texto para probarlo, eso es la prueba diciendo que la función está enredada con
cosas que no le tocan: sacala a un módulo puro primero.

Los nombres de las pruebas se leen como frases, en castellano, y dicen la regla
—no el nombre de la función—. "Lo devuelto no cuenta como comprometido" sirve;
"test montoDeSolicitud case 3" no le dice nada a quien la ve fallar.
