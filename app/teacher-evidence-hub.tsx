"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, Paperclip, X } from "lucide-react";
import { getSupabaseBrowserClient } from "./lib/supabase";
import TeacherEvidencePanel from "./teacher-evidence-panel";
import styles from "./teacher-evidence-hub.module.css";

type PortalExpedient = {
  expedient_id: string;
  career: string;
  period: string;
  subject: string;
};

export default function TeacherEvidenceHub({ token, onClose }: { token: string; onClose: () => void }) {
  const [processes, setProcesses] = useState<PortalExpedient[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !token) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("teacher_portal_summary", { p_token: token });
    setLoading(false);
    if (error) {
      setMessage("No se pudieron cargar sus procesos.");
      return;
    }
    const rows = (data ?? []) as PortalExpedient[];
    setProcesses(rows);
    setSelectedId((current) => current && rows.some((row) => row.expedient_id === current) ? current : rows[0]?.expedient_id ?? "");
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  return <div className={styles.backdrop}>
    <section className={styles.hub} role="dialog" aria-modal="true" aria-label="Evidencias del docente">
      <header className={styles.header}>
        <div className={styles.identity}><button onClick={onClose} aria-label="Volver"><ChevronLeft size={18}/></button><div><span>SIACD · Espacio docente</span><h1>Mis evidencias</h1></div></div>
        <button className={styles.close} onClick={onClose} aria-label="Cerrar"><X size={18}/></button>
      </header>

      <div className={styles.body}>
        {processes.length > 1 && <div className={styles.selector}><label>Proceso de acompañamiento</label><select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{processes.map((item) => <option key={item.expedient_id} value={item.expedient_id}>{item.career} · {item.subject} · {item.period}</option>)}</select></div>}
        {message && <div className={styles.message}>{message}</div>}
        {loading ? <div className={styles.empty}>Cargando procesos…</div> : selectedId ? <TeacherEvidencePanel token={token} expedientId={selectedId} /> : <div className={styles.empty}><Paperclip size={24}/><span>No existen procesos disponibles para enviar evidencias.</span></div>}
      </div>
    </section>
  </div>;
}
