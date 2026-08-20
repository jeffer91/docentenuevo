import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FIREBASE_DATABASE_URL = "https://repaso-fire-d8ceb-default-rtdb.firebaseio.com";
const ADMIN_PIN_HASH = "e6955a2c59dc90833986fe0894cf6718dddaa7816bb51bc955cdd3eb4470e554";

const allowedOrigins = new Set([
  "https://docentenuevo.pages.dev",
  "http://localhost:3000",
  "http://localhost:5173",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://docentenuevo.pages.dev",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function normalizeCedula(value: unknown) {
  if (typeof value !== "string") return "";
  let digits = value.replace(/\D/g, "");
  if (digits.length === 9) digits = `0${digits}`;
  return /^\d{10}$/.test(digits) ? digits : "";
}

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace("@itsqmet.edu.edu.ec", "@itsqmet.edu.ec");
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeName(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function parseCareers(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
  }
  return [];
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

type TeacherRow = {
  id: string;
  full_name: string | null;
  institutional_email: string | null;
  national_id: string | null;
  started_institution_on: string | null;
};

type FirebaseTeacher = {
  cedula?: unknown;
  nombresCompletos?: unknown;
  carreras?: unknown;
  carrera?: unknown;
  rol?: unknown;
};

function candidateScore(candidate: TeacherRow, referenceName: string) {
  const reference = normalizeName(referenceName);
  const current = normalizeName(candidate.full_name);
  if (!reference || !current) return 0;
  if (reference === current) return 10;

  const referenceTokens = [...new Set(reference.split(" ").filter(Boolean))];
  const candidateTokens = [...new Set(current.split(" ").filter(Boolean))];
  const referenceSet = new Set(referenceTokens);
  const intersection = candidateTokens.filter((token) => referenceSet.has(token)).length;
  if (!intersection) return 0;

  const candidateCoverage = intersection / candidateTokens.length;
  const referenceCoverage = intersection / referenceTokens.length;
  const institutionalBonus = normalizeEmail(candidate.institutional_email).includes("@itsqmet.") ? 0.3 : 0;
  return candidateCoverage * 2 + referenceCoverage + institutionalBonus;
}

function bestCandidate(candidates: TeacherRow[], referenceName: string) {
  const ranked = candidates
    .filter((candidate) => !candidate.national_id)
    .map((candidate) => ({ candidate, score: candidateScore(candidate, referenceName) }))
    .filter((item) => item.score >= 1.5)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.candidate ?? null;
}

async function readFirebaseTeacher(cedula: string): Promise<FirebaseTeacher | null> {
  try {
    const response = await fetch(`${FIREBASE_DATABASE_URL}/docentes-registrados/${encodeURIComponent(cedula)}.json`);
    if (!response.ok) return null;
    const data = await response.json();
    return data && typeof data === "object" ? data as FirebaseTeacher : null;
  } catch {
    return null;
  }
}

function firebaseCareers(record: FirebaseTeacher | null) {
  const values = parseCareers(record?.carreras);
  if (typeof record?.carrera === "string" && record.carrera.trim()) values.push(record.carrera.trim());
  return [...new Set(values)];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { ok: false, error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(req, { ok: false, error: "service_unavailable" }, 503);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(req, { ok: false, error: "invalid_request" }, 400);
  }

  const action = String(payload.action ?? "status");
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (action === "admin_reset_pin") {
    const adminPin = String(payload.admin_pin ?? "");
    const newPin = String(payload.new_pin ?? "");
    const teacherId = typeof payload.teacher_id === "string" ? payload.teacher_id : "";

    if (!/^\d{4}$/.test(adminPin) || await sha256Hex(adminPin) !== ADMIN_PIN_HASH) {
      return json(req, { ok: false, error: "invalid_admin_pin" }, 403);
    }
    if (!/^\d{4}$/.test(newPin)) return json(req, { ok: false, error: "invalid_pin" }, 400);
    if (!teacherId) return json(req, { ok: false, error: "teacher_not_found" }, 404);

    const { data: teacher } = await supabase
      .from("teachers")
      .select("id, institutional_email")
      .eq("id", teacherId)
      .eq("active", true)
      .maybeSingle();
    if (!teacher?.id) return json(req, { ok: false, error: "teacher_not_found" }, 404);

    let email = normalizeEmail(teacher.institutional_email);
    if (!validEmail(email)) {
      const { data: access } = await supabase
        .from("teacher_access")
        .select("email")
        .eq("teacher_id", teacherId)
        .maybeSingle();
      email = normalizeEmail(access?.email);
    }
    if (!validEmail(email)) return json(req, { ok: false, error: "teacher_email_required" }, 409);

    const { data: changed, error: changeError } = await supabase.rpc("teacher_register_pin", {
      p_teacher_id: teacherId,
      p_email: email,
      p_pin: newPin,
    });
    if (changeError || changed !== true) return json(req, { ok: false, error: "pin_reset_failed" }, 409);

    await supabase
      .from("teacher_device_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("teacher_id", teacherId)
      .is("revoked_at", null);

    return json(req, { ok: true, pin_changed: true });
  }

  const cedula = normalizeCedula(payload.cedula);
  if (!cedula) return json(req, { ok: false, error: "invalid_national_id" }, 400);

  if (action === "login") {
    const pin = String(payload.pin ?? "");
    if (!/^\d{4}$/.test(pin)) return json(req, { ok: false, error: "invalid_pin" }, 400);

    const { data, error } = await supabase.rpc("teacher_login_with_pin", {
      p_national_id: cedula,
      p_pin: pin,
      p_device_label: typeof payload.device_label === "string" ? payload.device_label.slice(0, 180) : null,
    });

    const row = !error && Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;
    if (row?.device_token) return json(req, { ok: true, ...row });

    const { data: teacher } = await supabase
      .from("teachers")
      .select("id")
      .eq("national_id", cedula)
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    if (teacher?.id) {
      const { data: access } = await supabase
        .from("teacher_access")
        .select("pin_hash, active")
        .eq("teacher_id", teacher.id)
        .maybeSingle();
      if (!access?.pin_hash || !access.active) return json(req, { ok: false, error: "registration_required" }, 409);
    } else {
      return json(req, { ok: false, error: "registration_required" }, 409);
    }

    return json(req, { ok: false, error: "invalid_credentials" }, 401);
  }

  const { data: teacherByCedula } = await supabase
    .from("teachers")
    .select("id, full_name, institutional_email, national_id, started_institution_on")
    .eq("national_id", cedula)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  const directory = await readFirebaseTeacher(cedula);
  const directoryName = typeof directory?.nombresCompletos === "string" ? directory.nombresCompletos.trim() : "";

  let suggestedTeacher = teacherByCedula as TeacherRow | null;
  if (!suggestedTeacher && directoryName) {
    const { data: candidates } = await supabase
      .from("teachers")
      .select("id, full_name, institutional_email, national_id, started_institution_on")
      .eq("active", true);
    suggestedTeacher = bestCandidate((candidates ?? []) as TeacherRow[], directoryName);
  }

  if (action === "status") {
    let registered = false;
    if (teacherByCedula?.id) {
      const { data: access } = await supabase
        .from("teacher_access")
        .select("pin_hash, active")
        .eq("teacher_id", teacherByCedula.id)
        .maybeSingle();
      registered = Boolean(access?.active && access?.pin_hash);
    }

    return json(req, {
      ok: true,
      registered,
      found: Boolean(directory || suggestedTeacher),
      full_name: directoryName || suggestedTeacher?.full_name || "",
      email: normalizeEmail(suggestedTeacher?.institutional_email),
      started_institution_on: suggestedTeacher?.started_institution_on ?? "",
      careers: firebaseCareers(directory),
    });
  }

  if (action !== "register") return json(req, { ok: false, error: "invalid_action" }, 400);

  const fullName = typeof payload.full_name === "string" ? payload.full_name.trim() : "";
  const email = normalizeEmail(payload.email);
  const pin = String(payload.pin ?? "");
  const startedOn = typeof payload.started_institution_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.started_institution_on)
    ? payload.started_institution_on
    : null;

  if (fullName.length < 5) return json(req, { ok: false, error: "invalid_name" }, 400);
  if (!validEmail(email)) return json(req, { ok: false, error: "invalid_email" }, 400);
  if (!/^\d{4}$/.test(pin)) return json(req, { ok: false, error: "invalid_pin" }, 400);

  let teacher = teacherByCedula as TeacherRow | null;

  if (!teacher) {
    const { data: emailCandidates } = await supabase
      .from("teachers")
      .select("id, full_name, institutional_email, national_id, started_institution_on")
      .eq("active", true);
    const candidates = (emailCandidates ?? []) as TeacherRow[];
    teacher = candidates.find((candidate) => {
      const sameEmail = normalizeEmail(candidate.institutional_email) === email;
      const compatibleId = !candidate.national_id || candidate.national_id === cedula;
      return sameEmail && compatibleId;
    }) ?? bestCandidate(candidates, directoryName || fullName);
  }

  const now = new Date().toISOString();
  if (teacher?.id) {
    if (teacher.national_id && teacher.national_id !== cedula) return json(req, { ok: false, error: "identity_conflict" }, 409);
    const { error: updateError } = await supabase
      .from("teachers")
      .update({
        national_id: cedula,
        full_name: fullName,
        institutional_email: email,
        started_institution_on: startedOn,
        active: true,
        updated_at: now,
      })
      .eq("id", teacher.id);
    if (updateError) return json(req, { ok: false, error: "profile_update_failed" }, 500);
  } else {
    const { data: created, error: createError } = await supabase
      .from("teachers")
      .insert({
        national_id: cedula,
        full_name: fullName,
        institutional_email: email,
        started_institution_on: startedOn,
        active: true,
        created_by: null,
        updated_at: now,
      })
      .select("id, full_name, institutional_email, national_id, started_institution_on")
      .single();
    if (createError || !created) return json(req, { ok: false, error: "profile_create_failed" }, 500);
    teacher = created as TeacherRow;
  }

  const { data: pinRegistered, error: pinError } = await supabase.rpc("teacher_register_pin", {
    p_teacher_id: teacher.id,
    p_email: email,
    p_pin: pin,
  });
  if (pinError || pinRegistered !== true) return json(req, { ok: false, error: "pin_registration_failed" }, 409);

  try {
    await fetch(`${FIREBASE_DATABASE_URL}/docentes-registrados/${encodeURIComponent(cedula)}.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cedula, nombresCompletos: fullName, rol: "docente", actualizadoEn: now }),
    });
  } catch {
  }

  const { data: loginData, error: loginError } = await supabase.rpc("teacher_login_with_pin", {
    p_national_id: cedula,
    p_pin: pin,
    p_device_label: typeof payload.device_label === "string" ? payload.device_label.slice(0, 180) : null,
  });
  const loginRow = !loginError && Array.isArray(loginData) ? loginData[0] as Record<string, unknown> | undefined : undefined;
  if (!loginRow?.device_token) return json(req, { ok: false, error: "session_creation_failed" }, 500);

  return json(req, { ok: true, registered: true, ...loginRow });
});
