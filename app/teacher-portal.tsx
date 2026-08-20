"use client";

import { useEffect, useState } from "react";
import { BarChart3, Paperclip } from "lucide-react";
import TeacherCedulaAccess from "./teacher-cedula-access";
import TeacherEvidenceHub from "./teacher-evidence-hub";
import TeacherIndicators from "./teacher-indicators";
import TeacherProcessPortal from "./teacher-process-portal";
import styles from "./teacher-portal-shell.module.css";

const DEVICE_TOKEN_KEY = "siacd-teacher-device-token";

export default function TeacherPortal() {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState("");
  const [showEvidence, setShowEvidence] = useState(false);
  const [showIndicators, setShowIndicators] = useState(false);

  useEffect(() => {
    function syncToken() {
      const current = window.localStorage.getItem(DEVICE_TOKEN_KEY) ?? "";
      setToken((previous) => previous === current ? previous : current);
      setReady(true);
      if (!current) {
        setShowEvidence(false);
        setShowIndicators(false);
      }
    }
    syncToken();
    const timer = window.setInterval(syncToken, 700);
    return () => window.clearInterval(timer);
  }, []);

  if (!ready) return null;
  if (!token) return <TeacherCedulaAccess onAuthenticated={setToken} />;

  return <>
    <TeacherProcessPortal token={token} />
    <button className={styles.indicatorButton} onClick={() => setShowIndicators(true)}><BarChart3 size={17}/>Mis indicadores</button>
    <button className={styles.evidenceButton} onClick={() => setShowEvidence(true)}><Paperclip size={17}/>Evidencias</button>
    {showEvidence && <TeacherEvidenceHub token={token} onClose={() => setShowEvidence(false)} />}
    {showIndicators && <TeacherIndicators token={token} onClose={() => setShowIndicators(false)} />}
  </>;
}
