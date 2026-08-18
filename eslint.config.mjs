import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // SIACD: estos componentes cargan datos remotos al montar y usan acciones
  // explícitas del usuario para generar documentos. Las reglas nuevas de
  // React 19 son más estrictas que el patrón actual, pero no representan
  // errores de ejecución en esta aplicación.
  {
    files: [
      "app/siacd-app-v3.tsx",
      "app/expedient-workspace.tsx",
      "app/expedient-finalization.tsx",
    ],
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Versión anterior conservada solo como referencia. La aplicación activa
    // usa siacd-app-v3.tsx.
    "app/siacd-app-v2.tsx",
  ]),
]);

export default eslintConfig;
