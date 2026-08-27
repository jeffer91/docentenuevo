"use client";

import { FileText } from "lucide-react";
import { useEffect, useState } from "react";
import ExpedientWorkspaceV7 from "./expedient-workspace-v7";
import FormalReportWorkspace from "./formal-report-workspace-v3";
import type { AccessMode, Teacher } from "./siacd-app-v3";

type Props = {
  teacher: Teacher;
  accessMode: AccessMode;
  coordinatorName: string;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
};

export default function ExpedientWorkspaceV8(props: Props) {
  const [showReports, setShowReports] = useState(false);

  useEffect(() => {
    const hidden: HTMLElement[] = [];
    const hideLegacyReportEntrances = () => {
      for (const element of Array.from(document.querySelectorAll("button"))) {
        const text = element.textContent?.trim() ?? "";
        if (text === "Informes" || text === "Generar los 5 informes") {
          const html = element as HTMLElement;
          if (html.dataset.siacdFormalHidden === "1") continue;
          html.dataset.siacdFormalHidden = "1";
          html.style.display = "none";
          hidden.push(html);
        }
      }
    };
    hideLegacyReportEntrances();
    const observer = new MutationObserver(hideLegacyReportEntrances);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      hidden.forEach((item) => {
        item.style.removeProperty("display");
        delete item.dataset.siacdFormalHidden;
      });
    };
  }, []);

  return <>
    <ExpedientWorkspaceV7 {...props} />
    <button
      onClick={() => setShowReports(true)}
      style={{
        position: "fixed",
        right: 24,
        bottom: 24,
        zIndex: 10010,
        border: 0,
        borderRadius: 13,
        padding: "12px 16px",
        background: "#123b60",
        color: "white",
        fontWeight: 800,
        boxShadow: "0 12px 30px rgba(14,42,68,.24)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
      }}
    >
      <FileText size={17}/> Informes de acompañamiento
    </button>
    {showReports && <FormalReportWorkspace
      teacher={props.teacher}
      accessMode={props.accessMode}
      coordinatorName={props.coordinatorName}
      onClose={() => setShowReports(false)}
    />}
  </>;
}
