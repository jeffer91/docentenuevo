"use client";

import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import ExpedientWorkspaceV6 from "./expedient-workspace-v6";
import ReviewCycleWorkspace from "./review-cycle-workspace";
import type { AccessMode, Teacher } from "./siacd-app-v3";
import styles from "./review-cycle-launcher.module.css";

type Props = {
  teacher: Teacher;
  accessMode: AccessMode;
  coordinatorName: string;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
};

export default function ExpedientWorkspaceV5(props: Props) {
  const [showReviews, setShowReviews] = useState(false);

  return <>
    <ExpedientWorkspaceV6 {...props} />
    <button className={styles.launcher} onClick={() => setShowReviews(true)}>
      <ClipboardCheck size={17}/>
      Revisiones
    </button>
    {showReviews && <ReviewCycleWorkspace
      teacher={props.teacher}
      accessMode={props.accessMode}
      coordinatorName={props.coordinatorName}
      onClose={() => setShowReviews(false)}
      onChanged={props.onChanged}
    />}
  </>;
}
