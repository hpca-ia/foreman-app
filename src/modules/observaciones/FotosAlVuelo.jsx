import { useRef } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import { colors } from "../../theme/colors";

// La foto, sacada en el momento.
//
// Una observación sin foto es una discusión: "la junta del baño 2" quiere
// decir una cosa para el que la vio y otra para el que la tiene que arreglar.
// Antes había que guardar la observación, entrar a ella y recién ahí subir la
// imagen — tres pasos parado en una obra con el casco puesto, que en la
// práctica significa "después le saco una" y nunca.
//
// Dos botones y no uno: `capture` abre la cámara directo en el teléfono, que
// es lo que uno quiere cuando está frente al problema, pero desde una
// computadora no existe cámara trasera y hace falta poder elegir un archivo.
// Un solo botón obligaría a que uno de los dos casos pase por el camino largo.
//
// Las fotos todavía no se suben: viven en memoria hasta que la observación
// existe y tiene a qué colgarse. Subirlas antes dejaría archivos sueltos en el
// depósito cada vez que alguien empieza una observación y la cancela.

export default function FotosAlVuelo({ fotos = [], onCambio, etiqueta = "Sacale una foto" }) {
  const camara = useRef(null);
  const archivo = useRef(null);

  const sumar = e => {
    const nuevas = [...e.target.files].filter(f => f.type.startsWith("image/"));
    e.target.value = "";
    if (nuevas.length) onCambio([...fotos, ...nuevas]);
  };

  const boton = {
    flex: 1, background: colors.bg, border: `1px dashed ${colors.border}`, borderRadius: 9,
    padding: "11px 8px", color: colors.inkSoft, fontSize: 12.5, cursor: "pointer",
    fontFamily: colors.font, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
  };

  return (
    <div>
      {fotos.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 7 }}>
          {fotos.map((f, i) => (
            <div key={i} style={{ position: "relative", width: 76, height: 76, borderRadius: 8, overflow: "hidden", background: colors.bg }}>
              <img src={URL.createObjectURL(f)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <button onClick={() => onCambio(fotos.filter((_, k) => k !== i))}
                style={{ position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: "50%",
                  border: "none", background: "rgba(0,0,0,.6)", color: "#fff", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => camara.current?.click()} style={boton}>
          <Camera size={15} /> {fotos.length ? "Otra foto" : etiqueta}
        </button>
        <button onClick={() => archivo.current?.click()} style={{ ...boton, flex: "0 0 auto", padding: "11px 14px" }} title="Elegir del teléfono o la computadora">
          <ImagePlus size={15} />
        </button>
      </div>

      <input ref={camara} type="file" accept="image/*" capture="environment"
        style={{ display: "none" }} onChange={sumar} />
      <input ref={archivo} type="file" accept="image/*" multiple
        style={{ display: "none" }} onChange={sumar} />
    </div>
  );
}
