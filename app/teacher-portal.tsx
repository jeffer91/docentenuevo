"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  History,
  ListChecks,
  LogOut,
  Mail,
  ShieldCheck,
  Target,
} from "lucide-react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "./lib/supabase";
import styles from "./teacher-portal.module.css";

const DEVICE_TOKEN_KEY = "siacd-teacher-device-token";
const DEVICE_EMAIL_KEY = "siacd-teacher-email";

type TeacherSession = {
  teacher_id: string;
  full_name: string;
  email: string;
  session_expires_at: string;
};

type VerifyRow = {
  device_token: string;
  teacher_id: string;
  full_name: string;
  email: string;
  expires_at: string;
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

type PhaseKey = "before" | "during" | "after";
type PortalTab = "home" | "process" | "reviews" | "history";

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

const phaseOrder: PhaseKey[] = ["before", "during", "after"];
const phaseLabels: Record<PhaseKey, string> = {
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

export default function TeacherPortal() {
  const configured = isSupabaseConfigured();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [session, setSession] = useState<TeacherSession | null>(null);
  const [expedients, setExpedients] = useState<PortalExpedient[]>([]);
  const [selectedExpedientId, setSelectedExpedientId] = useState("");
  const [detail, setDetail] = useState<PortalDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [portalTab, setPortalTab] = useState<PortalTab>("home");

  const loadSummary = useCallback(async (token: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data, error } = await supabase.rpc("teacher_portal_summary", { p_token: token });
    if (error) {
      setMessage("No se pudo cargar el acompañamiento docente.");
      return;
    }
    const rows = (data ?? []) as PortalExpedient[];
    setExpedients(rows);
    setSelectedExpedientId((current) => current && rows.some((item) => item.expedient_id === current) ? current : rows[0]?.expedient_id ?? "");
  }, []);

  const loadDetail = useCallback(async (token: string, expedientId: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !expedientId) return;
    setDetailLoading(true);
    const { data, error } = await supabase.rpc("teacher_portal_process_detail", {
      p_token: token,
      p_expedient_id: expedientId,
    });
    setDetailLoading(false);
    if (error || !data) {
      setDetail(null);
      setMessage("No se pudo cargar el detalle de este proceso.");
      return;
    }
    setDetail(data as PortalDetail);
  }, []);

  useEffect(() => {
    let active = true;
    async function validateSavedDevice() {
      if (!configured) {
        if (active) setChecking(false);
        return;
      }
      const token = window.localStorage.getItem(DEVICE_TOKEN_KEY);
      const savedEmail = window.localStorage.getItem(DEVICE_EMAIL_KEY) ?? "";
      if (savedEmail && active) setEmail(savedEmail);
      if (!token) {
        if (active) setChecking(false);
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (active) setChecking(false);
        return;
      }
      const { data, error } = await supabase.rpc("teacher_validate_device", { p_token: token });
      const row = !error && Array.isArray(data) ? (data[0] as TeacherSession | undefined) : undefined;
      if (!active) return;
      if (!row) {
        window.localStorage.removeItem(DEVICE_TOKEN_KEY);
        setChecking(false);
        return;
      }
      setSession(row);
      setEmail(row.email);
      setChecking(false);
      await loadSummary(token);
    }
    void validateSavedDevice();
    return () => { active = false; };
  }, [configured, loadSummary]);

  useEffect(() => {
    if (!selectedExpedientId || !session) return;
    const token = window.localStorage.getItem(DEVICE_TOKEN_KEY);
    if (!token) return;
    setPortalTab("home");
    void loadDetail(token, selectedExpedientId);
  }, [loadDetail, selectedExpedientId, session]);

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    const { data, error } = await supabase.functions.invoke("teacher-access", { body: { email: normalizedEmail } });
    setBusy(false);

    const serviceError = (data as { error?: string } | null)?.error;
    if (serviceError === "email_delivery_not_configured") {
      setMessage("El acceso docente ya está preparado, pero falta activar el servicio que enviará los códigos por correo.");
      return;
    }
    if (error || serviceError) {
      setMessage("No se pudo enviar el código. Intente nuevamente en unos minutos.");
      return;
    }

    setEmail(normalizedEmail);
    setStep("code");
    setMessage("Si el correo está registrado, recibirá un código de 4 dígitos. Revise también correo no deseado.");
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{4}$/.test(code)) {
      setMessage("Ingrese los 4 dígitos del código recibido.");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    const { data, error } = await supabase.rpc("teacher_verify_access", {
      p_email: email.trim().toLowerCase(),
      p_code: code,
      p_device_label: navigator.userAgent.slice(0, 180),
    });
    setBusy(false);

    const row = !error && Array.isArray(data) ? data[0] as VerifyRow | undefined : undefined;
    if (!row?.device_token) {
      setMessage("El código no es válido o ya venció. Puede solicitar uno nuevo.");
      return;
    }

    window.localStorage.setItem(DEVICE_TOKEN_KEY, row.device_token);
    window.localStorage.setItem(DEVICE_EMAIL_KEY, row.email);
    setSession({
      teacher_id: row.teacher_id,
      full_name: row.full_name,
      email: row.email,
      session_expires_at: row.expires_at,
    });
    setCode("");
    setMessage("");
    await loadSummary(row.device_token);
  }

  async function logout() {
    const token = window.localStorage.getItem(DEVICE_TOKEN_KEY);
    const supabase = getSupabaseBrowserClient();
    if (token && supabase) await supabase.rpc("teacher_revoke_device", { p_token: token });
    window.localStorage.removeItem(DEVICE_TOKEN_KEY);
    setSession(null);
    setExpedients([]);
    setSelectedExpedientId("");
    setDetail(null);
    setStep("email");
    setMessage("");
  }

  const latestReview = useMemo(() => detail?.closed_reviews?.[0] ?? null, [detail]);

  if (!configured) {
    return <div className={styles.center}><div className={styles.card}><h1>SIACD Docentes</h1><p>La conexión con Supabase no está configurada.</p></div></div>;
  }

  if (checking) {
    return <div className={styles.center}><div className={styles.loading}>Verificando este dispositivo…</div></div>;
  }

  if (!session) {
    return (
      <main className={styles.loginPage}>
        <section className={styles.brandPanel}>
          <img src="/logo-itsqmet.png" alt="ITSQMET" />
          <div>
            <span className={styles.eyebrow}>SIACD · Espacio docente</span>
            <h1>Su acompañamiento, en un solo lugar.</h1>
            <p>Consulte pendientes, avance, próximas revisiones y resultados del proceso de acompañamiento.</p>
          </div>
          <small>El código se solicita solo al registrar este dispositivo.</small>
        </section>

        <section className={styles.accessPanel}>
          <div className={styles.accessCard}>
            <div className={styles.accessIcon}><ShieldCheck size={22} /></div>
            <h2>Acceso docente</h2>
            {step === "email" ? (
              <form onSubmit={requestCode}>
                <label>Correo institucional</label>
                <div className={styles.inputWithIcon}><Mail size={17} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nombre@institucion.edu.ec" required /></div>
                <button type="submit" disabled={busy}>{busy ? "Enviando…" : "Enviar código"}<ArrowRight size={16} /></button>
              </form>
            ) : (
              <form onSubmit={verifyCode}>
                <label>Código de 4 dígitos</label>
                <input className={styles.codeInput} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="0000" required />
                <button type="submit" disabled={busy || code.length !== 4}>{busy ? "Verificando…" : "Ingresar"}<ArrowRight size={16} /></button>
                <button className={styles.linkButton} type="button" onClick={() => { setStep("email"); setCode(""); setMessage(""); }}>Usar otro correo / solicitar otro código</button>
              </form>
            )}
            {message && <div className={styles.message}>{message}</div>}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.portal}>
      <header className={styles.portalHeader}>
        <div><span className={styles.eyebrow}>SIACD · Docente</span><h1>Bienvenido, {session.full_name}</h1><p>{session.email}</p></div>
        <button className={styles.logout} onClick={() => void logout()}><LogOut size={16} />Cerrar sesión</button>
      </header>

      <section className={styles.infoBanner}>
        <CheckCircle2 size={20} />
        <div><strong>Este dispositivo quedó registrado.</strong><span>El código no se pedirá nuevamente mientras la sesión del dispositivo siga vigente.</span></div>
      </section>

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
      ) : detailLoading ? (
        <section className={styles.section}><div className={styles.empty}>Cargando su acompañamiento…</div></section>
      ) : detail ? (
        <>
          <section className={styles.processHero}>
            <div>
              <span className={styles.eyebrow}>{detail.expedient.career}</span>
              <h2>{detail.expedient.subject}</h2>
              <p>{detail.expedient.period} · {detail.expedient.modality}</p>
            </div>
            <span className={styles.statusBadge}>{statusLabel(detail.expedient.status)}</span>
          </section>

          <section className={styles.quickGrid}>
            <article className={styles.quickCard}><Target size={19} /><span>Momento actual</span><strong>{phaseLabels[detail.current_phase]}</strong></article>
            <article className={styles.quickCard}><CalendarDays size={19} /><span>Próxima revisión</span><strong>{detail.next_review?.scheduled_on ? formatDate(detail.next_review.scheduled_on) : "Sin programar"}</strong><small>{detail.next_review?.title ?? "La coordinación definirá la fecha"}</small></article>
            <article className={styles.quickCard}><ListChecks size={19} /><span>Mis pendientes</span><strong>{detail.pending_actions.length}</strong><small>{detail.pending_actions.length === 1 ? "acción pendiente" : "acciones pendientes"}</small></article>
            <article className={styles.quickCard}><CheckCircle2 size={19} /><span>Último resultado cerrado</span><strong>{latestReview?.percent === null || latestReview?.percent === undefined ? "—" : `${latestReview.percent}%`}</strong><small>{latestReview ? `${latestReview.passed} pasan · ${latestReview.failed} no pasan` : "Aún no hay una revisión cerrada"}</small></article>
          </section>

          <nav className={styles.portalTabs}>
            <button className={portalTab === "home" ? styles.activeTab : ""} onClick={() => setPortalTab("home")}>Inicio</button>
            <button className={portalTab === "process" ? styles.activeTab : ""} onClick={() => setPortalTab("process")}>Proceso</button>
            <button className={portalTab === "reviews" ? styles.activeTab : ""} onClick={() => setPortalTab("reviews")}>Revisiones</button>
            <button className={portalTab === "history" ? styles.activeTab : ""} onClick={() => setPortalTab("history")}>Historial</button>
          </nav>

          {portalTab === "home" && <HomeView detail={detail} />}
          {portalTab === "process" && <ProcessView detail={detail} />}
          {portalTab === "reviews" && <ReviewsView reviews={detail.closed_reviews} />}
          {portalTab === "history" && <HistoryView activity={detail.activity} />}
        </>
      ) : (
        <section className={styles.section}><div className={styles.empty}>No se pudo mostrar este proceso.</div></section>
      )}
    </main>
  );
}

function HomeView({ detail }: { detail: PortalDetail }) {
  return <div className={styles.dashboardGrid}>
    <section className={`${styles.section} ${styles.wideSection}`}>
      <div className={styles.sectionHead}><div><span className={styles.eyebrow}>Mi avance</span><h2>Antes, durante y después</h2></div></div>
      <div className={styles.phaseGrid}>
        {phaseOrder.map((phase) => {
          const item = detail.phases[phase];
          return <article key={phase} className={`${styles.phaseCard} ${phase === detail.current_phase ? styles.currentPhase : ""}`}>
            <header><div><span>{phaseLabels[phase]}</span><strong>{item.status}</strong></div><b>{item.progress}%</b></header>
            <div className={styles.progress}><span style={{ width: `${item.progress}%` }} /></div>
            <footer><span>{item.criteria_evaluated}/{item.criteria_total} criterios revisados</span><span>{item.hitos_validated}/{item.hitos_total} hitos validados</span></footer>
          </article>;
        })}
      </div>
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHead}><div><span className={styles.eyebrow}>Acciones</span><h2>Lo que debo hacer ahora</h2></div><span>{detail.pending_actions.length}</span></div>
      {detail.pending_actions.length ? <div className={styles.taskList}>{detail.pending_actions.map((task) => <article key={task.id} className={styles.taskItem}><div className={styles.taskIcon}><ListChecks size={16} /></div><div><strong>{task.action}</strong><span>{task.criterion_id ? `Criterio ${task.criterion_id}` : "Acción general"}{task.due_on ? ` · vence ${formatDate(task.due_on)}` : ""}</span></div><span className={styles.taskStatus}>{task.status === "in_progress" ? "En proceso" : "Pendiente"}</span></article>)}</div> : <div className={styles.emptyCompact}>No tiene acciones pendientes asignadas.</div>}
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHead}><div><span className={styles.eyebrow}>Próximo paso</span><h2>Próxima revisión</h2></div></div>
      {detail.next_review ? <div className={styles.nextReview}><div className={styles.calendarBox}><span>{detail.next_review.scheduled_on ? formatDate(detail.next_review.scheduled_on).split(" ")[0] : "—"}</span><small>{detail.next_review.scheduled_on ? formatDate(detail.next_review.scheduled_on).replace(/^\S+\s/, "") : "Sin fecha"}</small></div><div><strong>{detail.next_review.title}</strong><span>{detail.next_review.hito_id ?? "Seguimiento general"}</span><small>{detail.next_review.status === "open" ? "Revisión abierta" : "Programada por coordinación"}</small></div></div> : <div className={styles.emptyCompact}>No existe una nueva revisión programada todavía.</div>}
    </section>
  </div>;
}

function ProcessView({ detail }: { detail: PortalDetail }) {
  return <section className={styles.section}>
    <div className={styles.sectionHead}><div><span className={styles.eyebrow}>Ruta del acompañamiento</span><h2>Mi proceso</h2></div><span>{detail.hitos.filter((item) => item.validated).length}/6 hitos validados</span></div>
    <div className={styles.timeline}>{phaseOrder.map((phase) => <div key={phase} className={styles.timelinePhase}><div className={styles.timelinePhaseTitle}><span>{phaseLabels[phase]}</span><small>{detail.phases[phase].status}</small></div><div className={styles.hitoList}>{detail.hitos.filter((item) => item.phase === phase).map((hito) => <article key={hito.id} className={styles.hitoItem}><div className={`${styles.hitoDot} ${hito.validated ? styles.done : hito.executed_on ? styles.running : ""}`}>{hito.validated ? <CheckCircle2 size={16} /> : <Clock3 size={15} />}</div><div><strong>{hito.id} · {hito.title}</strong><p>{hito.purpose}</p><span>{hito.scheduled_on ? `Programado: ${formatDate(hito.scheduled_on)}` : hito.moment}</span></div><div className={styles.hitoState}>{hito.validated ? "Validado" : hito.executed_on ? "Ejecutado" : "Pendiente"}<ChevronRight size={15} /></div></article>)}</div></div>)}</div>
  </section>;
}

function ReviewsView({ reviews }: { reviews: ClosedReview[] }) {
  return <section className={styles.section}>
    <div className={styles.sectionHead}><div><span className={styles.eyebrow}>Resultados publicados</span><h2>Mis revisiones</h2></div><span>{reviews.length}</span></div>
    <p className={styles.helperText}>Los resultados aparecen aquí únicamente cuando la coordinación cierra la revisión.</p>
    {reviews.length ? <div className={styles.reviewList}>{reviews.map((review) => <article key={review.id} className={styles.reviewCard}><header><div><span>{review.hito_id ?? (review.cycle_type === "quality" ? "Calidad" : "Revisión")}</span><h3>{review.title}</h3><small>Cerrada {formatDate(review.closed_at)}</small></div><strong>{review.percent === null ? "—" : `${review.percent}%`}</strong></header><div className={styles.reviewStats}><span><b>{review.passed}</b>Pasan</span><span><b>{review.failed}</b>No pasan</span><span><b>{review.not_applicable}</b>No aplica</span><span><b>{review.evaluated}</b>Evaluados</span></div>{review.failed_items.length > 0 && <div className={styles.reviewIssues}><strong>Aspectos por mejorar</strong>{review.failed_items.map((item) => <div key={`${item.criterion_type}-${item.criterion_id}`}><span>{item.criterion_id} · {item.score}/4</span><p>{item.observation || "Requiere mejora en la próxima revisión."}</p></div>)}</div>}</article>)}</div> : <div className={styles.empty}>Aún no hay revisiones cerradas. Los puntajes no se muestran mientras una revisión está en proceso.</div>}
  </section>;
}

function HistoryView({ activity }: { activity: ActivityItem[] }) {
  return <section className={styles.section}>
    <div className={styles.sectionHead}><div><span className={styles.eyebrow}>Trazabilidad</span><h2>Historial del proceso</h2></div><span>{activity.length}</span></div>
    {activity.length ? <div className={styles.activityList}>{activity.map((item) => <article key={item.id} className={styles.activityItem}><div className={styles.activityIcon}><History size={15} /></div><div><strong>{item.message}</strong><span>{actorLabel(item.actor_type)} · {formatDate(item.created_at)}</span></div></article>)}</div> : <div className={styles.empty}>El historial automático empezará a llenarse con las próximas acciones del proceso.</div>}
  </section>;
}
