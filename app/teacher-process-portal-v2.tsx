"use client";

import { CheckCircle2, History, LogOut } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import TeacherCriterionEvidenceWorkspace, { type TeacherEvidencePhase } from "./teacher-criterion-evidence-workspace";
import { getSupabaseBrowserClient } from "./lib/supabase";
import styles from "./teacher-portal.module.css";

const DEVICE_TOKEN_KEY = "siacd-teacher-device-token";
type PortalTab = "home" | "process" | "reviews" | "history";

type TeacherSession = {
  teacher_id: string;
  full_name: string;
  email: string;
  session_expires_at: string;
};

type PortalExpedient = {
  expedient_id: string;
  career: string;
  period: string;
  subject: string;
  status: string;
};

type PhaseDetail = {
  label: string;
  hitos_total: number;
  hitos_executed: number;
  hitos_validated: number;
  criteria_total: number;
  criteria_evaluated: number;
  progress: number;
  status: "No iniciado" | "En proceso" | "Completado";
};

type ClosedReview = {
  id: string;
  sequence: number;
  title: string;
  closed_at: string;
  evaluated: number;
  passed: number;
  failed: number;
  not_applicable: number;
  percent: number | null;
  model_scope?: "current" | "historical";
  failed_items: Array<{ criterion_id: string; score: number; observation: string | null }>;
};

type ActivityItem = {
  id: string;
  actor_type: "teacher" | "coordinator" | "admin" | "system";
  event_type: string;
  message: string;
  created_at: string;
};

type PortalDetail = {
  expedient: {
    id: string;
    career: string;
    period: string;
    subject: string;
    status: string;
    modality: string;
  };
  current_phase: TeacherEvidencePhase;
  phases: Record<TeacherEvidencePhase, PhaseDetail>;
  pending_actions: Array<{ id: string }>;
  closed_reviews: ClosedReview[];
  activity: ActivityItem[];
};

const phaseOrder: TeacherEvidencePhase[] = ["areas", "before", "during", "after"];
const phaseLabels: Record<TeacherEvidencePhase, string> = {
  areas: "Áreas",
  before: "Antes",
  during: "Durante",
  after: "Después",
};

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    draft: "Pendiente",
    in_progress: "En acompañamiento",
    with_gaps: "Con brechas",
    ready_for_review: "Listo para revisión",
    pending_approval: "Pendiente de aprobación",
    returned: "Devuelto",
    approved: "Aprobado",
    certified: "Certificado",
    archived: "Archivado",
  };
  return labels[value] ?? value;
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function actorLabel(value: ActivityItem["actor_type"]) {
  if (value === "teacher") return "Docente";
  if (value === "coordinator") return "Coordinación";
  if (value === "admin") return "Administración";
  return "SIACD";
}

export default function TeacherProcessPortalV2({ token }: { token: string }) {
  const [session, setSession] = useState<TeacherSession | null>(null);
  const [expedients, setExpedients] = useState<PortalExpedient[]>([]);
  const [selectedExpedientId, setSelectedExpedientId] = useState("");
  const [detail, setDetail] = useState<PortalDetail | null>(null);
  const [portalTab, setPortalTab] = useState<PortalTab>("home");
  const [selectedPhase, setSelectedPhase] = useState<TeacherEvidencePhase>("areas");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadSummary = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !token) return;
    setLoading(true);
    const [sessionResult, summaryResult] = await Promise.all([
      supabase.rpc("teacher_validate_device", { p_token: token }),
      supabase.rpc("teacher_portal_summary", { p_token: token }),
    ]);
    const sessionRow = !sessionResult.error && Array.isArray(sessionResult.data)
      ? sessionResult.data[0] as TeacherSession | undefined
      : undefined;
    if (!sessionRow) {
      window.localStorage.removeItem(DEVICE_TOKEN_KEY);
      setLoading(false);
      return;
    }
    setSession(sessionRow);
    if (summaryResult.error) {
      setMessage("No se pudo cargar su proceso.");
      setLoading(false);
      return;
    }
    const rows = (summaryResult.data ?? []) as PortalExpedient[];
    setExpedients(rows);
    setSelectedExpedientId((current) => current && rows.some((item) => item.expedient_id === current) ? current : rows[0]?.expedient_id ?? "");
    setLoading(false);
  }, [token]);

  const loadDetail = useCallback(async (expedientId: string, resetTab = false) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !token || !expedientId) return;
    const { data, error } = await supabase.rpc("teacher_portal_process_detail", {
      p_token: token,
      p_expedient_id: expedientId,
    });
    if (error || !data) {
      setDetail(null);
      setMessage("No se pudo cargar el proceso.");
      return;
    }
    const loaded = data as PortalDetail;
    setDetail(loaded);
    setSelectedPhase(loaded.current_phase ?? "areas");
    if (resetTab) setPortalTab("home");
  }, [token]);

  useEffect(() => { void loadSummary(); }, [loadSummary]);
  useEffect(() => { if (selectedExpedientId) void loadDetail(selectedExpedientId, true); }, [loadDetail, selectedExpedientId]);

  async function logout() {
    const supabase = getSupabaseBrowserClient();
    try {
      if (supabase && token) await supabase.rpc("teacher_revoke_device", { p_token: token });
    } finally {
      window.localStorage.removeItem(DEVICE_TOKEN_KEY);
      window.location.reload();
    }
  }

  function openPhase(phase: TeacherEvidencePhase) {
    setSelectedPhase(phase);
    setPortalTab("process");
  }

  if (loading && !session) return <div className={styles.center}><div className={styles.loading}>Cargando…</div></div>;

  return <main className={styles.portal}>
    <header className={styles.portalHeader}>
      <div className={styles.teacherIdentity}>
        <span className={styles.eyebrow}>SIACD · Docente</span>
        <div className={styles.teacherLine}><h1>{session?.full_name ?? "Acompañamiento docente"}</h1><span className={styles.teacherRole}>Docente</span></div>
      </div>
      <button className={styles.logout} onClick={() => void logout()}><LogOut size={16}/>Salir</button>
    </header>

    {message && <section className={styles.infoBanner}><CheckCircle2 size={18}/><div><span>{message}</span></div></section>}

    {expedients.length > 1 && <section className={styles.processSelector}><span>Proceso</span><select value={selectedExpedientId} onChange={(event) => setSelectedExpedientId(event.target.value)}>{expedients.map((item) => <option key={item.expedient_id} value={item.expedient_id}>{item.career} · {item.subject} · {item.period}</option>)}</select></section>}

    {!expedients.length ? <section className={styles.section}><div className={styles.empty}>No hay procesos vinculados.</div></section> : detail && <>
      <section className={styles.processHero}>
        <div><span className={styles.eyebrow}>{detail.expedient.career}</span><h2>{detail.expedient.subject}</h2><p>{detail.expedient.period} · {detail.expedient.modality}</p></div>
        <span className={styles.statusBadge}>{statusLabel(detail.expedient.status)}</span>
      </section>

      <nav className={styles.portalTabs}>
        <button className={portalTab === "home" ? styles.activeTab : ""} onClick={() => setPortalTab("home")}>Inicio</button>
        <button className={portalTab === "process" ? styles.activeTab : ""} onClick={() => setPortalTab("process")}>Mi proceso</button>
        <button className={portalTab === "reviews" ? styles.activeTab : ""} onClick={() => setPortalTab("reviews")}>Revisiones</button>
        <button className={portalTab === "history" ? styles.activeTab : ""} onClick={() => setPortalTab("history")}>Historial</button>
      </nav>

      {portalTab === "home" && <div className={styles.dashboardGrid}>
        <section className={`${styles.section} ${styles.wideSection}`}>
          <div className={styles.sectionHead}><div><h2>Mi proceso</h2></div><button className={styles.logout} onClick={() => openPhase(detail.current_phase)}>Continuar</button></div>
          <div className={styles.phaseGrid}>
            {phaseOrder.map((phase) => {
              const item = detail.phases?.[phase];
              if (!item) return null;
              return <button key={phase} className={`${styles.phaseCard} ${phase === detail.current_phase ? styles.currentPhase : ""}`} style={{ textAlign: "left", cursor: "pointer", font: "inherit" }} onClick={() => openPhase(phase)}>
                <header><div><span>{phaseLabels[phase]}</span><strong>{item.status}</strong></div><b>{item.progress}%</b></header>
                <div className={styles.progress}><span style={{ width: `${item.progress}%` }}/></div>
                <footer><span>{item.criteria_evaluated}/{item.criteria_total} revisados</span><span>Abrir</span></footer>
              </button>;
            })}
          </div>
        </section>
      </div>}

      {portalTab === "process" && <section className={`${styles.section} ${styles.processSection}`}>
        <TeacherCriterionEvidenceWorkspace token={token} expedientId={selectedExpedientId} initialPhase={selectedPhase} onChanged={() => loadDetail(selectedExpedientId)} />
      </section>}

      {portalTab === "reviews" && <section className={styles.section}>
        <div className={styles.sectionHead}><div><h2>Revisiones</h2></div><span>{detail.closed_reviews?.length ?? 0}</span></div>
        {detail.closed_reviews?.length ? <div className={styles.reviewList}>{detail.closed_reviews.map((review) => <article className={styles.reviewCard} key={review.id}><header><div><span>{review.model_scope === "historical" ? "Histórico" : `Revisión ${review.sequence}`}</span><h3>{review.title}</h3><small>{formatDate(review.closed_at)}</small></div><strong>{review.percent === null ? "—" : `${review.percent}%`}</strong></header><div className={styles.reviewStats}><span><b>{review.evaluated}</b>Evaluados</span><span><b>{review.passed}</b>Cumplen</span><span><b>{review.failed}</b>Por mejorar</span><span><b>{review.not_applicable}</b>No aplica</span></div>{review.failed_items?.length > 0 && <div className={styles.reviewIssues}><strong>Por mejorar</strong>{review.failed_items.slice(0, 8).map((item) => <div key={`${review.id}-${item.criterion_id}`}><span>{item.criterion_id} · {item.score}/4</span><p>{item.observation || "Revise la observación."}</p></div>)}</div>}</article>)}</div> : <div className={styles.empty}>Sin revisiones todavía.</div>}
      </section>}

      {portalTab === "history" && <section className={styles.section}>
        <div className={styles.sectionHead}><div><h2>Historial</h2></div><span>{detail.activity?.length ?? 0}</span></div>
        {detail.activity?.length ? <div className={styles.activityList}>{detail.activity.map((item) => <article className={styles.activityItem} key={item.id}><div className={styles.activityIcon}><History size={15}/></div><div><strong>{item.message}</strong><span>{actorLabel(item.actor_type)} · {formatDate(item.created_at)}</span></div></article>)}</div> : <div className={styles.empty}>Sin movimientos todavía.</div>}
      </section>}
    </>}
  </main>;
}