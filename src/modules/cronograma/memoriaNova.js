import { supabase } from "../../lib/supabase";
import { patronDe } from "./apuntes";

// El cuaderno de NOVA: lo que esta oficina ya decidió.
//
// No es entrenar un modelo y conviene no confundirlo: es llevar un apunte y
// leerlo antes de opinar. La ventaja de hacerlo así es que se puede mirar,
// corregir y borrar. Una memoria que no se puede inspeccionar es una
// herramienta que falla sin que nadie sepa por qué, y eso en una obra termina
// en un valorado que nadie se anima a usar.
//
// DOS TEMAS, Y GUARDAN COSAS DISTINTAS:
//
// · valorado: la FORMA del pago, no los meses. Una ventanería se paga 50/30/20
//   empiece la obra en marzo o en septiembre; lo que no cambia es la distancia
//   entre el anticipo y la instalación.
// · cronograma: el RENDIMIENTO, no los días. "El enlucido lleva 70 días" no se
//   puede usar en otro proyecto; "rinde 18 m2 por día" sí.
//
// Lo que se dicta a NOVA con cada uno está en `apuntes.js`, aparte y con
// pruebas, porque dictar mal un apunte bien guardado ya pasó una vez.

export { patronDe };

const falta = e => /relation|column|does not exist|schema cache/i.test(e?.message || "");

export async function leerMemoria(tema = "valorado") {
  const campos = "id,tema,patron,perfil,pagos,anticipacion,rendimiento,nota,ejemplo,veces,creado_nombre,created_at";
  let { data, error } = await supabase.from("nova_memoria")
    .select(campos).eq("tema", tema).eq("activo", true)
    .order("veces", { ascending: false }).limit(40);
  // Sin la 100 no existe `rendimiento`: se lee sin ella antes que dejar a NOVA
  // sin memoria. Lo que se pierde es el rendimiento de los apuntes viejos, que
  // ya estaba en la nota en texto libre.
  if (error && falta(error)) {
    ({ data, error } = await supabase.from("nova_memoria")
      .select("*").eq("tema", tema).eq("activo", true)
      .order("veces", { ascending: false }).limit(40));
  }
  if (error) return { memoria: [], sinTabla: falta(error) };
  return { memoria: data || [], sinTabla: false };
}

/**
 * Guardar lo que alguien corrigió.
 *
 * Si el patrón ya existe se le suma una, y lo guardado se reemplaza por lo
 * último: la última corrección es la que vale, porque es la que hizo alguien
 * que ya vio las anteriores. `veces` no mide certeza sino insistencia, y sirve
 * para ordenar qué entra en la consulta cuando hay más apuntes que lugar.
 */
export async function recordar({ descripcion, perfil, pagos, anticipacion, rendimiento, nota, quien, tema = "valorado" }) {
  const patron = patronDe(descripcion);
  if (!patron) return null;

  const { data: ya } = await supabase.from("nova_memoria")
    .select("id,veces").eq("tema", tema).eq("patron", patron).limit(1);

  const campos = { perfil, pagos, anticipacion, rendimiento: rendimiento || null, nota: nota || null, activo: true };
  // Sin la 100, se guarda todo lo demás. Un apunte sin el número medido sigue
  // sirviendo —quedan los días— y es mejor que no guardar nada.
  const sinRendimiento = ({ rendimiento: _r, ...resto }) => resto;

  if (ya?.[0]) {
    const fila = { ...campos, veces: (ya[0].veces || 1) + 1 };
    let { error } = await supabase.from("nova_memoria").update(fila).eq("id", ya[0].id);
    if (error && falta(error)) ({ error } = await supabase.from("nova_memoria").update(sinRendimiento(fila)).eq("id", ya[0].id));
    return error ? error.message : null;
  }
  const fila = {
    tema, patron, ...campos,
    ejemplo: String(descripcion || "").slice(0, 120),
    creado_por: quien?.id ?? null, creado_nombre: quien?.name || null,
  };
  let { error } = await supabase.from("nova_memoria").insert(fila);
  if (error && falta(error)) ({ error } = await supabase.from("nova_memoria").insert(sinRendimiento(fila)));
  return error ? (falta(error) ? "Falta correr la migración 077." : error.message) : null;
}

export async function olvidar(id) {
  const { error } = await supabase.from("nova_memoria").update({ activo: false }).eq("id", id);
  return error ? error.message : null;
}
