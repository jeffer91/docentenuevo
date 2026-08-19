import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM = Deno.env.get("SIACD_EMAIL_FROM") ?? "SIACD <no-reply@itsqmet.edu.ec>";

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

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateFourDigitCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 10000).padStart(4, "0");
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { ok: false }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(req, { ok: false, error: "service_unavailable" }, 503);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(req, { ok: false, error: "invalid_request" }, 400);
  }

  const email = normalizeEmail(payload.email);
  if (!validEmail(email)) return json(req, { ok: false, error: "invalid_email" }, 400);
  if (!RESEND_API_KEY) return json(req, { ok: false, error: "email_delivery_not_configured" }, 503);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Respuesta genérica para no revelar si un correo pertenece o no a un docente.
  const genericOk = () => json(req, { ok: true, message: "Si el correo está registrado, recibirá un código de acceso." });

  const { data: existingAccess } = await supabase
    .from("teacher_access")
    .select("teacher_id, email, active")
    .eq("email", email)
    .eq("active", true)
    .maybeSingle();

  let teacherId = existingAccess?.teacher_id ? String(existingAccess.teacher_id) : "";
  let teacherName = "Docente";

  if (!teacherId) {
    const { data: teacher } = await supabase
      .from("teachers")
      .select("id, full_name, institutional_email")
      .ilike("institutional_email", email)
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!teacher?.id) return genericOk();
    teacherId = String(teacher.id);
    teacherName = String(teacher.full_name ?? "Docente");

    const { error: accessError } = await supabase
      .from("teacher_access")
      .upsert({ teacher_id: teacherId, email, active: true, updated_at: new Date().toISOString() }, { onConflict: "teacher_id" });
    if (accessError) return json(req, { ok: false, error: "access_preparation_failed" }, 500);
  } else {
    const { data: teacher } = await supabase.from("teachers").select("full_name").eq("id", teacherId).maybeSingle();
    teacherName = String(teacher?.full_name ?? "Docente");
  }

  const sixtySecondsAgo = new Date(Date.now() - 60_000).toISOString();
  const { data: recentCode } = await supabase
    .from("teacher_login_codes")
    .select("id")
    .eq("teacher_id", teacherId)
    .gte("created_at", sixtySecondsAgo)
    .is("consumed_at", null)
    .limit(1)
    .maybeSingle();

  if (recentCode?.id) return genericOk();

  const code = generateFourDigitCode();
  const hash = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

  const { data: loginCode, error: codeError } = await supabase
    .from("teacher_login_codes")
    .insert({
      teacher_id: teacherId,
      email,
      code_hash: `\\x${hash}`,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (codeError || !loginCode) return json(req, { ok: false, error: "code_creation_failed" }, 500);

  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [email],
      subject: "Código de acceso SIACD",
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto"><h2>Acceso docente SIACD</h2><p>Hola ${teacherName.replace(/[<>&]/g, "")},</p><p>Su código de acceso es:</p><div style="font-size:34px;font-weight:700;letter-spacing:8px;padding:18px 0">${code}</div><p>El código vence en 10 minutos y solo puede usarse una vez.</p><p>Si usted no solicitó este acceso, ignore este mensaje.</p></div>`,
    }),
  });

  if (!emailResponse.ok) {
    await supabase.from("teacher_login_codes").delete().eq("id", loginCode.id);
    return json(req, { ok: false, error: "email_delivery_failed" }, 502);
  }

  return genericOk();
});
