// Una sola pregunta: ¿se usa algo que no existe?
//
// Este proyecto no tiene `eslintConfig`, así que `react-scripts build` no corre
// ESLint: un identificador mal escrito, o un import que se perdió en una
// edición, compila igual y revienta recién cuando alguien abre esa pantalla.
// Así se fue a producción un modal de compras en blanco, y en la misma pasada
// aparecieron `setNewP` y `setRubrosDB` —dos ReferenceError que ya estaban
// arriba, uno de ellos justo después de guardar un rubro.
//
// Config aparte y no la del proyecto a propósito: prender `react-app` entero
// traería cientos de avisos viejos y rompería el build por cosas que no son
// esta. Una regla, la que cuesta una pantalla rota.
//
//   npm run nombres
// Y `react/jsx-no-undef`, que es la otra mitad y faltaba.
//
// `no-undef` NO ve los componentes de JSX: para ESLint, `<Sparkles />` no es
// una referencia a una variable, es un nodo JSXIdentifier, y la regla del
// núcleo no lo mira. O sea que el chequeo que existe justamente para que no se
// vaya a producción una pantalla en blanco dejaba pasar la forma más común de
// romper una pantalla: usar un icono y olvidarse de importarlo.
//
// Pasó con `Sparkles` en el cronograma: compiló, pasó el chequeo, y la
// pantalla salía en blanco. La regla de react sí mira esos nodos.
module.exports = {
  parserOptions: { ecmaVersion: 2022, sourceType: "module", ecmaFeatures: { jsx: true } },
  env: { browser: true, es2022: true, node: true },
  plugins: ["react"],
  rules: { "no-undef": "error", "react/jsx-no-undef": "error" },
};
