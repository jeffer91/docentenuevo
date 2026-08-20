"use client";

import { useEffect, useState } from "react";
import EvidenceReviewWorkspace from "./evidence-review-workspace";
import LegacyFinalization from "./expedient-finalization-legacy";
import { getSupabaseBrowserClient } from "./lib/supabase";
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
  const [notApplicableCount, setNotApplicableCount] = useState(0);

  useEffect(() => {
    let active = true;
    async function loadNotApplicable() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const { count, error } = await supabase
        .from("competency_scores")
        .select("id", { count: "exact", head: true })
        .eq("expedient_id", props.teacher.id)
        .eq("not_applicable", true);
      if (active && !error) setNotApplicableCount(count ?? 0);
    }
    void loadNotApplicable();
    return () => { active = false; };
  }, [props.teacher.id]);

  if (props.mode === "evidence") {
    return <EvidenceReviewWorkspace teacher={props.teacher} coordinatorName={props.coordinatorName} />;
  }

  const resolvedOperationalEvaluated = props.operationalEvaluated + notApplicableCount;
  return <LegacyFinalization {...props} operationalEvaluated={resolvedOperationalEvaluated} />;
}
