"use client";
/* eslint-disable @next/next/no-img-element */

import {
  Activity,
  ArrowLeftRight,
  ArrowRight,
  BarChart3,
  CalendarDays,
  ChevronRight,
  Clock3,
  FileText,
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
import AdminCareerManager from "./admin-career-manager";
import ExpedientWorkspace from "./expedient-workspace";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "./lib/supabase";
import { mergeDirectoryCareers, readDirectoryTeacher, writeDirectoryTeacher } from "./lib/teacher-directory";
import MonthlyAttendanceWorkspace from "./monthly-attendance-workspace";
import TeacherMasterModal from "./teacher-master-modal";
import TeacherRegistrationModal, { type TeacherRegistrationInput, type TeacherRegistrationPrefill } from "./teacher-registration-modal";

export type AccessMode = "landing" | "coordinator" | "admin";
type StaffRole = "coordinator" | "approver" | "admin";
type View = "dashboard" | "teachers" | "schedule" | "reports" | "documents" | "coordinators" | "assignments" | "settings";

export type CatalogOption = { id: string; name: string; program?: string };
type AcademicPeriod = { id: string; name: string; starts_on: string; ends_on: string; active: boolean };

export type StaffMember = {
  id: string;
  full_name: string;
  role: StaffRole;
  active: boolean;
  careerIds: string[];
};

export type Teacher = {
  id: string;
  teacherId: string;
  nationalId: string;
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
  resolvedCriteria: number;
  totalCriteria: number;
  compliance: number;
  status: "En acompañamiento" | "Con brechas" | "Pendiente de aprobación" | "Aprobado" | "Certificado";
  currentHito: string;
  criticalGaps: number;
  hitosExecuted: number;
};

type PendingTeacherAssignment = {
  id: string;
  teacherId: string;
  careerId: string;
  nationalId: string;
  name: string;
  email: string;
  entryDate: string;
  career: string;
  createdAt: string;
};

type CoordinatorInput = {
  id?: string;
  name: string;
  active: boolean;
};

type IndicatorRow = {
  expedient_id: string;
  phase: "areas" | "before" | "during" | "after";
  progress: number;
  operational_resolved: number;
  operational_total: number;
  operational_percent: number;
  critical_gaps: number;
};

const phaseName: Record<IndicatorRow["phase"], string> = {
  areas: "Áreas",
  before: "Antes",
  during: "Durante",
  after: "Después",
};

const coordinatorNav = [
  { label: "Panel general", view: "dashboard" as const, icon: LayoutDashboard },
  { label: "Docentes", view: "teachers" as const, icon: Users },
  { label: "Cronograma", view: "schedule" as const, icon: CalendarDays },
  { label: "Documentación", view: "documents" as const, icon: FileText },
  { label: "Reportes", view: "reports" as const, icon: BarChart3 },
];

const adminNav = [
  { label: "Panel general", view: "dashboard" as const, icon: LayoutDashboard },
  { label: "Coordinadores", view: "coordinators" as const, icon: UserCog },
  { label: "Asignación de carreras", view: "assignments" as const, icon: ArrowLeftRight },
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

function mapExpedient(row: Record<string, unknown>, metric?: IndicatorRow): Teacher {
  const teacher = relation(row.teachers);
  const career = relation(row.careers);
  const period = relation(row.academic_periods);
  const hitos = Array.isArray(row.hito_schedules) ? (row.hito_schedules as Record<string, unknown>[]) : [];
  const executed = hitos.filter((item) => Boolean(item.executed_on));
  const ranges = Array.isArray(row.expedient_schedules)
    ? [...(row.expedient_schedules as Record<string, unknown>[])].sort((a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0))
    : [];
  const status = mapStatus(String(row.status ?? "draft"));
  const resolvedCriteria = Number(metric?.operational_resolved ?? 0);
  const totalCriteria = Number(metric?.operational_total ?? 0);
  const progress = status === "Certificado"
    ? 100
    : Number(metric?.progress ?? (executed.length ? Math.round((executed.length / 6) * 100) : 0));
  const compliance = Number(metric?.operational_percent ?? 0);
  const currentStage = status === "Certificado"
    ? "Proceso finalizado"
    : metric
      ? `${phaseName[metric.phase]} · ${resolvedCriteria}/${totalCriteria}`
      : "Áreas · pendiente";

  return {
    id: String(row.id),
    teacherId: String(teacher?.id ?? ""),
    nationalId: String(teacher?.national_id ?? ""),
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
    resolvedCriteria,
    totalCriteria,
    compliance,
    status,
    currentHito: currentStage,
    criticalGaps: Number(metric?.critical_gaps ?? row.critical_gaps ?? 0),
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
  const [activeCriteriaCount, setActiveCriteriaCount] = useState(0);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [pendingAssignments, setPendingAssignments] = useState<PendingTeacherAssignment[]>([]);
  const [pendingTeacherToComplete, setPendingTeacherToComplete] = useState<PendingTeacherAssignment | null>(null);
  const [selectedCoordinatorId, setSelectedCoordinatorId] = useState("");
  const [assignmentCoordinatorId, setAssignmentCoordinatorId] = useState("");
  const [loading, setLoading] = useState(accessMode !== "landing" && configured);
  const [schemaIssue, setSchemaIssue] = useState("");
  const [toast, setToast] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [showCoordinatorModal, setShowCoordinatorModal] = useState(false);
  const [editingCoordinator, setEditingCoordinator] = useState<StaffMember | null>(null);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [editingTeacherMaster, setEditingTeacherMaster] = useState<Teacher | null>(null);

  const coordinators = useMemo(() => staff.filter((item) => item.role === "coordinator"), [staff]);
  const selectedCoordinator = useMemo(
    () => staff.find((item) => item.id === selectedCoordinatorId && item.role === "coordinator") ?? null,
    [selectedCoordinatorId, staff],
  );
  const assignedCareers = useMemo(() => {
    if (accessMode === "admin") return careers;
    if (!selectedCoordinator) return [];
    return careers.filter((career) => selectedCoordinator.careerIds.includes(career.id));
  }, [accessMode, careers, selectedCoordinator]);
  const activePeriods = useMemo(() => periods.filter((period) => period.active), [periods]);

  const loadBaseData = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setLoading(true);
    setSchemaIssue("");

    const [staffResult, careerResult, periodResult, criterionResult] = await Promise.all([
      supabase.from("siacd_staff").select("id, full_name, role, active, siacd_staff_careers(career_id)").order("full_name"),
      supabase.from("careers").select("id, name, program").eq("active", true).order("name"),
      supabase.from("academic_periods").select("id, name, starts_on, ends_on, active").order("starts_on", { ascending: false }),
      supabase.from("competency_definitions").select("id", { count: "exact", head: true }).eq("active", true),
    ]);

    if (staffResult.error) {
      const message = /does not exist|schema cache|relation/i.test(staffResult.error.message)
        ? "Falta aplicar la migración 202608180001_block1_access_and_staff.sql en Supabase."
        : `No se pudo cargar el personal SIACD: ${staffResult.error.message}`;
      setSchemaIssue(message);
      setLoading(false);
      return;
    }
    if (careerResult.error || periodResult.error || criterionResult.error) {
      setSchemaIssue(`No se pudieron cargar los catálogos: ${careerResult.error?.message ?? periodResult.error?.message ?? criterionResult.error?.message}`);
      setLoading(false);
      return;
    }

    setStaff(((staffResult.data ?? []) as Record<string, unknown>[]).map(mapStaff));
    setCareers((careerResult.data ?? []) as CatalogOption[]);
    setPeriods((periodResult.data ?? []) as AcademicPeriod[]);
    setActiveCriteriaCount(criterionResult.count ?? 0);
    setLoading(false);
  }, []);

  const refreshPeriods = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return [] as AcademicPeriod[];
    const { data, error } = await supabase
      .from("academic_periods")
      .select("id, name, starts_on, ends_on, active")
      .order("starts_on", { ascending: false });
    if (error) {
      setToast(`No se pudieron actualizar los períodos académicos: ${error.message}`);
      return [] as AcademicPeriod[];
    }
    const rows = (data ?? []) as AcademicPeriod[];
    setPeriods(rows);
    return rows;
  }, []);

  const loadExpedients = useCallback(async (coordinatorId?: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let query = supabase
      .from("expedients")
      .select("id, coordinator_staff_id, status, subject_names, modality, activities_start_on, planned_close_on, critical_gaps, teachers(id, national_id, full_name, institutional_email, started_institution_on), careers(id, name, program), academic_periods(name), hito_schedules(hito_id, scheduled_on, executed_on, coordinator_validated), expedient_schedules(sequence, start_time, end_time)")
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
      if (/national_id|schema cache|does not exist/i.test(error.message)) {
        setSchemaIssue("Falta aplicar la migración 202608190001_teacher_directory.sql en Supabase.");
        return;
      }
      setToast(`No se pudieron cargar los expedientes: ${error.message}`);
      return;
    }
    const { data: indicatorData, error: indicatorError } = await supabase.rpc("staff_indicator_dashboard", {
      p_staff_id: accessMode === "coordinator" ? coordinatorId ?? null : null,
    });
    if (indicatorError) {
      setToast(`No se pudieron sincronizar los indicadores: ${indicatorError.message}`);
    }
    const indicatorRows = (!indicatorError && indicatorData && typeof indicatorData === "object"
      ? ((indicatorData as { rows?: IndicatorRow[] }).rows ?? [])
      : []) as IndicatorRow[];
    const indicatorMap = new Map(indicatorRows.map((item) => [item.expedient_id, item]));
    setTeachers(((data ?? []) as Record<string, unknown>[]).map((row) => mapExpedient(row, indicatorMap.get(String(row.id)))));
  }, [accessMode]);

  const loadPendingAssignments = useCallback(async (coordinatorId?: string) => {
    if (!coordinatorId) {
      setPendingAssignments([]);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const { data, error } = await supabase
      .from("teacher_onboarding_assignments")
      .select("id, teacher_id, career_id, created_at, teachers(national_id, full_name, institutional_email, started_institution_on), careers(name, program)")
      .eq("coordinator_staff_id", coordinatorId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      if (/teacher_onboarding_assignments|schema cache|does not exist/i.test(error.message)) {
        setToast("Falta aplicar la migración 20260831100000_teacher_onboarding_career_assignment.sql.");
        return;
      }
      setToast(`No se pudieron cargar los docentes preasignados: ${error.message}`);
      return;
    }

    setPendingAssignments(((data ?? []) as Record<string, unknown>[]).map((row) => {
      const teacher = relation(row.teachers);
      return {
        id: String(row.id),
        teacherId: String(row.teacher_id ?? ""),
        careerId: String(row.career_id ?? ""),
        nationalId: String(teacher?.national_id ?? ""),
        name: String(teacher?.full_name ?? "Sin nombre"),
        email: String(teacher?.institutional_email ?? ""),
        entryDate: String(teacher?.started_institution_on ?? ""),
        career: relationName(row.careers),
        createdAt: String(row.created_at ?? ""),
      };
    }));
  }, []);

  useEffect(() => {
    if (accessMode !== "landing" && configured) void loadBaseData();
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
      setPendingAssignments([]);
      void loadExpedients();
      return;
    }
    if (accessMode === "coordinator" && selectedCoordinatorId) {
      void loadExpedients(selectedCoordinatorId);
      void loadPendingAssignments(selectedCoordinatorId);
    }
  }, [accessMode, loadExpedients, loadPendingAssignments, selectedCoordinatorId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
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
    setPendingAssignments([]);
    setPendingTeacherToComplete(null);
    if (typeof window !== "undefined") window.sessionStorage.removeItem("siacd-coordinator-id");
  }

  async function openNewTeacher() {
    await refreshPeriods();
    setPendingTeacherToComplete(null);
    setShowTeacherModal(true);
  }

  async function completePendingTeacher(assignment: PendingTeacherAssignment) {
    await refreshPeriods();
    setPendingTeacherToComplete(assignment);
    setShowTeacherModal(true);
  }

  function openCareerAssignments(coordinator?: StaffMember) {
    if (coordinator) setAssignmentCoordinatorId(coordinator.id);
    setView("assignments");
    setMobileOpen(false);
  }

  async function saveCoordinator(input: CoordinatorInput) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let staffId = input.id;
    const creating = !staffId;

    if (staffId) {
      const { error } = await supabase
        .from("siacd_staff")
        .update({ full_name: input.name, active: input.active, updated_at: new Date().toISOString() })
        .eq("id", staffId);
      if (error) return setToast(`No se pudo actualizar: ${error.message}`);
    } else {
      const { data, error } = await supabase
        .from("siacd_staff")
        .insert({ full_name: input.name, role: "coordinator", active: input.active })
        .select("id")
        .single();
      if (error || !data) return setToast(`No se pudo crear: ${error?.message ?? "error de base de datos"}`);
      staffId = String(data.id);
    }

    setShowCoordinatorModal(false);
    setEditingCoordinator(null);
    await loadBaseData();

    if (creating && staffId) {
      setAssignmentCoordinatorId(staffId);
      setView("assignments");
      setToast("Coordinador creado. Ahora asigne sus carreras.");
    } else {
      setToast("Coordinador actualizado");
    }
  }

  async function toggleCoordinator(coordinator: StaffMember) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error } = await supabase
      .from("siacd_staff")
      .update({ active: !coordinator.active, updated_at: new Date().toISOString() })
      .eq("id", coordinator.id);
    if (error) return setToast(`No se pudo cambiar el estado: ${error.message}`);
    setToast(coordinator.active ? "Coordinador desactivado" : "Coordinador activado");
    await loadBaseData();
  }

  async function saveTeacher(input: TeacherRegistrationInput) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !selectedCoordinator) return setToast("Seleccione un coordinador antes de registrar docentes");
    if (!selectedCoordinator.careerIds.includes(input.careerId)) {
      return setToast("La carrera seleccionada no está asignada a este coordinador");
    }
    const selectedCareer = assignedCareers.find((career) => career.id === input.careerId);
    if (!selectedCareer) return setToast("No se encontró la carrera seleccionada");

    const { data: selectedPeriod, error: periodError } = await supabase
      .from("academic_periods")
      .select("id, name, starts_on, ends_on, active")
      .eq("id", input.periodId)
      .eq("active", true)
      .maybeSingle();
    if (periodError) return setToast(`No se pudo validar el período académico: ${periodError.message}`);
    if (!selectedPeriod) return setToast("El período académico seleccionado ya no está activo. Vuelva a abrir el formulario.");
    if (
      input.activitiesStartDate < String(selectedPeriod.starts_on)
      || input.activitiesStartDate > String(selectedPeriod.ends_on)
    ) {
      return setToast(`La fecha de inicio de actividades debe estar dentro del período ${selectedPeriod.name}.`);
    }

    const now = new Date().toISOString();
    const existingResult = await supabase
      .from("teachers")
      .select("id")
      .eq("national_id", input.nationalId)
      .maybeSingle();
    if (existingResult.error) return setToast(`No se pudo comprobar el docente: ${existingResult.error.message}`);

    let teacherId = existingResult.data?.id ? String(existingResult.data.id) : "";
    let createdTeacher = false;
    if (teacherId) {
      const { error } = await supabase
        .from("teachers")
        .update({
          full_name: input.name,
          institutional_email: input.email || null,
          started_institution_on: input.entryDate || null,
          updated_at: now,
        })
        .eq("id", teacherId);
      if (error) return setToast(`No se pudo actualizar el docente: ${error.message}`);
    } else {
      const { data, error } = await supabase
        .from("teachers")
        .insert({
          national_id: input.nationalId,
          full_name: input.name,
          institutional_email: input.email || null,
          started_institution_on: input.entryDate || null,
          created_by: null,
          updated_at: now,
        })
        .select("id")
        .single();
      if (error || !data) return setToast(`No se pudo registrar el docente: ${error?.message ?? "error de base de datos"}`);
      teacherId = String(data.id);
      createdTeacher = true;
    }

    const { data: expedient, error: expedientError } = await supabase
      .from("expedients")
      .insert({
        teacher_id: teacherId,
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
      })
      .select("id")
      .single();

    if (expedientError || !expedient) {
      if (createdTeacher) await supabase.from("teachers").delete().eq("id", teacherId);
      const duplicate = /duplicate|unique/i.test(expedientError?.message ?? "");
      return setToast(duplicate ? "Ese docente ya tiene un expediente para esta carrera y período." : `No se pudo crear el expediente: ${expedientError?.message ?? "error de base de datos"}`);
    }

    const { error: rangesError } = await supabase
      .from("expedient_schedules")
      .insert(input.schedules.map((schedule, index) => ({
        expedient_id: expedient.id,
        sequence: index + 1,
        start_time: schedule.startTime,
        end_time: schedule.endTime,
      })));
    if (rangesError) {
      await supabase.from("expedients").delete().eq("id", expedient.id);
      if (createdTeacher) await supabase.from("teachers").delete().eq("id", teacherId);
      return setToast(`No se pudieron guardar las jornadas: ${rangesError.message}`);
    }

    const { error: hitosError } = await supabase
      .from("hito_schedules")
      .insert(hitoIds.map((hitoId) => ({ expedient_id: expedient.id, hito_id: hitoId })));
    if (hitosError) {
      await supabase.from("expedients").delete().eq("id", expedient.id);
      if (createdTeacher) await supabase.from("teachers").delete().eq("id", teacherId);
      return setToast(`No se pudo crear la estructura técnica del expediente: ${hitosError.message}`);
    }

    let firebaseSynced = true;
    try {
      const existingDirectory = await readDirectoryTeacher(input.nationalId);
      await writeDirectoryTeacher({
        cedula: input.nationalId,
        nombresCompletos: input.name,
        carreras: mergeDirectoryCareers(existingDirectory?.carreras ?? [], input.directoryCareers, [selectedCareer.name]),
        actualizadoEn: now,
      });
    } catch {
      firebaseSynced = false;
    }

    const { error: assignmentCompleteError } = await supabase
      .from("teacher_onboarding_assignments")
      .update({
        status: "completed",
        completed_at: now,
        updated_at: now,
      })
      .eq("teacher_id", teacherId)
      .eq("career_id", input.careerId)
      .eq("coordinator_staff_id", selectedCoordinator.id)
      .eq("status", "pending");

    setShowTeacherModal(false);
    setPendingTeacherToComplete(null);
    if (assignmentCompleteError) {
      setToast("Expediente guardado, pero no se pudo cerrar la preasignación del docente.");
    } else {
      setToast(firebaseSynced
        ? "Docente, directorio y expediente guardados correctamente"
        : "Expediente creado. Firebase no pudo sincronizarse; los datos de SIACD quedaron guardados.");
    }
    await Promise.all([
      loadExpedients(selectedCoordinator.id),
      loadPendingAssignments(selectedCoordinator.id),
    ]);
  }

  if (accessMode === "landing") return <AccessLanding />;
  if (!configured) return <ConfigurationRequired />;
  if (loading && !staff.length && !schemaIssue) return <LoadingScreen />;
  if (schemaIssue) return <MigrationRequired message={schemaIssue} />;
  if (accessMode === "coordinator" && !selectedCoordinator) {
    return <CoordinatorPicker coordinators={coordinators.filter((item) => item.active)} onChoose={chooseCoordinator} />;
  }

  const navItems = accessMode === "admin" ? adminNav : coordinatorNav;
  const profileName = accessMode === "admin" ? "Administrador SIACD" : selectedCoordinator?.full_name ?? "Coordinador";

  return (
    <div className="siacd-shell">
      <div className="mobile-topbar"><strong>SIACD</strong><button className="icon-button" aria-label="Abrir menú" onClick={() => setMobileOpen(true)}><Menu size={18} /></button></div>
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <InstitutionBrand compact />
        <div className="nav-label">Gestión</div>
        <nav className="nav">
          {navItems.map((item) => (
            <button key={item.view} className={`nav-button ${view === item.view ? "active" : ""}`} onClick={() => {
              if (item.view === "assignments") openCareerAssignments();
              else setView(item.view);
              setMobileOpen(false);
            }}><item.icon />{item.label}</button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        {accessMode === "coordinator" && <button className="nav-button" onClick={changeCoordinator}><UserCog />Cambiar coordinador</button>}
        <div className="user-card"><div className="avatar">{initials(profileName)}</div><div><strong>{profileName}</strong><span>{accessMode === "admin" ? "Administrador general" : "Coordinador de Carrera"}</span></div></div>
      </aside>
      {mobileOpen && <button aria-label="Cerrar menú" className="mobile-scrim" onClick={() => setMobileOpen(false)} />}

      <main className="main">
        <Header accessMode={accessMode} view={view} onNewTeacher={openNewTeacher} coordinatorName={selectedCoordinator?.full_name} />
        {view === "dashboard" && accessMode === "coordinator" && pendingAssignments.length > 0 && <PendingTeacherNotice count={pendingAssignments.length} onOpen={() => setView("teachers")} />}
        {view === "dashboard" && <Dashboard teachers={teachers} accessMode={accessMode} coordinatorCount={coordinators.filter((item) => item.active).length} onViewTeachers={() => setView("teachers")} onOpenTeacher={setSelectedTeacher} />}
        {view === "teachers" && accessMode === "coordinator" && <PendingTeachersPanel assignments={pendingAssignments} onComplete={completePendingTeacher} />}
        {view === "teachers" && <TeachersPanel teachers={teachers} careers={accessMode === "coordinator" ? assignedCareers : careers} canCreate={accessMode === "coordinator"} onNew={openNewTeacher} onOpen={setSelectedTeacher} onEditMaster={setEditingTeacherMaster} />}
        {view === "schedule" && <ScheduleOverview teachers={teachers} onOpen={setSelectedTeacher} />}
        {view === "reports" && <Reports teachers={teachers} />}
        {view === "documents" && accessMode === "coordinator" && selectedCoordinator && <MonthlyAttendanceWorkspace
          careers={assignedCareers}
          teachers={teachers}
          coordinatorId={selectedCoordinator.id}
          coordinatorName={selectedCoordinator.full_name}
        />}
        {view === "coordinators" && accessMode === "admin" && <CoordinatorsPanel coordinators={coordinators} onNew={() => { setEditingCoordinator(null); setShowCoordinatorModal(true); }} onEdit={(coordinator) => { setEditingCoordinator(coordinator); setShowCoordinatorModal(true); }} onManage={openCareerAssignments} onToggle={toggleCoordinator} />}
        {view === "assignments" && accessMode === "admin" && <AdminCareerManager coordinators={coordinators} careers={careers} selectedStaffId={assignmentCoordinatorId} onSelectStaff={setAssignmentCoordinatorId} onChanged={loadBaseData} />}
        {view === "settings" && accessMode === "admin" && <CatalogSummary careers={careers} periods={periods} staff={staff} criteriaCount={activeCriteriaCount} onPeriodsChanged={loadBaseData} />}
      </main>

      {showTeacherModal && selectedCoordinator && <TeacherRegistrationModal
        careers={pendingTeacherToComplete ? assignedCareers.filter((career) => career.id === pendingTeacherToComplete.careerId) : assignedCareers}
        periods={activePeriods.map((period) => ({
          id: period.id,
          name: period.name,
          startsOn: period.starts_on,
          endsOn: period.ends_on,
        }))}
        coordinatorName={selectedCoordinator.full_name}
        initialTeacher={pendingTeacherToComplete ? {
          nationalId: pendingTeacherToComplete.nationalId,
          name: pendingTeacherToComplete.name,
          email: pendingTeacherToComplete.email,
          entryDate: pendingTeacherToComplete.entryDate,
          careerId: pendingTeacherToComplete.careerId,
          careerName: pendingTeacherToComplete.career,
        } satisfies TeacherRegistrationPrefill : null}
        onClose={() => { setShowTeacherModal(false); setPendingTeacherToComplete(null); }}
        onSave={saveTeacher}
      />}
      {showCoordinatorModal && accessMode === "admin" && <CoordinatorModal coordinator={editingCoordinator} onClose={() => { setShowCoordinatorModal(false); setEditingCoordinator(null); }} onSave={saveCoordinator} />}
      {editingTeacherMaster && <TeacherMasterModal teacher={{ teacherId: editingTeacherMaster.teacherId, nationalId: editingTeacherMaster.nationalId, name: editingTeacherMaster.name, email: editingTeacherMaster.email, entryDate: editingTeacherMaster.entryDate }} careers={accessMode === "admin" ? careers : assignedCareers} onClose={() => setEditingTeacherMaster(null)} onChanged={async () => { await loadExpedients(accessMode === "coordinator" ? selectedCoordinatorId : undefined); }} />}
      {selectedTeacher && <ExpedientWorkspace teacher={selectedTeacher} accessMode={accessMode} coordinatorName={staff.find((item) => item.id === selectedTeacher.coordinatorId)?.full_name ?? selectedCoordinator?.full_name ?? "Coordinador"} onClose={() => setSelectedTeacher(null)} onChanged={async () => { await loadExpedients(accessMode === "coordinator" ? selectedCoordinatorId : undefined); }} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function InstitutionBrand({ compact = false }: { compact?: boolean }) {
  return <div className={`institution-brand ${compact ? "compact" : ""}`}><img src={`${import.meta.env.BASE_URL}logo-itsqmet.png`} alt="Instituto Tecnológico Superior Quito Metropolitano" /><span>SIACD · Acompañamiento Docente</span></div>;
}

function AccessLanding() {
  return <div className="login-page"><section className="login-art"><InstitutionBrand /><div><p className="eyebrow">ITSQMET · Sistema institucional</p><h1>Gestión del acompañamiento docente</h1><p>Una sola base institucional, con acceso separado para Coordinadores y Administrador.</p></div><p>Proceso CGC-PRO-121 · Uso institucional</p></section><section className="login-form-wrap"><div className="login-form"><h2>Seleccione su acceso</h2><p>Ingrese por el enlace correspondiente a su función.</p><a className="primary-button" href="./coordinador/" style={{ justifyContent: "center", textDecoration: "none" }}><Users size={15} />Acceso Coordinadores</a><a className="secondary-button" href="./administrador/" style={{ justifyContent: "center", textDecoration: "none", width: "100%", marginTop: 10 }}><ShieldCheck size={15} />Acceso Administrador</a></div></section></div>;
}

function CoordinatorPicker({ coordinators, onChoose }: { coordinators: StaffMember[]; onChoose: (id: string) => void }) {
  const [value, setValue] = useState(coordinators[0]?.id ?? "");
  useEffect(() => { if (!value && coordinators[0]) setValue(coordinators[0].id); }, [coordinators, value]);
  return <div className="login-page"><section className="login-art"><InstitutionBrand /><div><p className="eyebrow">Acceso de coordinadores</p><h1>Seleccione su nombre</h1><p>La app mostrará únicamente las carreras y docentes asignados a ese coordinador.</p></div><p>Acceso directo · Sin login</p></section><section className="login-form-wrap"><div className="login-form"><h2>Coordinador de Carrera</h2>{coordinators.length ? <><div className="field"><label>Nombre</label><select value={value} onChange={(event) => setValue(event.target.value)}>{coordinators.map((coordinator) => <option key={coordinator.id} value={coordinator.id}>{coordinator.full_name}</option>)}</select></div><button className="primary-button" style={{ width: "100%", justifyContent: "center" }} onClick={() => value && onChoose(value)}>Ingresar <ArrowRight size={15} /></button></> : <div className="error-note">No existen coordinadores activos. Deben crearse desde Administrador.</div>}<a className="text-link" href="../" style={{ display: "inline-block", marginTop: 16 }}>Volver al inicio</a></div></section></div>;
}

function ConfigurationRequired() {
  return <div className="login-page"><section className="login-art"><InstitutionBrand /><div><p className="eyebrow">ITSQMET</p><h1>Conexión requerida</h1><p>Configure las variables públicas de Supabase.</p></div></section><section className="login-form-wrap"><div className="login-form"><h2>Configuración pendiente</h2><div className="error-note">No se encontraron VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY.</div></div></section></div>;
}

function MigrationRequired({ message }: { message: string }) {
  return <div className="login-page"><section className="login-art"><InstitutionBrand /><div><p className="eyebrow">Base de datos</p><h1>Actualización pendiente</h1><p>Revise la conexión o las migraciones del sistema.</p></div></section><section className="login-form-wrap"><div className="login-form"><h2>No se pudo iniciar SIACD</h2><div className="error-note">{message}</div></div></section></div>;
}

function LoadingScreen() { return <div className="login-form-wrap">Preparando SIACD…</div>; }

function Header({ accessMode, view, onNewTeacher, coordinatorName }: { accessMode: AccessMode; view: View; onNewTeacher: () => void; coordinatorName?: string }) {
  const titles: Record<View, [string, string]> = {
    dashboard: ["Panel de acompañamiento", accessMode === "admin" ? "Vista institucional completa" : `Gestión de ${coordinatorName ?? "coordinación"}`],
    teachers: ["Docentes y expedientes", "Busque por cédula, docente, carrera o asignatura"],
    schedule: ["Cronograma institucional", "Estado general de Áreas, Antes, Durante y Después"],
    reports: ["Estadísticas y reportes", "Indicadores de avance y brechas"],
    documents: ["Documentación institucional", "Informes por docente y registro mensual de asistencia a la inducción"],
    coordinators: ["Coordinadores", "Cree coordinadores y gestione posteriormente sus carreras"],
    assignments: ["Asignación de carreras", "Distribuya las carreras institucionales entre los coordinadores"],
    settings: ["Catálogos", "Resumen de carreras, períodos y personal"],
  };
  return <header className="topline"><div><div className="eyebrow">Sistema Integral de Acompañamiento</div><h1>{titles[view][0]}</h1><p className="subtitle">{titles[view][1]}</p></div><div className="top-actions">{accessMode === "coordinator" && <button className="primary-button" onClick={onNewTeacher}><Plus size={15} />Nuevo docente</button>}</div></header>;
}

function PendingTeacherNotice({ count, onOpen }: { count: number; onOpen: () => void }) {
  return <section className="section-card"><div className="panel-head"><div><h3>Docentes pendientes de completar expediente</h3><p>{count} docente{count === 1 ? "" : "s"} seleccionó su carrera y quedó anexado a esta coordinación.</p></div><button className="secondary-button" onClick={onOpen}>Revisar pendientes</button></div></section>;
}

function PendingTeachersPanel({ assignments, onComplete }: { assignments: PendingTeacherAssignment[]; onComplete: (assignment: PendingTeacherAssignment) => void }) {
  if (!assignments.length) return null;
  return <section className="section-card"><div className="panel-head"><div><h3>Preasignados desde el portal docente</h3><p>La carrera elegida por el docente determinó automáticamente esta coordinación. Complete los datos administrativos para crear el expediente.</p></div><span className="badge gold">{assignments.length} pendiente{assignments.length === 1 ? "" : "s"}</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Cédula</th><th>Docente</th><th>Carrera</th><th>Registro</th><th>Acción</th></tr></thead><tbody>{assignments.map((assignment) => <tr key={assignment.id}><td className="teacher-id-cell">{assignment.nationalId || "Pendiente"}</td><td><strong>{assignment.name}</strong><span className="row-meta">{assignment.email || "Sin correo"}</span></td><td>{assignment.career}</td><td>{assignment.createdAt ? new Date(assignment.createdAt).toLocaleDateString("es-EC") : "—"}</td><td><button className="primary-button" onClick={() => onComplete(assignment)}>Completar expediente <ChevronRight size={13} /></button></td></tr>)}</tbody></table></div></section>;
}

function Dashboard({ teachers, accessMode, coordinatorCount, onViewTeachers, onOpenTeacher }: { teachers: Teacher[]; accessMode: AccessMode; coordinatorCount: number; onViewTeachers: () => void; onOpenTeacher: (teacher: Teacher) => void }) {
  const active = teachers.filter((teacher) => teacher.status !== "Certificado").length;
  const certified = teachers.filter((teacher) => teacher.status === "Certificado").length;
  const gaps = teachers.reduce((sum, teacher) => sum + teacher.criticalGaps, 0);
  const average = teachers.length ? Math.round(teachers.reduce((sum, teacher) => sum + teacher.progress, 0) / teachers.length) : 0;
  return <><div className="hero-grid"><section className="hero-card"><div className="eyebrow">Información institucional</div><h2>{teachers.length ? `${teachers.length} expediente${teachers.length === 1 ? "" : "s"} visible${teachers.length === 1 ? "" : "s"}` : "Listo para iniciar"}</h2><p>Abra un docente para trabajar Áreas, Antes, Durante, Después, evidencias, informes e historial.</p><div className="hero-progress"><div className="progress-track"><div className="progress-fill" style={{ width: `${average}%` }} /></div><strong>{average}% de avance promedio</strong></div></section><aside className="approval-card"><div className="round-icon"><FolderOpen size={20} /></div><h3>Expediente completo</h3><p>El expediente concentra el trabajo operativo y documental de cada docente.</p>{teachers[0] && <button className="secondary-button" onClick={() => onOpenTeacher(teachers[0])}>Abrir reciente <ChevronRight size={14} /></button>}</aside></div><div className="metric-grid"><Metric icon={Users} label="Docentes activos" value={String(active)} note="Procesos en curso" /><Metric icon={Activity} label="Brechas críticas" value={String(gaps)} note="Puntajes críticos menores a 3" tone="red" /><Metric icon={Clock3} label="Avance promedio" value={`${average}%`} note="Criterios activos resueltos" tone="gold" /><Metric icon={accessMode === "admin" ? UserCog : ShieldCheck} label={accessMode === "admin" ? "Coordinadores" : "Certificados"} value={String(accessMode === "admin" ? coordinatorCount : certified)} note={accessMode === "admin" ? "Activos" : "Procesos finalizados"} tone="blue" /></div><section className="panel"><div className="panel-head"><div><h3>Expedientes recientes</h3><p>Abra uno para continuar el acompañamiento</p></div><button className="text-link" onClick={onViewTeachers}>Ver todos</button></div><div className="teacher-list">{teachers.length ? teachers.slice(0, 5).map((teacher) => <TeacherRow key={teacher.id} teacher={teacher} onOpen={onOpenTeacher} />) : <div className="empty-state"><h3>Sin expedientes</h3><p>No existen docentes registrados para esta vista.</p></div>}</div></section></>;
}

function Metric({ icon: Icon, label, value, note, tone = "" }: { icon: typeof Users; label: string; value: string; note: string; tone?: string }) {
  return <article className="metric-card"><div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon size={15} /></span></div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></article>;
}

function TeacherRow({ teacher, onOpen }: { teacher: Teacher; onOpen: (teacher: Teacher) => void }) {
  return <div className="teacher-row"><div className="teacher"><div className="teacher-avatar">{initials(teacher.name)}</div><div><strong>{teacher.name}</strong><span>{teacher.career}</span><span className="teacher-id-inline">{teacher.nationalId || "Sin cédula vinculada"}</span></div></div><div className="row-meta"><span className={`badge ${statusClass(teacher.status)}`}>{teacher.status}</span><span>{teacher.currentHito}</span></div><div className="progress-cell"><span className="row-meta">{teacher.progress}% completado</span><div className="mini-progress"><span style={{ width: `${teacher.progress}%` }} /></div></div><button className="row-action" aria-label={`Abrir ${teacher.name}`} onClick={() => onOpen(teacher)}><ChevronRight size={15} /></button></div>;
}

function TeachersPanel({ teachers, careers, canCreate, onNew, onOpen, onEditMaster }: { teachers: Teacher[]; careers: CatalogOption[]; canCreate: boolean; onNew: () => void; onOpen: (teacher: Teacher) => void; onEditMaster: (teacher: Teacher) => void }) {
  const [query, setQuery] = useState("");
  const [career, setCareer] = useState("");
  const [period, setPeriod] = useState("");
  const periods = [...new Set(teachers.map((teacher) => teacher.period))];
  const filtered = useMemo(() => teachers.filter((teacher) => {
    const matches = `${teacher.nationalId} ${teacher.name} ${teacher.career} ${teacher.subject}`.toLowerCase().includes(query.toLowerCase());
    return matches && (!career || teacher.careerId === career) && (!period || teacher.period === period);
  }), [teachers, query, career, period]);

  return <section className="section-card"><div className="toolbar"><div className="search"><Search size={15} /><input placeholder="Buscar cédula, docente, carrera o asignatura" value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="filters"><select className="select" value={career} onChange={(event) => setCareer(event.target.value)}><option value="">Todas las carreras</option>{careers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select className="select" value={period} onChange={(event) => setPeriod(event.target.value)}><option value="">Todos los períodos</option>{periods.map((item) => <option key={item}>{item}</option>)}</select>{canCreate && <button className="primary-button" onClick={onNew}><Plus size={14} />Registrar docente</button>}</div></div>{filtered.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Cédula</th><th>Docente</th><th>Carrera / asignatura</th><th>Período</th><th>Etapa</th><th>Avance</th><th>Brechas</th><th>Acciones</th></tr></thead><tbody>{filtered.map((teacher) => <tr key={teacher.id}><td className="teacher-id-cell">{teacher.nationalId || "Pendiente"}</td><td><strong>{teacher.name}</strong><span className="row-meta">{teacher.email || "Sin correo"}</span></td><td>{teacher.career}<span className="row-meta">{teacher.subject}</span></td><td>{teacher.period}</td><td>{teacher.currentHito}</td><td>{teacher.progress}%</td><td><span className={`badge ${teacher.criticalGaps ? "red" : "green"}`}>{teacher.criticalGaps}</span></td><td><div className="filters"><button className="ghost-button" onClick={() => onEditMaster(teacher)}>Datos</button><button className="secondary-button" onClick={() => onOpen(teacher)}>Expediente <ChevronRight size={13} /></button></div></td></tr>)}</tbody></table></div> : <div className="empty-state"><h3>Sin resultados</h3><p>No hay docentes con esos filtros.</p></div>}</section>;
}

function ScheduleOverview({ teachers, onOpen }: { teachers: Teacher[]; onOpen: (teacher: Teacher) => void }) {
  return <section className="section-card"><div className="panel-head"><div><h3>Avance por etapa</h3><p>Áreas, Antes, Durante y Después se actualizan con los criterios activos del expediente.</p></div></div>{teachers.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Cédula</th><th>Docente</th><th>Carrera</th><th>Etapa actual</th><th>Criterios resueltos</th><th>Avance</th><th></th></tr></thead><tbody>{teachers.map((teacher) => <tr key={teacher.id}><td className="teacher-id-cell">{teacher.nationalId || "Pendiente"}</td><td><strong>{teacher.name}</strong></td><td>{teacher.career}</td><td>{teacher.currentHito}</td><td>{teacher.resolvedCriteria}/{teacher.totalCriteria}</td><td>{teacher.progress}%</td><td><button className="secondary-button" onClick={() => onOpen(teacher)}>Abrir</button></td></tr>)}</tbody></table></div> : <div className="empty-state"><p>No existen expedientes.</p></div>}</section>;
}

function Reports({ teachers }: { teachers: Teacher[] }) {
  const certified = teachers.filter((teacher) => teacher.status === "Certificado").length;
  const gaps = teachers.reduce((sum, teacher) => sum + teacher.criticalGaps, 0);
  const average = teachers.length ? Math.round(teachers.reduce((sum, teacher) => sum + teacher.progress, 0) / teachers.length) : 0;
  return <><div className="metric-grid"><Metric icon={Users} label="Docentes" value={String(teachers.length)} note="Expedientes visibles" /><Metric icon={Clock3} label="Avance" value={`${average}%`} note="Promedio de criterios resueltos" tone="gold" /><Metric icon={Activity} label="Brechas críticas" value={String(gaps)} note="Criterios evaluados < 3" tone="red" /><Metric icon={ShieldCheck} label="Certificados" value={String(certified)} note="Procesos finalizados" tone="blue" /></div><section className="section-card"><div className="panel-head"><div><h3>Avance por docente</h3><p>Información del expediente</p></div></div>{teachers.map((teacher) => <div className="teacher-row" key={teacher.id}><strong>{teacher.name}</strong><span className="row-meta">{teacher.nationalId || "Sin cédula"} · {teacher.currentHito}</span><div className="progress-cell"><div className="mini-progress"><span style={{ width: `${teacher.progress}%` }} /></div></div><span className={`badge ${statusClass(teacher.status)}`}>{teacher.progress}%</span></div>)}</section></>;
}

function CoordinatorsPanel({ coordinators, onNew, onEdit, onManage, onToggle }: { coordinators: StaffMember[]; onNew: () => void; onEdit: (coordinator: StaffMember) => void; onManage: (coordinator: StaffMember) => void; onToggle: (coordinator: StaffMember) => void }) {
  return <section className="section-card"><div className="toolbar"><div><h3>Coordinadores</h3><p className="subtitle">Cree coordinadores y gestione posteriormente las carreras asignadas a cada uno.</p></div><button className="primary-button" onClick={onNew}><Plus size={14} />Nuevo coordinador</button></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Coordinador</th><th>Carreras asignadas</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{coordinators.map((coordinator) => <tr key={coordinator.id}><td><strong>{coordinator.full_name}</strong></td><td><strong>{coordinator.careerIds.length ? `${coordinator.careerIds.length} carrera${coordinator.careerIds.length === 1 ? "" : "s"}` : "Sin carreras"}</strong><span className="row-meta">{coordinator.careerIds.length ? "Asignadas en el módulo de carreras" : "Requiere asignación"}</span></td><td><span className={`badge ${coordinator.active ? "green" : "gray"}`}>{coordinator.active ? "Activo" : "Inactivo"}</span></td><td><div className="filters"><button className="secondary-button" onClick={() => onManage(coordinator)}>{coordinator.careerIds.length ? "Carreras" : "Asignar carreras"}</button><button className="secondary-button" onClick={() => onEdit(coordinator)}>Editar</button><button className="ghost-button" onClick={() => onToggle(coordinator)}>{coordinator.active ? "Desactivar" : "Activar"}</button></div></td></tr>)}</tbody></table></div>{!coordinators.length && <div className="empty-state"><h3>Sin coordinadores</h3><p>Cree el primer coordinador para iniciar la distribución de carreras.</p></div>}</section>;
}

function CatalogSummary({ careers, periods, staff, criteriaCount, onPeriodsChanged }: { careers: CatalogOption[]; periods: AcademicPeriod[]; staff: StaffMember[]; criteriaCount: number; onPeriodsChanged: () => Promise<void> | void }) {
  const active = periods.filter((period) => period.active);
  return <>
    <div className="metric-grid"><Metric icon={Settings} label="Carreras activas" value={String(careers.length)} note="Catálogo institucional" /><Metric icon={CalendarDays} label="Períodos activos" value={String(active.length)} note={active[0]?.name ?? "Sin períodos"} tone="gold" /><Metric icon={UserCog} label="Coordinadores" value={String(staff.filter((item) => item.role === "coordinator" && item.active).length)} note="Activos" tone="blue" /><Metric icon={FolderOpen} label="Criterios activos" value={String(criteriaCount)} note="Áreas · Antes · Durante · Después" tone="red" /></div>
    <AcademicPeriodsManager periods={periods} onChanged={onPeriodsChanged} />
  </>;
}

function AcademicPeriodsManager({ periods, onChanged }: { periods: AcademicPeriod[]; onChanged: () => Promise<void> | void }) {
  const [editing, setEditing] = useState<AcademicPeriod | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [usage, setUsage] = useState<Record<string, number>>({});

  const loadUsage = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data, error } = await supabase.from("expedients").select("period_id");
    if (error) return;
    const counts: Record<string, number> = {};
    for (const row of (data ?? []) as Array<{ period_id?: string | null }>) {
      const id = String(row.period_id ?? "");
      if (id) counts[id] = (counts[id] ?? 0) + 1;
    }
    setUsage(counts);
  }, []);

  useEffect(() => { void loadUsage(); }, [loadUsage, periods]);

  function startCreate() {
    setEditing(null);
    setCreating(true);
    setName("");
    setStartsOn("");
    setEndsOn("");
    setActive(true);
    setMessage("");
  }

  function startEdit(period: AcademicPeriod) {
    setEditing(period);
    setCreating(false);
    setName(period.name);
    setStartsOn(period.starts_on);
    setEndsOn(period.ends_on);
    setActive(period.active);
    setMessage("");
  }

  function cancelEdit() {
    setEditing(null);
    setCreating(false);
    setMessage("");
  }

  async function savePeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase || saving) return;
    if (!name.trim() || !startsOn || !endsOn) return setMessage("Complete el nombre y las dos fechas.");
    if (endsOn < startsOn) return setMessage("La fecha final no puede ser anterior a la fecha inicial.");

    setSaving(true);
    setMessage("");
    const used = editing ? (usage[editing.id] ?? 0) > 0 : false;
    const payload = used
      ? { active }
      : { name: name.trim(), starts_on: startsOn, ends_on: endsOn, active };

    const result = editing
      ? await supabase.from("academic_periods").update(payload).eq("id", editing.id)
      : await supabase.from("academic_periods").insert(payload);

    setSaving(false);
    if (result.error) {
      const duplicate = /duplicate|unique/i.test(result.error.message);
      setMessage(duplicate ? "Ya existe un período con ese nombre." : `No se pudo guardar el período: ${result.error.message}`);
      return;
    }

    cancelEdit();
    await onChanged();
    await loadUsage();
  }

  async function togglePeriod(period: AcademicPeriod) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { error } = await supabase
      .from("academic_periods")
      .update({ active: !period.active })
      .eq("id", period.id);
    if (error) {
      setMessage(`No se pudo cambiar el estado del período: ${error.message}`);
      return;
    }
    setMessage(period.active ? "Período desactivado. Se conserva en los expedientes históricos." : "Período activado.");
    await onChanged();
  }

  return <section className="section-card">
    <div className="toolbar">
      <div><h3>Períodos académicos</h3><p className="subtitle">El administrador define los períodos disponibles para coordinadores y docentes. Los períodos usados se conservan para el historial.</p></div>
      <button className="primary-button" onClick={startCreate}><Plus size={14} />Nuevo período</button>
    </div>

    {(creating || editing) && <form className="form-grid" onSubmit={savePeriod} style={{ marginBottom: 22 }}>
      <div className="field full">
        <label>Nombre del período</label>
        <input value={name} onChange={(event) => setName(event.target.value)} disabled={Boolean(editing && (usage[editing.id] ?? 0) > 0)} placeholder="Ej. Mayo – Noviembre 2027" required />
      </div>
      <div className="field">
        <label>Fecha de inicio</label>
        <input type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} disabled={Boolean(editing && (usage[editing.id] ?? 0) > 0)} required />
      </div>
      <div className="field">
        <label>Fecha de finalización</label>
        <input type="date" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} disabled={Boolean(editing && (usage[editing.id] ?? 0) > 0)} required />
      </div>
      <div className="field full coordinator-active-field">
        <label><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span><strong>Período activo</strong><small>Los períodos activos aparecen al crear nuevos procesos.</small></span></label>
      </div>
      {editing && (usage[editing.id] ?? 0) > 0 && <div className="field full"><div className="error-note">Este período ya tiene expedientes asociados. Para preservar el historial, su nombre y fechas quedan bloqueados; únicamente puede activarlo o desactivarlo.</div></div>}
      {message && <div className="field full"><div className="error-note">{message}</div></div>}
      <div className="form-actions"><button type="button" className="ghost-button" onClick={cancelEdit}>Cancelar</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar período"}</button></div>
    </form>}

    {message && !(creating || editing) && <div className="error-note" style={{ marginBottom: 14 }}>{message}</div>}

    <div className="table-scroll"><table className="data-table"><thead><tr><th>Período</th><th>Inicio</th><th>Fin</th><th>Expedientes</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
      {periods.map((period) => <tr key={period.id}>
        <td><strong>{period.name}</strong></td>
        <td>{period.starts_on ? new Date(`${period.starts_on}T00:00:00`).toLocaleDateString("es-EC") : "—"}</td>
        <td>{period.ends_on ? new Date(`${period.ends_on}T00:00:00`).toLocaleDateString("es-EC") : "—"}</td>
        <td>{usage[period.id] ?? 0}</td>
        <td><span className={`badge ${period.active ? "green" : "gray"}`}>{period.active ? "Activo" : "Inactivo"}</span></td>
        <td><div className="filters"><button className="secondary-button" onClick={() => startEdit(period)}>Editar</button><button className="ghost-button" onClick={() => void togglePeriod(period)}>{period.active ? "Desactivar" : "Activar"}</button></div></td>
      </tr>)}
    </tbody></table></div>
    {!periods.length && <div className="empty-state"><h3>Sin períodos académicos</h3><p>Cree el primer período para habilitar el registro de procesos.</p></div>}
  </section>;
}

function CoordinatorModal({ coordinator, onClose, onSave }: { coordinator: StaffMember | null; onClose: () => void; onSave: (input: CoordinatorInput) => Promise<void> }) {
  const [active, setActive] = useState(coordinator?.active ?? true);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void onSave({ id: coordinator?.id, name: String(form.get("name") ?? ""), active });
  }
  return <div className="modal-backdrop"><div className="modal coordinator-simple-modal" role="dialog" aria-modal="true"><div className="modal-head"><div><h2>{coordinator ? "Editar coordinador" : "Nuevo coordinador"}</h2><p className="subtitle">Las carreras se administran en el apartado Asignación de carreras.</p></div><button className="icon-button" onClick={onClose}><X size={17} /></button></div><form className="modal-body form-grid" onSubmit={submit}><div className="field full"><label>Nombre completo</label><input name="name" required defaultValue={coordinator?.full_name ?? ""} /></div><div className="field full coordinator-active-field"><label><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span><strong>Coordinador activo</strong><small>Puede ingresar y gestionar sus docentes.</small></span></label></div><div className="form-actions"><button type="button" className="ghost-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button">Guardar</button></div></form></div></div>;
}
