"use client";

import { useEffect, useState } from "react";
import { BarChart3, Paperclip } from "lucide-react";
import TeacherEvidenceHub from "./teacher-evidence-hub";
import TeacherIndicators from "./teacher-indicators";
import TeacherPortalLegacy from "./teacher-portal-legacy";
import styles from "./teacher-portal-shell.module.css";

const DEVICE_TOKEN_KEY = "siacd-teacher-device-token";

export default function TeacherPortal() {
  const [token, setToken] = useState("");
  const [showEvidence, setShowEvidence] = useState(false);
  const [showIndicators, setShowIndicators] = useState(false);

  useEffect(() => {
    function syncToken() {
      const current = window.localStorage.getItem(DEVICE_TOKEN_KEY) ?? "";
      setToken((previous) => previous === current ? previous : current);
      if (!current) {
        setShowEvidence(false);
        setShowIndicators(false);
      }
    }
    syncToken();
    const timer = window.setInterval(syncToken, 700);
    return () => window.clearInterval(timer);
  }, []);

  return <>
    <TeacherPortalLegacy />
    {token && <>
      <button className={styles.indicatorButton} onClick={() => setShowIndicators(true)}><BarChart3 size={17}/>Mis indicadores</button>
      <button className={styles.evidenceButton} onClick={() => setShowEvidence(true)}><Paperclip size={17}/>Evidencias</button>
    </>}
    {showEvidence && token && <TeacherEvidenceHub token={token} onClose={() => setShowEvidence(false)} />}
    {showIndicators && token && <TeacherIndicators token={token} onClose={() => setShowIndicators(false)} />}
  </>;
}
