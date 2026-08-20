"use client";

import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import InstitutionalIndicators from "./institutional-indicators";
import SiacdAppV3 from "./siacd-app-v3";
import styles from "./siacd-app-v6.module.css";

export default function SiacdAppV6({ forcedAccess }: { forcedAccess?: "coordinator" | "admin" }) {
  const [showIndicators, setShowIndicators] = useState(false);
  const [coordinatorId, setCoordinatorId] = useState("");

  useEffect(() => {
    if (forcedAccess !== "coordinator") return;
    function sync() {
      setCoordinatorId(window.sessionStorage.getItem("siacd-coordinator-id") ?? "");
    }
    sync();
    const timer = window.setInterval(sync, 800);
    return () => window.clearInterval(timer);
  }, [forcedAccess]);

  const canShow = forcedAccess === "admin" || (forcedAccess === "coordinator" && coordinatorId);

  return <>
    <SiacdAppV3 forcedAccess={forcedAccess} />
    {canShow && <button className={styles.launcher} onClick={() => setShowIndicators(true)}><BarChart3 size={17}/>Indicadores</button>}
    {showIndicators && canShow && <InstitutionalIndicators
      mode={forcedAccess === "admin" ? "admin" : "coordinator"}
      staffId={forcedAccess === "admin" ? null : coordinatorId}
      onClose={() => setShowIndicators(false)}
    />}
  </>;
}
