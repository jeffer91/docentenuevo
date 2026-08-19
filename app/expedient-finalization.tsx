"use client";

import EvidenceReviewWorkspace from "./evidence-review-workspace";
import LegacyFinalization from "./expedient-finalization-legacy";
import type { AccessMode, Teacher } from "./siacd-app-v3";

export type FinalizationMode = "complementary" | "quality" | "evidence" | "documents" | "certification";

type Props = {
  mode: FinalizationMode;
  teacher: Teacher;
  accessMode: AccessMode;
  coordinatorName: string;
  operationalPercent: number;
  operationalEvaluated: number;
  operationalCriticalGaps: number;
  onChanged: () => Promise<void> | void;
};

export default function ExpedientFinalization(props: Props) {
  if (props.mode === "evidence") {
    return <EvidenceReviewWorkspace teacher={props.teacher} coordinatorName={props.coordinatorName} />;
  }
  return <LegacyFinalization {...props} />;
}
