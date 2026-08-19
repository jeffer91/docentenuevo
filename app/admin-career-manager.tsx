"use client";

import { useCallback, useMemo, useState } from "react";
import { ArrowLeftRight, Search, UserCog, X } from "lucide-react";
import { getSupabaseBrowserClient } from "./lib/supabase";

export type CareerManagerStaff = {
  id: string;
  full_name: string;
  active: boolean;
};

type Career = {
  id: string;
  name: string;
  program?: string | null;
};

type Assignment = {
  staff_id: string;
  career_id: string;
};

function careerLabel(career: Career) {
  return career.program ? `${career.name} — ${career.program}` : career.name;
}

export default function AdminCareerManager() {
  const [open, setOpen] = useState(false);
  const [staff, setStaff] = useState<CareerManagerStaff[]>([]);
  const [careers, setCareers] = useState<Career[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [changed, setChanged] = useState(false);

  const isAdminPath = typeof window !== "undefined" && window.location.pathname.toLowerCase().includes("/administrador");

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setLoading(true);
    const [staffResult, careersResult, assignmentsResult] = await Promise.all([
      supabase.from("siacd_staff").select("id, full_name, active").eq("role", "coordinator").order("full_name"),
      supabase.from("careers").select("id, name, program").eq("active", true).order("name"),
      supabase.from("siacd_staff_careers").select("staff_id, career_id"),
    ]);
    if (staffResult.error || careersResult.error || assignmentsResult.error) {
      setMessage("No se pudo cargar la asignación de carreras.");
      setLoading(false);
      return;
    }
    const nextStaff = (staffResult.data ?? []) as CareerManagerStaff[];
    setStaff(nextStaff);
    setCareers((careersResult.data ?? []) as Career[]);
    setAssignments((assignmentsResult.data ?? []) as Assignment[]);
    setSelectedStaffId((current) => nextStaff.some((item) => item.id === current) ? current : nextStaff[0]?.id || "");
    setLoading(false);
  }, []);

  function openManager() {
    setOpen(true);
    setChanged(false);
    setMessage("");
    setQuery("");
    void load();
  }

  function closeManager() {
    setOpen(false);
    if (changed) window.location.reload();
  }

  const assignedIds = useMemo(
    () => new Set(assignments.filter((item) => item.staff_id === selectedStaffId).map((item) => item.career_id)),
    [assignments, selectedStaffId],
  );

  const globallyAssignedIds = useMemo(
    () => new Set(assignments.map((item) => item.career_id)),
    [assignments],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const available = useMemo(
    () => careers.filter((career) => !globallyAssignedIds.has(career.id) && (!normalizedQuery || careerLabel(career).toLowerCase().includes(normalizedQuery))),
    [careers, globallyAssignedIds, normalizedQuery],
  );
  const assigned = useMemo(
    () => careers.filter((career) => assignedIds.has(career.id) && (!normalizedQuery || careerLabel(career).toLowerCase().includes(normalizedQuery))),
    [careers, assignedIds, normalizedQuery],
  );

  async function assign(careerId: string) {
    if (!selectedStaffId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setMessage("");
    const { error } = await supabase.from("siacd_staff_careers").insert({ staff_id: selectedStaffId, career_id: careerId });
    if (error) {
      setMessage("Esa carrera ya fue asignada a otro coordinador. Se actualizó la lista.");
      await load();
      return;
    }
    setAssignments((current) => [...current, { staff_id: selectedStaffId, career_id: careerId }]);
    setChanged(true);
  }

  async function remove(careerId: string) {
    if (!selectedStaffId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setMessage("");
    const { error } = await supabase.from("siacd_staff_careers").delete().eq("staff_id", selectedStaffId).eq("career_id", careerId);
    if (error) {
      setMessage("No se pudo quitar la carrera.");
      return;
    }
    setAssignments((current) => current.filter((item) => !(item.staff_id === selectedStaffId && item.career_id === careerId)));
    setChanged(true);
  }

  if (!isAdminPath) return null;

  return (
    <>
      <button className="career-manager-launcher" onClick={openManager}>
        <ArrowLeftRight size={16} /> Gestionar carreras
      </button>
      {open && (
        <div className="career-manager-backdrop" role="presentation">
          <section className="career-manager" role="dialog" aria-modal="true" aria-label="Asignación de carreras">
            <header className="career-manager-head">
              <div>
                <span className="career-manager-kicker">Administrador</span>
                <h2>Asignación de carreras</h2>
                <p>Seleccione un coordinador y gestione sus carreras. Cada carrera puede pertenecer a un solo coordinador.</p>
              </div>
              <button className="career-manager-close" onClick={closeManager} aria-label="Cerrar"><X size={18} /></button>
            </header>

            <div className="career-manager-controls">
              <label>
                <span>Coordinador</span>
                <select value={selectedStaffId} onChange={(event) => setSelectedStaffId(event.target.value)} disabled={!staff.length}>
                  {!staff.length && <option value="">Sin coordinadores registrados</option>}
                  {staff.map((item) => <option key={item.id} value={item.id}>{item.full_name}{item.active ? "" : " · Inactivo"}</option>)}
                </select>
              </label>
              <label className="career-manager-search">
                <span>Buscar carrera</span>
                <div><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ej. Enfermería" /></div>
              </label>
            </div>

            {message && <div className="career-manager-message">{message}</div>}
            {!loading && !staff.length && <div className="career-manager-message">Primero cree un coordinador desde el botón “Nuevo coordinador”.</div>}

            <div className="career-manager-columns">
              <div className="career-manager-table-card">
                <div className="career-manager-table-title"><div><strong>Carreras disponibles</strong><span>{available.length} sin asignar</span></div></div>
                <div className="career-manager-table-wrap">
                  <table className="career-manager-table">
                    <thead><tr><th>Carrera</th><th>Acción</th></tr></thead>
                    <tbody>
                      {available.map((career) => <tr key={career.id}><td><strong>{career.name}</strong><span>{career.program || ""}</span></td><td><button className="career-assign" disabled={!selectedStaffId} onClick={() => void assign(career.id)}>Asignar →</button></td></tr>)}
                    </tbody>
                  </table>
                  {!loading && available.length === 0 && <div className="career-manager-empty">No hay carreras disponibles con este filtro.</div>}
                </div>
              </div>

              <div className="career-manager-table-card assigned">
                <div className="career-manager-table-title"><div><strong>Carreras del coordinador</strong><span>{assigned.length} asignadas</span></div><UserCog size={18} /></div>
                <div className="career-manager-table-wrap">
                  <table className="career-manager-table">
                    <thead><tr><th>Carrera</th><th>Acción</th></tr></thead>
                    <tbody>
                      {assigned.map((career) => <tr key={career.id}><td><strong>{career.name}</strong><span>{career.program || ""}</span></td><td><button className="career-remove" onClick={() => void remove(career.id)}>Quitar</button></td></tr>)}
                    </tbody>
                  </table>
                  {!loading && assigned.length === 0 && <div className="career-manager-empty">Este coordinador todavía no tiene carreras asignadas.</div>}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
