import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BUCKET = "siacd-teacher-evidence";
const MAX_BYTES = 10 * 1024 * 1024;

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

function safeFileName(value: string) {
  const cleaned = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  return cleaned.slice(0, 120) || "evidencia";
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { ok: false, error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(req, { ok: false, error: "service_unavailable" }, 503);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return json(req, { ok: false, error: "invalid_form" }, 400);
    }

    const token = String(form.get("token") ?? "");
    const requestId = String(form.get("request_id") ?? "");
    const comment = String(form.get("comment") ?? "").trim();
    const file = form.get("file");

    if (!token || !validUuid(requestId) || !(file instanceof File)) {
      return json(req, { ok: false, error: "invalid_request" }, 400);
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return json(req, { ok: false, error: "invalid_file_size" }, 400);
    }
    if (!(file.type.startsWith("image/") || file.type === "application/pdf")) {
      return json(req, { ok: false, error: "unsupported_file_type" }, 400);
    }

    const { data: sessionRows, error: sessionError } = await supabase.rpc("teacher_validate_device", { p_token: token });
    const session = !sessionError && Array.isArray(sessionRows) ? sessionRows[0] : null;
    const teacherId = session?.teacher_id ? String(session.teacher_id) : "";
    if (!teacherId) return json(req, { ok: false, error: "invalid_session" }, 401);

    const { data: evidenceRequest, error: requestError } = await supabase
      .from("evidence_requests")
      .select("id, expedient_id, status, title")
      .eq("id", requestId)
      .maybeSingle();
    if (requestError || !evidenceRequest) return json(req, { ok: false, error: "request_not_found" }, 404);
    if (!["pending", "correction_required"].includes(String(evidenceRequest.status))) {
      return json(req, { ok: false, error: "request_not_open" }, 409);
    }

    const { data: expedient } = await supabase
      .from("expedients")
      .select("id, teacher_id")
      .eq("id", evidenceRequest.expedient_id)
      .maybeSingle();
    if (!expedient || String(expedient.teacher_id) !== teacherId) {
      return json(req, { ok: false, error: "not_allowed" }, 403);
    }

    const { data: previous } = await supabase
      .from("evidence_submissions")
      .select("version")
      .eq("request_id", requestId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const version = Number(previous?.version ?? 0) + 1;
    const storagePath = `${evidenceRequest.expedient_id}/${requestId}/v${version}-${crypto.randomUUID()}-${safeFileName(file.name)}`;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: "3600",
    });
    if (uploadError) return json(req, { ok: false, error: "upload_failed" }, 500);

    const { data: submission, error: submissionError } = await supabase
      .from("evidence_submissions")
      .insert({
        request_id: requestId,
        teacher_id: teacherId,
        version,
        file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        storage_path: storagePath,
        teacher_comment: comment || null,
        status: "submitted",
      })
      .select("id, version")
      .single();

    if (submissionError || !submission) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
      return json(req, { ok: false, error: "submission_failed" }, 500);
    }

    await supabase.from("evidence_requests").update({ status: "submitted", updated_at: new Date().toISOString() }).eq("id", requestId);
    await supabase.from("activity_log").insert({
      expedient_id: evidenceRequest.expedient_id,
      actor_type: "teacher",
      actor_teacher_id: teacherId,
      event_type: "evidence_submitted",
      message: `El docente envió la evidencia: ${String(evidenceRequest.title ?? "Evidencia")}.`,
      metadata: { request_id: requestId, submission_id: submission.id, version },
    });

    return json(req, { ok: true, submission_id: submission.id, version });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(req, { ok: false, error: "invalid_json" }, 400);
  }

  const action = String(payload.action ?? "");
  const submissionId = String(payload.submission_id ?? "");
  if (!validUuid(submissionId)) return json(req, { ok: false, error: "invalid_submission" }, 400);

  const { data: submission } = await supabase
    .from("evidence_submissions")
    .select("id, request_id, teacher_id, storage_path, file_name")
    .eq("id", submissionId)
    .maybeSingle();
  if (!submission) return json(req, { ok: false, error: "submission_not_found" }, 404);

  if (action === "signed-url") {
    const token = String(payload.token ?? "");
    const { data: sessionRows } = await supabase.rpc("teacher_validate_device", { p_token: token });
    const session = Array.isArray(sessionRows) ? sessionRows[0] : null;
    if (!session?.teacher_id || String(session.teacher_id) !== String(submission.teacher_id)) {
      return json(req, { ok: false, error: "not_allowed" }, 403);
    }
  } else if (action === "staff-signed-url") {
    const staffId = String(payload.staff_id ?? "");
    if (!validUuid(staffId)) return json(req, { ok: false, error: "invalid_staff" }, 400);
    const { data: evidenceRequest } = await supabase.from("evidence_requests").select("expedient_id").eq("id", submission.request_id).maybeSingle();
    const { data: expedient } = evidenceRequest
      ? await supabase.from("expedients").select("coordinator_staff_id").eq("id", evidenceRequest.expedient_id).maybeSingle()
      : { data: null };
    const { data: staff } = await supabase.from("siacd_staff").select("id, role, active").eq("id", staffId).maybeSingle();
    const allowed = Boolean(staff?.active) && (String(staff?.role) === "admin" || String(expedient?.coordinator_staff_id ?? "") === staffId);
    if (!allowed) return json(req, { ok: false, error: "not_allowed" }, 403);
  } else {
    return json(req, { ok: false, error: "invalid_action" }, 400);
  }

  const { data: signed, error: signedError } = await supabase.storage.from(BUCKET).createSignedUrl(String(submission.storage_path), 900, {
    download: String(submission.file_name ?? "evidencia"),
  });
  if (signedError || !signed?.signedUrl) return json(req, { ok: false, error: "signed_url_failed" }, 500);
  return json(req, { ok: true, url: signed.signedUrl });
});
