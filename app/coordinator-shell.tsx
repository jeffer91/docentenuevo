"use client";
/* eslint-disable @next/next/no-img-element */

import { ArrowRight, Users } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "./lib/supabase";
import SiacdApp from "./siacd-app";

type CoordinatorOption = {
  id: string;
  full_name: string;
};

const COORDINATOR_SESSION_KEY = "siacd-coordinator-id";

export default function CoordinatorShell() {
  const [coordinators, setCoordinators] = useState<CoordinatorOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [authorizedId, setAuthorizedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    window.sessionStorage.removeItem(COORDINATOR_SESSION_KEY);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      setError("No se pudo conectar con SIACD.");
      return;
    }

    let active = true;
    void supabase
      .from("siacd_staff")
      .select("id, full_name, role, active")
      .eq("role", "coordinator")
      .eq("active", true)
      .order("full_name")
      .then(({ data, error: loadError }) => {
        if (!active) return;

        if (loadError) {
          setError("No se pudo cargar la lista de coordinadores.");
          setLoading(false);
          return;
        }

        const options = ((data ?? []) as Array<Record<string, unknown>>).map((item) => ({
          id: String(item.id),
          full_name: String(item.full_name ?? "Sin nombre"),
        }));

        setCoordinators(options);
        setSelectedId("");
        setLoading(false);
      });

    return () => { active = false; };
  }, []);

  function authorize(staffId: string) {
    if (!coordinators.some((item) => item.id === staffId)) return;
    window.sessionStorage.setItem(COORDINATOR_SESSION_KEY, staffId);
    setAuthorizedId(staffId);
    setError("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId) return;
    authorize(selectedId);
  }

  if (authorizedId) return <SiacdApp forcedAccess="coordinator" />;

  return (
    <div className="login-page">
      <section className="login-art">
        <div className="institution-brand">
          <img src="/logo-itsqmet.png" alt="Instituto Tecnológico Superior Quito Metropolitano" />
          <span>SIACD · Acompañamiento Docente</span>
        </div>
        <div>
          <p className="eyebrow">Acceso de coordinadores</p>
          <h1>Ingreso directo</h1>
          <p>Seleccione su nombre para ingresar al panel y trabajar con las carreras y docentes asignados.</p>
        </div>
        <p>Proceso CGC-PRO-121 · Uso institucional</p>
      </section>

      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <Users size={18} />
            <h2 style={{ margin: 0 }}>Coordinador de Carrera</h2>
          </div>

          <p>Seleccione su nombre para continuar.</p>

          {loading ? (
            <div className="error-note">Cargando coordinadores…</div>
          ) : coordinators.length ? (
            <>
              <div className="field">
                <label>Nombre</label>
                <select
                  value={selectedId}
                  onChange={(event) => {
                    setSelectedId(event.target.value);
                    setError("");
                  }}
                >
                  <option value="" disabled>Seleccione su nombre</option>
                  {coordinators.map((coordinator) => (
                    <option key={coordinator.id} value={coordinator.id}>
                      {coordinator.full_name}
                    </option>
                  ))}
                </select>
              </div>

              {error && <div className="error-note">{error}</div>}

              <button
                className="primary-button"
                type="submit"
                disabled={!selectedId}
                style={{ width: "100%", justifyContent: "center" }}
              >
                Ingresar <ArrowRight size={15} />
              </button>
            </>
          ) : (
            <div className="error-note">No existen coordinadores activos.</div>
          )}

          {!coordinators.length && error && <div className="error-note">{error}</div>}

          <a className="text-link" href="../" style={{ display: "inline-block", marginTop: 16 }}>
            Volver al inicio
          </a>
        </form>
      </section>
    </div>
  );
}
