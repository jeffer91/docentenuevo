"use client";

import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Search, UserCog, XCircle } from "lucide-react";
import { getSupabaseBrowserClient } from "./lib/supabase";

export type CareerManagerCoordinator = {
  id: string;
  full_name: string;
  active: boolean;
  careerIds: string[];
};

export type CareerManagerCareer = {
  id: string;
  name: string;
  program?: string | null;
};

function careerLabel(career: CareerManagerCareer) {
  return career.program ? `${career.name} — ${career.program}` : career.name;
}

export default function AdminCareerManager({
  coordinators,
  careers,
  selectedStaffId,
  onSelectStaff,
  onChanged,
}: {
  coordinators: CareerManagerCoordinator[];
  careers: CareerManagerCareer[];
  selectedStaffId: string;
  onSelectStaff: (staffId: string) => void;
  onChanged: () => Promise<void> | void;
}) {
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [busyCareerId, setBusyCareerId] = useState("");

  const effectiveStaffId = coordinators.some((item) => item.id === selectedStaffId)
    ? selectedStaffId
    : coordinators[0]?.id ?? "";

  const selectedCoordinator = coordinators.find((item) => item.id === effectiveStaffId) ?? null;
  const assignedIds = useMemo(
    () => new Set(selectedCoordinator?.careerIds ?? []),
    [selectedCoordinator],
  );
  const globallyAssignedIds = useMemo(
    () => new Set(coordinators.flatMap((item) => item.careerIds)),
    [coordinators],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const available = useMemo(
    () => careers.filter((career) =>
      !globallyAssignedIds.has(career.id)
      && (!normalizedQuery || careerLabel(career).toLowerCase().includes(normalizedQuery))),
    [careers, globallyAssignedIds, normalizedQuery],
  );
  const assigned = useMemo(
    () => careers.filter((career) =>
      assignedIds.has(career.id)
      && (!normalizedQuery || careerLabel(career).toLowerCase().includes(normalizedQuery))),
    [careers, assignedIds, normalizedQuery],
  );

  const totalAssigned = globallyAssignedIds.size;
  const totalAvailable = Math.max(0, careers.length - totalAssigned);

  async function assign(careerId: string) {
    if (!effectiveStaffId || busyCareerId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusyCareerId(careerId);
    setMessage("");
    const { error } = await supabase
      .from("siacd_staff_careers")
      .insert({ staff_id: effectiveStaffId, career_id: careerId });
    if (error) {
      setMessage("No se pudo asignar la carrera. Puede haber sido asignada a otro coordinador.");
      setBusyCareerId("");
      await onChanged();
      return;
    }
    setMessage("Carrera asignada correctamente.");
    setBusyCareerId("");
    await onChanged();
  }

  async function remove(careerId: string) {
    if (!effectiveStaffId || busyCareerId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusyCareerId(careerId);
    setMessage("");
    const { error } = await supabase
      .from("siacd_staff_careers")
      .delete()
      .eq("staff_id", effectiveStaffId)
      .eq("career_id", careerId);
    if (error) {
      setMessage("No se pudo quitar la carrera.");
      setBusyCareerId("");
      return;
    }
    setMessage("Carrera liberada y disponible nuevamente.");
    setBusyCareerId("");
    await onChanged();
  }

  return (
    <div className="career-assignment-page">
      <div className="career-assignment-stats">
        <article><span>Carreras activas</span><strong>{careers.length}</strong><small>Catálogo institucional</small></article>
        <article><span>Asignadas</span><strong>{totalAssigned}</strong><small>Con coordinador responsable</small></article>
        <article><span>Disponibles</span><strong>{totalAvailable}</strong><small>Pendientes de asignación</small></article>
        <article><span>Coordinadores</span><strong>{coordinators.length}</strong><small>{coordinators.filter((item) => item.active).length} activos</small></article>
      </div>

      <section className="career-assignment-card">
        <div className="career-assignment-intro">
          <div>
            <span className="career-assignment-kicker">Administración SIACD</span>
            <h2>Asignación de carreras</h2>
            <p>Seleccione un coordinador y asigne o libere sus carreras. Una carrera solo puede pertenecer a un coordinador a la vez.</p>
          </div>
          <UserCog size={24} />
        </div>

        <div className="career-assignment-controls">
          <label>
            <span>Coordinador</span>
            <select
              value={effectiveStaffId}
              onChange={(event) => onSelectStaff(event.target.value)}
              disabled={!coordinators.length}
            >
              {!coordinators.length && <option value="">Sin coordinadores registrados</option>}
              {coordinators.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.full_name}{item.active ? "" : " · Inactivo"}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Buscar carrera</span>
            <div className="career-assignment-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ej. Enfermería, Pedagogía..."
              />
            </div>
          </label>
        </div>

        {selectedCoordinator && (
          <div className="career-assignment-selected">
            <div>
              <span>Coordinador seleccionado</span>
              <strong>{selectedCoordinator.full_name}</strong>
            </div>
            <div>
              <span>Carreras asignadas</span>
              <strong>{selectedCoordinator.careerIds.length}</strong>
            </div>
            <div>
              <span>Estado</span>
              <strong className={selectedCoordinator.active ? "career-state-active" : "career-state-inactive"}>
                {selectedCoordinator.active ? "Activo" : "Inactivo"}
              </strong>
            </div>
          </div>
        )}

        {message && <div className="career-assignment-message">{message}</div>}

        {!coordinators.length ? (
          <div className="career-assignment-empty">
            <XCircle size={28} />
            <h3>No hay coordinadores registrados</h3>
            <p>Primero cree un coordinador desde el apartado Coordinadores.</p>
          </div>
        ) : (
          <div className="career-assignment-columns">
            <section className="career-assignment-table-card">
              <header>
                <div><strong>Carreras disponibles</strong><span>{available.length} visibles</span></div>
                <span className="career-count available-count">{totalAvailable}</span>
              </header>
              <div className="career-assignment-table-wrap">
                <table>
                  <thead><tr><th>Carrera</th><th>Acción</th></tr></thead>
                  <tbody>
                    {available.map((career) => (
                      <tr key={career.id}>
                        <td><strong>{career.name}</strong><span>{career.program || "Sin nivel especificado"}</span></td>
                        <td>
                          <button
                            className="career-assign-button"
                            disabled={!effectiveStaffId || busyCareerId === career.id}
                            onClick={() => void assign(career.id)}
                          >
                            {busyCareerId === career.id ? "Asignando..." : <>Asignar <ArrowRight size={14} /></>}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!available.length && <div className="career-assignment-no-results">No hay carreras disponibles con este filtro.</div>}
              </div>
            </section>

            <section className="career-assignment-table-card assigned-card">
              <header>
                <div><strong>Carreras del coordinador</strong><span>{assigned.length} visibles</span></div>
                <span className="career-count assigned-count">{selectedCoordinator?.careerIds.length ?? 0}</span>
              </header>
              <div className="career-assignment-table-wrap">
                <table>
                  <thead><tr><th>Carrera</th><th>Acción</th></tr></thead>
                  <tbody>
                    {assigned.map((career) => (
                      <tr key={career.id}>
                        <td><strong>{career.name}</strong><span>{career.program || "Sin nivel especificado"}</span></td>
                        <td>
                          <button
                            className="career-remove-button"
                            disabled={busyCareerId === career.id}
                            onClick={() => void remove(career.id)}
                          >
                            {busyCareerId === career.id ? "Quitando..." : "Quitar"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!assigned.length && (
                  <div className="career-assignment-no-results assigned-empty">
                    <CheckCircle2 size={24} />
                    Este coordinador todavía no tiene carreras asignadas.
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
