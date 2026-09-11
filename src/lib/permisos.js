import { supabase } from "./supabase";

// Catálogo de permisos. Es lo que el Director ve como lista de interruptores
// en Ajustes, así que los textos son los que él lee: nada de jerga.
export const GRUPOS_PERMISOS = [
  {
    titulo: "A qué módulos entra",
    permisos: [
      { id: "tareas.ver", label: "Tareas" },
      { id: "presupuestos.ver", label: "Presupuestos" },
      { id: "controlObra.ver", label: "Control de Obra" },
      { id: "cajaChica.ver", label: "Caja Chica" },
      { id: "ajustes.ver", label: "Ajustes", nota: "Usuarios, proyectos y datos de la empresa" },
    ],
  },
  {
    titulo: "Cuánto ve",
    permisos: [
      { id: "tareas.todas", label: "Las tareas de todos", nota: "Si no, solo las suyas" },
      { id: "obras.todas", label: "Todas las obras", nota: "Si no, solo las que tenga asignadas" },
      { id: "cajaChica.todas", label: "Todas las cajas chicas", nota: "Si no, solo la suya" },
      { id: "montos.ver", label: "Los montos del presupuesto", nota: "Sin esto puede asignar un gasto a un rubro, pero no ve cuánto tiene ese rubro" },
    ],
  },
  {
    titulo: "Qué puede hacer",
    permisos: [
      { id: "tareas.asignar", label: "Asignar tareas a otros" },
      { id: "presupuestos.crear", label: "Crear y editar presupuestos" },
      { id: "obras.crear", label: "Activar una obra para controlarla" },
      { id: "facturas.registrar", label: "Registrar facturas y gastos" },
      { id: "planillas.cerrar", label: "Cerrar una planilla" },
      { id: "gastos.anular", label: "Anular facturas y gastos", nota: "Anular no borra: queda el registro de quién y por qué" },
      { id: "borrar.definitivo", label: "Borrar definitivamente", nota: "Solo cosas nunca usadas, como un presupuesto que quedó en borrador" },
    ],
  },
];

export const TODOS_LOS_PERMISOS = GRUPOS_PERMISOS.flatMap(g => g.permisos);

// El Director no aparece acá: siempre puede todo, por código. Si sus permisos
// fueran editables, un error de edición lo dejaría fuera de su propia app.
export const ROLES_EDITABLES = ["assistant", "gerente", "residente"];

// Se usa mientras la tabla carga, y para sembrar permisos nuevos que todavía
// no existan en la base.
export const POR_DEFECTO = {
  assistant: {
    "tareas.ver": true, "tareas.todas": true, "tareas.asignar": true,
    "presupuestos.ver": true, "presupuestos.crear": true,
    "controlObra.ver": true, "obras.todas": true, "obras.crear": true,
    "facturas.registrar": true, "planillas.cerrar": true,
    "cajaChica.ver": true, "cajaChica.todas": true,
    "montos.ver": true, "gastos.anular": true, "ajustes.ver": true,
    "borrar.definitivo": false,
  },
  gerente: {
    "tareas.ver": true, "tareas.todas": true, "tareas.asignar": true,
    "presupuestos.ver": false, "presupuestos.crear": false,
    "controlObra.ver": true, "obras.todas": false, "obras.crear": false,
    "facturas.registrar": true, "planillas.cerrar": true,
    "cajaChica.ver": true, "cajaChica.todas": false,
    "montos.ver": true, "gastos.anular": true, "ajustes.ver": false,
    "borrar.definitivo": false,
  },
  residente: {
    "tareas.ver": true, "tareas.todas": false, "tareas.asignar": false,
    "presupuestos.ver": false, "presupuestos.crear": false,
    "controlObra.ver": false, "obras.todas": false, "obras.crear": false,
    "facturas.registrar": false, "planillas.cerrar": false,
    "cajaChica.ver": true, "cajaChica.todas": false,
    "montos.ver": false, "gastos.anular": false, "ajustes.ver": false,
    "borrar.definitivo": false,
  },
};

/** Lee la tabla y devuelve { rol: { permiso: bool } }, completando con los
 *  valores por defecto lo que todavía no esté guardado. */
export async function cargarPermisos() {
  const mapa = {};
  ROLES_EDITABLES.forEach(r => { mapa[r] = { ...POR_DEFECTO[r] }; });
  const { data, error } = await supabase.from("permisos_rol").select("rol,permiso,activo");
  if (error) return mapa;              // sin conexión se trabaja con los de fábrica
  (data || []).forEach(({ rol, permiso, activo }) => {
    if (mapa[rol]) mapa[rol][permiso] = !!activo;
  });
  return mapa;
}

export async function guardarPermiso(rol, permiso, activo) {
  return supabase.from("permisos_rol").upsert({ rol, permiso, activo }, { onConflict: "rol,permiso" });
}

/** `puede("cajaChica.ver")` para el usuario en sesión. */
export function crearPuede(usuario, mapa) {
  return permiso => {
    if (!usuario) return false;
    if (usuario.role === "owner") return true;          // el Director siempre
    return !!mapa?.[usuario.role]?.[permiso];
  };
}
