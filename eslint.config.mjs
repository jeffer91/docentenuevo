import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: [
      "app/siacd-app-v3.tsx",
      "app/expedient-workspace.tsx",
      "app/expedient-finalization.tsx",
      "app/teacher-master-modal.tsx",
      "app/teacher-portal.tsx",
    ],
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
    },
  },
  {
    files: [
      "app/expedient-workspace.tsx",
      "app/expedient-finalization.tsx",
    ],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "app/siacd-app-v2.tsx",
    "supabase/functions/**",
  ]),
]);

export default eslintConfig;
