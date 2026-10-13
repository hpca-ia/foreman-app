import { useState } from "react";
import { ListTodo, Wallet, HardHat, PiggyBank, Target, ShoppingCart, BookOpen, ClipboardList,
  GanttChartSquare, MoreHorizontal, X, FileSignature } from "lucide-react";
import { rolInfo } from "../lib/roles";
import { colors } from "../theme/colors";
import Avatar from "./ui/Avatar";

// El menú de la izquierda.
//
// Era un riel de iconos sin nombre: hay que acordarse de que el casco es
// Control de Obra y el chanchito la caja chica, y cada vez que entra alguien
// nuevo hay que explicárselo. Ahora cada cosa dice cómo se llama.
//
// Y va agrupado como fluye el trabajo, que es la misma cadena que sostiene
// FOREMAN por dentro: el proyecto nace en el pipeline, se le hace un
// presupuesto, y si se aprueba pasa a la obra —donde se controla la plata, se
// escribe el libro, se pide material y se rinde la caja—. Un menú ordenado por
// esa historia se aprende solo; uno ordenado por cuándo se programó cada
// módulo, no.

/**
 * Los cuatro que van en la barra del teléfono, según el rol.
 *
 * EN EL TELÉFONO NO ENTRAN DIEZ. La barra de abajo los reparte parejo: con
 * diez, en una pantalla de 375 píxeles, cada botón mide 37 — y el mínimo para
 * acertarle con el dedo son 44. Errarle no es mala suerte, es lo que tiene que
 * pasar. Con cuatro y un "Más" cada uno mide 75.
 *
 * Cuáles cuatro depende de en qué anda cada uno: el residente vive en el libro
 * y en las observaciones, administración en compras y caja, y quien dirige
 * mira el control y el cronograma. Poner los mismos cuatro para todos sería
 * acertar para uno y fallar para los otros tres.
 *
 * FIJOS, no los más usados. Una barra que se reordena sola obliga a mirar
 * antes de tocar, y entonces deja de ser una barra: la memoria del pulgar es
 * la mitad de para qué sirve.
 */
const EN_LA_BARRA = {
  owner:         ["tareas", "controlObra", "cronograma", "compras"],
  gerente:       ["tareas", "controlObra", "cronograma", "compras"],
  assistant:     ["tareas", "compras", "cajaChica", "controlObra"],
  residente:     ["libro", "observaciones", "compras", "tareas"],
  arquitecto:    ["tareas", "presupuestos", "controlObra", "observaciones"],
  arquitecto_jr: ["tareas", "presupuestos", "observaciones", "libro"],
  conductor:     ["tareas", "compras", "cajaChica", "observaciones"],
};

export default function Sidebar({ puede, usuario, empresa, vista, setVista, admin, verPipeline, pendientes = {} }) {
  // El cajón con todo lo demás, en el teléfono.
  const [verTodo, setVerTodo] = useState(false);
  // En el teléfono la barra es de abajo y hay siete: ahí "Control de Obra" no
  // entra y empuja a los de al lado. El nombre corto es para esa barra, y solo
  // para esa: en la computadora se lee el completo.
  // Cuántas cosas esperan a esta persona en cada módulo. Va en el menú y no en
  // un correo: las observaciones de una obra son muchas y por goteo, y un
  // correo por cada una se vuelve ruido que se archiva sin leer. El número al
  // lado del nombre está cuando uno mira, y no cuando al sistema se le ocurre.
  // Los módulos se DESCRIBEN acá y se dibujan en dos lados: la barra y el
  // cajón de "Más". Antes `item()` devolvía el botón ya hecho y el cajón tenía
  // que ir a buscarle el icono adentro del JSX, que funciona hasta que alguien
  // le agrega un elemento y deja de funcionar sin que nadie entienda por qué.
  const item = (v, label, Icon, corto = label) => ({ v, label, Icon, corto });

  const Boton = ({ m }) => (
    <button
      onClick={() => setVista(m.v)}
      title={m.label}
      className={`app-nav-item ${enBarra.includes(m.v) ? "nav-en-barra" : "nav-escondido"}`}
      style={{
        border: "none", cursor: "pointer", textAlign: "left",
        background: vista === m.v ? colors.brandSoft : "transparent",
        color: vista === m.v ? colors.brand : colors.inkSoft,
        fontWeight: vista === m.v ? 600 : 500,
        fontFamily: colors.font, borderRadius: colors.radiusMd,
      }}
    >
      <m.Icon size={17} strokeWidth={vista === m.v ? 2.2 : 1.8} style={{ flexShrink: 0 }} />
      <span className="app-nav-label">{m.label}</span>
      <span className="app-nav-corto">{m.corto}</span>
      {pendientes[m.v] > 0 && (
        <span style={{ marginLeft: "auto", background: colors.warning, color: "#fff", borderRadius: 10,
          minWidth: 18, height: 18, padding: "0 5px", fontSize: 10.5, fontWeight: 700,
          display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {pendientes[m.v] > 99 ? "99+" : pendientes[m.v]}
        </span>
      )}
    </button>
  );

  // Cada grupo con lo que de verdad tenga: un título sobre un hueco es peor
  // que no tener título.
  const grupos = [
    [null, [puede("tareas.ver") && item("tareas", "Tablero", ListTodo)]],
    ["PROYECTOS", [
      verPipeline && item("leads", "Pipeline", Target),
      puede("presupuestos.ver") && item("presupuestos", "Presupuestos", Wallet, "Presup."),
    ]],
    ["OBRA", [
      puede("controlObra.ver") && item("controlObra", "Control de Obra", HardHat, "Obra"),
      puede("libro.ver") && item("libro", "Libro de Obra", BookOpen, "Libro"),
      puede("cronograma.ver") && item("cronograma", "Cronograma", GanttChartSquare, "Crono."),
      puede("manoObra.ver") && item("manoObra", "Mano de obra", HardHat, "Personal"),
      puede("observaciones.ver") && item("observaciones", "Observaciones", ClipboardList, "Observ."),
      puede("actas.ver") && item("actas", "Actas de reunión", FileSignature, "Actas"),
      puede("compras.ver") && item("compras", "Compras", ShoppingCart),
      puede("cajaChica.ver") && item("cajaChica", "Caja Chica", PiggyBank, "Caja"),
    ]],
  ].map(([titulo, hijos]) => [titulo, hijos.filter(Boolean)]).filter(([, hijos]) => hijos.length);

  // Qué módulos tiene esta persona, en el orden del menú.
  const todos = grupos.flatMap(([, hijos]) => hijos).map(m => m.v);
  const preferidos = (EN_LA_BARRA[usuario.role] || []).filter(v => todos.includes(v));
  // Si el rol no llena los cuatro —porque no tiene permiso para alguno— se
  // completan con los primeros que sí tenga: una barra con tres botones y un
  // hueco se ve rota.
  const enBarra = [...preferidos, ...todos.filter(v => !preferidos.includes(v))].slice(0, 4);
  const escondidos = todos.filter(v => !enBarra.includes(v));
  // Si lo que quedó escondido tiene algo esperando, el botón "Más" lo dice: un
  // pendiente que nadie ve es un pendiente que no existe.
  const pendientesEscondidos = escondidos.reduce((t, v) => t + (pendientes[v] || 0), 0);

  return (
    <div className="app-sidebar" style={{ background: colors.surface, flexShrink: 0 }}>
      <div className="app-sidebar-logo">
        <div style={{ width: 34, height: 34, borderRadius: 9, background: colors.brand, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ color: "#fff", fontSize: 17, fontWeight: 700 }}>F</span>
        </div>
        <div className="app-nav-label" style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: colors.ink, letterSpacing: 0.3 }}>FOREMAN</div>
          <div style={{ fontSize: 10, color: colors.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {empresa?.nombre || "HCA Studio"}
          </div>
        </div>
      </div>

      {/* En la computadora van todos, agrupados. En el teléfono, el CSS
          esconde los que no están en la barra y muestra el botón "Más". */}
      {grupos.map(([titulo, hijos]) => (
        <div key={titulo || "inicio"} className="app-nav-grupo">
          {titulo && <div className="app-nav-titulo">{titulo}</div>}
          {hijos.map(m => <Boton key={m.v} m={m} />)}
        </div>
      ))}

      {/* EL BOTÓN "MÁS", solo en el teléfono. */}
      {escondidos.length > 0 && (
        <button onClick={() => setVerTodo(true)} className="app-nav-item nav-mas"
          style={{ border: "none", cursor: "pointer", background: "transparent", color: colors.inkSoft,
            fontWeight: 500, fontFamily: colors.font, borderRadius: colors.radiusMd, position: "relative" }}>
          <MoreHorizontal size={17} strokeWidth={1.8} style={{ flexShrink: 0 }} />
          <span className="app-nav-corto">Más</span>
          {pendientesEscondidos > 0 && (
            <span style={{ position: "absolute", top: 2, right: "50%", marginRight: -18,
              background: colors.warning, color: "#fff", borderRadius: 10, minWidth: 16, height: 16,
              padding: "0 4px", fontSize: 9.5, fontWeight: 700, display: "inline-flex",
              alignItems: "center", justifyContent: "center" }}>
              {pendientesEscondidos > 99 ? "99+" : pendientesEscondidos}
            </span>
          )}
        </button>
      )}

      {/* EL CAJÓN CON TODO, cuando se toca "Más".
          Renglones altos y el nombre completo: acá no hay que ahorrar espacio,
          hay que poder tocar sin errarle. Se cierra al elegir. */}
      {verTodo && (
        <div onClick={() => setVerTodo(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 120,
            display: "flex", alignItems: "flex-end" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: colors.surface, width: "100%", borderTopLeftRadius: 18,
              borderTopRightRadius: 18, padding: "10px 12px 22px", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", padding: "4px 6px 10px" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: colors.ink }}>Ir a…</span>
              <button onClick={() => setVerTodo(false)}
                style={{ marginLeft: "auto", background: colors.neutralSoft, border: "none",
                  borderRadius: 8, width: 30, height: 30, color: colors.inkSoft, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={15} />
              </button>
            </div>
            {grupos.map(([titulo, hijos]) => (
              <div key={titulo || "inicio"}>
                {titulo && (
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: colors.muted,
                    letterSpacing: 0.5, padding: "9px 6px 4px" }}>{titulo}</div>
                )}
                {hijos.map(m => (
                  <button key={m.v} onClick={() => { setVista(m.v); setVerTodo(false); }}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 11,
                      padding: "13px 10px", border: "none", borderRadius: colors.radiusMd,
                      background: vista === m.v ? colors.brandSoft : "transparent",
                      color: vista === m.v ? colors.brand : colors.ink,
                      fontWeight: vista === m.v ? 600 : 500, fontSize: 14,
                      fontFamily: colors.font, cursor: "pointer", textAlign: "left" }}>
                    <m.Icon size={18} />
                    {m.label}
                    {pendientes[m.v] > 0 && (
                      <span style={{ marginLeft: "auto", background: colors.warning, color: "#fff",
                        borderRadius: 10, minWidth: 20, height: 20, padding: "0 6px", fontSize: 11,
                        fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                        {pendientes[m.v]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="app-sidebar-spacer" style={{ flex: 1 }} />

      <div className="app-sidebar-profile" title={`${usuario.name} · ${rolInfo(usuario.role).label}`}>
        <Avatar name={usuario.name} size={28} color={usuario.color || colors.brand} />
        <div className="app-nav-label" style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {usuario.name}
          </div>
          <div style={{ fontSize: 10, color: colors.muted }}>{rolInfo(usuario.role).label}</div>
          {/* QUÉ VERSIÓN ESTÁS VIENDO.
              "Sigue igual" y "ya está cargada la actualización" son la misma
              pregunta, y sin esto no se puede contestar: desde adentro del
              navegador no hay forma de saber si lo que se está mirando es el
              código de hoy o el del martes que quedó en la memoria. Acá está
              el commit y la hora del despliegue. Si no coincide con lo que
              acaba de salir, es la pantalla vieja y hay que recargar fuerte,
              y eso se ve en un segundo en vez de perderse una tarde. */}
          <div title="Versión que está corriendo en esta pantalla. Si no es la última, recargá con Cmd+Shift+R."
            style={{ fontSize: 9, color: colors.border, fontFamily: "ui-monospace, monospace", marginTop: 1 }}>
            {process.env.REACT_APP_BUILD || "dev"}
          </div>
        </div>
      </div>
    </div>
  );
}
