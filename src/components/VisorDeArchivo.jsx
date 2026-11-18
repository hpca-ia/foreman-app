import { useEffect, useState } from "react";
import { Download, ExternalLink, X, FileText, ZoomIn, ZoomOut } from "lucide-react";
import { enlaceArchivo, descargarArchivo, ponerVisor, tipoDelPapel, paraLeer } from "../lib/archivos";
import { useArrastrarParaRecorrer } from "../lib/arrastrarParaRecorrer.js";

// EL VISOR DE ARCHIVOS DE FOREMAN: uno solo, para todos los módulos.
//
// Hernán, 18/11/2026: «en compras y en todos los módulos no se leen bien los
// archivos. Además me gustaría poder descargar».
//
// Una factura, una cotización o un plano se abrían cada uno a su manera: en
// Compras, en un cuadro chico adentro de la ventana; en Control y en los
// archivos del proyecto, en otra pestaña del navegador, de la que había que
// volver. Y bajarlos era encontrar el ícono del visor del navegador, que los
// guarda con el nombre que les puso el depósito.
//
// Acá el archivo ocupa la pantalla entera, encima de lo que se estaba mirando
// —al cerrarlo se sigue donde se estaba—, y arriba tiene siempre lo mismo, con
// su nombre: DESCARGAR, que lo baja con el nombre con que se cargó; ABRIR EN
// OTRA PESTAÑA; y CERRAR (o Esc).
//
//   · Un PDF se muestra con el visor del navegador, a lo ancho y sin el panel
//     de miniaturas.
//   · Una foto entra entera; tocándola se ve a su tamaño, y ahí se recorre
//     agarrándola.
//   · Lo que el navegador no sabe dibujar —un Excel, un CAD— lo dice, y
//     ofrece bajarlo.
//
// Se monta una sola vez (App). Lo abre `abrirArchivo`, de lib/archivos.

const boton = {
  display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,.12)", border: "none", color: "#fff",
  borderRadius: 8, padding: "8px 13px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
  textDecoration: "none", whiteSpace: "nowrap",
};

export default function VisorDeArchivo() {
  // { valor, nombre, url }: `url` es undefined mientras se pide y null si no se pudo.
  const [archivo, setArchivo] = useState(null);
  const [acercada, setAcercada] = useState(false);
  const [bajando, setBajando] = useState(false);
  const paneo = useArrastrarParaRecorrer({ adentro: true });

  useEffect(() => ponerVisor(async a => {
    setAcercada(false);
    setArchivo({ ...a, url: undefined });
    const url = await enlaceArchivo(a.valor);
    setArchivo(x => (x && x.valor === a.valor ? { ...x, url } : x));
  }), []);

  useEffect(() => {
    if (!archivo) return;
    const tecla = e => { if (e.key === "Escape") setArchivo(null); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [archivo]);

  if (!archivo) return null;
  const tipo = tipoDelPapel(archivo.nombre, archivo.valor);
  const cerrar = () => setArchivo(null);
  const bajar = async () => { setBajando(true); await descargarArchivo(archivo.valor, archivo.nombre); setBajando(false); };

  return (
    <div className="visor-de-archivo" role="dialog" aria-label={`Archivo: ${archivo.nombre}`} onClick={cerrar}
      style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(10,12,14,.94)", display: "flex", flexDirection: "column", fontFamily: "'Inter', sans-serif" }}>
      <div onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", color: "#fff", flexShrink: 0, flexWrap: "wrap" }}>
        <FileText size={16} style={{ opacity: 0.7, flexShrink: 0 }} />
        <div className="nombre-del-archivo" title={archivo.nombre}
          style={{ flex: "1 1 160px", minWidth: 0, fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {archivo.nombre}
        </div>
        {tipo === "imagen" && archivo.url && (
          <button className="acercar-la-foto" onClick={() => setAcercada(v => !v)} style={boton}>
            {acercada ? <ZoomOut size={15} /> : <ZoomIn size={15} />} {acercada ? "Verla entera" : "Verla a su tamaño"}
          </button>
        )}
        <button className="descargar-archivo" onClick={bajar} disabled={bajando} style={{ ...boton, background: "#fff", color: "#0F3D3E" }}>
          <Download size={15} /> {bajando ? "Bajando…" : "Descargar"}
        </button>
        {archivo.url && (
          <a className="abrir-aparte" href={archivo.url} target="_blank" rel="noreferrer" style={boton}>
            <ExternalLink size={15} /> Abrir en otra pestaña
          </a>
        )}
        <button className="cerrar-archivo" onClick={cerrar} aria-label="Cerrar el archivo" style={boton}><X size={16} /> Cerrar</button>
      </div>

      <div onClick={e => e.stopPropagation()} style={{ flex: 1, minHeight: 0, padding: "0 14px 14px", display: "flex" }}>
        {archivo.url === undefined ? (
          <div style={{ margin: "auto", color: "rgba(255,255,255,.7)", fontSize: 13 }}>Abriendo…</div>
        ) : !archivo.url ? (
          <div className="no-se-pudo-abrir" role="alert" style={{ margin: "auto", color: "#fff", fontSize: 13.5, textAlign: "center", lineHeight: 1.6 }}>
            No se pudo abrir este archivo.<br />Probá descargarlo; si tampoco baja, puede que lo hayan borrado.
          </div>
        ) : tipo === "pdf" ? (
          <iframe className="hoja-del-archivo" title={archivo.nombre} src={paraLeer(archivo.url, "hoja.pdf")}
            style={{ flex: 1, width: "100%", height: "100%", border: "none", borderRadius: 8, background: "#fff" }} />
        ) : tipo === "imagen" ? (
          <div ref={paneo.cajaRef} onMouseDown={acercada ? paneo.agarrar : undefined} className="foto-del-archivo"
            style={{ flex: 1, minWidth: 0, overflow: "auto", display: "flex", borderRadius: 8, ...(acercada ? paneo.estilo : {}) }}>
            <img src={archivo.url} alt={archivo.nombre} draggable={false}
              onClick={() => { if (!paneo.arrastrando) setAcercada(v => !v); }}
              title={acercada ? "Agarrala para recorrerla; tocá para verla entera" : "Tocá para verla a su tamaño"}
              style={acercada
                ? { margin: "auto", maxWidth: "none", cursor: "inherit", display: "block" }
                : { margin: "auto", maxWidth: "100%", maxHeight: "100%", objectFit: "contain", cursor: "zoom-in", display: "block" }} />
          </div>
        ) : (
          // Ni FOREMAN ni el navegador saben dibujar un .xlsx o un .dwg:
          // decirlo es mejor que un cuadro en blanco.
          <div className="no-se-ve-aca" style={{ margin: "auto", color: "#fff", fontSize: 13.5, textAlign: "center", lineHeight: 1.6 }}>
            <FileText size={28} style={{ opacity: 0.7, marginBottom: 6 }} />
            <div>Este tipo de archivo no se puede ver acá dentro.</div>
            <div style={{ opacity: 0.7, fontSize: 12.5 }}>Descargalo y abrilo con su programa.</div>
            <button onClick={bajar} disabled={bajando} style={{ ...boton, background: "#fff", color: "#0F3D3E", marginTop: 12 }}>
              <Download size={15} /> {bajando ? "Bajando…" : "Descargar"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
