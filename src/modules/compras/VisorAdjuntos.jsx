import { useEffect, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, FileText, Download, Maximize2, X, ExternalLink } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";
import { descargarArchivo, paraLeer, tipoDelPapel } from "../../lib/archivos";

// Todos los papeles de la solicitud, acá adentro.
//
// Quien aprueba abre el pedido con tres cotizaciones y un plano. Tenía que
// abrir cada uno en otra pestaña, mirarlo, cerrarlo y volver — y para comparar
// precios, hacerlo dos veces. Comparar es justamente lo que se viene a hacer
// a esta pantalla, así que los documentos tienen que estar en ella.
//
// Se ven en FOREMAN los que el navegador sabe mostrar: imágenes y PDF, que es
// el 95% de lo que llega. Un Excel o un Word no los dibuja ningún navegador
// sin convertirlos en el servidor, así que esos se bajan, y el visor lo dice
// en vez de mostrar un cuadro en blanco.
//
// SE LEEN EN GRANDE, Y SE BAJAN. Hernán, 18/11/2026, con una cotización de
// $2.119 abierta acá: «no se leen bien los archivos. Además me gustaría poder
// descargar». El documento se veía adentro de la ventana, en un cuadro de 420
// px de alto: el visor de PDF del navegador metía ahí su barra y su panel de
// miniaturas, y de la hoja quedaba una franja. Para verlo grande había un
// ícono sin nombre, y el de bajar lo abría en otra pestaña.
//
// Ahora tocar un papel lo abre A PANTALLA COMPLETA, encima de la ventana —se
// sigue sin salir de la solicitud, y con las flechas se pasa de una cotización
// a la otra, que es compararlas—. El PDF entra a lo ancho y sin miniaturas. Y
// «Descargar» lo baja con su nombre.

// Qué es cada papel: lo dice su nombre o, si no, su archivo —una cotización se
// llama a veces como el proveedor, y es el archivo el que termina en .pdf—.
const esImagen = p => tipoDelPapel(p?.nombre, p?.ruta) === "imagen";
const esPDF = p => tipoDelPapel(p?.nombre, p?.ruta) === "pdf";

export default function VisorAdjuntos({ solicitudId, proformas = [], lista = null, titulo = "" }) {
  const [papeles, setPapeles] = useState([]);
  const [i, setI] = useState(0);
  // A pantalla completa: es donde se lee. Adentro de la ventana una proforma
  // no se lee —hay que acercarse a la pantalla a mirar números de cuatro
  // cifras—, y comparar precios es lo que se vino a hacer.
  const [grande, setGrande] = useState(false);
  // Cuál se está bajando, para decirlo en su botón.
  const [bajando, setBajando] = useState(null);
  const bajar = async p => { setBajando(p.clave); await descargarArchivo(p.ruta, p.nombre); setBajando(null); };

  const cargar = useCallback(async () => {
    // Con la lista dada —presupuestos, por ejemplo— el visor no averigua nada:
    // le dicen qué papeles son y los muestra. Comparar tres cotizaciones sin
    // abrir tres pestañas es lo mismo acá que en una solicitud de compra, así
    // que el visor es el mismo y lo único que cambia es de dónde sale la lista.
    if (lista) {
      if (!lista.length) { setPapeles([]); return; }
      const { data: firmados } = await supabase.storage.from("task-files")
        .createSignedUrls(lista.map(x => x.ruta), 3600);
      setPapeles(lista.map((x, k) => ({ ...x, url: firmados?.[k]?.signedUrl || null })));
      return;
    }
    if (!solicitudId) return;
    // Las proformas cuelgan de la solicitud; los anexos, de la carpeta que usa
    // InlineFiles. Dos lugares por historia, un solo visor por sentido común.
    const deProformas = proformas.map(p => ({
      clave: `p${p.id}`, ruta: p.storage_path, nombre: p.nombre || p.proveedor || "Cotización",
      etiqueta: p.proveedor ? `Cotización · ${p.proveedor}` : "Cotización",
      monto: p.monto,
    }));
    const { data: sueltos } = await supabase.storage.from("task-files")
      .list(`task-compra-${solicitudId}/`, { sortBy: { column: "created_at", order: "asc" } });
    const deAnexos = (sueltos || [])
      .filter(f => f.name && f.name !== ".emptyFolderPlaceholder")
      .map(f => ({ clave: `a${f.name}`, ruta: `task-compra-${solicitudId}/${f.name}`, nombre: f.name, etiqueta: "Anexo" }));

    const todos = [...deProformas, ...deAnexos];
    if (!todos.length) { setPapeles([]); return; }
    // Una hora alcanza para mirarlos; el enlace se vuelve a pedir al reabrir.
    const { data: firmados } = await supabase.storage.from("task-files")
      .createSignedUrls(todos.map(x => x.ruta), 3600);
    setPapeles(todos.map((x, k) => ({ ...x, url: firmados?.[k]?.signedUrl || null })));
  }, [solicitudId, proformas, lista]);
  useEffect(() => { cargar(); }, [cargar]);

  const actual = papeles[Math.min(i, papeles.length - 1)];
  const mover = d => setI(k => (k + d + papeles.length) % papeles.length);

  // Las flechas y Escape mientras está a pantalla completa: pasar tres
  // cotizaciones con el teclado es la diferencia entre compararlas y no.
  useEffect(() => {
    if (!grande) return;
    const total = papeles.length;
    const tecla = e => {
      if (e.key === "Escape") setGrande(false);
      if (e.key === "ArrowRight") setI(k => (k + 1) % total);
      if (e.key === "ArrowLeft") setI(k => (k - 1 + total) % total);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [grande, papeles.length]);

  if (!papeles.length) return null;

  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden", background: colors.surface }}>
      {/* La tira: de un vistazo cuántos papeles hay y cuál se está mirando. */}
      <div style={{ display: "flex", gap: 5, padding: 7, overflowX: "auto", borderBottom: `1px solid ${colors.neutralSoft}` }}>
        {papeles.map((p, k) => {
          const puesto = k === i;
          return (
            <button key={p.clave} className="papel" onClick={() => { setI(k); setGrande(true); }} title={`${p.nombre} · tocá para leerlo en grande`}
              style={{ flexShrink: 0, width: 92, border: `1px solid ${puesto ? colors.brand : colors.border}`,
                background: puesto ? colors.brandSoft : "#fff", borderRadius: 7, padding: 4, cursor: "pointer",
                fontFamily: colors.font, textAlign: "left" }}>
              <div style={{ height: 46, borderRadius: 4, overflow: "hidden", background: colors.bg,
                display: "flex", alignItems: "center", justifyContent: "center" }}>
                {esImagen(p) && p.url
                  ? <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <FileText size={18} color={colors.muted} />}
              </div>
              <div style={{ fontSize: 9, color: puesto ? colors.brand : colors.inkSoft, fontWeight: 600,
                marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.etiqueta}
              </div>
              {p.monto ? <div style={{ fontSize: 9.5, color: colors.ink, fontWeight: 700 }}>${Number(p.monto).toFixed(2)}</div> : null}
            </button>
          );
        })}
      </div>

      {/* El papel elegido, con lo que se le puede hacer, dicho con su nombre. */}
      <div className="papel-elegido" style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 9px", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 160px", minWidth: 0, fontSize: 11.5, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <strong>{actual.etiqueta}</strong> · {actual.nombre}
          {papeles.length > 1 && <span style={{ color: colors.muted }}> · {Math.min(i, papeles.length - 1) + 1} de {papeles.length}</span>}
        </div>
        <button className="ver-en-grande" onClick={() => setGrande(true)} style={botonClaro(true)}>
          <Maximize2 size={12} /> Ver en grande
        </button>
        <button className="descargar-papel" onClick={() => bajar(actual)} disabled={bajando === actual.clave} style={botonClaro(false)}>
          <Download size={12} /> {bajando === actual.clave ? "Bajando…" : "Descargar"}
        </button>
      </div>
      <div style={{ fontSize: 10.5, color: colors.muted, padding: "0 9px 7px" }}>
        Tocá un papel para leerlo a pantalla completa{papeles.length > 1 ? "; con las flechas se pasa de uno al otro" : ""}.
      </div>

      {/* Pantalla completa, por encima del modal. El documento ocupa todo lo
          que hay, que es lo que hace falta para leer una proforma. */}
      {grande && (
        <div onClick={() => setGrande(false)}
          style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(10,12,14,.93)",
            display: "flex", flexDirection: "column" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", color: "#fff", flexShrink: 0 }}>
            <button onClick={() => mover(-1)} style={botonOscuro}><ChevronLeft size={20} /></button>
            <div style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <strong>{actual.etiqueta}</strong>
              {actual.monto ? ` · $${Number(actual.monto).toFixed(2)}` : ""}
              <span style={{ opacity: .6 }}> · {actual.nombre} · {i + 1} de {papeles.length}</span>
            </div>
            <button onClick={() => mover(1)} style={botonOscuro}><ChevronRight size={20} /></button>
            <button className="descargar-papel" onClick={() => bajar(actual)} disabled={bajando === actual.clave}
              style={{ ...botonOscuro, width: "auto", padding: "0 13px", gap: 6, fontSize: 13, fontWeight: 600, fontFamily: colors.font, background: "#fff", color: colors.brand }}>
              <Download size={15} /> {bajando === actual.clave ? "Bajando…" : "Descargar"}
            </button>
            {actual.url && (
              <a className="abrir-aparte" href={actual.url} target="_blank" rel="noreferrer" title="Abrir en otra pestaña"
                style={{ ...botonOscuro, textDecoration: "none" }}><ExternalLink size={16} /></a>
            )}
            <button onClick={() => setGrande(false)} aria-label="Cerrar" style={botonOscuro}><X size={20} /></button>
          </div>
          <div onClick={e => e.stopPropagation()}
            style={{ flex: 1, minHeight: 0, padding: "0 14px 14px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {!actual.url ? (
              <span style={{ color: "#fff", fontSize: 13 }}>No se pudo abrir este archivo.</span>
            ) : esImagen(actual) ? (
              <img src={actual.url} alt={actual.nombre}
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            ) : esPDF(actual) ? (
              <iframe className="hoja-del-papel" title={actual.nombre} src={paraLeer(actual.url, "hoja.pdf")}
                style={{ width: "100%", height: "100%", border: "none", borderRadius: 8, background: "#fff" }} />
            ) : (
              // Ni el visor ni el navegador saben dibujar un .xlsx: decirlo es
              // mejor que mostrar un recuadro vacío y que uno crea que falló.
              <div style={{ color: "#fff", fontSize: 13.5, textAlign: "center", lineHeight: 1.6 }}>
                <div>Este tipo de archivo no se puede ver acá dentro.</div>
                <div style={{ opacity: 0.7, fontSize: 12.5 }}>Descargalo y abrilo con su programa.</div>
              </div>
            )}
          </div>
          <div style={{ textAlign: "center", color: "rgba(255,255,255,.45)", fontSize: 11, paddingBottom: 10 }}>
            ← → para pasar · Esc para cerrar
          </div>
        </div>
      )}
    </div>
  );
}

const botonClaro = fuerte => ({
  display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontFamily: colors.font, fontSize: 11.5, fontWeight: 600,
  border: `1px solid ${fuerte ? colors.brand : colors.border}`, background: fuerte ? colors.brand : "#fff",
  color: fuerte ? "#fff" : colors.inkSoft, borderRadius: 8, padding: "5px 10px", whiteSpace: "nowrap", flexShrink: 0,
});

const botonOscuro = {
  background: "rgba(255,255,255,.1)", border: "none", color: "#fff", borderRadius: 8,
  width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", flexShrink: 0,
};
