"use client";

import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import TeacherCedulaAccess from "./teacher-cedula-access";
import TeacherIndicators from "./teacher-indicators";
import TeacherProcessPortal from "./teacher-process-portal";
import TeacherProcessAutoOpen from "./teacher-process-auto-open";
import styles from "./teacher-portal-shell.module.css";

const DEVICE_TOKEN_KEY = "siacd-teacher-device-token";

export default function TeacherPortal() {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState("");
  const [showIndicators, setShowIndicators] = useState(false);
  const [hasProcess, setHasProcess] = useState(false);

  useEffect(() => {
    function syncToken() {
      const current = window.localStorage.getItem(DEVICE_TOKEN_KEY) ?? "";
      setToken((previous) => previous === current ? previous : current);
      setReady(true);
      if (!current) {
        setShowIndicators(false);
        setHasProcess(false);
      }
    }
    syncToken();
    const timer = window.setInterval(syncToken, 700);
    return () => window.clearInterval(timer);
  }, []);

  if (!ready) return null;
  if (!token) return <TeacherCedulaAccess onAuthenticated={setToken} />;

  return <>
    <TeacherProcessAutoOpen />
    <TeacherProcessPortal token={token} onProcessAvailabilityChange={setHasProcess} />
    {hasProcess && <button className={styles.indicatorButton} onClick={() => setShowIndicators(true)}><BarChart3 size={17}/>Mis indicadores</button>}
    {hasProcess && showIndicators && <TeacherIndicators token={token} onClose={() => setShowIndicators(false)} />}
  </>;
}
