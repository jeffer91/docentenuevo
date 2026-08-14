"use client";

import {
  Activity,
  Archive,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileText,
  FolderArchive,
  GraduationCap,
  LayoutDashboard,
  LogOut,
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
  status: "En acompañamiento" | "Con brechas" | "Pendiente de aprobación" | "Certificado";
  currentHito: string;
};

const sampleTeachers: Teacher[] = [
  { id: "doc-001", name: "Carolina Andrade Mena", career: "Enfermería", subject: "Fundamentos de Enfermería", period: "Mayo – Noviembre 2026", progress: 72, status: "En acompañamiento", currentHito: "H4 · Seguimiento 1" },
  { id: "doc-002", name: "Mateo Cevallos Ruiz", career: "Desarrollo de Software", subject: "Programación Web", period: "Mayo – Noviembre 2026", progress: 48, status: "Con brechas", currentHito: "H3 · Inicio docencia" },
  { id: "doc-003", name: "Daniela Jácome Silva", career: "Marketing Digital", subject: "Analítica Digital", period: "Mayo – Noviembre 2026", progress: 86, status: "Pendiente de aprobación", currentHito: "H6 · Cierre" },
  { id: "doc-004", name: "José Morales Ortiz", career: "Mecánica Automotriz", subject: "Electricidad Automotriz", period: "Febrero – Agosto 2026", progress: 100, status: "Certificado", currentHito: "Proceso finalizado" },
];

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
  if (status === "Certificado") return "green";
  if (status === "Con brechas") return "red";
  if (status === "Pendiente de aprobación") return "gold";
  return "blue";
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
  const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0D6759" ss:Pattern="Solid"/></Style></Styles><Worksheet ss:Name="Expedientes"><Table><Row>${cells(headings, true)}</Row>${rows.map((row) => `<Row>${cells(row)}</Row>`).join("")}</Table></Worksheet></Workbook>`;
  downloadBlob(xml, "application/vnd.ms-excel;charset=utf-8", `respaldo-siacd-${new Date().toISOString().slice(0, 10)}.xls`);
}

async function downloadPdfDocument(title: string) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  pdf.setFillColor(13, 103, 89);
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
  const demoMode = !isSupabaseConfigured();
  const [role, setRole] = useState<Role>("coordinator");
  const [view, setView] = useState<View>("dashboard");
  const [teachers, setTeachers] = useState<Teacher[]>(sampleTeachers);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [toast, setToast] = useState("");
  const [sessionReady, setSessionReady] = useState(demoMode);
  const [signedIn, setSignedIn] = useState(demoMode);
  const [profileName, setProfileName] = useState("Usuario SIACD");
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    async function applySession(userId?: string) {
      if (!userId || !supabase) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, role")
        .eq("id", userId)
        .single();
      if (profile?.full_name) setProfileName(profile.full_name);
      if (profile?.role && ["coordinator", "approver", "admin"].includes(profile.role)) {
        setRole(profile.role as Role);
      }
    }

    supabase.auth.getSession().then(async ({ data }) => {
      setSignedIn(Boolean(data.session));
      await applySession(data.session?.user.id);
      setSessionReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
      void applySession(session?.user.id);
    });
    return () => data.subscription.unsubscribe();
  }, [demoMode]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setSignedIn(true);
      return;
    }
    setLoginError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setLoginError("No se pudo iniciar sesión. Verifique sus credenciales.");
  }

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    else setSignedIn(false);
  }

  if (!sessionReady) return <div className="login-form-wrap">Preparando SIACD…</div>;
  if (!signedIn) return <Login onSubmit={signIn} error={loginError} />;

  const changeRole = (next: Role) => {
    setRole(next);
    setView("dashboard");
  };

  return (
    <div className="siacd-shell">
      <div className="mobile-topbar">
        <strong>SIACD</strong>
        <button className="icon-button" aria-label="Abrir menú" onClick={() => setMobileOpen(true)}><Menu size={18} /></button>
      </div>
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="brand"><div className="brand-mark"><GraduationCap size={24} /></div><div><strong>SIACD</strong><span>Acompañamiento<br />Docente</span></div></div>
        <div className="nav-label">Gestión</div>
        <nav className="nav">
          {navByRole[role].map((item) => <button key={item.view} className={`nav-button ${view === item.view ? "active" : ""}`} onClick={() => { setView(item.view); setMobileOpen(false); }}><item.icon />{item.label}</button>)}
        </nav>
        <div className="sidebar-spacer" />
        <button className="nav-button" onClick={signOut}><LogOut />Cerrar sesión</button>
        <div className="user-card"><div className="avatar">{initials(profileName)}</div><div><strong>{profileName}</strong><span>{role === "coordinator" ? "Coordinador de Carrera" : role === "approver" ? "Autoridad aprobadora" : "Administrador general"}</span></div></div>
      </aside>
      {mobileOpen && <button aria-label="Cerrar menú" className="mobile-scrim" onClick={() => setMobileOpen(false)} />}
      <main className="main">
        <Header role={role} view={view} onRole={changeRole} onNew={() => setShowTeacherModal(true)} allowRoleSwitch={demoMode} />
        {view === "dashboard" && <Dashboard role={role} teachers={teachers} onViewTeachers={() => setView("teachers")} onAction={(msg) => setToast(msg)} />}
        {view === "teachers" && <Teachers teachers={teachers} onNew={() => setShowTeacherModal(true)} onAction={(msg) => setToast(msg)} />}
        {view === "schedule" && <Schedule />}
        {view === "reviews" && <Reviews role={role} onAction={(msg) => setToast(msg)} />}
        {view === "evidence" && <Evidence role={role} onAction={(msg) => setToast(msg)} />}
        {view === "documents" && <Documents role={role} teachers={teachers} onAction={(msg) => setToast(msg)} />}
        {view === "reports" && <Reports />}
        {view === "users" && <UsersPanel onAction={(msg) => setToast(msg)} />}
        {view === "settings" && <SettingsPanel onAction={(msg) => setToast(msg)} />}
      </main>
      {showTeacherModal && <TeacherModal onClose={() => setShowTeacherModal(false)} onSave={(teacher) => { setTeachers((current) => [teacher, ...current]); setShowTeacherModal(false); setToast("Docente registrado correctamente"); }} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Login({ onSubmit, error }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void; error: string }) {
  return <div className="login-page"><section className="login-art"><div className="brand"><div className="brand-mark"><GraduationCap size={25} /></div><div><strong>SIACD</strong><span>Sistema institucional</span></div></div><div><p className="eyebrow">ITSQMET · Gestión académica</p><h1>Acompañar bien también es enseñar.</h1><p>Un solo lugar para orientar, evaluar y certificar el proceso de incorporación de cada docente nuevo, con trazabilidad y evidencia institucional.</p></div><p>Proceso CGC-PRO-121 · Uso institucional</p></section><section className="login-form-wrap"><form className="login-form" onSubmit={onSubmit}><div className="round-icon"><ShieldCheck /></div><h2>Bienvenido al SIACD</h2><p>Ingrese con la cuenta asignada por el administrador institucional.</p>{error && <div className="error-note">{error}</div>}<div className="field"><label>Correo institucional</label><input name="email" type="email" required placeholder="nombre@institucion.edu.ec" /></div><div className="field"><label>Contraseña</label><input name="password" type="password" required placeholder="••••••••" /></div><button className="primary-button" type="submit">Ingresar al sistema <ArrowRight size={15} /></button><div className="login-note">Las funciones y la información visible dependen del rol asignado: coordinador, autoridad aprobadora o administrador.</div></form></section></div>;
}

function Header({ role, view, onRole, onNew, allowRoleSwitch }: { role: Role; view: View; onRole: (role: Role) => void; onNew: () => void; allowRoleSwitch: boolean }) {
  const titles: Record<View, [string, string]> = { dashboard:["Panel de acompañamiento","Seguimiento institucional de docentes nuevos"], teachers:["Docentes y expedientes","Gestione todos los procesos bajo su responsabilidad"], schedule:["Cronograma institucional","Fechas, hitos y alertas de cumplimiento"], reviews:["Evaluaciones y aprobación","Revise criterios, resultados y expedientes"], evidence:["Evidencias y certificación","Archivos, capturas, enlaces y certificados"], documents:["Documentos del expediente","Actas, informes, respaldos y archivo final"], reports:["Estadísticas y reportes","Indicadores para la toma de decisiones"], users:["Usuarios y permisos","Cuentas, roles y asignaciones"], settings:["Configuración del SIACD","Períodos, carreras, criterios y plantillas"] };
  return <header className="topline"><div><div className="eyebrow">Sistema Integral de Acompañamiento</div><h1>{titles[view][0]}</h1><p className="subtitle">{titles[view][1]}</p></div><div className="top-actions">{allowRoleSwitch && <div className="role-switch" aria-label="Vista de demostración por rol"><button className={role === "coordinator" ? "active" : ""} onClick={() => onRole("coordinator")}>Coordinador</button><button className={role === "approver" ? "active" : ""} onClick={() => onRole("approver")}>Aprobación</button><button className={role === "admin" ? "active" : ""} onClick={() => onRole("admin")}>Administrador</button></div>}<button className="icon-button" aria-label="Notificaciones"><Bell size={17} /></button>{role === "coordinator" && <button className="primary-button" onClick={onNew}><Plus size={15} />Nuevo docente</button>}</div></header>;
}

function Dashboard({ role, teachers, onViewTeachers, onAction }: { role: Role; teachers: Teacher[]; onViewTeachers: () => void; onAction: (msg: string) => void }) {
  const active = teachers.filter((t) => t.status !== "Certificado").length;
  return <><div className="hero-grid"><section className="hero-card"><div className="eyebrow">Período Mayo – Noviembre 2026</div><h2>{role === "coordinator" ? "Su acompañamiento docente está al día" : role === "approver" ? "Tres expedientes esperan su validación" : "El sistema institucional funciona con normalidad"}</h2><p>{role === "coordinator" ? "Continúe documentando cada intervención. El próximo hito con vencimiento corresponde al seguimiento del primer tercio." : role === "approver" ? "Revise las evidencias, observaciones y resultados antes de habilitar la certificación." : "Supervise coordinadores, períodos, expedientes y el uso del almacenamiento desde un solo panel."}</p><div className="hero-progress"><div className="progress-track"><div className="progress-fill" style={{ width:"68%" }} /></div><strong>68% de avance global</strong></div></section><aside className="approval-card"><div className="round-icon"><Clock3 size={20} /></div><h3>{role === "approver" ? "Revisión prioritaria" : "Próximo vencimiento"}</h3><p>{role === "approver" ? "El expediente de Daniela Jácome cumple los criterios automáticos y está listo para revisión documental." : "Seguimiento 1 de Mateo Cevallos vence el 18 de agosto. Mantiene dos competencias críticas con brecha."}</p><button className="secondary-button" onClick={() => onAction("Expediente abierto para revisión")}>Abrir expediente <ChevronRight size={14} /></button></aside></div><div className="metric-grid"><Metric icon={Users} label="Docentes activos" value={String(active)} note="En el período actual" /><Metric icon={ClipboardCheck} label="Hitos por completar" value="11" note="3 vencen esta semana" tone="gold" /><Metric icon={Activity} label="Brechas críticas" value="4" note="Requieren plan de mejora" tone="red" /><Metric icon={FileCheck2} label="Certificados" value="12" note="Emitidos en 2026" tone="blue" /></div><div className="content-grid"><section className="panel"><div className="panel-head"><div><h3>Expedientes recientes</h3><p>Avance y estado de los docentes asignados</p></div><button className="text-link" onClick={onViewTeachers}>Ver todos</button></div><div className="teacher-list">{teachers.slice(0,4).map((teacher) => <TeacherRow key={teacher.id} teacher={teacher} onAction={onAction} />)}</div></section><section className="panel"><div className="panel-head"><div><h3>Actividad reciente</h3><p>Trazabilidad del proceso</p></div></div><div className="timeline"><Timeline icon={UploadCloud} title="Evidencia cargada" text="Captura de configuración EVA · Carolina Andrade" time="Hace 38 minutos" /><Timeline icon={ClipboardCheck} title="Hito evaluado" text="H3 · Inicio docencia · Mateo Cevallos" time="Ayer, 16:42" /><Timeline icon={FileCheck2} title="Expediente enviado" text="Daniela Jácome · pendiente de aprobación" time="12 de agosto" /><Timeline icon={CheckCircle2} title="Certificado emitido" text="José Morales · Mecánica Automotriz" time="9 de agosto" /></div></section></div></>;
}

function Metric({ icon: Icon, label, value, note, tone="" }: { icon: typeof Users; label: string; value: string; note: string; tone?: string }) { return <article className="metric-card"><div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon size={15} /></span></div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></article>; }
function TeacherRow({ teacher, onAction }: { teacher: Teacher; onAction: (msg:string)=>void }) { return <div className="teacher-row"><div className="teacher"><div className="teacher-avatar">{initials(teacher.name)}</div><div><strong>{teacher.name}</strong><span>{teacher.career}</span></div></div><div className="row-meta"><span className={`badge ${statusClass(teacher.status)}`}>{teacher.status}</span><span>{teacher.currentHito}</span></div><div className="progress-cell"><span className="row-meta">{teacher.progress}% completado</span><div className="mini-progress"><span style={{width:`${teacher.progress}%`}} /></div></div><button className="row-action" aria-label={`Abrir expediente de ${teacher.name}`} onClick={()=>onAction(`Expediente de ${teacher.name} abierto`)}><ChevronRight size={15}/></button></div>; }
function Timeline({icon:Icon,title,text,time}:{icon:typeof UploadCloud;title:string;text:string;time:string}) { return <div className="timeline-item"><div className="timeline-icon"><Icon size={15}/></div><div><strong>{title}</strong><p>{text}</p><time>{time}</time></div></div>; }

function Teachers({ teachers, onNew, onAction }: { teachers: Teacher[]; onNew:()=>void; onAction:(msg:string)=>void }) {
  const [query,setQuery]=useState(""); const filtered=useMemo(()=>teachers.filter(t=>`${t.name} ${t.career} ${t.subject}`.toLowerCase().includes(query.toLowerCase())),[teachers,query]);
  return <section className="section-card"><div className="toolbar"><div className="search"><Search size={15}/><input aria-label="Buscar docentes" placeholder="Buscar por docente, carrera o asignatura" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="filters"><select className="select" aria-label="Filtrar período"><option>Todos los períodos</option><option>Mayo – Noviembre 2026</option><option>Febrero – Agosto 2026</option></select><select className="select" aria-label="Filtrar estado"><option>Todos los estados</option><option>En acompañamiento</option><option>Con brechas</option><option>Certificado</option></select><button className="primary-button" onClick={onNew}><Plus size={14}/>Registrar docente</button></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Docente</th><th>Carrera / asignatura</th><th>Período</th><th>Hito actual</th><th>Avance</th><th>Estado</th><th></th></tr></thead><tbody>{filtered.map(t=><tr key={t.id}><td><div className="teacher"><div className="teacher-avatar">{initials(t.name)}</div><strong>{t.name}</strong></div></td><td>{t.career}<span className="row-meta">{t.subject}</span></td><td>{t.period}</td><td>{t.currentHito}</td><td>{t.progress}%</td><td><span className={`badge ${statusClass(t.status)}`}>{t.status}</span></td><td><button className="row-action" onClick={()=>onAction(`Expediente de ${t.name} abierto`)} aria-label="Abrir"><ChevronRight size={14}/></button></td></tr>)}</tbody></table></div></section>;
}

function Schedule() { const hitos=[['H1 · Inducción','Ingreso / Semana 0','Conocimientos institucionales y accesos','Completado'],['H2 · Preparación','Una semana antes','SISACAD, EVA, Teams y Telegram','Completado'],['H3 · Inicio docencia','Semana 1–2','Implementación inicial y acompañamiento','En curso'],['H4 · Seguimiento 1','Primer tercio','Evaluación, grabaciones y tutorías','Próximo'],['H5 · Seguimiento 2','Segundo tercio','Autonomía y corrección de brechas','Pendiente'],['H6 · Cierre','Una semana después','Cierre documental y certificación','Pendiente']]; return <section className="section-card"><div className="panel-head"><div><h3>Ruta de acompañamiento</h3><p>Los hitos mantienen la secuencia del proceso CGC-PRO-121</p></div><button className="secondary-button"><CalendarDays size={14}/>Programar fechas</button></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Hito</th><th>Momento</th><th>Propósito</th><th>Fecha programada</th><th>Estado</th></tr></thead><tbody>{hitos.map((h,i)=><tr key={h[0]}><td><strong>{h[0]}</strong></td><td>{h[1]}</td><td>{h[2]}</td><td>{i<3?`${8+i*7}/08/2026`:'Por programar'}</td><td><span className={`badge ${h[3]==='Completado'?'green':h[3]==='En curso'?'blue':'gray'}`}>{h[3]}</span></td></tr>)}</tbody></table></div></section>; }

function Reviews({role,onAction}:{role:Role;onAction:(msg:string)=>void}) { const rows=role==='approver'?[['Daniela Jácome Silva','Marketing Digital','81,8%','Sin brechas','Listo para revisar'],['Carolina Andrade Mena','Enfermería','78,2%','Sin brechas','Documentación pendiente'],['Luis Montalvo Peña','Contabilidad','76,4%','Sin brechas','Listo para revisar']]:[['H1 · Inducción','7 criterios','3,6 / 4','Superado','Completo'],['H2 · Preparación','20 criterios','3,4 / 4','Superado','Completo'],['H3 · Inicio docencia','14 criterios','2,9 / 4','Con brechas','En revisión'],['H4 · Seguimiento 1','12 criterios','—','Sin evaluar','Pendiente'],['Matriz complementaria','17 criterios','76%','Cumple','Completo'],['Observación de Calidad','21 criterios','82%','Cumple','Completo']]; return <section className="section-card"><div className="panel-head"><div><h3>{role==='approver'?'Bandeja de aprobación':'Evaluación integral'}</h3><p>{role==='approver'?'Expedientes enviados por los coordinadores':'Hitos, matrices y rúbrica de Calidad'}</p></div></div><div className="table-scroll"><table className="data-table"><thead><tr>{(role==='approver'?['Docente','Carrera','Resultado','Control crítico','Estado']:['Componente','Alcance','Resultado','Dictamen','Estado']).map(h=><th key={h}>{h}</th>)}<th></th></tr></thead><tbody>{rows.map((r)=><tr key={r[0]}>{r.map((c,i)=><td key={i}>{i===3?<span className={`badge ${c.includes('brechas')?'red':c==='Superado'||c==='Cumple'?'green':'gray'}`}>{c}</span>:c}</td>)}<td><button className="secondary-button" onClick={()=>onAction(role==='approver'?'Expediente abierto para aprobación':'Evaluación abierta')}>{role==='approver'?'Revisar':'Evaluar'} <ChevronRight size={13}/></button></td></tr>)}</tbody></table></div></section>; }

function Evidence({role,onAction}:{role:Role;onAction:(msg:string)=>void}) { return <section className="section-card">{role==='approver'?<><div className="panel-head"><div><h3>Certificados habilitados</h3><p>Solo aparecen después de la aprobación institucional</p></div></div><div className="empty-state"><div className="round-icon"><ShieldCheck/></div><h3>Certificación protegida</h3><p>El sistema verifica el resultado integrado, las brechas críticas, los seguimientos y la aprobación antes de emitir el documento.</p><button className="primary-button" onClick={()=>onAction('Listado de certificados actualizado')}>Actualizar listado</button></div></>:<><div className="toolbar"><div><h3>Evidencias del expediente</h3><p className="subtitle">Archivos, fotografías, capturas y enlaces verificables</p></div><button className="primary-button" onClick={()=>onAction('Selector de archivos abierto')}><UploadCloud size={15}/>Subir evidencia</button></div><div className="metric-grid"><Metric icon={FileText} label="Archivos" value="18" note="PDF, Word y Excel"/><Metric icon={UploadCloud} label="Capturas" value="27" note="EVA, Teams y SISACAD" tone="blue"/><Metric icon={BookOpenCheck} label="Enlaces" value="14" note="Recursos verificables" tone="gold"/><Metric icon={Archive} label="Almacenamiento" value="86 MB" note="Uso del expediente"/></div></>}</section>; }

function Documents({role,teachers,onAction}:{role:Role;teachers:Teacher[];onAction:(msg:string)=>void}) { const docs=['Acta oficial de inducción','Registro de acompañamiento 1','Informe de observación de clase','Registro de acompañamiento 2','Informe consolidado de cierre','Certificado de cumplimiento','Expediente completo','Respaldo en Excel']; async function generate(doc:string,index:number){if(index===5&&role!=='approver'){onAction('El certificado requiere aprobación institucional');return;}if(index===7){downloadExcelBackup(teachers);}else{await downloadPdfDocument(doc);}onAction(`${doc}: descarga generada`);} return <section className="section-card"><div className="panel-head"><div><h3>Generación documental</h3><p>Plantillas institucionales alimentadas con la información del expediente</p></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Documento</th><th>Responsable</th><th>Formato</th><th>Estado</th><th></th></tr></thead><tbody>{docs.map((doc,i)=><tr key={doc}><td><strong>{doc}</strong></td><td>{i===5?'Coordinación General':'Coordinador de Carrera'}</td><td>{i===7?'Excel':'PDF'}</td><td><span className={`badge ${i<3?'green':i===5&&role!=='approver'?'gold':'gray'}`}>{i<3?'Disponible':i===5&&role!=='approver'?'Requiere aprobación':'Generable'}</span></td><td><button className="ghost-button" onClick={()=>void generate(doc,i)}><FileText size={13}/>Generar</button></td></tr>)}</tbody></table></div></section>; }

function Reports() { return <><div className="metric-grid"><Metric icon={Users} label="Docentes acompañados" value="38" note="Acumulado 2026"/><Metric icon={CheckCircle2} label="Tasa de certificación" value="84%" note="32 de 38 docentes" tone="gold"/><Metric icon={Clock3} label="Duración promedio" value="94 d" note="Desde inducción a cierre" tone="blue"/><Metric icon={Activity} label="Brecha más frecuente" value="EVA" note="Evidencias y calificación" tone="red"/></div><section className="section-card"><div className="panel-head"><div><h3>Desempeño por hito</h3><p>Promedio institucional en escala de 0 a 4</p></div></div>{['H1 · Inducción','H2 · Preparación','H3 · Inicio docencia','H4 · Seguimiento 1','H5 · Seguimiento 2','H6 · Cierre'].map((h,i)=><div className="teacher-row" key={h}><strong>{h}</strong><span className="row-meta">{[3.7,3.5,3.2,3.1,3.4,3.6][i]} / 4</span><div className="progress-cell"><div className="mini-progress"><span style={{width:`${[92,88,80,77,85,90][i]}%`}}/></div></div><span className="badge green">Competente</span></div>)}</section></>; }

function UsersPanel({onAction}:{onAction:(msg:string)=>void}) { const users=[['Jefferson Villarreal','Coordinador','Titulación / carreras asignadas','Activo'],['María Alejandra Hernández','Aprobadora','Coordinación General','Activo'],['Juan Carlos Pazmiño','Coordinador','Software y Redes','Activo'],['Administrador SIACD','Administrador','Acceso institucional','Activo']]; return <section className="section-card"><div className="toolbar"><div><h3>Usuarios del sistema</h3><p className="subtitle">Cuentas, roles y alcance de acceso</p></div><button className="primary-button" onClick={()=>onAction('Formulario para crear usuario abierto')}><Plus size={14}/>Crear usuario</button></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Usuario</th><th>Rol</th><th>Asignación</th><th>Estado</th><th></th></tr></thead><tbody>{users.map(u=><tr key={u[0]}><td><strong>{u[0]}</strong></td><td>{u[1]}</td><td>{u[2]}</td><td><span className="badge green">{u[3]}</span></td><td><button className="row-action" aria-label="Editar usuario"><ChevronRight size={14}/></button></td></tr>)}</tbody></table></div></section>; }

function SettingsPanel({onAction}:{onAction:(msg:string)=>void}) { return <section className="section-card"><div className="form-grid"><div className="field"><label>Período académico activo</label><select><option>Mayo – Noviembre 2026</option><option>Febrero – Agosto 2026</option></select></div><div className="field"><label>Resultado mínimo de certificación</label><input value="75%" readOnly/></div><div className="field"><label>Peso operativo SIACD</label><input value="60%" readOnly/></div><div className="field"><label>Peso Observación de Calidad</label><input value="25%" readOnly/></div><div className="field"><label>Peso Matriz complementaria</label><input value="15%" readOnly/></div><div className="field"><label>Seguimientos mínimos</label><input value="4" readOnly/></div><div className="field full"><label>Regla de seguridad</label><textarea value="Ningún expediente puede certificarse con competencias críticas por debajo de 3, información incompleta o sin aprobación de Coordinación General." readOnly/></div><div className="form-actions"><button className="primary-button" onClick={()=>onAction('Configuración guardada')}>Guardar configuración</button></div></div></section>; }

function TeacherModal({onClose,onSave}:{onClose:()=>void;onSave:(teacher:Teacher)=>void}) { function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);onSave({id:crypto.randomUUID(),name:String(f.get('name')),career:String(f.get('career')),subject:String(f.get('subject')),period:String(f.get('period')),progress:0,status:'En acompañamiento',currentHito:'H1 · Inducción'});} return <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="teacher-title"><div className="modal-head"><h2 id="teacher-title">Registrar docente nuevo</h2><button className="icon-button" aria-label="Cerrar" onClick={onClose}><X size={17}/></button></div><form className="modal-body form-grid" onSubmit={submit}><div className="field full"><label>Nombres y apellidos</label><input name="name" required placeholder="Nombre completo del docente"/></div><div className="field"><label>Carrera</label><input name="career" required placeholder="Ej. Enfermería"/></div><div className="field"><label>Asignatura(s)</label><input name="subject" required placeholder="Ej. Fundamentos de Enfermería"/></div><div className="field"><label>Modalidad</label><select name="modality"><option>Presencial</option><option>Híbrida</option><option>Online</option></select></div><div className="field"><label>Período académico</label><select name="period"><option>Mayo – Noviembre 2026</option><option>Febrero – Agosto 2026</option></select></div><div className="field"><label>Fecha de ingreso</label><input type="date" name="startDate" required/></div><div className="field"><label>Jornada / horario</label><input name="schedule" placeholder="Ej. Nocturna · 19:00 a 22:00"/></div><div className="field"><label>Correo institucional</label><input name="email" type="email" placeholder="docente@institucion.edu.ec"/></div><div className="field"><label>Código Teams</label><input name="teams" placeholder="Código del equipo"/></div><div className="field full"><label>Enlace de Telegram</label><input name="telegram" type="url" placeholder="https://t.me/..."/></div><div className="form-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button"><Plus size={14}/>Crear expediente</button></div></form></div></div>; }
