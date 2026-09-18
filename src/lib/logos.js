import { supabase } from "./supabase";
import { BUCKET_PUBLICO } from "./archivos";
import { logoEmpresa } from "./marca";

// Los logos con los que puede salir un documento de FOREMAN.
//
// No siempre va el de HCA Studio: hay obras que se presentan con la marca de
// un socio, de la constructora que contrata o del mismo cliente. Viven en el
// depósito público —en un PDF o en un correo, un enlace que caduca se vería
// roto— y cualquiera del equipo puede subir uno nuevo.

const CARPETA = "logos";

const legible = archivo => archivo
  .replace(/^\d+-/, "")
  .replace(/\.[^.]+$/, "")
  .replace(/[-_]+/g, " ")
  .trim() || "Logo";

const slug = t => String(t || "logo").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "logo";

/** El de la empresa primero, después los que se hayan subido. */
export async function listarLogos() {
  const lista = [{ id: "empresa", nombre: "HCA Studio", url: logoEmpresa() }];
  const { data, error } = await supabase.storage.from(BUCKET_PUBLICO).list(CARPETA, {
    limit: 100, sortBy: { column: "created_at", order: "desc" },
  });
  if (error) return lista;
  (data || []).filter(f => f.name && !f.name.startsWith(".") && f.id).forEach(f => {
    const ruta = `${CARPETA}/${f.name}`;
    const { data: u } = supabase.storage.from(BUCKET_PUBLICO).getPublicUrl(ruta);
    lista.push({ id: ruta, ruta, nombre: legible(f.name), url: u.publicUrl });
  });
  return lista;
}

/** Sube un logo nuevo con el nombre que se le dé. Devuelve el logo o { error }. */
export async function subirLogo(file, nombre) {
  if (!file?.type?.startsWith("image/")) return { error: "Tiene que ser una imagen: PNG, JPG o SVG." };
  if (file.size > 3 * 1024 * 1024) return { error: "El logo pesa más de 3 MB. Uno más liviano se ve igual en el PDF." };
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const ruta = `${CARPETA}/${Date.now()}-${slug(nombre || file.name.replace(/\.[^.]+$/, ""))}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET_PUBLICO).upload(ruta, file, { upsert: false, contentType: file.type });
  if (error) return { error: error.message };
  const { data } = supabase.storage.from(BUCKET_PUBLICO).getPublicUrl(ruta);
  return { id: ruta, ruta, nombre: nombre || legible(ruta.split("/").pop()), url: data.publicUrl };
}

export async function borrarLogo(ruta) {
  const { error } = await supabase.storage.from(BUCKET_PUBLICO).remove([ruta]);
  return error;
}

/**
 * El logo listo para jsPDF: pasado a PNG por un canvas, con sus medidas. Así
 * entra igual un SVG, un JPG o un PNG con transparencia. Si no carga, null: el
 * documento sale sin logo antes que no salir.
 */
export async function logoParaPDF(url) {
  if (!url) return null;
  try {
    // Con onload y no con img.decode(): decode() espera a que la pestaña esté
    // a la vista, y quien cambia de pestaña mientras exporta se quedaba con el
    // botón en "Armando…" para siempre. Y con tiempo límite, por la misma razón.
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise((ok, mal) => {
      const reloj = setTimeout(() => mal(new Error("el logo tardó demasiado")), 10000);
      img.onload = () => { clearTimeout(reloj); ok(); };
      img.onerror = () => { clearTimeout(reloj); mal(new Error("el logo no cargó")); };
      img.src = url;
    });
    const w = img.naturalWidth || 600, h = img.naturalHeight || 200;
    const escala = Math.min(1, 1200 / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * escala);
    canvas.height = Math.round(h * escala);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
  } catch {
    return null;
  }
}
