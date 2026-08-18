"use client";
/* eslint-disable @next/next/no-img-element */

import {
  Activity,
  ArrowRight,
  BarChart3,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FolderArchive,
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

type AccessMode = "landing" | "coordinator" | "admin";
type StaffRole = "coordinator" | "approver" | "admin";
type View = "dashboard" | "teachers" | "schedule" | "reports" | "coordinators" | "settings";

type CatalogOption = {
  id: string;
  name: string;
  program?: string;
};

type AcademicPeriod = {
  id: string;
  name: string;
};

type StaffMember = {
  id: string;
  full_name: string;
  role: StaffRole;
  active: boolean;
  careerIds: string[];
};

type ScheduleRange = {
  startTime: string;
  endTime: string;
};

type Teacher = {
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

const coordinatorNav: { label: string; view: View; icon: typeof LayoutDashboard }[] = [
  { label: "Panel general", view: "dashboard", icon: LayoutDashboard },
  { label: "Docentes", view: "teachers", icon: Users },
  { label: "Cronograma", view: "schedule", icon: CalendarDays },
  { label: "Reportes", view: "reports", icon: BarChart3 },
];

const adminNav: { label: string; view: View; icon: typeof LayoutDashboard }[] = [
  { label: "Panel general", view: "dashboard", icon: LayoutDashboard },
  { label: "Coordinadores", view: "coordinators", icon: UserCog },
  { label: "Docentes", view: "teachers", icon: Users },
  { label: "Estadísticas", view: "reports", icon: BarChart3 },
  { label: "Catálogos", view: "settings", icon: Settings },
];

const hitoIds = ["H1", "H2", "H3", "H4", "H5", "H6"];

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
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
  const assignments = Array.isArray(row.siacd_staff_careers)
    ? (row.siacd_staff_careers as Record<string, unknown>[])
    : [];
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
    ? ([...(row.expedient_schedules as Record<string, unknown>[])].sort(
        (a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0),
      ))
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
    currentHito:
      status === "Certificado"
        ? "Proceso finalizado"
        : executed.length === 6
          ? "H6 · Cierre completado"
          : `H${nextHito} · pendiente`,
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

  const selectedCoordinator = useMemo(
    () => staff.find((item) => item.id === selectedCoordinatorId && item.role === "coordinator") ?? null,
    [selectedCoordinatorId, staff],
  );

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
      supabase
        .from("siacd_staff")
        .select("id, full_name, role, active, siacd_staff_careers(career_id)")
        .order("full_name"),
      supabase.from("careers").select("id, name, program").eq("active", true).order("name"),
      supabase.from("academic_periods").select("id, name").eq("active", true).order("starts_on", { ascending: false }),
    ]);

    if (staffResult.error) {
      setSchemaIssue(
        "Falta aplicar la migración 202608180001_block1_access_and_staff.sql en Supabase.",
      );
      setLoading(false);
      return;
    }

    setStaff(((staffResult.data ?? []) as Record<string, unknown>[]).map(mapStaff));
    setCareers((careerResult.data ?? []) as CatalogOption[]);
    setPeriods((periodResult.data ?? []) as AcademicPeriod[]);
    setLoading(false);
  }, []);

  const loadExpedients = useCallback(
    async (coordinatorId?: string) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      let query = supabase
        .from("expedients")
        .select(
          "id, coordinator_staff_id, status, subject_names, modality, activities_start_on, planned_close_on, critical_gaps, teachers(full_name, institutional_email, started_institution_on), careers(id, name, program), academic_periods(name), hito_schedules(hito_id, scheduled_on, executed_on, coordinator_validated), expedient_schedules(sequence, start_time, end_time)",
        )
        .order("created_at", { ascending: false });

      if (accessMode === "coordinator") {
        if (!coordinatorId) {
          setTeachers([]);
          return;
        }
        query = query.eq("coordinator_staff_id", coordinatorId);
      }

      const { data, error } = await query;
      if (error) {
        setToast(`No se pudieron cargar los expedientes: ${error.message}`);
        return;
      }
      setTeachers(((data ?? []) as Record<string, unknown>[]).map(mapExpedient));
    },
    [accessMode],
  );

  useEffect(() => {
    if (accessMode === "landing" || !configured) return;
    void loadBaseData();
  }, [accessMode, configured, loadBaseData]);

  useEffect(() => {
    if (accessMode !== "coordinator" || !staff.length) return;
    const saved = typeof window !== "undefined" ? window.sessionStorage.getItem("siacd-coordinator-id") : null;
    if (saved && staff.some((item) => item.id === saved && item.role === "coordinator" && item.active)) {
      setSelectedCoordinatorId(saved);
    }
  }, [accessMode, staff]);

  useEffect(() => {
    if (accessMode === "admin") {
      void loadExpedients();
      return;
    }
    if (accessMode === "coordinator" && selectedCoordinatorId) {
      void loadExpedients(selectedCoordinatorId);
    }
  }, [accessMode, loadExpedients, selectedCoordinatorId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

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
      const { error } = await supabase
        .from("siacd_staff")
        .update({ full_name: input.name, active: input.active, updated_at: new Date().toISOString() })
        .eq("id", staffId);
      if (error) {
        setToast(`No se pudo actualizar el coordinador: ${error.message}`);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("siacd_staff")
        .insert({ full_name: input.name, role: "coordinator", active: input.active })
        .select("id")
        .single();
      if (error || !data) {
        setToast(`No se pudo crear el coordinador: ${error?.message ?? "error de base de datos"}`);
        return;
      }
      staffId = data.id;
    }

    const { error: deleteError } = await supabase.from("siacd_staff_careers").delete().eq("staff_id", staffId);
    if (deleteError) {
      setToast(`No se pudieron actualizar las carreras: ${deleteError.message}`);
      return;
    }

    if (input.careerIds.length) {
      const { error: assignmentError } = await supabase.from("siacd_staff_careers").insert(
        input.careerIds.map((careerId) => ({ staff_id: staffId, career_id: careerId })),
      );
      if (assignmentError) {
        setToast(`No se pudieron asignar las carreras: ${assignmentError.message}`);
        return;
      }
    }

    setShowCoordinatorModal(false);
    setEditingCoordinator(null);
    setToast(input.id ? "Coordinador actualizado" : "Coordinador creado");
    await loadBaseData();
  }

  async function toggleCoordinator(coordinator: StaffMember) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error } = await supabase
      .from("siacd_staff")
      .update({ active: !coordinator.active, updated_at: new Date().toISOString() })
      .eq("id", coordinator.id);
    if (error) {
      setToast(`No se pudo cambiar el estado: ${error.message}`);
      return;
    }
    setToast(coordinator.active ? "Coordinador desactivado" : "Coordinador activado");
    await loadBaseData();
  }

  async function saveTeacher(input: NewTeacherInput) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !selectedCoordinator) {
      setToast("Seleccione un coordinador antes de registrar docentes");
      return;
    }
    if (!selectedCoordinator.careerIds.includes(input.careerId)) {
      setToast("La carrera seleccionada no está asignada a este coordinador");
      return;
    }

    const { data: teacher, error: teacherError } = await supabase
      .from("teachers")
      .insert({
        full_name: input.name,
        institutional_email: input.email || null,
        started_institution_on: input.entryDate,
        created_by: null,
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
        coordinator_id: null,
        coordinator_staff_id: selectedCoordinator.id,
        subject_names: input.subject,
        modality: input.modality,
        schedule_text: input.schedules.map((schedule) => `${schedule.startTime} a ${schedule.endTime}`).join(" · "),
        activities_start_on: input.activitiesStartDate,
        planned_close_on: input.plannedCloseDate,
        teams_code: input.teams || null,
        telegram_url: input.telegram || null,
        status: "in_progress",
      })
      .select("id")
      .single();

    if (expedientError || !expedient) {
      await supabase.from("teachers").delete().eq("id", teacher.id);
      setToast(`No se pudo crear el expediente: ${expedientError?.message ?? "error de base de datos"}`);
      return;
    }

    const { error: rangesError } = await supabase.from("expedient_schedules").insert(
      input.schedules.map((schedule, index) => ({
        expedient_id: expedient.id,
        sequence: index + 1,
        start_time: schedule.startTime,
        end_time: schedule.endTime,
      })),
    );

    if (rangesError) {
      await supabase.from("expedients").delete().eq("id", expedient.id);
      await supabase.from("teachers").delete().eq("id", teacher.id);
      setToast(`No se pudieron guardar las jornadas: ${rangesError.message}`);
      return;
    }

    const { error: hitosError } = await supabase.from("hito_schedules").insert(
      hitoIds.map((hitoId) => ({ expedient_id: expedient.id, hito_id: hitoId })),
    );

    if (hitosError) {
      await supabase.from("expedients").delete().eq("id", expedient.id);
      await supabase.from("teachers").delete().eq("id", teacher.id);
      setToast(`No se pudo crear el cronograma H1–H6: ${hitosError.message}`);
      return;
    }

    setShowTeacherModal(false);
    setToast("Docente y expediente creados correctamente");
    await loadExpedients(selectedCoordinator.id);
  }

  if (accessMode === "landing") return <AccessLanding />;
  if (!configured) return <ConfigurationRequired />;
  if (loading && !staff.length && !schemaIssue) return <LoadingScreen />;
  if (schemaIssue) return <MigrationRequired message={schemaIssue} />;

  if (accessMode === "coordinator" && !selectedCoordinator) {
    return (
      <CoordinatorPicker
        coordinators={staff.filter((item) => item.role === "coordinator" && item.active)}
        onChoose={chooseCoordinator}
      />
    );
  }

  const navItems = accessMode === "admin" ? adminNav : coordinatorNav;
  const profileName = accessMode === "admin" ? "Administrador SIACD" : selectedCoordinator?.full_name ?? "Coordinador";

  return (
    <div className="siacd-shell">
      <div className="mobile-topbar">
        <strong>SIACD</strong>
        <button className="icon-button" aria-label="Abrir menú" onClick={() => setMobileOpen(true)}>
          <Menu size={18} />
        </button>
      </div>

      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <InstitutionBrand compact />
        <div className="nav-label">Gestión</div>
        <nav className="nav">
          {navItems.map((item) => (
            <button
              key={item.view}
              className={`nav-button ${view === item.view ? "active" : ""}`}
              onClick={() => {
                setView(item.view);
                setMobileOpen(false);
              }}
            >
              <item.icon />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        {accessMode === "coordinator" && (
          <button className="nav-button" onClick={changeCoordinator}>
            <UserCog />
            Cambiar coordinador
          </button>
        )}
        <div className="user-card">
          <div className="avatar">{initials(profileName)}</div>
          <div>
            <strong>{profileName}</strong>
            <span>{accessMode === "admin" ? "Administrador general" : "Coordinador de Carrera"}</span>
          </div>
        </div>
      </aside>

      {mobileOpen && <button aria-label="Cerrar menú" className="mobile-scrim" onClick={() => setMobileOpen(false)} />}

      <main className="main">
        <Header
          accessMode={accessMode}
          view={view}
          onNewTeacher={() => setShowTeacherModal(true)}
          coordinatorName={selectedCoordinator?.full_name}
        />

        {view === "dashboard" && (
          <Dashboard
            teachers={teachers}
            accessMode={accessMode}
            coordinatorCount={staff.filter((item) => item.role === "coordinator" && item.active).length}
            onViewTeachers={() => setView("teachers")}
            onOpenTeacher={setSelectedTeacher}
          />
        )}
        {view === "teachers" && (
          <TeachersPanel
            teachers={teachers}
            careers={accessMode === "coordinator" ? assignedCareers : careers}
            canCreate={accessMode === "coordinator"}
            onNew={() => setShowTeacherModal(true)}
            onOpen={setSelectedTeacher}
          />
        )}
        {view === "schedule" && <ScheduleOverview teachers={teachers} onOpen={setSelectedTeacher} />}
        {view === "reports" && <Reports teachers={teachers} />}
        {view === "coordinators" && accessMode === "admin" && (
          <CoordinatorsPanel
            coordinators={staff.filter((item) => item.role === "coordinator")}
            careers={careers}
            onNew={() => {
              setEditingCoordinator(null);
              setShowCoordinatorModal(true);
            }}
            onEdit={(coordinator) => {
              setEditingCoordinator(coordinator);
              setShowCoordinatorModal(true);
            }}
            onToggle={toggleCoordinator}
          />
        )}
        {view === "settings" && accessMode === "admin" && (
          <CatalogSummary careers={careers} periods={periods} staff={staff} />
        )}
      </main>

      {showTeacherModal && selectedCoordinator && (
        <TeacherModal
          careers={assignedCareers}
          periods={periods}
          coordinatorName={selectedCoordinator.full_name}
          onClose={() => setShowTeacherModal(false)}
          onSave={saveTeacher}
        />
      )}

      {showCoordinatorModal && accessMode === "admin" && (
        <CoordinatorModal
          coordinator={editingCoordinator}
          careers={careers}
          onClose={() => {
            setShowCoordinatorModal(false);
            setEditingCoordinator(null);
          }}
          onSave={saveCoordinator}
        />
      )}

      {selectedTeacher && <TeacherSummaryModal teacher={selectedTeacher} onClose={() => setSelectedTeacher(null)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function InstitutionBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`institution-brand ${compact ? "compact" : ""}`}>
      <img src="/logo-itsqmet.png" alt="Instituto Tecnológico Superior Quito Metropolitano" />
      <span>SIACD · Acompañamiento Docente</span>
    </div>
  );
}

function AccessLanding() {
  return (
    <div className="login-page">
      <section className="login-art">
        <InstitutionBrand />
        <div>
          <p className="eyebrow">ITSQMET · Sistema institucional</p>
          <h1>Gestión del acompañamiento docente</h1>
          <p>El SIACD trabaja con una sola base institucional y dos accesos separados según la función.</p>
        </div>
        <p>Proceso CGC-PRO-121 · Uso institucional</p>
      </section>
      <section className="login-form-wrap">
        <div className="login-form">
          <h2>Seleccione su acceso</h2>
          <p>Los dos enlaces trabajan sobre la misma información de Supabase.</p>
          <a className="primary-button" href="./coordinador/" style={{ justifyContent: "center", textDecoration: "none" }}>
            <Users size={15} /> Acceso Coordinadores
          </a>
          <a
            className="secondary-button"
            href="./administrador/"
            style={{ justifyContent: "center", textDecoration: "none", width: "100%", marginTop: 10 }}
          >
            <ShieldCheck size={15} /> Acceso Administrador
          </a>
        </div>
      </section>
    </div>
  );
}

function CoordinatorPicker({ coordinators, onChoose }: { coordinators: StaffMember[]; onChoose: (id: string) => void }) {
  const [value, setValue] = useState(coordinators[0]?.id ?? "");
  useEffect(() => {
    if (!value && coordinators[0]) setValue(coordinators[0].id);
  }, [coordinators, value]);

  return (
    <div className="login-page">
      <section className="login-art">
        <InstitutionBrand />
        <div>
          <p className="eyebrow">Acceso de coordinadores</p>
          <h1>Seleccione su nombre</h1>
          <p>La selección define las carreras y los docentes que aparecerán durante esta sesión.</p>
        </div>
        <p>Acceso directo · Sin usuario y contraseña</p>
      </section>
      <section className="login-form-wrap">
        <div className="login-form">
          <h2>Coordinador de Carrera</h2>
          {coordinators.length ? (
            <>
              <div className="field">
                <label>Nombre del coordinador</label>
                <select value={value} onChange={(event) => setValue(event.target.value)}>
                  {coordinators.map((coordinator) => (
                    <option key={coordinator.id} value={coordinator.id}>
                      {coordinator.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <button className="primary-button" style={{ width: "100%", justifyContent: "center" }} onClick={() => value && onChoose(value)}>
                Ingresar <ArrowRight size={15} />
              </button>
            </>
          ) : (
            <div className="error-note">No existen coordinadores activos. Deben crearse desde el enlace de Administrador.</div>
          )}
          <a className="text-link" href="../" style={{ display: "inline-block", marginTop: 16 }}>
            Volver al inicio
          </a>
        </div>
      </section>
    </div>
  );
}

function ConfigurationRequired() {
  return (
    <div className="login-page">
      <section className="login-art">
        <InstitutionBrand />
        <div>
          <p className="eyebrow">ITSQMET · Sistema institucional</p>
          <h1>Conexión requerida</h1>
          <p>El SIACD necesita las variables públicas de Supabase para trabajar con la base institucional.</p>
        </div>
      </section>
      <section className="login-form-wrap">
        <div className="login-form">
          <h2>Configuración pendiente</h2>
          <div className="error-note">No se encontraron VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY.</div>
        </div>
      </section>
    </div>
  );
}

function MigrationRequired({ message }: { message: string }) {
  return (
    <div className="login-page">
      <section className="login-art">
        <InstitutionBrand />
        <div>
          <p className="eyebrow">Bloque 1 · Base de datos</p>
          <h1>Actualización de Supabase pendiente</h1>
          <p>El código de la aplicación ya está actualizado, pero la base debe recibir la migración incluida en el repositorio.</p>
        </div>
      </section>
      <section className="login-form-wrap">
        <div className="login-form">
          <h2>Migración requerida</h2>
          <div className="error-note">{message}</div>
          <p>Archivo: supabase/migrations/202608180001_block1_access_and_staff.sql</p>
        </div>
      </section>
    </div>
  );
}

function LoadingScreen() {
  return <div className="login-form-wrap">Preparando SIACD…</div>;
}

function Header({
  accessMode,
  view,
  onNewTeacher,
  coordinatorName,
}: {
  accessMode: AccessMode;
  view: View;
  onNewTeacher: () => void;
  coordinatorName?: string;
}) {
  const titles: Record<View, [string, string]> = {
    dashboard: ["Panel de acompañamiento", accessMode === "admin" ? "Vista institucional completa" : `Gestión de ${coordinatorName ?? "coordinación"}`],
    teachers: ["Docentes y expedientes", "Registro y consulta de docentes nuevos"],
    schedule: ["Cronograma institucional", "Seguimiento de los hitos H1–H6"],
    reports: ["Estadísticas y reportes", "Indicadores calculados desde la base institucional"],
    coordinators: ["Coordinadores y carreras", "Cree coordinadores y asigne sus carreras"],
    settings: ["Catálogos institucionales", "Carreras, períodos y estructura activa del SIACD"],
  };

  return (
    <header className="topline">
      <div>
        <div className="eyebrow">Sistema Integral de Acompañamiento</div>
        <h1>{titles[view][0]}</h1>
        <p className="subtitle">{titles[view][1]}</p>
      </div>
      {accessMode === "coordinator" && view !== "coordinators" && (
        <div className="top-actions">
          <button className="primary-button" onClick={onNewTeacher}>
            <Plus size={15} /> Nuevo docente
          </button>
        </div>
      )}
    </header>
  );
}

function Dashboard({
  teachers,
  accessMode,
  coordinatorCount,
  onViewTeachers,
  onOpenTeacher,
}: {
  teachers: Teacher[];
  accessMode: AccessMode;
  coordinatorCount: number;
  onViewTeachers: () => void;
  onOpenTeacher: (teacher: Teacher) => void;
}) {
  const active = teachers.filter((teacher) => teacher.status !== "Certificado").length;
  const certified = teachers.filter((teacher) => teacher.status === "Certificado").length;
  const gaps = teachers.reduce((total, teacher) => total + teacher.criticalGaps, 0);
  const average = teachers.length
    ? Math.round(teachers.reduce((total, teacher) => total + teacher.progress, 0) / teachers.length)
    : 0;

  return (
    <>
      <div className="hero-grid">
        <section className="hero-card">
          <div className="eyebrow">Información institucional</div>
          <h2>{teachers.length ? `${teachers.length} expediente${teachers.length === 1 ? "" : "s"} visible${teachers.length === 1 ? "" : "s"}` : "Sin expedientes registrados"}</h2>
          <p>{accessMode === "admin" ? "El administrador visualiza todos los expedientes del SIACD." : "Solo se muestran docentes vinculados a las carreras asignadas a este coordinador."}</p>
          <div className="hero-progress">
            <div className="progress-track"><div className="progress-fill" style={{ width: `${average}%` }} /></div>
            <strong>{average}% de avance promedio</strong>
          </div>
        </section>
        <aside className="approval-card">
          <div className="round-icon"><ClipboardCheck size={20} /></div>
          <h3>{accessMode === "admin" ? "Control institucional" : "Expediente central"}</h3>
          <p>{accessMode === "admin" ? `${coordinatorCount} coordinadores activos en el sistema.` : "Cada docente tendrá un solo expediente central para todo el proceso."}</p>
          <button className="secondary-button" onClick={onViewTeachers}>Ver docentes <ChevronRight size={14} /></button>
        </aside>
      </div>
      <div className="metric-grid">
        <Metric icon={Users} label="Docentes activos" value={String(active)} note="Expedientes en proceso" />
        <Metric icon={Clock3} label="Avance promedio" value={`${average}%`} note="Hitos H1–H6 ejecutados" tone="gold" />
        <Metric icon={Activity} label="Brechas críticas" value={String(gaps)} note="Registradas actualmente" tone="red" />
        <Metric icon={FolderArchive} label="Certificados" value={String(certified)} note="Procesos finalizados" tone="blue" />
      </div>
      <section className="panel">
        <div className="panel-head">
          <div><h3>Expedientes recientes</h3><p>Últimos docentes registrados</p></div>
          <button className="text-link" onClick={onViewTeachers}>Ver todos</button>
        </div>
        <div className="teacher-list">
          {teachers.length ? teachers.slice(0, 5).map((teacher) => (
            <TeacherRow key={teacher.id} teacher={teacher} onOpen={() => onOpenTeacher(teacher)} />
          )) : <div className="empty-state"><h3>Sin registros</h3><p>Los docentes aparecerán aquí cuando se cree el primer expediente.</p></div>}
        </div>
      </section>
    </>
  );
}

function Metric({ icon: Icon, label, value, note, tone = "" }: { icon: typeof Users; label: string; value: string; note: string; tone?: string }) {
  return (
    <article className="metric-card">
      <div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon size={15} /></span></div>
      <div className="metric-value">{value}</div>
      <div className="metric-note">{note}</div>
    </article>
  );
}

function TeacherRow({ teacher, onOpen }: { teacher: Teacher; onOpen: () => void }) {
  return (
    <div className="teacher-row">
      <div className="teacher">
        <div className="teacher-avatar">{initials(teacher.name)}</div>
        <div><strong>{teacher.name}</strong><span>{teacher.career}</span></div>
      </div>
      <div className="row-meta"><span className={`badge ${statusClass(teacher.status)}`}>{teacher.status}</span><span>{teacher.currentHito}</span></div>
      <div className="progress-cell"><span className="row-meta">{teacher.progress}% completado</span><div className="mini-progress"><span style={{ width: `${teacher.progress}%` }} /></div></div>
      <button className="row-action" aria-label={`Abrir ficha de ${teacher.name}`} onClick={onOpen}><ChevronRight size={15} /></button>
    </div>
  );
}

function TeachersPanel({
  teachers,
  careers,
  canCreate,
  onNew,
  onOpen,
}: {
  teachers: Teacher[];
  careers: CatalogOption[];
  canCreate: boolean;
  onNew: () => void;
  onOpen: (teacher: Teacher) => void;
}) {
  const [query, setQuery] = useState("");
  const [careerId, setCareerId] = useState("");
  const [status, setStatus] = useState("");
  const filtered = useMemo(
    () => teachers.filter((teacher) => {
      const textMatch = `${teacher.name} ${teacher.career} ${teacher.subject}`.toLowerCase().includes(query.toLowerCase());
      return textMatch && (!careerId || teacher.careerId === careerId) && (!status || teacher.status === status);
    }),
    [careerId, query, status, teachers],
  );

  return (
    <section className="section-card">
      <div className="toolbar">
        <div className="search"><Search size={15} /><input aria-label="Buscar docentes" placeholder="Buscar docente, carrera o asignatura" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <div className="filters">
          <select className="select" value={careerId} onChange={(event) => setCareerId(event.target.value)} aria-label="Filtrar carrera">
            <option value="">Todas las carreras</option>
            {careers.map((career) => <option key={career.id} value={career.id}>{career.name}{career.program ? ` — ${career.program}` : ""}</option>)}
          </select>
          <select className="select" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrar estado">
            <option value="">Todos los estados</option>
            {[...new Set(teachers.map((teacher) => teacher.status))].map((item) => <option key={item}>{item}</option>)}
          </select>
          {canCreate && <button className="primary-button" onClick={onNew}><Plus size={14} /> Registrar docente</button>}
        </div>
      </div>
      {filtered.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Docente</th><th>Carrera / asignatura</th><th>Período</th><th>Hito</th><th>Avance</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {filtered.map((teacher) => (
                <tr key={teacher.id}>
                  <td><div className="teacher"><div className="teacher-avatar">{initials(teacher.name)}</div><strong>{teacher.name}</strong></div></td>
                  <td>{teacher.career}<span className="row-meta">{teacher.subject}</span></td>
                  <td>{teacher.period}</td>
                  <td>{teacher.currentHito}</td>
                  <td>{teacher.progress}%</td>
                  <td><span className={`badge ${statusClass(teacher.status)}`}>{teacher.status}</span></td>
                  <td><button className="row-action" onClick={() => onOpen(teacher)} aria-label="Abrir ficha"><ChevronRight size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state"><h3>Sin docentes</h3><p>No existen registros que coincidan con los filtros seleccionados.</p>{canCreate && <button className="primary-button" onClick={onNew}><Plus size={14} /> Registrar docente</button>}</div>
      )}
    </section>
  );
}

function ScheduleOverview({ teachers, onOpen }: { teachers: Teacher[]; onOpen: (teacher: Teacher) => void }) {
  return (
    <section className="section-card">
      <div className="panel-head"><div><h3>Estado del cronograma H1–H6</h3><p>Los seis hitos se crean automáticamente al registrar cada docente.</p></div></div>
      {teachers.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Docente</th><th>Carrera</th><th>Ejecutados</th><th>Siguiente hito</th><th>Avance</th><th></th></tr></thead>
            <tbody>{teachers.map((teacher) => (
              <tr key={teacher.id}>
                <td><strong>{teacher.name}</strong></td>
                <td>{teacher.career}</td>
                <td>{teacher.hitosExecuted} de 6</td>
                <td>{teacher.currentHito}</td>
                <td>{teacher.progress}%</td>
                <td><button className="secondary-button" onClick={() => onOpen(teacher)}>Ver ficha <ChevronRight size={13} /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <div className="empty-state"><h3>Sin cronogramas</h3><p>El cronograma aparecerá al crear el primer expediente.</p></div>}
    </section>
  );
}

function Reports({ teachers }: { teachers: Teacher[] }) {
  const certified = teachers.filter((teacher) => teacher.status === "Certificado").length;
  const average = teachers.length ? Math.round(teachers.reduce((sum, teacher) => sum + teacher.progress, 0) / teachers.length) : 0;
  const gaps = teachers.reduce((sum, teacher) => sum + teacher.criticalGaps, 0);
  const rate = teachers.length ? Math.round((certified / teachers.length) * 100) : 0;
  return (
    <>
      <div className="metric-grid">
        <Metric icon={Users} label="Docentes" value={String(teachers.length)} note="Expedientes visibles" />
        <Metric icon={FolderArchive} label="Certificación" value={`${rate}%`} note={`${certified} certificados`} tone="gold" />
        <Metric icon={Clock3} label="Avance promedio" value={`${average}%`} note="Hitos ejecutados" tone="blue" />
        <Metric icon={Activity} label="Brechas críticas" value={String(gaps)} note="Total registrado" tone="red" />
      </div>
      <section className="section-card">
        <div className="panel-head"><div><h3>Avance por docente</h3><p>Datos recuperados desde Supabase.</p></div></div>
        {teachers.length ? teachers.map((teacher) => <TeacherRow key={teacher.id} teacher={teacher} onOpen={() => undefined} />) : <div className="empty-state"><p>No existen datos todavía.</p></div>}
      </section>
    </>
  );
}

function CoordinatorsPanel({
  coordinators,
  careers,
  onNew,
  onEdit,
  onToggle,
}: {
  coordinators: StaffMember[];
  careers: CatalogOption[];
  onNew: () => void;
  onEdit: (coordinator: StaffMember) => void;
  onToggle: (coordinator: StaffMember) => void;
}) {
  const careerById = useMemo(() => new Map(careers.map((career) => [career.id, career])), [careers]);
  return (
    <section className="section-card">
      <div className="toolbar">
        <div><h3>Coordinadores del SIACD</h3><p className="subtitle">El administrador controla nombres, estado y carreras asignadas.</p></div>
        <button className="primary-button" onClick={onNew}><Plus size={14} /> Nuevo coordinador</button>
      </div>
      {coordinators.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Coordinador</th><th>Carreras asignadas</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>{coordinators.map((coordinator) => (
              <tr key={coordinator.id}>
                <td><strong>{coordinator.full_name}</strong></td>
                <td>{coordinator.careerIds.length ? coordinator.careerIds.map((id) => careerById.get(id)?.name).filter(Boolean).join(" · ") : "Sin carreras asignadas"}</td>
                <td><span className={`badge ${coordinator.active ? "green" : "gray"}`}>{coordinator.active ? "Activo" : "Inactivo"}</span></td>
                <td><div className="filters"><button className="secondary-button" onClick={() => onEdit(coordinator)}>Editar</button><button className="ghost-button" onClick={() => onToggle(coordinator)}>{coordinator.active ? "Desactivar" : "Activar"}</button></div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <div className="empty-state"><h3>Sin coordinadores</h3><p>Cree el primer coordinador y asigne sus carreras.</p><button className="primary-button" onClick={onNew}><Plus size={14} /> Nuevo coordinador</button></div>}
    </section>
  );
}

function CatalogSummary({ careers, periods, staff }: { careers: CatalogOption[]; periods: AcademicPeriod[]; staff: StaffMember[] }) {
  return (
    <>
      <div className="metric-grid">
        <Metric icon={Users} label="Coordinadores" value={String(staff.filter((item) => item.role === "coordinator").length)} note="Activos e inactivos" />
        <Metric icon={FolderArchive} label="Carreras" value={String(careers.length)} note="Catálogo activo" tone="blue" />
        <Metric icon={CalendarDays} label="Períodos" value={String(periods.length)} note="Períodos activos" tone="gold" />
        <Metric icon={ShieldCheck} label="Accesos" value="2" note="Coordinador y administrador" />
      </div>
      <section className="section-card">
        <div className="panel-head"><div><h3>Períodos académicos activos</h3><p>Información actual de Supabase.</p></div></div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Período</th><th>Estado</th></tr></thead><tbody>{periods.map((period) => <tr key={period.id}><td><strong>{period.name}</strong></td><td><span className="badge green">Activo</span></td></tr>)}</tbody></table></div>
      </section>
    </>
  );
}

function CoordinatorModal({
  coordinator,
  careers,
  onClose,
  onSave,
}: {
  coordinator: StaffMember | null;
  careers: CatalogOption[];
  onClose: () => void;
  onSave: (input: CoordinatorInput) => Promise<void>;
}) {
  const [selectedCareerIds, setSelectedCareerIds] = useState<string[]>(coordinator?.careerIds ?? []);
  const [active, setActive] = useState(coordinator?.active ?? true);

  function toggleCareer(id: string) {
    setSelectedCareerIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void onSave({
      id: coordinator?.id,
      name: String(form.get("name") ?? "").trim(),
      active,
      careerIds: selectedCareerIds,
    });
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="coordinator-title">
        <div className="modal-head"><h2 id="coordinator-title">{coordinator ? "Editar coordinador" : "Nuevo coordinador"}</h2><button className="icon-button" aria-label="Cerrar" onClick={onClose}><X size={17} /></button></div>
        <form className="modal-body form-grid" onSubmit={submit}>
          <div className="field full"><label>Nombres y apellidos</label><input name="name" defaultValue={coordinator?.full_name ?? ""} required placeholder="Nombre completo del coordinador" /></div>
          <div className="field full"><label>Estado</label><select value={active ? "active" : "inactive"} onChange={(event) => setActive(event.target.value === "active")}><option value="active">Activo</option><option value="inactive">Inactivo</option></select></div>
          <div className="field full">
            <label>Carreras asignadas</label>
            <div className="schedule-editor">
              {careers.map((career) => (
                <label key={career.id} style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 600 }}>
                  <input type="checkbox" checked={selectedCareerIds.includes(career.id)} onChange={() => toggleCareer(career.id)} style={{ width: 16 }} />
                  <span>{career.name}{career.program ? ` — ${career.program}` : ""}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="form-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button">Guardar coordinador</button></div>
        </form>
      </div>
    </div>
  );
}

function TeacherModal({
  careers,
  periods,
  coordinatorName,
  onClose,
  onSave,
}: {
  careers: CatalogOption[];
  periods: AcademicPeriod[];
  coordinatorName: string;
  onClose: () => void;
  onSave: (input: NewTeacherInput) => Promise<void>;
}) {
  const [schedules, setSchedules] = useState<ScheduleRange[]>([{ startTime: "", endTime: "" }]);

  function addSchedule() {
    setSchedules((current) => [...current, { startTime: "", endTime: "" }]);
  }

  function removeSchedule(index: number) {
    setSchedules((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function updateSchedule(index: number, field: keyof ScheduleRange, value: string) {
    setSchedules((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (schedules.some((schedule) => !schedule.startTime || !schedule.endTime || schedule.endTime <= schedule.startTime)) {
      window.alert("Cada jornada debe tener una hora final posterior a la hora inicial.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const entryDate = String(form.get("entryDate") ?? "");
    const activitiesStartDate = String(form.get("activitiesStartDate") ?? "");
    const plannedCloseDate = String(form.get("plannedCloseDate") ?? "");
    if (activitiesStartDate < entryDate) {
      window.alert("La fecha de inicio de actividades no puede ser anterior a la fecha de ingreso.");
      return;
    }
    if (plannedCloseDate < activitiesStartDate) {
      window.alert("La fecha prevista de cierre debe ser posterior al inicio de actividades.");
      return;
    }

    void onSave({
      name: String(form.get("name") ?? ""),
      careerId: String(form.get("careerId") ?? ""),
      periodId: String(form.get("periodId") ?? ""),
      subject: String(form.get("subject") ?? ""),
      modality: String(form.get("modality") ?? ""),
      entryDate,
      activitiesStartDate,
      plannedCloseDate,
      schedules,
      email: String(form.get("email") ?? ""),
      teams: String(form.get("teams") ?? ""),
      telegram: String(form.get("telegram") ?? ""),
    });
  }

  const ready = careers.length > 0 && periods.length > 0;

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="teacher-title">
        <div className="modal-head"><div><h2 id="teacher-title">Registrar docente nuevo</h2><p className="subtitle">Responsable: {coordinatorName}</p></div><button className="icon-button" aria-label="Cerrar" onClick={onClose}><X size={17} /></button></div>
        <form className="modal-body form-grid" onSubmit={submit}>
          {!ready && <div className="error-note field full">El coordinador necesita al menos una carrera asignada y un período activo.</div>}
          <div className="field full"><label>Nombres y apellidos</label><input name="name" required placeholder="Nombre completo del docente" /></div>
          <div className="field"><label>Carrera</label><select name="careerId" required>{careers.map((career) => <option key={career.id} value={career.id}>{career.name}{career.program ? ` — ${career.program}` : ""}</option>)}</select></div>
          <div className="field"><label>Asignatura(s)</label><input name="subject" required placeholder="Asignatura o asignaturas" /></div>
          <div className="field"><label>Modalidad</label><select name="modality" required><option>Presencial</option><option>Híbrida</option><option>Online</option><option>Intensiva</option></select></div>
          <div className="field"><label>Período académico</label><select name="periodId" required>{periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}</select></div>
          <div className="field"><label>Fecha de ingreso</label><input type="date" name="entryDate" required /></div>
          <div className="field"><label>Inicio de actividades</label><input type="date" name="activitiesStartDate" required /></div>
          <div className="field full"><label>Fecha prevista de cierre</label><input type="date" name="plannedCloseDate" required /></div>
          <div className="field full">
            <label>Jornadas / horarios</label>
            <div className="schedule-editor">
              {schedules.map((schedule, index) => (
                <div className="schedule-range" key={index}>
                  <strong>Jornada {index + 1}</strong>
                  <div className="field"><label>Desde</label><input type="time" required value={schedule.startTime} onChange={(event) => updateSchedule(index, "startTime", event.target.value)} /></div>
                  <div className="schedule-separator">a</div>
                  <div className="field"><label>Hasta</label><input type="time" required value={schedule.endTime} onChange={(event) => updateSchedule(index, "endTime", event.target.value)} /></div>
                  <button type="button" className="icon-button schedule-remove" aria-label={`Eliminar jornada ${index + 1}`} disabled={schedules.length === 1} onClick={() => removeSchedule(index)}><X size={15} /></button>
                </div>
              ))}
              <button type="button" className="secondary-button schedule-add" onClick={addSchedule}><Plus size={14} /> Agregar otra jornada</button>
            </div>
          </div>
          <div className="field"><label>Correo institucional</label><input name="email" type="email" placeholder="docente@institucion.edu.ec" /></div>
          <div className="field"><label>Código Teams</label><input name="teams" placeholder="Código del equipo" /></div>
          <div className="field full"><label>Enlace de Telegram</label><input name="telegram" type="url" placeholder="https://t.me/..." /></div>
          <div className="form-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button" disabled={!ready}><Plus size={14} /> Crear expediente</button></div>
        </form>
      </div>
    </div>
  );
}

function TeacherSummaryModal({ teacher, onClose }: { teacher: Teacher; onClose: () => void }) {
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="summary-title">
        <div className="modal-head"><div><h2 id="summary-title">{teacher.name}</h2><p className="subtitle">Ficha base del expediente</p></div><button className="icon-button" aria-label="Cerrar" onClick={onClose}><X size={17} /></button></div>
        <div className="modal-body form-grid">
          <Info label="Carrera" value={teacher.career} />
          <Info label="Asignatura(s)" value={teacher.subject} />
          <Info label="Modalidad" value={teacher.modality} />
          <Info label="Período" value={teacher.period} />
          <Info label="Fecha de ingreso" value={teacher.entryDate || "Sin registrar"} />
          <Info label="Inicio de actividades" value={teacher.activitiesStartDate || "Sin registrar"} />
          <Info label="Fecha prevista de cierre" value={teacher.plannedCloseDate || "Sin registrar"} />
          <Info label="Correo institucional" value={teacher.email || "Sin registrar"} />
          <div className="field full"><label>Jornadas</label><div className="schedule-editor">{teacher.scheduleRanges.length ? teacher.scheduleRanges.map((range, index) => <div key={range + index}><strong>Jornada {index + 1}:</strong> {range}</div>) : <span>Sin horarios registrados</span>}</div></div>
          <div className="field full"><label>Estado actual</label><div><span className={`badge ${statusClass(teacher.status)}`}>{teacher.status}</span> <span className="row-meta">{teacher.currentHito} · {teacher.progress}%</span></div></div>
          <div className="form-actions"><button className="primary-button" onClick={onClose}>Cerrar</button></div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="field"><label>{label}</label><div className="login-note" style={{ marginTop: 0 }}>{value}</div></div>;
}
