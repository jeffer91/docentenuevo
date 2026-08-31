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

type PendingOnboardingAssignment = {
  id: string;
  careerId: string;
  career: string;
  program?: string;
  coordinator: string;
};

type PeriodOption = {
  id: string;
  name: string;
};

type CareerOption = {
  id: string;
  name: string;
  program?: string;
  coordinatorId: string;
  coordinatorName: string;
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

export default function TeacherProcessPortalV2({
  token,
  onProcessAvailabilityChange,
}: {
  token: string;
  onProcessAvailabilityChange?: (available: boolean) => void;
}) {
  const [session, setSession] = useState<TeacherSession | null>(null);
  const [expedients, setExpedients] = useState<PortalExpedient[]>([]);
  const [selectedExpedientId, setSelectedExpedientId] = useState("");
  const [detail, setDetail] = useState<PortalDetail | null>(null);
  const [portalTab, setPortalTab] = useState<PortalTab>("home");
  const [selectedPhase, setSelectedPhase] = useState<TeacherEvidencePhase>("areas");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [pendingAssignment, setPendingAssignment] = useState<PendingOnboardingAssignment | null>(null);
  const [careerOptions, setCareerOptions] = useState<CareerOption[]>([]);
  const [periodOptions, setPeriodOptions] = useState<PeriodOption[]>([]);
  const [selectedCareerId, setSelectedCareerId] = useState("");
  const [subjectNames, setSubjectNames] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [modality, setModality] = useState("Presencial");
  const [activitiesStartOn, setActivitiesStartOn] = useState("");
  const [linkingCareer, setLinkingCareer] = useState(false);
  const [creatingProcess, setCreatingProcess] = useState(false);
  const [changingCareer, setChangingCareer] = useState(false);

  const loadOnboarding = useCallback(async (teacherId: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !teacherId) return;

    const [pendingResult, careerResult, staffResult, assignmentResult, periodResult] = await Promise.all([
      supabase.rpc("teacher_onboarding_state", { p_token: token }),
      supabase.from("careers").select("id, name, program").eq("active", true).order("name"),
      supabase.from("siacd_staff").select("id, full_name").eq("role", "coordinator").eq("active", true),
      supabase.from("siacd_staff_careers").select("staff_id, career_id"),
      supabase.from("academic_periods").select("id, name").eq("active", true).order("starts_on", { ascending: false }),
    ]);

    if (pendingResult.error) {
      setMessage("No se pudo consultar la vinculación de su carrera.");
      return;
    }

    const pendingRow = Array.isArray(pendingResult.data)
      ? pendingResult.data[0] as Record<string, unknown> | undefined
      : undefined;

    if (pendingRow) {
      setPendingAssignment({
        id: String(pendingRow.assignment_id ?? ""),
        careerId: String(pendingRow.career_id ?? ""),
        career: String(pendingRow.career ?? "Carrera"),
        program: typeof pendingRow.program === "string" ? pendingRow.program : undefined,
        coordinator: String(pendingRow.coordinator ?? "Coordinación"),
      });
      setSelectedCareerId(String(pendingRow.career_id ?? ""));
    } else {
      setPendingAssignment(null);
    }

    const catalogError = careerResult.error ?? staffResult.error ?? assignmentResult.error;
    if (catalogError) {
      setMessage("No se pudieron cargar las carreras disponibles.");
      setCareerOptions([]);
    } else {
      const staffMap = new Map(
        ((staffResult.data ?? []) as Array<Record<string, unknown>>).map((row) => [
          String(row.id),
          String(row.full_name ?? "Coordinación"),
        ]),
      );
      const careerMap = new Map(
        ((careerResult.data ?? []) as Array<Record<string, unknown>>).map((row) => [
          String(row.id),
          {
            id: String(row.id),
            name: String(row.name ?? ""),
            program: typeof row.program === "string" ? row.program : undefined,
          },
        ]),
      );

      const options: CareerOption[] = [];
      for (const row of (assignmentResult.data ?? []) as Array<Record<string, unknown>>) {
        const staffId = String(row.staff_id ?? "");
        const careerId = String(row.career_id ?? "");
        const coordinatorName = staffMap.get(staffId);
        const career = careerMap.get(careerId);
        if (!career || !coordinatorName) continue;
        options.push({
          ...career,
          coordinatorId: staffId,
          coordinatorName,
        });
      }

      options.sort((a, b) => a.name.localeCompare(b.name, "es"));
      setCareerOptions(options);
    }

    if (periodResult.error) {
      setMessage("No se pudieron cargar los períodos académicos.");
      setPeriodOptions([]);
    } else {
      const periods = ((periodResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        name: String(row.name ?? ""),
      }));
      setPeriodOptions(periods);
      setPeriodId((current) => current || periods[0]?.id || "");
    }
  }, [token]);

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
      onProcessAvailabilityChange?.(false);
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
    onProcessAvailabilityChange?.(rows.length > 0);
    setSelectedExpedientId((current) => current && rows.some((item) => item.expedient_id === current) ? current : rows[0]?.expedient_id ?? "");
    if (!rows.length) {
      await loadOnboarding(sessionRow.teacher_id);
    } else {
      setPendingAssignment(null);
      setCareerOptions([]);
      setSelectedCareerId("");
    }
    setLoading(false);
  }, [loadOnboarding, onProcessAvailabilityChange, token]);

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

  async function linkCareer() {
    if (!selectedCareerId || linkingCareer) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setLinkingCareer(true);
    setMessage("");
    const { error } = await supabase.rpc("teacher_set_onboarding_career", {
      p_token: token,
      p_career_id: selectedCareerId,
    });
    setLinkingCareer(false);

    if (error) {
      setMessage("No se pudo vincular la carrera. Verifique que tenga un coordinador asignado e intente nuevamente.");
      return;
    }

    if (session?.teacher_id) await loadOnboarding(session.teacher_id);
    setChangingCareer(false);
    setMessage("Carrera vinculada correctamente. Complete los datos del proceso para ingresar.");
  }

  async function createProcess() {
    if (!pendingAssignment || creatingProcess) return;
    if (subjectNames.trim().length < 2) {
      setMessage("Ingrese la asignatura o asignaturas del proceso.");
      return;
    }
    if (!periodId) {
      setMessage("Seleccione el período académico.");
      return;
    }
    if (!activitiesStartOn) {
      setMessage("Seleccione la fecha de inicio de actividades.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setCreatingProcess(true);
    setMessage("");
    const { data, error } = await supabase.rpc("teacher_create_process_from_onboarding", {
      p_token: token,
      p_period_id: periodId,
      p_subject_names: subjectNames.trim(),
      p_modality: modality,
      p_activities_start_on: activitiesStartOn,
    });
    setCreatingProcess(false);

    if (error) {
      const detail = error.message ?? "";
      if (/period_not_available/i.test(detail)) {
        setMessage("El período seleccionado ya no está disponible.");
      } else if (/onboarding_not_found/i.test(detail)) {
        setMessage("No se encontró la carrera pendiente. Vuelva a seleccionarla.");
      } else if (/career_without_coordinator/i.test(detail)) {
        setMessage("La carrera ya no tiene un coordinador activo asignado.");
      } else {
        setMessage("No se pudo crear el proceso. Revise los datos e intente nuevamente.");
      }
      return;
    }

    const row = Array.isArray(data) ? data[0] as { expedient_id?: string } | undefined : undefined;
    setPendingAssignment(null);
    setChangingCareer(false);
    setSubjectNames("");
    setActivitiesStartOn("");
    setMessage("Proceso creado correctamente. Ya puede continuar con su acompañamiento.");
    await loadSummary();
    if (row?.expedient_id) setSelectedExpedientId(String(row.expedient_id));
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

    {!expedients.length ? <section className={styles.section}>
      {pendingAssignment ? <div>
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.eyebrow}>Paso 2 de 2</span>
            <h2>Complete los datos de su proceso</h2>
            <p>Su carrera ya está vinculada. Con estos datos SIACD creará el expediente y podrá ingresar inmediatamente.</p>
          </div>
          <span>Listo para crear</span>
        </div>

        <div className={styles.processHero}>
          <div>
            <span className={styles.eyebrow}>Carrera seleccionada</span>
            <h2>{pendingAssignment.career}{pendingAssignment.program ? ` — ${pendingAssignment.program}` : ""}</h2>
            <p>Coordinador responsable: {pendingAssignment.coordinator}</p>
          </div>
        </div>

        {changingCareer ? <div className={styles.onboardingCareerChange}>
          <label>Cambiar carrera</label>
          <div className={styles.processSelector}>
            <select value={selectedCareerId} onChange={(event) => setSelectedCareerId(event.target.value)}>
              <option value="">Seleccione una carrera</option>
              {careerOptions.map((career) => <option key={career.id} value={career.id}>{career.name}{career.program ? ` — ${career.program}` : ""} · {career.coordinatorName}</option>)}
            </select>
            <button className={styles.logout} type="button" disabled={!selectedCareerId || linkingCareer} onClick={() => void linkCareer()}>{linkingCareer ? "Guardando…" : "Guardar carrera"}</button>
            <button className={styles.logout} type="button" onClick={() => { setChangingCareer(false); setSelectedCareerId(pendingAssignment.careerId); }}>Cancelar</button>
          </div>
        </div> : <button className={styles.linkButtonInline} type="button" onClick={() => { setSelectedCareerId(pendingAssignment.careerId); setChangingCareer(true); }}>Cambiar carrera</button>}

        <div className={styles.onboardingGrid}>
          <label className={styles.onboardingField}>
            <span>Asignatura(s)</span>
            <input value={subjectNames} onChange={(event) => setSubjectNames(event.target.value)} placeholder="Ej. Programación I" />
          </label>

          <label className={styles.onboardingField}>
            <span>Período académico</span>
            <select value={periodId} onChange={(event) => setPeriodId(event.target.value)}>
              <option value="">Seleccione un período</option>
              {periodOptions.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
            </select>
          </label>

          <label className={styles.onboardingField}>
            <span>Modalidad</span>
            <select value={modality} onChange={(event) => setModality(event.target.value)}>
              <option>Presencial</option>
              <option>Híbrida</option>
              <option>Online</option>
              <option>Intensiva</option>
            </select>
          </label>

          <label className={styles.onboardingField}>
            <span>Inicio de actividades</span>
            <input type="date" value={activitiesStartOn} onChange={(event) => setActivitiesStartOn(event.target.value)} />
          </label>
        </div>

        <div className={styles.onboardingActions}>
          <button
            type="button"
            disabled={creatingProcess || subjectNames.trim().length < 2 || !periodId || !activitiesStartOn}
            onClick={() => void createProcess()}
          >
            {creatingProcess ? "Creando proceso…" : "Crear proceso e ingresar"}
          </button>
        </div>
      </div> : <div>
        <div className={styles.sectionHead}><div><span className={styles.eyebrow}>Paso 1 de 2</span><h2>Seleccione su carrera</h2><p>SIACD identificará automáticamente al coordinador responsable.</p></div></div>
        {careerOptions.length ? <div className={styles.processSelector}>
          <span>Carrera</span>
          <select value={selectedCareerId} onChange={(event) => setSelectedCareerId(event.target.value)}>
            <option value="">Seleccione una carrera</option>
            {careerOptions.map((career) => <option key={career.id} value={career.id}>{career.name}{career.program ? ` — ${career.program}` : ""} · {career.coordinatorName}</option>)}
          </select>
          <button className={styles.logout} type="button" disabled={!selectedCareerId || linkingCareer} onClick={() => void linkCareer()}>{linkingCareer ? "Vinculando…" : "Continuar"}</button>
        </div> : <div className={styles.empty}>No existen carreras disponibles con coordinador asignado.</div>}
      </div>}
    </section> : detail && <>
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