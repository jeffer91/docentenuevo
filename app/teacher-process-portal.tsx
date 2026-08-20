"use client";

import TeacherProcessPortalV2 from "./teacher-process-portal-v2";

/**
 * Compatibilidad deliberada: cualquier importación antigua del portal docente
 * usa el flujo vigente de Áreas / Antes / Durante / Después.
 * Esto evita que vuelva a mostrarse la ruta histórica basada en H1–H6.
 */
export default function TeacherProcessPortal({ token }: { token: string }) {
  return <TeacherProcessPortalV2 token={token} />;
}
