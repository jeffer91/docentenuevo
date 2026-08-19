"use client";

import { useEffect, useState } from "react";
import { Paperclip } from "lucide-react";
import TeacherEvidenceHub from "./teacher-evidence-hub";
import TeacherPortalLegacy from "./teacher-portal-legacy";
import styles from "./teacher-portal-shell.module.css";

const DEVICE_TOKEN_KEY = "siacd-teacher-device-token";

export default function TeacherPortal() {
  const [token, setToken] = useState("");
  const [showEvidence, setShowEvidence] = useState(false);

  useEffect(() => {
    function syncToken() {
      const current = window.localStorage.getItem(DEVICE_TOKEN_KEY) ?? "";
      setToken((previous) => previous === current ? previous : current);
      if (!current) setShowEvidence(false);
    }
    syncToken();
    const timer = window.setInterval(syncToken, 700);
    return () => window.clearInterval(timer);
  }, []);

  return <>
    <TeacherPortalLegacy />
    {token && <button className={styles.evidenceButton} onClick={() => setShowEvidence(true)}><Paperclip size={17}/>Evidencias</button>}
    {showEvidence && token && <TeacherEvidenceHub token={token} onClose={() => setShowEvidence(false)} />}
  </>;
}
