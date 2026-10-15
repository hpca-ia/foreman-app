import { useState } from "react";
import { FileText, Download, Lock } from "lucide-react";
import { colors } from "../../theme/colors";
import Button from "../../components/ui/Button";
import { contenidoDe, enlacesDeFotos, guardarPdfDelDia } from "./libro";
import { pdfDiaDeObra, pdfLibroDeObra, comoSeLee } from "./pdfDiaDeObra";
import { abrirArchivo } from "../../lib/archivos";

// EL LIBRO, EL DE VERDAD.
//
// Lo que se escribe día a día vive en la base, y eso alcanza para escribirlo.
// No alcanza para lo único que un libro de obra tiene que hacer cuando hace
// falta: ser un documento. En un reclamo, una planilla discutida o un juicio
// nadie entra a FOREMAN — se pide "el libro".
//
// Cada día cerrado deja su PDF, y esos PDF apilados son el libro. Acá se ven
// todos, se baja uno, o se baja el libro entero en un solo documento con su
// índice: eso es lo que se entrega.

export default function LibroImpreso({ lead, dias = [], onCambio }) {
  const [ocupado, setOcupado] = useState("");
  const [error, setError] = useState("");

  const cerrados = dias.filter(d => d.estado === "cerrado" || d.estado === "aprobado");
  const conPdf = cerrados.filter(d => d.pdf_url).length;

  async function contenido(dia) {
    const { entradas, fotos } = await contenidoDe(dia.id);
    return { entradas, fotos, enlaces: await enlacesDeFotos(fotos) };
  }

  /** Mirar el PDF de un día. Si no lo tiene —lo cerró el reloj, se cayó la red
      cuando se cerró— se arma ahora y queda guardado. */
  async function verDia(dia) {
    setOcupado(dia.id); setError("");
    try {
      if (dia.pdf_url) { await abrirArchivo(dia.pdf_url); }
      else {
        const datos = await contenido(dia);
        await pdfDiaDeObra({ dia, obra: lead.nombre, ...datos }, "abrir");
        const blob = await pdfDiaDeObra({ dia, obra: lead.nombre, ...datos }, "blob");
        const r = await guardarPdfDelDia(dia, blob);
        if (!r.error) onCambio?.();
      }
    } catch (e) { setError("No se pudo abrir el PDF: " + e.message); }
    setOcupado("");
  }

  async function bajarTodo() {
    setOcupado("todo"); setError("");
    try {
      // En orden, del primer día al último: un libro se lee para adelante.
      const enOrden = [...cerrados].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
      await pdfLibroDeObra({ obra: lead.nombre, dias: enOrden, traerDia: contenido }, "abrir");
    } catch (e) { setError("No se pudo armar el libro: " + e.message); }
    setOcupado("");
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.ink }}>
            {cerrados.length} {cerrados.length === 1 ? "día cerrado" : "días cerrados"}
          </div>
          <div style={{ fontSize: 11.5, color: colors.muted, lineHeight: 1.45, marginTop: 2 }}>
            Cada día cerrado deja su PDF. Apilados son el libro de obra: lo que se entrega cuando alguien lo pide.
            {conPdf < cerrados.length && ` ${cerrados.length - conPdf} todavía no tienen el PDF guardado; se arma solo al abrirlo.`}
          </div>
        </div>
        <Button variant="primary" size="sm" disabled={!cerrados.length || !!ocupado} onClick={bajarTodo}>
          <Download size={13} /> {ocupado === "todo" ? "Armando el libro…" : "El libro completo"}
        </Button>
      </div>

      {error && <div style={{ fontSize: 12, color: colors.danger, marginBottom: 10 }}>{error}</div>}

      {!cerrados.length ? (
        <div style={{ fontSize: 12.5, color: colors.muted, background: colors.surface, border: `1px solid ${colors.border}`,
          borderRadius: colors.radiusMd, padding: 16, lineHeight: 1.55 }}>
          Todavía no hay ningún día cerrado. El residente cierra el día cuando terminó de escribirlo —desde el
          libro del día, botón <strong>Cerrar el día</strong>— y ahí queda su PDF, con fecha y con lo que había
          escrito ese día.
        </div>
      ) : (
        <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: colors.radiusMd, overflow: "hidden" }}>
          {cerrados.map(d => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 13px",
              borderBottom: `1px solid ${colors.neutralSoft}` }}>
              <Lock size={12} color={colors.muted} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: colors.ink, textTransform: "capitalize" }}>{comoSeLee(d.fecha)}</div>
                <div style={{ fontSize: 10.5, color: colors.muted }}>
                  {d.estado === "aprobado" ? "Aprobado" : "Cerrado"}
                  {d.aprobado_nombre ? ` por ${d.aprobado_nombre}` : ""}
                  {d.reabierto_at ? ` · reabierto ${Number(d.reaperturas) > 1 ? `${d.reaperturas} veces` : "una vez"}` : ""}
                  {d.pdf_url ? "" : " · sin PDF guardado"}
                </div>
              </div>
              <Button variant="outline" size="sm" disabled={!!ocupado} onClick={() => verDia(d)}>
                <FileText size={12} /> {ocupado === d.id ? "…" : "PDF"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
