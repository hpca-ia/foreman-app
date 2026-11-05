// QUÉ CLASE DE CAMBIO ES CADA PARTIDA DE UNA ORDEN, del lado del servidor.
//
// Es la misma regla que src/modules/controlObra/clasesDePartida.js. Vive
// repetida porque lo que corre en Vercel no puede importar de src/, y hay una
// prueba —pruebas/clasesDePartida.test.mjs— que compara las dos partida por
// partida: si una cambia y la otra no, el correo y el portal dirían una cosa y
// el PDF otra, sobre el mismo documento que el cliente firma.

const TITULOS = {
  nuevo: ["TRABAJOS NUEVOS", "No estaban cotizados: especificación o pedido nuevo del cliente"],
  mas: ["AUMENTO DE CANTIDAD", "Rubros del contrato con más cantidad de la contratada"],
};

const apuntaAUnRubro = l => !!l?.obra_rubro_id || !!String(l?.rubro_codigo || "").trim();

/** nuevo | mas | menos. Lo que resta nunca es trabajo nuevo. */
export function claseDe(l) {
  if (l?.tipo === "quita") return "menos";
  if (l?.clase === "nuevo" || l?.clase === "mas") return l.clase;
  return apuntaAUnRubro(l) ? "mas" : "nuevo";
}

/**
 * Si las adiciones de la orden tienen algo que distinguir: alguna con su clase
 * guardada, o alguna que apunta a un rubro del contrato. Una orden vieja
 * escrita a mano, sin nada de eso, sale como salía.
 */
export function seSeparan(lineas = []) {
  return (lineas || []).filter(l => l?.tipo !== "quita")
    .some(l => l?.clase === "nuevo" || l?.clase === "mas" || apuntaAUnRubro(l));
}

/** Las adiciones en bloques con su rótulo, o null si no hay nada que separar. */
export function bloquesDeAdiciones(lineas = []) {
  if (!seSeparan(lineas)) return null;
  const suyas = (lineas || []).filter(l => l?.tipo !== "quita");
  return ["nuevo", "mas"].map(clase => ({
    clase, titulo: TITULOS[clase][0], pista: TITULOS[clase][1],
    lineas: suyas.filter(l => claseDe(l) === clase),
  })).filter(b => b.lineas.length);
}
