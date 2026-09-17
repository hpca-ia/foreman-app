// El logo de HCA Studio vive en el depósito público de Supabase: así se ve en
// cualquier navegador, aunque nadie haya abierto Ajustes en esa máquina.
// Si Ajustes tiene uno propio, ese manda.

export const LOGO_HCA = "https://qxoincfvscvbqvoxamdi.supabase.co/storage/v1/object/public/publico/empresa/logo.png";

export function logoEmpresa() {
  try { return JSON.parse(localStorage.getItem("foreman_empresa") || "{}").logoUrl || LOGO_HCA; }
  catch { return LOGO_HCA; }
}
