"use client";

import ExpedientWorkspaceV7 from "./expedient-workspace-v7";
import type { AccessMode, Teacher } from "./siacd-app-v3";

type Props = {
  teacher: Teacher;
  accessMode: AccessMode;
  coordinatorName: string;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
};

/**
 * El expediente activo se concentra en Áreas / Antes / Durante / Después.
 * El centro de revisiones histórico se conserva en código por compatibilidad,
 * pero ya no se expone como flujo paralelo al usuario.
 */
export default function ExpedientWorkspaceV5(props: Props) {
  return <ExpedientWorkspaceV7 {...props} />;
}
