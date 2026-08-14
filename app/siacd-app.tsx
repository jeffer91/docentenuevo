"use client";
/* eslint-disable @next/next/no-img-element */

import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileText,
  FolderArchive,
  LayoutDashboard,
  Menu,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  UploadCloud,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "./lib/supabase";

type Role = "coordinator" | "approver" | "admin";
type View =
  | "dashboard"
  | "teachers"
  | "schedule"
  | "reviews"
  | "evidence"
  | "documents"
  | "reports"
  | "users"
  | "settings";

type Teacher = {
  id: string;
  name: string;
  career: string;
  subject: string;
  period: string;
  progress: number;
  status: "En acompañamiento" | "Con brechas" | "Pendiente de aprobación" | "Aprobado" | "Certificado";
  currentHito: string;
  criticalGaps: number;
};

type CatalogOption = { id: string; name: string };
type SystemProfile = { id: string; full_name: string; role: Role; active: boolean };
type NewTeacherInput = {
  name: string;
  careerId: string;
  periodId: string;
  subject: string;
  modality: string;
  startDate: string;
  schedule: string;
  email: string;
  teams: string;
  telegram: string;
};

const INSTITUTIONAL_USER_ID = "f29a868f-338d-4023-8e18-b744a9b95015";

const navByRole: Record<Role, { label: string; view: View; icon: typeof LayoutDashboard }[]> = {
  coordinator: [
    { label: "Panel general", view: "dashboard", icon: LayoutDashboard },
    { label: "Docentes", view: "teachers", icon: Users },
    { label: "Cronograma", view: "schedule", icon: CalendarDays },
    { label: "Evaluaciones", view: "reviews", icon: ClipboardCheck },
    { label: "Evidencias", view: "evidence", icon: UploadCloud },
    { label: "Documentos", view: "documents", icon: FileText },
    { label: "Reportes", view: "reports", icon: BarChart3 },
  ],
  approver: [
    { label: "Panel general", view: "dashboard", icon: LayoutDashboard },
    { label: "Por revisar", view: "reviews", icon: ClipboardCheck },
    { label: "Documentos", view: "documents", icon: FileText },
    { label: "Certificados", view: "evidence", icon: FileCheck2 },
    { label: "Reportes", view: "reports", icon: BarChart3 },
  ],
  admin: [
    { label: "Panel general", view: "dashboard", icon: LayoutDashboard },
    { label: "Usuarios", view: "users", icon: UserCog },
    { label: "Docentes", view: "teachers", icon: Users },
    { label: "Expedientes", view: "documents", icon: FolderArchive },
    { label: "Estadísticas", view: "reports", icon: BarChart3 },
    { label: "Configuración", view: "settings", icon: Settings },
  ],
};

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((part) => part[0]).join("");
}

function statusClass(status: Teacher["status"]) {
  if (status === "Certificado" || status === "Aprobado") return "green";
  if (status === "Con brechas") return "red";
  if (status === "Pendiente de aprobación") return "gold";
  return "blue";
}

function relationName(value: unknown) {
  const relation = Array.isArray(value) ? value[0] : value;
  return relation && typeof relation === "object" && "name" in relation ? String(relation.name) : "Sin asignar";
}

function relationFullName(value: unknown) {
  const relation = Array.isArray(value) ? value[0] : value;
  return relation && typeof relation === "object" && "full_name" in relation ? String(relation.full_name) : "Sin nombre";
}

function mapStatus(value: string): Teacher["status"] {
  if (value === "with_gaps") return "Con brechas";
  if (["ready_for_review", "pending_approval", "returned"].includes(value)) return "Pendiente de aprobación";
  if (value === "approved") return "Aprobado";
  if (["certified", "archived"].includes(value)) return "Certificado";
  return "En acompañamiento";
}

function mapExpedient(row: Record<string, unknown>): Teacher {
  const schedules = Array.isArray(row.hito_schedules) ? row.hito_schedules as Record<string, unknown>[] : [];
  const executed = schedules.filter((schedule) => Boolean(schedule.executed_on));
  const ordered = [...executed].sort((a, b) => String(a.hito_id).localeCompare(String(b.hito_id)));
  const last = ordered.at(-1);
  const status = mapStatus(String(row.status ?? "draft"));
  const progress = status === "Certificado" ? 100 : Math.min(100, Math.round((executed.length / 6) * 100));
  const currentHito = status === "Certificado"
    ? "Proceso finalizado"
    : last ? `${String(last.hito_id)} · completado` : "H1 · Inducción";

  return {
    id: String(row.id),
    name: relationFullName(row.teachers),
    career: relationName(row.careers),
    subject: String(row.subject_names ?? "Sin asignatura"),
    period: relationName(row.academic_periods),
    progress,
    status,
    currentHito,
    criticalGaps: Number(row.critical_gaps ?? 0),
  };
}

function downloadBlob(content: BlobPart, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function xmlText(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function downloadExcelBackup(teachers: Teacher[]) {
  const headings = ["Docente", "Carrera", "Asignatura", "Período", "Avance", "Estado", "Hito actual"];
  const rows = teachers.map((teacher) => [teacher.name, teacher.career, teacher.subject, teacher.period, `${teacher.progress}%`, teacher.status, teacher.currentHito]);
  const cells = (row: string[], header = false) => row.map((cell) => `<Cell${header ? ' ss:StyleID="Header"' : ""}><Data ss:Type="String">${xmlText(cell)}</Data></Cell>`).join("");
  const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#071C34" ss:Pattern="Solid"/></Style></Styles><Worksheet ss:Name="Expedientes"><Table><Row>${cells(headings, true)}</Row>${rows.map((row) => `<Row>${cells(row)}</Row>`).join("")}</Table></Worksheet></Workbook>`;
  downloadBlob(xml, "application/vnd.ms-excel;charset=utf-8", `respaldo-siacd-${new Date().toISOString().slice(0, 10)}.xls`);
}

async function downloadPdfDocument(title: string) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  pdf.setFillColor(7, 28, 52);
  pdf.rect(0, 0, 210, 32, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(18);
  pdf.text("SIACD", 18, 14);
  pdf.setFontSize(9);
  pdf.text("Sistema Integral de Acompañamiento Docente", 18, 22);
  pdf.setTextColor(28, 48, 44);
  pdf.setFontSize(17);
  pdf.text(title, 18, 50);
  pdf.setFontSize(10);
  pdf.text(["Documento generado automáticamente desde el expediente institucional.", `Fecha de emisión: ${new Intl.DateTimeFormat("es-EC", { dateStyle: "long" }).format(new Date())}`, "Estado: borrador verificable · pendiente de firmas cuando corresponda."], 18, 64);
  pdf.setDrawColor(210, 221, 217);
  pdf.line(18, 91, 192, 91);
  pdf.setFontSize(9);
  pdf.setTextColor(90, 108, 103);
  pdf.text("El contenido definitivo se completa con los datos, evaluaciones y evidencias del expediente seleccionado.", 18, 103, { maxWidth: 174 });
  pdf.save(`${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`);
}

export default function SiacdApp() {
  const configured = isSupabaseConfigured();
  const [role, setRole] = useState<Role>("admin");
  const [view, setView] = useState<View>("dashboard");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [careers, setCareers] = useState<CatalogOption[]>([]);
  const [periods, setPeriods] = useState<CatalogOption[]>([]);
  const [profiles, setProfiles] = useState<SystemProfile[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [toast, setToast] = useState("");
  const [sessionReady, setSessionReady] = useState(!configured);
  const [profileName, setProfileName] = useState("Usuario SIACD");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    async function applySession(userId?: string) {
      if (!userId || !supabase) return;
      setCurrentUserId(userId);
      const [{ data: profile }, { data: careerRows }, { data: periodRows }, { data: expedientRows }, { data: profileRows }] = await Promise.all([
        supabase.from("profiles").select("full_name, role").eq("id", userId).single(),
        supabase.from("careers").select("id, name").eq("active", true).order("name"),
        supabase.from("academic_periods").select("id, name").eq("active", true).order("starts_on", { ascending: false }),
        supabase.from("expedients").select("id, status, subject_names, critical_gaps, teachers(full_name), careers(name), academic_periods(name), hito_schedules(hito_id, executed_on)").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, full_name, role, active").order("full_name"),
      ]);
      if (!profile) {
        setLoginError("La cuenta existe, pero no tiene un perfil SIACD asignado. Solicite acceso al administrador.");
        await supabase.auth.signOut();
        return;
      }
      if (profile?.full_name) setProfileName(profile.full_name);
      if (profile?.role && ["coordinator", "approver", "admin"].includes(profile.role)) {
        setRole(profile.role as Role);
      }
      setCareers((careerRows ?? []) as CatalogOption[]);
      setPeriods((periodRows ?? []) as CatalogOption[]);
      setTeachers(((expedientRows ?? []) as Record<string, unknown>[]).map(mapExpedient));
      setProfiles((profileRows ?? []) as SystemProfile[]);
    }

    void applySession(INSTITUTIONAL_USER_ID).finally(() => setSessionReady(true));
  }, [configured]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function saveTeacher(input: NewTeacherInput) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !currentUserId) {
      setToast("No existe una sesión institucional activa");
      return;
    }
    const { data: teacher, error: teacherError } = await supabase
      .from("teachers")
      .insert({
        full_name: input.name,
        institutional_email: input.email || null,
        started_institution_on: input.startDate,
        created_by: currentUserId,
      })
      .select("id")
      .single();
    if (teacherError || !teacher) {
      setToast(`No se pudo registrar el docente: ${teacherError?.message ?? "error de base de datos"}`);
      return;
    }
    const { data: expedient, error: expedientError } = await supabase
      .from("expedients")
      .insert({
        teacher_id: teacher.id,
        career_id: input.careerId,
        period_id: input.periodId,
        coordinator_id: currentUserId,
        subject_names: input.subject,
        modality: input.modality,
        schedule_text: input.schedule || null,
        activities_start_on: input.startDate,
        teams_code: input.teams || null,
        telegram_url: input.telegram || null,
        status: "in_progress",
      })
      .select("id, status, subject_names, critical_gaps, teachers(full_name), careers(name), academic_periods(name), hito_schedules(hito_id, executed_on)")
      .single();
    if (expedientError || !expedient) {
      await supabase.from("teachers").delete().eq("id", teacher.id);
      setToast(`No se pudo crear el expediente: ${expedientError?.message ?? "error de base de datos"}`);
      return;
    }
    setTeachers((current) => [mapExpedient(expedient as Record<string, unknown>), ...current]);
    setShowTeacherModal(false);
    setToast("Docente y expediente guardados en Supabase");
  }

  if (!sessionReady) return <div className="login-form-wrap">Preparando SIACD…</div>;
  if (!configured) return <ConfigurationRequired />;

  return (
    <div className="siacd-shell">
      <div className="mobile-topbar">
        <strong>SIACD</strong>
        <button className="icon-button" aria-label="Abrir menú" onClick={() => setMobileOpen(true)}><Menu size={18} /></button>
      </div>
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <InstitutionBrand compact />
        <div className="nav-label">Gestión</div>
        <nav className="nav">
          {navByRole[role].map((item) => <button key={item.view} className={`nav-button ${view === item.view ? "active" : ""}`} onClick={() => { setView(item.view); setMobileOpen(false); }}><item.icon />{item.label}</button>)}
        </nav>
        <div className="sidebar-spacer" />
        <button className="nav-button" onClick={() => setToast("Acceso institucional directo activo")}><ShieldCheck />Acceso directo activo</button>
        <div className="user-card"><div className="avatar">{initials(profileName)}</div><div><strong>{profileName}</strong><span>{role === "coordinator" ? "Coordinador de Carrera" : role === "approver" ? "Autoridad aprobadora" : "Administrador general"}</span></div></div>
      </aside>
      {mobileOpen && <button aria-label="Cerrar menú" className="mobile-scrim" onClick={() => setMobileOpen(false)} />}
      <main className="main">
        <Header role={role} view={view} onNew={() => setShowTeacherModal(true)} />
        {view === "dashboard" && <Dashboard teachers={teachers} onViewTeachers={() => setView("teachers")} onAction={(msg) => setToast(msg)} />}
        {view === "teachers" && <Teachers teachers={teachers} onNew={() => setShowTeacherModal(true)} onAction={(msg) => setToast(msg)} />}
        {view === "schedule" && <Schedule />}
        {view === "reviews" && <Reviews role={role} teachers={teachers} onAction={(msg) => setToast(msg)} />}
        {view === "evidence" && <Evidence role={role} onAction={(msg) => setToast(msg)} />}
        {view === "documents" && <Documents role={role} teachers={teachers} onAction={(msg) => setToast(msg)} />}
        {view === "reports" && <Reports teachers={teachers} />}
        {view === "users" && <UsersPanel users={profiles} onAction={(msg) => setToast(msg)} />}
        {view === "settings" && <SettingsPanel periods={periods} onAction={(msg) => setToast(msg)} />}
      </main>
      {showTeacherModal && <TeacherModal careers={careers} periods={periods} onClose={() => setShowTeacherModal(false)} onSave={saveTeacher} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function InstitutionBrand({ compact = false }: { compact?: boolean }) {
  return <div className={`institution-brand ${compact ? "compact" : ""}`}><img src="/logo-itsqmet.png" alt="Instituto Tecnológico Superior Quito Metropolitano" /><span>SIACD · Acompañamiento Docente</span></div>;
}

function ConfigurationRequired() {
  return <div className="login-page"><section className="login-art"><InstitutionBrand /><div><p className="eyebrow">ITSQMET · Sistema institucional</p><h1>Conexión segura requerida</h1><p>El modo demostración está deshabilitado. El SIACD solo funciona conectado a la base institucional de Supabase.</p></div><p>Proceso CGC-PRO-121 · Uso institucional</p></section><section className="login-form-wrap"><div className="login-form"><div className="round-icon"><ShieldCheck /></div><h2>Configuración pendiente</h2><p>Configure las variables públicas de Supabase y vuelva a publicar la aplicación.</p><div className="error-note">No se encontraron VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY.</div></div></section></div>;
}

function Header({ role, view, onNew }: { role: Role; view: View; onNew: () => void }) {
  const titles: Record<View, [string, string]> = { dashboard:["Panel de acompañamiento","Seguimiento institucional de docentes nuevos"], teachers:["Docentes y expedientes","Gestione todos los procesos bajo su responsabilidad"], schedule:["Cronograma institucional","Fechas, hitos y alertas de cumplimiento"], reviews:["Evaluaciones y aprobación","Revise criterios, resultados y expedientes"], evidence:["Evidencias y certificación","Archivos, capturas, enlaces y certificados"], documents:["Documentos del expediente","Actas, informes, respaldos y archivo final"], reports:["Estadísticas y reportes","Indicadores para la toma de decisiones"], users:["Usuarios y permisos","Cuentas, roles y asignaciones"], settings:["Configuración del SIACD","Períodos, carreras, criterios y plantillas"] };
  return <header className="topline"><div><div className="eyebrow">Sistema Integral de Acompañamiento</div><h1>{titles[view][0]}</h1><p className="subtitle">{titles[view][1]}</p></div><div className="top-actions"><button className="icon-button" aria-label="Notificaciones"><Bell size={17} /></button>{role === "coordinator" && <button className="primary-button" onClick={onNew}><Plus size={15} />Nuevo docente</button>}</div></header>;
}

function Dashboard({ teachers, onViewTeachers, onAction }: { teachers: Teacher[]; onViewTeachers: () => void; onAction: (msg: string) => void }) {
  const active = teachers.filter((t) => t.status !== "Certificado").length;
  const pending = teachers.filter((t) => t.status === "Pendiente de aprobación");
  const certified = teachers.filter((t) => t.status === "Certificado").length;
  const gaps = teachers.reduce((total, teacher) => total + teacher.criticalGaps, 0);
  const average = teachers.length ? Math.round(teachers.reduce((total, teacher) => total + teacher.progress, 0) / teachers.length) : 0;
  const priority = pending[0] ?? teachers.find((teacher) => teacher.criticalGaps > 0);
  return <><div className="hero-grid"><section className="hero-card"><div className="eyebrow">Información institucional en tiempo real</div><h2>{teachers.length ? `${teachers.length} expediente${teachers.length === 1 ? "" : "s"} registrado${teachers.length === 1 ? "" : "s"}` : "El SIACD está listo para iniciar"}</h2><p>{teachers.length ? "Los indicadores se calculan únicamente con información guardada en Supabase." : "Registre el primer docente para iniciar su expediente de acompañamiento institucional."}</p><div className="hero-progress"><div className="progress-track"><div className="progress-fill" style={{ width:`${average}%` }} /></div><strong>{average}% de avance global</strong></div></section><aside className="approval-card"><div className="round-icon"><Clock3 size={20} /></div><h3>{priority ? "Atención prioritaria" : "Sin pendientes"}</h3><p>{priority ? `${priority.name} · ${priority.status} · ${priority.currentHito}` : "No existen expedientes pendientes de revisión o con brechas registradas."}</p>{priority && <button className="secondary-button" onClick={() => onAction(`Expediente de ${priority.name} abierto`)}>Abrir expediente <ChevronRight size={14} /></button>}</aside></div><div className="metric-grid"><Metric icon={Users} label="Docentes activos" value={String(active)} note="Registros visibles para su rol" /><Metric icon={ClipboardCheck} label="Por aprobar" value={String(pending.length)} note="Expedientes enviados" tone="gold" /><Metric icon={Activity} label="Brechas críticas" value={String(gaps)} note="Registradas en expedientes" tone="red" /><Metric icon={FileCheck2} label="Certificados" value={String(certified)} note="Procesos finalizados" tone="blue" /></div><div className="content-grid"><section className="panel"><div className="panel-head"><div><h3>Expedientes recientes</h3><p>Información recuperada desde Supabase</p></div><button className="text-link" onClick={onViewTeachers}>Ver todos</button></div><div className="teacher-list">{teachers.length ? teachers.slice(0,4).map((teacher) => <TeacherRow key={teacher.id} teacher={teacher} onAction={onAction} />) : <div className="empty-state"><h3>Sin expedientes</h3><p>Todavía no existen docentes registrados para este usuario.</p></div>}</div></section><section className="panel"><div className="panel-head"><div><h3>Estado de expedientes</h3><p>Últimos registros disponibles</p></div></div><div className="timeline">{teachers.length ? teachers.slice(0,4).map((teacher) => <Timeline key={teacher.id} icon={FolderArchive} title={teacher.status} text={`${teacher.name} · ${teacher.career}`} time={`${teacher.progress}% completado`} />) : <div className="empty-state"><p>La actividad aparecerá al registrar información.</p></div>}</div></section></div></>;
}

function Metric({ icon: Icon, label, value, note, tone="" }: { icon: typeof Users; label: string; value: string; note: string; tone?: string }) { return <article className="metric-card"><div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon size={15} /></span></div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></article>; }
function TeacherRow({ teacher, onAction }: { teacher: Teacher; onAction: (msg:string)=>void }) { return <div className="teacher-row"><div className="teacher"><div className="teacher-avatar">{initials(teacher.name)}</div><div><strong>{teacher.name}</strong><span>{teacher.career}</span></div></div><div className="row-meta"><span className={`badge ${statusClass(teacher.status)}`}>{teacher.status}</span><span>{teacher.currentHito}</span></div><div className="progress-cell"><span className="row-meta">{teacher.progress}% completado</span><div className="mini-progress"><span style={{width:`${teacher.progress}%`}} /></div></div><button className="row-action" aria-label={`Abrir expediente de ${teacher.name}`} onClick={()=>onAction(`Expediente de ${teacher.name} abierto`)}><ChevronRight size={15}/></button></div>; }
function Timeline({icon:Icon,title,text,time}:{icon:typeof UploadCloud;title:string;text:string;time:string}) { return <div className="timeline-item"><div className="timeline-icon"><Icon size={15}/></div><div><strong>{title}</strong><p>{text}</p><time>{time}</time></div></div>; }

function Teachers({ teachers, onNew, onAction }: { teachers: Teacher[]; onNew:()=>void; onAction:(msg:string)=>void }) {
  const [query,setQuery]=useState("");
  const [period,setPeriod]=useState("");
  const [status,setStatus]=useState("");
  const periodNames = useMemo(() => [...new Set(teachers.map((teacher) => teacher.period))], [teachers]);
  const filtered=useMemo(()=>teachers.filter(t=>`${t.name} ${t.career} ${t.subject}`.toLowerCase().includes(query.toLowerCase()) && (!period || t.period === period) && (!status || t.status === status)),[teachers,query,period,status]);
  return <section className="section-card"><div className="toolbar"><div className="search"><Search size={15}/><input aria-label="Buscar docentes" placeholder="Buscar por docente, carrera o asignatura" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="filters"><select className="select" aria-label="Filtrar período" value={period} onChange={(event)=>setPeriod(event.target.value)}><option value="">Todos los períodos</option>{periodNames.map((name)=><option key={name}>{name}</option>)}</select><select className="select" aria-label="Filtrar estado" value={status} onChange={(event)=>setStatus(event.target.value)}><option value="">Todos los estados</option>{[...new Set(teachers.map((teacher)=>teacher.status))].map((name)=><option key={name}>{name}</option>)}</select><button className="primary-button" onClick={onNew}><Plus size={14}/>Registrar docente</button></div></div>{filtered.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Docente</th><th>Carrera / asignatura</th><th>Período</th><th>Hito actual</th><th>Avance</th><th>Estado</th><th></th></tr></thead><tbody>{filtered.map(t=><tr key={t.id}><td><div className="teacher"><div className="teacher-avatar">{initials(t.name)}</div><strong>{t.name}</strong></div></td><td>{t.career}<span className="row-meta">{t.subject}</span></td><td>{t.period}</td><td>{t.currentHito}</td><td>{t.progress}%</td><td><span className={`badge ${statusClass(t.status)}`}>{t.status}</span></td><td><button className="row-action" onClick={()=>onAction(`Expediente de ${t.name} abierto`)} aria-label="Abrir"><ChevronRight size={14}/></button></td></tr>)}</tbody></table></div> : <div className="empty-state"><h3>Sin docentes registrados</h3><p>Registre el primer docente para crear su expediente institucional.</p><button className="primary-button" onClick={onNew}><Plus size={14}/>Registrar docente</button></div>}</section>;
}

function Schedule() { const hitos=[['H1 · Inducción','Ingreso / Semana 0','Conocimientos institucionales y accesos'],['H2 · Preparación','Una semana antes','SISACAD, EVA, Teams y Telegram'],['H3 · Inicio docencia','Semana 1–2','Implementación inicial y acompañamiento'],['H4 · Seguimiento 1','Primer tercio','Evaluación, grabaciones y tutorías'],['H5 · Seguimiento 2','Segundo tercio','Autonomía y corrección de brechas'],['H6 · Cierre','Una semana después','Cierre documental y certificación']]; return <section className="section-card"><div className="panel-head"><div><h3>Ruta de acompañamiento</h3><p>Los hitos mantienen la secuencia del proceso CGC-PRO-121</p></div><button className="secondary-button"><CalendarDays size={14}/>Programar fechas</button></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Hito</th><th>Momento</th><th>Propósito</th><th>Fecha programada</th><th>Estado</th></tr></thead><tbody>{hitos.map((h)=><tr key={h[0]}><td><strong>{h[0]}</strong></td><td>{h[1]}</td><td>{h[2]}</td><td>Por programar</td><td><span className="badge gray">Pendiente</span></td></tr>)}</tbody></table></div></section>; }

function Reviews({role,teachers,onAction}:{role:Role;teachers:Teacher[];onAction:(msg:string)=>void}) { const rows=role==='approver'?teachers.filter((teacher)=>teacher.status==='Pendiente de aprobación'):teachers; return <section className="section-card"><div className="panel-head"><div><h3>{role==='approver'?'Bandeja de aprobación':'Evaluación integral'}</h3><p>{role==='approver'?'Expedientes enviados por los coordinadores':'Expedientes disponibles para evaluación'}</p></div></div>{rows.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Docente</th><th>Carrera</th><th>Avance</th><th>Brechas críticas</th><th>Estado</th><th></th></tr></thead><tbody>{rows.map((teacher)=><tr key={teacher.id}><td><strong>{teacher.name}</strong></td><td>{teacher.career}</td><td>{teacher.progress}%</td><td><span className={`badge ${teacher.criticalGaps ? 'red':'green'}`}>{teacher.criticalGaps}</span></td><td>{teacher.status}</td><td><button className="secondary-button" onClick={()=>onAction(`Expediente de ${teacher.name} abierto`)}>{role==='approver'?'Revisar':'Evaluar'} <ChevronRight size={13}/></button></td></tr>)}</tbody></table></div> : <div className="empty-state"><div className="round-icon"><ClipboardCheck/></div><h3>Sin expedientes pendientes</h3><p>No existen registros disponibles para esta bandeja.</p></div>}</section>; }

function Evidence({role,onAction}:{role:Role;onAction:(msg:string)=>void}) { return <section className="section-card"><div className="panel-head"><div><h3>{role==='approver'?'Certificados habilitados':'Evidencias del expediente'}</h3><p>{role==='approver'?'Solo aparecen después de la aprobación institucional':'Archivos, fotografías, capturas y enlaces verificables'}</p></div></div><div className="empty-state"><div className="round-icon">{role==='approver'?<ShieldCheck/>:<UploadCloud/>}</div><h3>{role==='approver'?'Certificación protegida':'Seleccione un expediente'}</h3><p>{role==='approver'?'El sistema solo habilitará certificados que cumplan todas las reglas institucionales.':'Abra un expediente de docente para consultar o cargar evidencias reales en Supabase Storage.'}</p><button className="secondary-button" onClick={()=>onAction('Seleccione un expediente desde Docentes')}>Ir a expedientes</button></div></section>; }

function Documents({role,teachers,onAction}:{role:Role;teachers:Teacher[];onAction:(msg:string)=>void}) { const docs=['Acta oficial de inducción','Registro de acompañamiento 1','Informe de observación de clase','Registro de acompañamiento 2','Informe consolidado de cierre','Certificado de cumplimiento','Expediente completo','Respaldo en Excel']; async function generate(doc:string,index:number){if(index===5&&role!=='approver'){onAction('El certificado requiere aprobación institucional');return;}if(index===7){downloadExcelBackup(teachers);}else{await downloadPdfDocument(doc);}onAction(`${doc}: descarga generada`);} return <section className="section-card"><div className="panel-head"><div><h3>Generación documental</h3><p>Plantillas institucionales alimentadas con la información del expediente</p></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Documento</th><th>Responsable</th><th>Formato</th><th>Estado</th><th></th></tr></thead><tbody>{docs.map((doc,i)=><tr key={doc}><td><strong>{doc}</strong></td><td>{i===5?'Coordinación General':'Coordinador de Carrera'}</td><td>{i===7?'Excel':'PDF'}</td><td><span className={`badge ${i<3?'green':i===5&&role!=='approver'?'gold':'gray'}`}>{i<3?'Disponible':i===5&&role!=='approver'?'Requiere aprobación':'Generable'}</span></td><td><button className="ghost-button" onClick={()=>void generate(doc,i)}><FileText size={13}/>Generar</button></td></tr>)}</tbody></table></div></section>; }

function Reports({teachers}:{teachers:Teacher[]}) { const certified=teachers.filter((teacher)=>teacher.status==='Certificado').length; const average=teachers.length?Math.round(teachers.reduce((total,teacher)=>total+teacher.progress,0)/teachers.length):0; const gaps=teachers.reduce((total,teacher)=>total+teacher.criticalGaps,0); const rate=teachers.length?Math.round((certified/teachers.length)*100):0; return <><div className="metric-grid"><Metric icon={Users} label="Docentes acompañados" value={String(teachers.length)} note="Registros visibles"/><Metric icon={FileCheck2} label="Tasa de certificación" value={`${rate}%`} note={`${certified} certificados`} tone="gold"/><Metric icon={Clock3} label="Avance promedio" value={`${average}%`} note="Todos los expedientes" tone="blue"/><Metric icon={Activity} label="Brechas críticas" value={String(gaps)} note="Total registrado" tone="red"/></div><section className="section-card"><div className="panel-head"><div><h3>Avance por expediente</h3><p>Datos calculados desde Supabase</p></div></div>{teachers.length?teachers.map((teacher)=><div className="teacher-row" key={teacher.id}><strong>{teacher.name}</strong><span className="row-meta">{teacher.currentHito}</span><div className="progress-cell"><div className="mini-progress"><span style={{width:`${teacher.progress}%`}}/></div></div><span className={`badge ${statusClass(teacher.status)}`}>{teacher.progress}%</span></div>):<div className="empty-state"><p>No existen datos para generar indicadores.</p></div>}</section></>; }

function UsersPanel({users,onAction}:{users:SystemProfile[];onAction:(msg:string)=>void}) { const roleLabel:Record<Role,string>={coordinator:'Coordinador',approver:'Aprobador',admin:'Administrador'}; return <section className="section-card"><div className="toolbar"><div><h3>Usuarios del sistema</h3><p className="subtitle">Perfiles recuperados desde Supabase</p></div><button className="primary-button" onClick={()=>onAction('Cree la cuenta desde Supabase Auth y asigne su perfil institucional')}><Plus size={14}/>Crear usuario</button></div>{users.length?<div className="table-scroll"><table className="data-table"><thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th></tr></thead><tbody>{users.map((user)=><tr key={user.id}><td><strong>{user.full_name}</strong></td><td>{roleLabel[user.role]}</td><td><span className={`badge ${user.active?'green':'gray'}`}>{user.active?'Activo':'Inactivo'}</span></td></tr>)}</tbody></table></div>:<div className="empty-state"><p>No existen perfiles visibles para esta cuenta.</p></div>}</section>; }

function SettingsPanel({periods,onAction}:{periods:CatalogOption[];onAction:(msg:string)=>void}) { return <section className="section-card"><div className="form-grid"><div className="field"><label>Período académico activo</label><select>{periods.length?periods.map((period)=><option key={period.id} value={period.id}>{period.name}</option>):<option>Sin períodos configurados</option>}</select></div><div className="field"><label>Resultado mínimo de certificación</label><input value="75%" readOnly/></div><div className="field"><label>Peso operativo SIACD</label><input value="60%" readOnly/></div><div className="field"><label>Peso Observación de Calidad</label><input value="25%" readOnly/></div><div className="field"><label>Peso Matriz complementaria</label><input value="15%" readOnly/></div><div className="field"><label>Seguimientos mínimos</label><input value="4" readOnly/></div><div className="field full"><label>Regla de seguridad</label><textarea value="Ningún expediente puede certificarse con competencias críticas por debajo de 3, información incompleta o sin aprobación de Coordinación General." readOnly/></div><div className="form-actions"><button className="primary-button" onClick={()=>onAction('Configuración guardada')}>Guardar configuración</button></div></div></section>; }

function TeacherModal({careers,periods,onClose,onSave}:{careers:CatalogOption[];periods:CatalogOption[];onClose:()=>void;onSave:(teacher:NewTeacherInput)=>void}) { function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);void onSave({name:String(f.get('name')),careerId:String(f.get('careerId')),periodId:String(f.get('periodId')),subject:String(f.get('subject')),modality:String(f.get('modality')),startDate:String(f.get('startDate')),schedule:String(f.get('schedule')??''),email:String(f.get('email')??''),teams:String(f.get('teams')??''),telegram:String(f.get('telegram')??'')});} const ready=careers.length>0&&periods.length>0; return <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="teacher-title"><div className="modal-head"><h2 id="teacher-title">Registrar docente nuevo</h2><button className="icon-button" aria-label="Cerrar" onClick={onClose}><X size={17}/></button></div><form className="modal-body form-grid" onSubmit={submit}>{!ready&&<div className="error-note field full">El administrador debe configurar al menos una carrera y un período académico en Supabase.</div>}<div className="field full"><label>Nombres y apellidos</label><input name="name" required placeholder="Nombre completo del docente"/></div><div className="field"><label>Carrera</label><select name="careerId" required>{careers.map((career)=><option key={career.id} value={career.id}>{career.name}</option>)}</select></div><div className="field"><label>Asignatura(s)</label><input name="subject" required placeholder="Ej. Fundamentos de Enfermería"/></div><div className="field"><label>Modalidad</label><select name="modality"><option>Presencial</option><option>Híbrida</option><option>Online</option></select></div><div className="field"><label>Período académico</label><select name="periodId" required>{periods.map((period)=><option key={period.id} value={period.id}>{period.name}</option>)}</select></div><div className="field"><label>Fecha de ingreso</label><input type="date" name="startDate" required/></div><div className="field"><label>Jornada / horario</label><input name="schedule" placeholder="Ej. Nocturna · 19:00 a 22:00"/></div><div className="field"><label>Correo institucional</label><input name="email" type="email" placeholder="docente@institucion.edu.ec"/></div><div className="field"><label>Código Teams</label><input name="teams" placeholder="Código del equipo"/></div><div className="field full"><label>Enlace de Telegram</label><input name="telegram" type="url" placeholder="https://t.me/..."/></div><div className="form-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button" disabled={!ready}><Plus size={14}/>Guardar en Supabase</button></div></form></div></div>; }
