"use client";
/* eslint-disable @next/next/no-img-element */

import {
  Activity,
  ArrowRight,
  BarChart3,
  CalendarDays,
  ChevronRight,
  Clock3,
  FolderOpen,
  LayoutDashboard,
  Menu,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "./lib/supabase";
import ExpedientWorkspace from "./expedient-workspace";

export type AccessMode = "landing" | "coordinator" | "admin";
type StaffRole = "coordinator" | "approver" | "admin";
type View = "dashboard" | "teachers" | "schedule" | "reports" | "coordinators" | "settings";

export type CatalogOption = { id: string; name: string; program?: string };
type AcademicPeriod = { id: string; name: string };

export type StaffMember = {
  id: string;
  full_name: string;
  role: StaffRole;
  active: boolean;
  careerIds: string[];
};

type ScheduleRange = { startTime: string; endTime: string };

export type Teacher = {
  id: string;
  coordinatorId: string;
  name: string;
  email: string;
  careerId: string;
  career: string;
  subject: string;
  modality: string;
  period: string;
  entryDate: string;
  activitiesStartDate: string;
  plannedCloseDate: string;
  scheduleRanges: string[];
  progress: number;
  status: "En acompañamiento" | "Con brechas" | "Pendiente de aprobación" | "Aprobado" | "Certificado";
  currentHito: string;
  criticalGaps: number;
  hitosExecuted: number;
};

type NewTeacherInput = {
  name: string;
  careerId: string;
  periodId: string;
  subject: string;
  modality: string;
  entryDate: string;
  activitiesStartDate: string;
  plannedCloseDate: string;
  schedules: ScheduleRange[];
  email: string;
  teams: string;
  telegram: string;
};

type CoordinatorInput = {
  id?: string;
  name: string;
  active: boolean;
  careerIds: string[];
};

const coordinatorNav = [
  { label: "Panel general", view: "dashboard" as const, icon: LayoutDashboard },
  { label: "Docentes", view: "teachers" as const, icon: Users },
  { label: "Cronograma", view: "schedule" as const, icon: CalendarDays },
  { label: "Reportes", view: "reports" as const, icon: BarChart3 },
];

const adminNav = [
  { label: "Panel general", view: "dashboard" as const, icon: LayoutDashboard },
  { label: "Coordinadores", view: "coordinators" as const, icon: UserCog },
  { label: "Docentes", view: "teachers" as const, icon: Users },
  { label: "Estadísticas", view: "reports" as const, icon: BarChart3 },
  { label: "Catálogos", view: "settings" as const, icon: Settings },
];

const hitoIds = ["H1", "H2", "H3", "H4", "H5", "H6"];

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function relation(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" ? (row as Record<string, unknown>) : null;
}

function relationName(value: unknown) {
  const row = relation(value);
  if (!row) return "Sin asignar";
  const name = String(row.name ?? "Sin asignar");
  const program = row.program ? String(row.program) : "";
  return program ? `${name} — ${program}` : name;
}

function mapStatus(value: string): Teacher["status"] {
  if (value === "with_gaps") return "Con brechas";
  if (["ready_for_review", "pending_approval", "returned"].includes(value)) return "Pendiente de aprobación";
  if (value === "approved") return "Aprobado";
  if (["certified", "archived"].includes(value)) return "Certificado";
  return "En acompañamiento";
}

function statusClass(status: Teacher["status"]) {
  if (status === "Certificado" || status === "Aprobado") return "green";
  if (status === "Con brechas") return "red";
  if (status === "Pendiente de aprobación") return "gold";
  return "blue";
}

function mapStaff(row: Record<string, unknown>): StaffMember {
  const assignments = Array.isArray(row.siacd_staff_careers) ? (row.siacd_staff_careers as Record<string, unknown>[]) : [];
  return {
    id: String(row.id),
    full_name: String(row.full_name ?? "Sin nombre"),
    role: String(row.role ?? "coordinator") as StaffRole,
    active: Boolean(row.active),
    careerIds: assignments.map((item) => String(item.career_id)),
  };
}

function mapExpedient(row: Record<string, unknown>): Teacher {
  const teacher = relation(row.teachers);
  const career = relation(row.careers);
  const period = relation(row.academic_periods);
  const hitos = Array.isArray(row.hito_schedules) ? (row.hito_schedules as Record<string, unknown>[]) : [];
  const executed = hitos.filter((item) => Boolean(item.executed_on));
  const ranges = Array.isArray(row.expedient_schedules)
    ? [...(row.expedient_schedules as Record<string, unknown>[])].sort((a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0))
    : [];
  const status = mapStatus(String(row.status ?? "draft"));
  const progress = status === "Certificado" ? 100 : Math.round((executed.length / 6) * 100);
  const nextHito = Math.min(6, executed.length + 1);

  return {
    id: String(row.id),
    coordinatorId: String(row.coordinator_staff_id ?? ""),
    name: String(teacher?.full_name ?? "Sin nombre"),
    email: String(teacher?.institutional_email ?? ""),
    careerId: String(career?.id ?? ""),
    career: relationName(row.careers),
    subject: String(row.subject_names ?? "Sin asignatura"),
    modality: String(row.modality ?? "Sin modalidad"),
    period: String(period?.name ?? "Sin período"),
    entryDate: String(teacher?.started_institution_on ?? ""),
    activitiesStartDate: String(row.activities_start_on ?? ""),
    plannedCloseDate: String(row.planned_close_on ?? ""),
    scheduleRanges: ranges.map((item) => `${String(item.start_time ?? "").slice(0, 5)} a ${String(item.end_time ?? "").slice(0, 5)}`),
    progress,
    status,
    currentHito: status === "Certificado" ? "Proceso finalizado" : executed.length === 6 ? "H6 · Cierre completado" : `H${nextHito} · pendiente`,
    criticalGaps: Number(row.critical_gaps ?? 0),
    hitosExecuted: executed.length,
  };
}

function accessFromPath(): AccessMode {
  if (typeof window === "undefined") return "landing";
  const pathname = window.location.pathname.toLowerCase();
  if (pathname.includes("/coordinador")) return "coordinator";
  if (pathname.includes("/administrador")) return "admin";
  return "landing";
}

export default function SiacdApp({ forcedAccess }: { forcedAccess?: "coordinator" | "admin" }) {
  const configured = isSupabaseConfigured();
  const [accessMode] = useState<AccessMode>(() => forcedAccess ?? accessFromPath());
  const [view, setView] = useState<View>("dashboard");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [careers, setCareers] = useState<CatalogOption[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedCoordinatorId, setSelectedCoordinatorId] = useState("");
  const [loading, setLoading] = useState(accessMode !== "landing" && configured);
  const [schemaIssue, setSchemaIssue] = useState("");
  const [toast, setToast] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [showCoordinatorModal, setShowCoordinatorModal] = useState(false);
  const [editingCoordinator, setEditingCoordinator] = useState<StaffMember | null>(null);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);

  const selectedCoordinator = useMemo(() => staff.find((item) => item.id === selectedCoordinatorId && item.role === "coordinator") ?? null, [selectedCoordinatorId, staff]);

  const assignedCareers = useMemo(() => {
    if (accessMode === "admin") return careers;
    if (!selectedCoordinator) return [];
    return careers.filter((career) => selectedCoordinator.careerIds.includes(career.id));
  }, [accessMode, careers, selectedCoordinator]);

  const loadBaseData = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setLoading(true);
    setSchemaIssue("");
    const [staffResult, careerResult, periodResult] = await Promise.all([
      supabase.from("siacd_staff").select("id, full_name, role, active, siacd_staff_careers(career_id)").order("full_name"),
      supabase.from("careers").select("id, name, program").eq("active", true).order("name"),
      supabase.from("academic_periods").select("id, name").eq("active", true).order("starts_on", { ascending: false }),
    ]);
    if (staffResult.error) {
      setSchemaIssue("Falta aplicar la migración 202608180001_block1_access_and_staff.sql en Supabase.");
      setLoading(false);
      return;
    }
    setStaff(((staffResult.data ?? []) as Record<string, unknown>[]).map(mapStaff));
    setCareers((careerResult.data ?? []) as CatalogOption[]);
    setPeriods((periodResult.data ?? []) as AcademicPeriod[]);
    setLoading(false);
  }, []);

  const loadExpedients = useCallback(async (coordinatorId?: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let query = supabase
      .from("expedients")
      .select("id, coordinator_staff_id, status, subject_names, modality, activities_start_on, planned_close_on, critical_gaps, teachers(full_name, institutional_email, started_institution_on), careers(id, name, program), academic_periods(name), hito_schedules(hito_id, scheduled_on, executed_on, coordinator_validated), expedient_schedules(sequence, start_time, end_time)")
      .order("created_at", { ascending: false });
    if (accessMode === "coordinator") {
      if (!coordinatorId) { setTeachers([]); return; }
      query = query.eq("coordinator_staff_id", coordinatorId);
    }
    const { data, error } = await query;
    if (error) { setToast(`No se pudieron cargar los expedientes: ${error.message}`); return; }
    setTeachers(((data ?? []) as Record<string, unknown>[]).map(mapExpedient));
  }, [accessMode]);

  useEffect(() => { if (accessMode !== "landing" && configured) void loadBaseData(); }, [accessMode, configured, loadBaseData]);
  useEffect(() => {
    if (accessMode !== "coordinator" || !staff.length) return;
    const saved = typeof window !== "undefined" ? window.sessionStorage.getItem("siacd-coordinator-id") : null;
    if (saved && staff.some((item) => item.id === saved && item.role === "coordinator" && item.active)) setSelectedCoordinatorId(saved);
  }, [accessMode, staff]);
  useEffect(() => {
    if (accessMode === "admin") { void loadExpedients(); return; }
    if (accessMode === "coordinator" && selectedCoordinatorId) void loadExpedients(selectedCoordinatorId);
  }, [accessMode, loadExpedients, selectedCoordinatorId]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 2800); return () => window.clearTimeout(timer); }, [toast]);

  function chooseCoordinator(id: string) {
    setSelectedCoordinatorId(id);
    if (typeof window !== "undefined") window.sessionStorage.setItem("siacd-coordinator-id", id);
    setView("dashboard");
  }

  function changeCoordinator() {
    setSelectedCoordinatorId("");
    setTeachers([]);
    if (typeof window !== "undefined") window.sessionStorage.removeItem("siacd-coordinator-id");
  }

  async function saveCoordinator(input: CoordinatorInput) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let staffId = input.id;
    if (staffId) {
      const { error } = await supabase.from("siacd_staff").update({ full_name: input.name, active: input.active, updated_at: new Date().toISOString() }).eq("id", staffId);
      if (error) return setToast(`No se pudo actualizar: ${error.message}`);
    } else {
      const { data, error } = await supabase.from("siacd_staff").insert({ full_name: input.name, role: "coordinator", active: input.active }).select("id").single();
      if (error || !data) return setToast(`No se pudo crear: ${error?.message ?? "error de base de datos"}`);
      staffId = data.id;
    }
    const { error: deleteError } = await supabase.from("siacd_staff_careers").delete().eq("staff_id", staffId);
    if (deleteError) return setToast(`No se pudieron actualizar las carreras: ${deleteError.message}`);
    if (input.careerIds.length) {
      const { error } = await supabase.from("siacd_staff_careers").insert(input.careerIds.map((careerId) => ({ staff_id: staffId, career_id: careerId })));
      if (error) return setToast(`No se pudieron asignar las carreras: ${error.message}`);
    }
    setShowCoordinatorModal(false);
    setEditingCoordinator(null);
    setToast(input.id ? "Coordinador actualizado" : "Coordinador creado");
    await loadBaseData();
  }

  async function toggleCoordinator(coordinator: StaffMember) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.from("siacd_staff").update({ active: !coordinator.active, updated_at: new Date().toISOString() }).eq("id", coordinator.id);
    if (error) return setToast(`No se pudo cambiar el estado: ${error.message}`);
    setToast(coordinator.active ? "Coordinador desactivado" : "Coordinador activado");
    await loadBaseData();
  }

  async function saveTeacher(input: NewTeacherInput) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !selectedCoordinator) return setToast("Seleccione un coordinador antes de registrar docentes");
    if (!selectedCoordinator.careerIds.includes(input.careerId)) return setToast("La carrera seleccionada no está asignada a este coordinador");
    const { data: teacher, error: teacherError } = await supabase.from("teachers").insert({ full_name: input.name, institutional_email: input.email || null, started_institution_on: input.entryDate, created_by: null }).select("id").single();
    if (teacherError || !teacher) return setToast(`No se pudo registrar el docente: ${teacherError?.message ?? "error de base de datos"}`);
    const { data: expedient, error: expedientError } = await supabase.from("expedients").insert({
      teacher_id: teacher.id,
      career_id: input.careerId,
      period_id: input.periodId,
      coordinator_id: null,
      coordinator_staff_id: selectedCoordinator.id,
      subject_names: input.subject,
      modality: input.modality,
      schedule_text: input.schedules.map((schedule) => `${schedule.startTime} a ${schedule.endTime}`).join(" · "),
      activities_start_on: input.activitiesStartDate,
      planned_close_on: input.plannedCloseDate || null,
      teams_code: input.teams || null,
      telegram_url: input.telegram || null,
      status: "in_progress",
    }).select("id").single();
    if (expedientError || !expedient) {
      await supabase.from("teachers").delete().eq("id", teacher.id);
      return setToast(`No se pudo crear el expediente: ${expedientError?.message ?? "error de base de datos"}`);
    }
    const { error: rangesError } = await supabase.from("expedient_schedules").insert(input.schedules.map((schedule, index) => ({ expedient_id: expedient.id, sequence: index + 1, start_time: schedule.startTime, end_time: schedule.endTime })));
    if (rangesError) {
      await supabase.from("expedients").delete().eq("id", expedient.id);
      await supabase.from("teachers").delete().eq("id", teacher.id);
      return setToast(`No se pudieron guardar las jornadas: ${rangesError.message}`);
    }
    const { error: hitosError } = await supabase.from("hito_schedules").insert(hitoIds.map((hitoId) => ({ expedient_id: expedient.id, hito_id: hitoId })));
    if (hitosError) {
      await supabase.from("expedients").delete().eq("id", expedient.id);
      await supabase.from("teachers").delete().eq("id", teacher.id);
      return setToast(`No se pudo crear H1–H6: ${hitosError.message}`);
    }
    setShowTeacherModal(false);
    setToast("Docente y expediente creados correctamente");
    await loadExpedients(selectedCoordinator.id);
  }

  if (accessMode === "landing") return <AccessLanding />;
  if (!configured) return <ConfigurationRequired />;
  if (loading && !staff.length && !schemaIssue) return <LoadingScreen />;
  if (schemaIssue) return <MigrationRequired message={schemaIssue} />;
  if (accessMode === "coordinator" && !selectedCoordinator) return <CoordinatorPicker coordinators={staff.filter((item) => item.role === "coordinator" && item.active)} onChoose={chooseCoordinator} />;

  const navItems = accessMode === "admin" ? adminNav : coordinatorNav;
  const profileName = accessMode === "admin" ? "Administrador SIACD" : selectedCoordinator?.full_name ?? "Coordinador";

  return (
    <div className="siacd-shell">
      <div className="mobile-topbar"><strong>SIACD</strong><button className="icon-button" aria-label="Abrir menú" onClick={() => setMobileOpen(true)}><Menu size={18} /></button></div>
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <InstitutionBrand compact />
        <div className="nav-label">Gestión</div>
        <nav className="nav">{navItems.map((item) => <button key={item.view} className={`nav-button ${view === item.view ? "active" : ""}`} onClick={() => { setView(item.view); setMobileOpen(false); }}><item.icon />{item.label}</button>)}</nav>
        <div className="sidebar-spacer" />
        {accessMode === "coordinator" && <button className="nav-button" onClick={changeCoordinator}><UserCog />Cambiar coordinador</button>}
        <div className="user-card"><div className="avatar">{initials(profileName)}</div><div><strong>{profileName}</strong><span>{accessMode === "admin" ? "Administrador general" : "Coordinador de Carrera"}</span></div></div>
      </aside>
      {mobileOpen && <button aria-label="Cerrar menú" className="mobile-scrim" onClick={() => setMobileOpen(false)} />}
      <main className="main">
        <Header accessMode={accessMode} view={view} onNewTeacher={() => setShowTeacherModal(true)} coordinatorName={selectedCoordinator?.full_name} />
        {view === "dashboard" && <Dashboard teachers={teachers} accessMode={accessMode} coordinatorCount={staff.filter((item) => item.role === "coordinator" && item.active).length} onViewTeachers={() => setView("teachers")} onOpenTeacher={setSelectedTeacher} />}
        {view === "teachers" && <TeachersPanel teachers={teachers} careers={accessMode === "coordinator" ? assignedCareers : careers} canCreate={accessMode === "coordinator"} onNew={() => setShowTeacherModal(true)} onOpen={setSelectedTeacher} />}
        {view === "schedule" && <ScheduleOverview teachers={teachers} onOpen={setSelectedTeacher} />}
        {view === "reports" && <Reports teachers={teachers} />}
        {view === "coordinators" && accessMode === "admin" && <CoordinatorsPanel coordinators={staff.filter((item) => item.role === "coordinator")} careers={careers} onNew={() => { setEditingCoordinator(null); setShowCoordinatorModal(true); }} onEdit={(coordinator) => { setEditingCoordinator(coordinator); setShowCoordinatorModal(true); }} onToggle={toggleCoordinator} />}
        {view === "settings" && accessMode === "admin" && <CatalogSummary careers={careers} periods={periods} staff={staff} />}
      </main>
      {showTeacherModal && selectedCoordinator && <TeacherModal careers={assignedCareers} periods={periods} coordinatorName={selectedCoordinator.full_name} onClose={() => setShowTeacherModal(false)} onSave={saveTeacher} />}
      {showCoordinatorModal && accessMode === "admin" && <CoordinatorModal coordinator={editingCoordinator} careers={careers} onClose={() => { setShowCoordinatorModal(false); setEditingCoordinator(null); }} onSave={saveCoordinator} />}
      {selectedTeacher && <ExpedientWorkspace teacher={selectedTeacher} accessMode={accessMode} coordinatorName={staff.find((item) => item.id === selectedTeacher.coordinatorId)?.full_name ?? selectedCoordinator?.full_name ?? "Coordinador"} onClose={() => setSelectedTeacher(null)} onChanged={async () => { await loadExpedients(accessMode === "coordinator" ? selectedCoordinatorId : undefined); }} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function InstitutionBrand({ compact = false }: { compact?: boolean }) {
  return <div className={`institution-brand ${compact ? "compact" : ""}`}><img src="/logo-itsqmet.png" alt="Instituto Tecnológico Superior Quito Metropolitano" /><span>SIACD · Acompañamiento Docente</span></div>;
}

function AccessLanding() {
  return <div className="login-page"><section className="login-art"><InstitutionBrand /><div><p className="eyebrow">ITSQMET · Sistema institucional</p><h1>Gestión del acompañamiento docente</h1><p>Una sola base institucional, con acceso separado para Coordinadores y Administrador.</p></div><p>Proceso CGC-PRO-121 · Uso institucional</p></section><section className="login-form-wrap"><div className="login-form"><h2>Seleccione su acceso</h2><p>Ingrese por el enlace correspondiente a su función.</p><a className="primary-button" href="./coordinador/" style={{ justifyContent:"center", textDecoration:"none" }}><Users size={15}/>Acceso Coordinadores</a><a className="secondary-button" href="./administrador/" style={{ justifyContent:"center", textDecoration:"none", width:"100%", marginTop:10 }}><ShieldCheck size={15}/>Acceso Administrador</a></div></section></div>;
}

function CoordinatorPicker({ coordinators, onChoose }: { coordinators: StaffMember[]; onChoose: (id: string) => void }) {
  const [value, setValue] = useState(coordinators[0]?.id ?? "");
  useEffect(() => { if (!value && coordinators[0]) setValue(coordinators[0].id); }, [coordinators, value]);
  return <div className="login-page"><section className="login-art"><InstitutionBrand /><div><p className="eyebrow">Acceso de coordinadores</p><h1>Seleccione su nombre</h1><p>La app mostrará únicamente las carreras y docentes asignados a ese coordinador.</p></div><p>Acceso directo · Sin login</p></section><section className="login-form-wrap"><div className="login-form"><h2>Coordinador de Carrera</h2>{coordinators.length ? <><div className="field"><label>Nombre</label><select value={value} onChange={(e)=>setValue(e.target.value)}>{coordinators.map((c)=><option key={c.id} value={c.id}>{c.full_name}</option>)}</select></div><button className="primary-button" style={{width:"100%",justifyContent:"center"}} onClick={()=>value&&onChoose(value)}>Ingresar <ArrowRight size={15}/></button></> : <div className="error-note">No existen coordinadores activos. Deben crearse desde Administrador.</div>}<a className="text-link" href="../" style={{display:"inline-block",marginTop:16}}>Volver al inicio</a></div></section></div>;
}

function ConfigurationRequired() { return <div className="login-page"><section className="login-art"><InstitutionBrand/><div><p className="eyebrow">ITSQMET</p><h1>Conexión requerida</h1><p>Configure las variables públicas de Supabase.</p></div></section><section className="login-form-wrap"><div className="login-form"><h2>Configuración pendiente</h2><div className="error-note">No se encontraron VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY.</div></div></section></div>; }
function MigrationRequired({ message }: { message: string }) { return <div className="login-page"><section className="login-art"><InstitutionBrand/><div><p className="eyebrow">Base de datos</p><h1>Actualización pendiente</h1><p>El código está listo, pero falta ejecutar la migración incluida en el repositorio.</p></div></section><section className="login-form-wrap"><div className="login-form"><h2>Migración requerida</h2><div className="error-note">{message}</div></div></section></div>; }
function LoadingScreen() { return <div className="login-form-wrap">Preparando SIACD…</div>; }

function Header({ accessMode, view, onNewTeacher, coordinatorName }: { accessMode: AccessMode; view: View; onNewTeacher:()=>void; coordinatorName?:string }) {
  const titles: Record<View,[string,string]> = {
    dashboard:["Panel de acompañamiento", accessMode==="admin"?"Vista institucional completa":`Gestión de ${coordinatorName ?? "coordinación"}`],
    teachers:["Docentes y expedientes","Abra un docente para trabajar su expediente completo"],
    schedule:["Cronograma institucional","Estado general de H1–H6 por docente"],
    reports:["Estadísticas y reportes","Indicadores de avance y brechas"],
    coordinators:["Coordinadores","Asignación de carreras y estado"],
    settings:["Catálogos","Resumen de carreras, períodos y personal"],
  };
  return <header className="topline"><div><div className="eyebrow">Sistema Integral de Acompañamiento</div><h1>{titles[view][0]}</h1><p className="subtitle">{titles[view][1]}</p></div><div className="top-actions">{accessMode==="coordinator"&&<button className="primary-button" onClick={onNewTeacher}><Plus size={15}/>Nuevo docente</button>}</div></header>;
}

function Dashboard({ teachers, accessMode, coordinatorCount, onViewTeachers, onOpenTeacher }: { teachers:Teacher[]; accessMode:AccessMode; coordinatorCount:number; onViewTeachers:()=>void; onOpenTeacher:(teacher:Teacher)=>void }) {
  const active=teachers.filter((t)=>t.status!=="Certificado").length;
  const certified=teachers.filter((t)=>t.status==="Certificado").length;
  const gaps=teachers.reduce((sum,t)=>sum+t.criticalGaps,0);
  const average=teachers.length?Math.round(teachers.reduce((sum,t)=>sum+t.progress,0)/teachers.length):0;
  return <><div className="hero-grid"><section className="hero-card"><div className="eyebrow">Información institucional</div><h2>{teachers.length?`${teachers.length} expediente${teachers.length===1?"":"s"} visible${teachers.length===1?"":"s"}`:"Listo para iniciar"}</h2><p>Abra un docente para trabajar ficha, cronograma, H1–H6, bitácora y plan de mejora.</p><div className="hero-progress"><div className="progress-track"><div className="progress-fill" style={{width:`${average}%`}}/></div><strong>{average}% de avance promedio</strong></div></section><aside className="approval-card"><div className="round-icon"><FolderOpen size={20}/></div><h3>Expediente completo</h3><p>El Bloque 2 concentra el trabajo operativo en un solo expediente por docente.</p>{teachers[0]&&<button className="secondary-button" onClick={()=>onOpenTeacher(teachers[0])}>Abrir reciente <ChevronRight size={14}/></button>}</aside></div><div className="metric-grid"><Metric icon={Users} label="Docentes activos" value={String(active)} note="Procesos en curso"/><Metric icon={Activity} label="Brechas críticas" value={String(gaps)} note="Puntajes críticos menores a 3" tone="red"/><Metric icon={Clock3} label="Avance promedio" value={`${average}%`} note="Hitos ejecutados" tone="gold"/><Metric icon={accessMode==="admin"?UserCog:ShieldCheck} label={accessMode==="admin"?"Coordinadores":"Certificados"} value={String(accessMode==="admin"?coordinatorCount:certified)} note={accessMode==="admin"?"Activos":"Procesos finalizados"} tone="blue"/></div><section className="panel"><div className="panel-head"><div><h3>Expedientes recientes</h3><p>Abra uno para continuar el acompañamiento</p></div><button className="text-link" onClick={onViewTeachers}>Ver todos</button></div><div className="teacher-list">{teachers.length?teachers.slice(0,5).map((t)=><TeacherRow key={t.id} teacher={t} onOpen={onOpenTeacher}/>):<div className="empty-state"><h3>Sin expedientes</h3><p>No existen docentes registrados para esta vista.</p></div>}</div></section></>;
}

function Metric({ icon:Icon,label,value,note,tone="" }:{icon:typeof Users;label:string;value:string;note:string;tone?:string}) { return <article className="metric-card"><div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon size={15}/></span></div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></article>; }
function TeacherRow({teacher,onOpen}:{teacher:Teacher;onOpen:(teacher:Teacher)=>void}) { return <div className="teacher-row"><div className="teacher"><div className="teacher-avatar">{initials(teacher.name)}</div><div><strong>{teacher.name}</strong><span>{teacher.career}</span></div></div><div className="row-meta"><span className={`badge ${statusClass(teacher.status)}`}>{teacher.status}</span><span>{teacher.currentHito}</span></div><div className="progress-cell"><span className="row-meta">{teacher.progress}% completado</span><div className="mini-progress"><span style={{width:`${teacher.progress}%`}}/></div></div><button className="row-action" aria-label={`Abrir ${teacher.name}`} onClick={()=>onOpen(teacher)}><ChevronRight size={15}/></button></div>; }

function TeachersPanel({teachers,careers,canCreate,onNew,onOpen}:{teachers:Teacher[];careers:CatalogOption[];canCreate:boolean;onNew:()=>void;onOpen:(teacher:Teacher)=>void}) {
  const [query,setQuery]=useState(""); const [career,setCareer]=useState(""); const [period,setPeriod]=useState(""); const periods=[...new Set(teachers.map((t)=>t.period))];
  const filtered=useMemo(()=>teachers.filter((t)=>{ const matches=`${t.name} ${t.career} ${t.subject}`.toLowerCase().includes(query.toLowerCase()); return matches && (!career||t.careerId===career) && (!period||t.period===period); }),[teachers,query,career,period]);
  return <section className="section-card"><div className="toolbar"><div className="search"><Search size={15}/><input placeholder="Buscar docente, carrera o asignatura" value={query} onChange={(e)=>setQuery(e.target.value)}/></div><div className="filters"><select className="select" value={career} onChange={(e)=>setCareer(e.target.value)}><option value="">Todas las carreras</option>{careers.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select><select className="select" value={period} onChange={(e)=>setPeriod(e.target.value)}><option value="">Todos los períodos</option>{periods.map((p)=><option key={p}>{p}</option>)}</select>{canCreate&&<button className="primary-button" onClick={onNew}><Plus size={14}/>Registrar docente</button>}</div></div>{filtered.length?<div className="table-scroll"><table className="data-table"><thead><tr><th>Docente</th><th>Carrera / asignatura</th><th>Período</th><th>Hito</th><th>Avance</th><th>Brechas</th><th></th></tr></thead><tbody>{filtered.map((t)=><tr key={t.id}><td><strong>{t.name}</strong><span className="row-meta">{t.email||"Sin correo"}</span></td><td>{t.career}<span className="row-meta">{t.subject}</span></td><td>{t.period}</td><td>{t.currentHito}</td><td>{t.progress}%</td><td><span className={`badge ${t.criticalGaps?"red":"green"}`}>{t.criticalGaps}</span></td><td><button className="secondary-button" onClick={()=>onOpen(t)}>Expediente <ChevronRight size={13}/></button></td></tr>)}</tbody></table></div>:<div className="empty-state"><h3>Sin resultados</h3><p>No hay docentes con esos filtros.</p></div>}</section>;
}

function ScheduleOverview({teachers,onOpen}:{teachers:Teacher[];onOpen:(teacher:Teacher)=>void}) { return <section className="section-card"><div className="panel-head"><div><h3>Avance de H1–H6</h3><p>La programación detallada se edita dentro de cada expediente.</p></div></div>{teachers.length?<div className="table-scroll"><table className="data-table"><thead><tr><th>Docente</th><th>Carrera</th><th>Hitos ejecutados</th><th>Hito actual</th><th>Avance</th><th></th></tr></thead><tbody>{teachers.map((t)=><tr key={t.id}><td><strong>{t.name}</strong></td><td>{t.career}</td><td>{t.hitosExecuted}/6</td><td>{t.currentHito}</td><td>{t.progress}%</td><td><button className="secondary-button" onClick={()=>onOpen(t)}>Programar</button></td></tr>)}</tbody></table></div>:<div className="empty-state"><p>No existen expedientes.</p></div>}</section>; }
function Reports({teachers}:{teachers:Teacher[]}) { const certified=teachers.filter((t)=>t.status==="Certificado").length; const gaps=teachers.reduce((sum,t)=>sum+t.criticalGaps,0); const average=teachers.length?Math.round(teachers.reduce((sum,t)=>sum+t.progress,0)/teachers.length):0; return <><div className="metric-grid"><Metric icon={Users} label="Docentes" value={String(teachers.length)} note="Expedientes visibles"/><Metric icon={Clock3} label="Avance" value={`${average}%`} note="Promedio de H1–H6" tone="gold"/><Metric icon={Activity} label="Brechas críticas" value={String(gaps)} note="Criterios evaluados < 3" tone="red"/><Metric icon={ShieldCheck} label="Certificados" value={String(certified)} note="Procesos finalizados" tone="blue"/></div><section className="section-card"><div className="panel-head"><div><h3>Avance por docente</h3><p>Información del expediente</p></div></div>{teachers.map((t)=><div className="teacher-row" key={t.id}><strong>{t.name}</strong><span className="row-meta">{t.currentHito}</span><div className="progress-cell"><div className="mini-progress"><span style={{width:`${t.progress}%`}}/></div></div><span className={`badge ${statusClass(t.status)}`}>{t.progress}%</span></div>)}</section></>; }

function CoordinatorsPanel({coordinators,careers,onNew,onEdit,onToggle}:{coordinators:StaffMember[];careers:CatalogOption[];onNew:()=>void;onEdit:(c:StaffMember)=>void;onToggle:(c:StaffMember)=>void}) { const careerNames=(ids:string[])=>ids.map((id)=>careers.find((c)=>c.id===id)?.name).filter(Boolean).join(", ")||"Sin carreras"; return <section className="section-card"><div className="toolbar"><div><h3>Coordinadores</h3><p className="subtitle">El administrador define sus carreras.</p></div><button className="primary-button" onClick={onNew}><Plus size={14}/>Nuevo coordinador</button></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Coordinador</th><th>Carreras</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{coordinators.map((c)=><tr key={c.id}><td><strong>{c.full_name}</strong></td><td>{careerNames(c.careerIds)}</td><td><span className={`badge ${c.active?"green":"gray"}`}>{c.active?"Activo":"Inactivo"}</span></td><td><div className="filters"><button className="secondary-button" onClick={()=>onEdit(c)}>Editar</button><button className="ghost-button" onClick={()=>onToggle(c)}>{c.active?"Desactivar":"Activar"}</button></div></td></tr>)}</tbody></table></div></section>; }
function CatalogSummary({careers,periods,staff}:{careers:CatalogOption[];periods:AcademicPeriod[];staff:StaffMember[]}) { return <div className="metric-grid"><Metric icon={Settings} label="Carreras activas" value={String(careers.length)} note="Catálogo institucional"/><Metric icon={CalendarDays} label="Períodos activos" value={String(periods.length)} note={periods[0]?.name??"Sin períodos"} tone="gold"/><Metric icon={UserCog} label="Coordinadores" value={String(staff.filter((s)=>s.role==="coordinator"&&s.active).length)} note="Activos" tone="blue"/><Metric icon={FolderOpen} label="Bloque 2" value="75" note="Criterios H1–H6" tone="red"/></div>; }

function TeacherModal({careers,periods,coordinatorName,onClose,onSave}:{careers:CatalogOption[];periods:AcademicPeriod[];coordinatorName:string;onClose:()=>void;onSave:(input:NewTeacherInput)=>Promise<void>}) {
  const [schedules,setSchedules]=useState<ScheduleRange[]>([{startTime:"",endTime:""}]);
  function submit(event:FormEvent<HTMLFormElement>) { event.preventDefault(); if (schedules.some((s)=>!s.startTime||!s.endTime||s.endTime<=s.startTime)) return window.alert("Revise las jornadas."); const f=new FormData(event.currentTarget); void onSave({ name:String(f.get("name")??""),careerId:String(f.get("careerId")??""),periodId:String(f.get("periodId")??""),subject:String(f.get("subject")??""),modality:String(f.get("modality")??""),entryDate:String(f.get("entryDate")??""),activitiesStartDate:String(f.get("activitiesStartDate")??""),plannedCloseDate:String(f.get("plannedCloseDate")??""),schedules,email:String(f.get("email")??""),teams:String(f.get("teams")??""),telegram:String(f.get("telegram")??"") }); }
  return <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true"><div className="modal-head"><div><h2>Registrar docente nuevo</h2><p className="subtitle">Coordinador: {coordinatorName}</p></div><button className="icon-button" onClick={onClose}><X size={17}/></button></div><form className="modal-body form-grid" onSubmit={submit}><div className="field full"><label>Nombres y apellidos</label><input name="name" required/></div><div className="field"><label>Carrera</label><select name="careerId" required>{careers.map((c)=><option key={c.id} value={c.id}>{c.name}{c.program?` — ${c.program}`:""}</option>)}</select></div><div className="field"><label>Asignatura(s)</label><input name="subject" required/></div><div className="field"><label>Modalidad</label><select name="modality"><option>Presencial</option><option>Híbrida</option><option>Online</option><option>Intensiva</option></select></div><div className="field"><label>Período académico</label><select name="periodId" required>{periods.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div><div className="field"><label>Fecha de ingreso</label><input type="date" name="entryDate" required/></div><div className="field"><label>Inicio de actividades</label><input type="date" name="activitiesStartDate" required/></div><div className="field full"><label>Fecha prevista de cierre</label><input type="date" name="plannedCloseDate"/></div><div className="field full"><label>Jornadas / horarios</label><div className="schedule-editor">{schedules.map((s,i)=><div className="schedule-range" key={i}><strong>Jornada {i+1}</strong><div className="field"><label>Desde</label><input type="time" required value={s.startTime} onChange={(e)=>setSchedules((curr)=>curr.map((r,n)=>n===i?{...r,startTime:e.target.value}:r))}/></div><div className="schedule-separator">a</div><div className="field"><label>Hasta</label><input type="time" required value={s.endTime} onChange={(e)=>setSchedules((curr)=>curr.map((r,n)=>n===i?{...r,endTime:e.target.value}:r))}/></div><button type="button" className="icon-button schedule-remove" disabled={schedules.length===1} onClick={()=>setSchedules((curr)=>curr.filter((_,n)=>n!==i))}><X size={15}/></button></div>)}<button type="button" className="secondary-button schedule-add" onClick={()=>setSchedules((curr)=>[...curr,{startTime:"",endTime:""}])}><Plus size={14}/>Agregar otra jornada</button></div></div><div className="field"><label>Correo institucional</label><input type="email" name="email"/></div><div className="field"><label>Código Teams</label><input name="teams"/></div><div className="field full"><label>Enlace Telegram</label><input type="url" name="telegram"/></div><div className="form-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit" disabled={!careers.length||!periods.length}><Plus size={14}/>Guardar</button></div></form></div></div>;
}

function CoordinatorModal({coordinator,careers,onClose,onSave}:{coordinator:StaffMember|null;careers:CatalogOption[];onClose:()=>void;onSave:(input:CoordinatorInput)=>Promise<void>}) {
  const [selected,setSelected]=useState<string[]>(coordinator?.careerIds??[]); const [active,setActive]=useState(coordinator?.active??true);
  function submit(event:FormEvent<HTMLFormElement>) { event.preventDefault(); const f=new FormData(event.currentTarget); void onSave({id:coordinator?.id,name:String(f.get("name")??""),active,careerIds:selected}); }
  return <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true"><div className="modal-head"><h2>{coordinator?"Editar coordinador":"Nuevo coordinador"}</h2><button className="icon-button" onClick={onClose}><X size={17}/></button></div><form className="modal-body form-grid" onSubmit={submit}><div className="field full"><label>Nombre completo</label><input name="name" required defaultValue={coordinator?.full_name??""}/></div><div className="field full"><label>Carreras asignadas</label><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:8}}>{careers.map((c)=><label key={c.id} style={{display:"flex",gap:8,alignItems:"flex-start",fontSize:11}}><input type="checkbox" checked={selected.includes(c.id)} onChange={(e)=>setSelected((curr)=>e.target.checked?[...curr,c.id]:curr.filter((id)=>id!==c.id))}/><span>{c.name}{c.program?` — ${c.program}`:""}</span></label>)}</div></div><div className="field full"><label style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" checked={active} onChange={(e)=>setActive(e.target.checked)}/>Coordinador activo</label></div><div className="form-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button">Guardar</button></div></form></div></div>;
}
