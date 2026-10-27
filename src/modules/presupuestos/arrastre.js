// LO QUE SE ESTÁ ARRASTRANDO ENTRE PRESUPUESTOS.
//
// El navegador no deja leer qué se arrastra hasta que se suelta, y hace falta
// saberlo antes: para iluminar el capítulo de destino y para no aceptar
// cualquier cosa que alguien arrastre desde otra ventana. Lo que se arrastra
// se guarda acá mientras dura el arrastre.
//
// { tipo: "rubros", rubros: [...], desde: "Casa Fowler" }
// { tipo: "capitulo", nombre: "CARPINTERÍA", rubros: [...], desde: "Casa Fowler" }

let paquete = null;

export function empezarArrastre(e, p) {
  paquete = p;
  e.dataTransfer.effectAllowed = "copy";
  // Firefox no arranca el arrastre sin algo en dataTransfer.
  e.dataTransfer.setData("text/plain", p.tipo === "capitulo" ? p.nombre : p.rubros.map(r => r.descripcion).join("\n"));
}

export function terminarArrastre() { paquete = null; }

/** Lo que se está arrastrando desde otro presupuesto, o null. */
export const loQueSeArrastra = () => paquete;
