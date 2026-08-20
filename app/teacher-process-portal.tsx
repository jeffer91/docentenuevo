"use client";

import { CheckCircle2, ChevronRight, Clock3, History, ListChecks, LogOut, Target } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "./lib/supabase";
import styles from "./teacher-portal.module.css";

const DEVICE_TOKEN_KEY = "siacd-teacher-device-token";

type PhaseKey = "areas" | "before" | "during" | "after";
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
  activities_start_on: string | null;
  planned_close_on: string | null;
  hitos_executed: number;
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

type HitoDetail = {
  id: string;
  title: string;
  phase: PhaseKey;
  moment: string;
  purpose: string;
  scheduled_on: string | null;
  executed_on: string | null;
  validated: boolean;
};

type PendingAction = {
  id: string;
  criterion_id: string | null;
  action: string;
  responsible: string;
  due_on: string | null;
  status: "pending" | "in_progress";
};

type ClosedReview = {
  id: string;
  sequence: number;
  title: string;
  cycle_type: string;
  hito_id: string | null;
  phase: PhaseKey | null;
  scheduled_on: string | null;
  closed_at: string;
  evaluated: number;
  passed: number;
  failed: number;
  not_applicable: number;
  percent: number | null;
  failed_items: Array<{
    criterion_type: string;
    criterion_id: string;
    score: number;
    observation: string | null;
  }>;
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
    activities_start_on: string | null;
    planned_close_on: string | null;
    modality: string;
  };
  current_phase: PhaseKey;
  phases: Record<PhaseKey, PhaseDetail>;
  hitos: HitoDetail[];
  next_review: {
    id: string;
    title: string;
    cycle_type: string;
    hito_id: string | null;
    scheduled_on: string | null;
    status: "planned" | "open";
  } | null;
  pending_actions: PendingAction[];
  closed_reviews: ClosedReview[];
  activity: ActivityItem[];
};

const phaseOrder: PhaseKey[] = ["areas", "before", "during", "after"];
const phaseLabels: Record<PhaseKey, string> = {
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
  if (!value) return "Sin fecha";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T12:00:00`);
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

export default function TeacherProcessPortal({ token }: { token: string }) {
  const [session, setSession] = useState<TeacherSession | null>(null);
  const [expedients, setExpedients] = useState<PortalExpedient[]>([]);
  const [selectedExpedientId, setSelectedExpedientId] = useState("");
  const [detail, setDetail] = useState<PortalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [portalTab, setPortalTab] = useState<PortalTab>("home");

  const loadSummary = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !token) return;
    const [sessionResult, summaryResult] = await Promise.all([
      supabase.rpc("teacher_validate_device", { p_token: token }),
      supabase.rpc("teacher_portal_summary", { p_token: token }),
    ]);

    const sessionRow = !sessionResult.error && Array.isArray(sessionResult.data)
      ? sessionResult.data[0] as TeacherSession | undefined
      : undefined;
    if (!sessionRow) {
      window.localStorage.removeItem(DEVICE_TOKEN_KEY);
      setMessage("La sesión del dispositivo venció. Ingrese nuevamente.");
      setLoading(false);
      return;
    }
    setSession(sessionRow);

    if (summaryResult.error) {
      setMessage("No se pudo cargar el acompañamiento docente.");
      setLoading(false);
      return;
    }
    const rows = (summaryResult.data ?? []) as PortalExpedient[];
    setExpedients(rows);
    setSelectedExpedientId((current) => current && rows.some((item) => item.expedient_id === current) ? current : rows[0]?.expedient_id ?? "");
    setLoading(false);
  }, [token]);

  const loadDetail = useCallback(async (expedientId: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !token || !expedientId) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("teacher_portal_process_detail", {
      p_token: token,
      p_expedient_id: expedientId,
    });
    if (error || !data) {
      setDetail(null);
      setMessage("No se pudo cargar el detalle de este proceso.");
    } else {
      setDetail(data as PortalDetail);
      setPortalTab("home");
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { void loadSummary(); }, [loadSummary]);
  useEffect(() => {
    if (selectedExpedientId) void loadDetail(selectedExpedientId);
  }, [loadDetail, selectedExpedientId]);

  const latestReview = useMemo(() => detail?.closed_reviews?.[0] ?? null, [detail]);

  function logout() {
    window.localStorage.removeItem(DEVICE_TOKEN_KEY);
    setSession(null);
    window.location.reload();
  }

  if (loading && !detail) {
    return <div className={styles.center}><div className={styles.loading}>Cargando su acompañamiento…</div></div>;
  }

  return (
    <main className={styles.portal}>
      <header className={styles.portalHeader}>
        <div>
          <span className={styles.eyebrow}>SIACD · Docente</span>
          <h1>{session ? `Bienvenido, ${session.full_name}` : "Acompañamiento docente"}</h1>
          <p>{session?.email ?? ""}</p>
        </div>
        <button className={styles.logout} onClick={logout}><LogOut size={16}/>Cerrar sesión</button>
      </header>

      {message && <section className={styles.infoBanner}><CheckCircle2 size={20}/><div><strong>Información</strong><span>{message}</span></div></section>}

      {expedients.length > 1 && (
        <section className={styles.processSelector}>
          <span>Proceso</span>
          <select value={selectedExpedientId} onChange={(event) => setSelectedExpedientId(event.target.value)}>
            {expedients.map((item) => <option key={item.expedient_id} value={item.expedient_id}>{item.career} · {item.subject} · {item.period}</option>)}
          </select>
        </section>
      )}

      {!expedients.length ? (
        <section className={styles.section}><div className={styles.empty}>No existen procesos vinculados a este docente todavía.</div></section>
      ) : detail ? (
        <>
          <section className={styles.processHero}>
            <div><span className={styles.eyebrow}>{detail.expedient.career}</span><h2>{detail.expedient.subject}</h2><p>{detail.expedient.period} · {detail.expedient.modality}</p></div>
            <span className={styles.statusBadge}>{statusLabel(detail.expedient.status)}</span>
          </section>

          <section className={styles.quickGrid}>
            <article className={styles.quickCard}><Target size={19}/><span>Momento actual</span><strong>{phaseLabels[detail.current_phase] ?? "Áreas"}</strong></article>
            <article className={styles.quickCard}><ListChecks size={19}/><span>Mis pendientes</span><strong>{detail.pending_actions.length}</strong><small>{detail.pending_actions.length === 1 ? "acción pendiente" : "acciones pendientes"}</small></article>
            <article className={styles.quickCard}><CheckCircle2 size={19}/><span>Último resultado</span><strong>{latestReview?.percent === null || latestReview?.percent === undefined ? "—" : `${latestReview.percent}%`}</strong><small>{latestReview ? `${latestReview.passed} cumplen · ${latestReview.failed} por mejorar` : "Aún no hay revisión cerrada"}</small></article>
            <article className={styles.quickCard}><Clock3 size={19}/><span>Próxima revisión</span><strong>{detail.next_review?.scheduled_on ? formatDate(detail.next_review.scheduled_on) : "Sin programar"}</strong><small>{detail.next_review?.title ?? "Coordinación definirá la fecha"}</small></article>
          </section>

          <nav className={styles.portalTabs}>
            <button className={portalTab === "home" ? styles.activeTab : ""} onClick={() => setPortalTab("home")}>Inicio</button>
            <button className={portalTab === "process" ? styles.activeTab : ""} onClick={() => setPortalTab("process")}>Proceso</button>
            <button className={portalTab === "reviews" ? styles.activeTab : ""} onClick={() => setPortalTab("reviews")}>Revisiones</button>
            <button className={portalTab === "history" ? styles.activeTab : ""} onClick={() => setPortalTab("history")}>Historial</button>
          </nav>

          {portalTab === "home" && (
            <div className={styles.dashboardGrid}>
              <section className={`${styles.section} ${styles.wideSection}`}>
                <div className={styles.sectionHead}><div><span className={styles.eyebrow}>Mi avance</span><h2>Áreas, antes, durante y después</h2></div></div>
                <div className={styles.phaseGrid}>
                  {phaseOrder.map((phase) => {
                    const item = detail.phases?.[phase];
                    if (!item) return null;
                    return <article key={phase} className={`${styles.phaseCard} ${phase === detail.current_phase ? styles.currentPhase : ""}`}>
                      <header><div><span>{phaseLabels[phase]}</span><strong>{item.status}</strong></div><b>{item.progress}%</b></header>
                      <div className={styles.progress}><span style={{ width: `${item.progress}%` }}/></div>
                      <footer><span>{item.criteria_evaluated}/{item.criteria_total} criterios revisados</span><span>{item.hitos_validated}/{item.hitos_total} hitos validados</span></footer>
                    </article>;
                  })}
                </div>
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHead}><div><span className={styles.eyebrow}>Acciones</span><h2>Lo que debo hacer ahora</h2></div><span>{detail.pending_actions.length}</span></div>
                {detail.pending_actions.length ? <div className={styles.taskList}>{detail.pending_actions.map((task) => <article key={task.id} className={styles.taskItem}><div className={styles.taskIcon}><ListChecks size={16}/></div><div><strong>{task.action}</strong><span>{task.criterion_id ? `Criterio ${task.criterion_id}` : "Acción general"}{task.due_on ? ` · vence ${formatDate(task.due_on)}` : ""}</span></div><span className={styles.taskStatus}>{task.status === "in_progress" ? "En proceso" : "Pendiente"}</span></article>)}</div> : <div className={styles.emptyCompact}>No tiene acciones pendientes asignadas.</div>}
              </section>
            </div>
          )}

          {portalTab === "process" && (
            <section className={styles.section}>
              <div className={styles.sectionHead}><div><span className={styles.eyebrow}>Ruta del acompañamiento</span><h2>Mi proceso completo</h2></div><span>{detail.hitos.filter((item) => item.validated).length}/6 hitos validados</span></div>
              <div className={styles.timeline}>{phaseOrder.map((phase) => <div key={phase} className={styles.timelinePhase}><div className={styles.timelinePhaseTitle}><span>{phaseLabels[phase]}</span><small>{detail.phases?.[phase]?.status ?? "No iniciado"}</small></div><div className={styles.hitoList}>{detail.hitos.filter((item) => item.phase === phase).map((hito) => <article key={hito.id} className={styles.hitoItem}><div className={`${styles.hitoDot} ${hito.validated ? styles.done : hito.executed_on ? styles.running : ""}`}>{hito.validated ? <CheckCircle2 size={16}/> : <Clock3 size={15}/>}</div><div><strong>{hito.title}</strong><p>{hito.purpose}</p><span>{hito.scheduled_on ? `Programado: ${formatDate(hito.scheduled_on)}` : hito.moment}</span></div><div className={styles.hitoState}>{hito.validated ? "Validado" : hito.executed_on ? "Ejecutado" : "Pendiente"}<ChevronRight size={15}/></div></article>)}</div></div>)}</div>
            </section>
          )}

          {portalTab === "reviews" && (
            <section className={styles.section}>
              <div className={styles.sectionHead}><div><span className={styles.eyebrow}>Resultados publicados</span><h2>Mis revisiones</h2></div><span>{detail.closed_reviews.length}</span></div>
              {detail.closed_reviews.length ? <div className={styles.reviewList}>{detail.closed_reviews.map((review) => <article key={review.id} className={styles.reviewCard}><header><div><span>{review.phase ? phaseLabels[review.phase] : review.hito_id ?? "Revisión"}</span><h3>{review.title}</h3><small>Cerrada {formatDate(review.closed_at)}</small></div><strong>{review.percent === null ? "—" : `${review.percent}%`}</strong></header><div className={styles.reviewStats}><span><b>{review.passed}</b>Cumplen</span><span><b>{review.failed}</b>Por mejorar</span><span><b>{review.not_applicable}</b>No aplica</span><span><b>{review.evaluated}</b>Evaluados</span></div>{review.failed_items.length > 0 && <div className={styles.reviewIssues}>{review.failed_items.slice(0, 8).map((item) => <div key={`${review.id}-${item.criterion_type}-${item.criterion_id}`}><strong>{item.criterion_id}</strong><span>{item.observation || "Requiere mejora."}</span></div>)}</div>}</article>)}</div> : <div className={styles.empty}>Aún no existen revisiones cerradas.</div>}
            </section>
          )}

          {portalTab === "history" && (
            <section className={styles.section}>
              <div className={styles.sectionHead}><div><span className={styles.eyebrow}>Trazabilidad</span><h2>Historial del proceso</h2></div><History size={18}/></div>
              {detail.activity.length ? <div className={styles.activityList}>{detail.activity.map((item) => <article key={item.id}><div><strong>{actorLabel(item.actor_type)}</strong><span>{formatDate(item.created_at)}</span></div><p>{item.message}</p></article>)}</div> : <div className={styles.empty}>Todavía no existe actividad registrada.</div>}
            </section>
          )}
        </>
      ) : (
        <section className={styles.section}><div className={styles.empty}>No se pudo mostrar este proceso.</div></section>
      )}
    </main>
  );
}
