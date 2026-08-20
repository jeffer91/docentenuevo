"use client";

import ExpedientWorkspaceV8 from "./expedient-workspace-v8";
import type { AccessMode, Teacher } from "./siacd-app-v3";

type Props = {
  teacher: Teacher;
  accessMode: AccessMode;
  coordinatorName: string;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
};

/**
 * Flujo único vigente: Áreas / Antes / Durante / Después, evaluación integrada
 * e informes institucionales con las evidencias finales aprobadas.
 */
export default function ExpedientWorkspaceV5(props: Props) {
  return <ExpedientWorkspaceV8 {...props} />;
}
