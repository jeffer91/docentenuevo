"use client";

import { KeyRound, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "./lib/supabase";

type PinRow = {
  staff_id: string;
  full_name: string;
  active: boolean;
  pin_configured: boolean;
  changed_at: string | null;
};

export default function CoordinatorPinAdmin() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PinRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let active = true;
    setLoading(true);
    void supabase.rpc("coordinator_pin_overview").then(({ data, error }) => {
      if (!active) return;
      setLoading(false);
      if (error) {
        setMessage("No se pudo cargar el estado de los PIN.");
        return;
      }
      const next = (data ?? []) as PinRow[];
      setRows(next);
      setSelectedId((current) => current && next.some((item) => item.staff_id === current) ? current : next[0]?.staff_id ?? "");
      setMessage("");
    });
    return () => { active = false; };
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || pin.length !== 4) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setSaving(true);
    setMessage("");
    const { error } = await supabase.rpc("staff_set_coordinator_pin", {
      p_staff_id: selectedId,
      p_pin: pin,
    });
    setSaving(false);
    if (error) {
      setMessage("No se pudo guardar el PIN.");
      return;
    }
    setRows((current) => current.map((item) => item.staff_id === selectedId ? { ...item, pin_configured: true, changed_at: new Date().toISOString() } : item));
    setPin("");
    setMessage("PIN actualizado correctamente.");
  }

  const selected = rows.find((item) => item.staff_id === selectedId) ?? null;

  return <>
    <button
      type="button"
      onClick={() => setOpen(true)}
      style={{
        position: "fixed",
        left: 24,
        bottom: 24,
        zIndex: 10011,
        border: 0,
        borderRadius: 13,
        padding: "12px 16px",
        background: "#5b447e",
        color: "white",
        fontWeight: 800,
        boxShadow: "0 12px 30px rgba(40,24,62,.22)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
      }}
    >
      <KeyRound size={17}/> PIN coordinadores
    </button>

    {open && <div style={{ position: "fixed", inset: 0, zIndex: 10030, background: "rgba(8,22,38,.58)", display: "grid", placeItems: "center", padding: 18 }}>
      <section style={{ width: "min(520px,96vw)", background: "white", borderRadius: 17, overflow: "hidden", boxShadow: "0 24px 70px rgba(0,0,0,.25)" }}>
        <header style={{ padding: "17px 20px", background: "#0d2946", color: "white", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
          <div><strong style={{ display: "block" }}>PIN de coordinadores</strong><span style={{ fontSize: 12, opacity: .78 }}>Configure o cambie el PIN personal de 4 dígitos.</span></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" style={{ border: 0, background: "rgba(255,255,255,.12)", color: "white", borderRadius: 9, padding: 7, cursor: "pointer" }}><X size={17}/></button>
        </header>
        <form onSubmit={submit} style={{ padding: 20, display: "grid", gap: 14 }}>
          {loading ? <div className="error-note">Cargando coordinadores…</div> : rows.length ? <>
            <div className="field">
              <label>Coordinador</label>
              <select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setPin(""); setMessage(""); }}>
                {rows.map((item) => <option key={item.staff_id} value={item.staff_id}>{item.full_name}{item.active ? "" : " · Inactivo"}</option>)}
              </select>
            </div>
            <div style={{ border: "1px solid #e1e7ed", borderRadius: 11, padding: 11, background: "#f8fafc", fontSize: 12, color: "#52677a" }}>
              Estado: <strong style={{ color: selected?.pin_configured ? "#2e7d5b" : "#b46928" }}>{selected?.pin_configured ? "PIN configurado" : "Sin PIN"}</strong>
            </div>
            <div className="field">
              <label>{selected?.pin_configured ? "Nuevo PIN" : "PIN"}</label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                autoComplete="new-password"
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="4 dígitos"
                required
              />
              <small>El PIN se almacena cifrado; después de guardarlo no puede visualizarse.</small>
            </div>
            {message && <div className="error-note" style={message.startsWith("PIN actualizado") ? { background: "#edf8f1", color: "#2e704b", borderColor: "#cde6d6" } : undefined}>{message}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="ghost-button" onClick={() => setOpen(false)}>Cerrar</button>
              <button type="submit" className="primary-button" disabled={saving || pin.length !== 4}>{saving ? "Guardando…" : "Guardar PIN"}</button>
            </div>
          </> : <div className="error-note">No existen coordinadores registrados.</div>}
        </form>
      </section>
    </div>}
  </>;
}
