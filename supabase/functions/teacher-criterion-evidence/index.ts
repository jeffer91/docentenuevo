import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BUCKET = "siacd-teacher-evidence";
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ITEMS = 3;

const allowedOrigins = new Set([
  "https://docentenuevo.pages.dev",
  "http://localhost:3000",
  "http://localhost:5173",
]);

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
]);

const extensionMime: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
};

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

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function safeFileName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 120) || "evidencia";
}

function normalizedMime(file: File) {
  if (allowedMimeTypes.has(file.type)) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return extensionMime[extension] ?? null;
}

function normalizeHttpUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { ok: false, error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(req, { ok: false, error: "service_unavailable" }, 503);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function teacherFromToken(token: string) {
    const { data: sessionRows, error } = await supabase.rpc("teacher_validate_device", { p_token: token });
    const session = !error && Array.isArray(sessionRows) ? sessionRows[0] : null;
    return session?.teacher_id ? String(session.teacher_id) : "";
  }

  async function loadOwnedSubmission(submissionId: string, teacherId: string) {
    const { data: submission } = await supabase
      .from("evidence_submissions")
      .select("id, request_id, teacher_id, version, status, reviewed_at")
      .eq("id", submissionId)
      .maybeSingle();
    if (!submission || String(submission.teacher_id) !== teacherId) return null;
    const { data: evidenceRequest } = await supabase
      .from("evidence_requests")
      .select("id, expedient_id, status, criterion_id")
      .eq("id", submission.request_id)
      .maybeSingle();
    if (!evidenceRequest) return null;
    const { data: expedient } = await supabase
      .from("expedients")
      .select("id, teacher_id")
      .eq("id", evidenceRequest.expedient_id)
      .maybeSingle();
    if (!expedient || String(expedient.teacher_id) !== teacherId) return null;
    return { submission, evidenceRequest };
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return json(req, { ok: false, error: "invalid_form" }, 400);
    }

    const action = String(form.get("action") ?? "");
    const token = String(form.get("token") ?? "");
    const requestId = String(form.get("request_id") ?? "");
    const submissionId = String(form.get("submission_id") ?? "");
    const comment = String(form.get("comment") ?? "").trim();
    if (action !== "append" || !token || !validUuid(requestId) || !validUuid(submissionId)) {
      return json(req, { ok: false, error: "invalid_request" }, 400);
    }

    const teacherId = await teacherFromToken(token);
    if (!teacherId) return json(req, { ok: false, error: "invalid_session" }, 401);
    const owned = await loadOwnedSubmission(submissionId, teacherId);
    if (!owned || String(owned.evidenceRequest.id) !== requestId) return json(req, { ok: false, error: "not_allowed" }, 403);
    if (owned.submission.status !== "submitted" || owned.submission.reviewed_at || owned.evidenceRequest.status !== "submitted") {
      return json(req, { ok: false, error: "submission_locked" }, 409);
    }

    const files = form.getAll("file").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    const links = form.getAll("link").map((entry) => normalizeHttpUrl(String(entry ?? ""))).filter((entry): entry is string => Boolean(entry));
    if (!files.length && !links.length) return json(req, { ok: false, error: "invalid_item_count" }, 400);

    const { data: existingItems } = await supabase
      .from("evidence_submission_items")
      .select("position")
      .eq("submission_id", submissionId)
      .order("position");
    const usedPositions = new Set((existingItems ?? []).map((item) => Number(item.position)));
    const currentCount = usedPositions.size;
    if (currentCount + files.length + links.length > MAX_ITEMS) {
      return json(req, { ok: false, error: "invalid_item_count", max_items: MAX_ITEMS }, 400);
    }

    const preparedFiles: Array<{ file: File; mime: string }> = [];
    for (const file of files) {
      if (file.size <= 0 || file.size > MAX_BYTES) return json(req, { ok: false, error: "invalid_file_size", file_name: file.name }, 400);
      const mime = normalizedMime(file);
      if (!mime) return json(req, { ok: false, error: "unsupported_file_type", file_name: file.name }, 400);
      preparedFiles.push({ file, mime });
    }

    const freePositions = [1, 2, 3].filter((position) => !usedPositions.has(position));
    const uploadedPaths: string[] = [];
    const rows: Array<Record<string, unknown>> = [];
    let offset = 0;

    for (const prepared of preparedFiles) {
      const position = freePositions[offset++];
      const storagePath = `${owned.evidenceRequest.expedient_id}/${requestId}/v${owned.submission.version}/${submissionId}/${position}-${crypto.randomUUID()}-${safeFileName(prepared.file.name)}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, prepared.file, {
        contentType: prepared.mime,
        upsert: false,
        cacheControl: "3600",
      });
      if (uploadError) {
        if (uploadedPaths.length) await supabase.storage.from(BUCKET).remove(uploadedPaths);
        return json(req, { ok: false, error: "upload_failed" }, 500);
      }
      uploadedPaths.push(storagePath);
      rows.push({
        submission_id: submissionId,
        position,
        kind: prepared.mime.startsWith("image/") ? "image" : "file",
        file_name: prepared.file.name,
        mime_type: prepared.mime,
        size_bytes: prepared.file.size,
        storage_path: storagePath,
        external_url: null,
      });
    }

    for (const link of links) {
      const position = freePositions[offset++];
      rows.push({
        submission_id: submissionId,
        position,
        kind: "link",
        file_name: null,
        mime_type: null,
        size_bytes: null,
        storage_path: null,
        external_url: link,
      });
    }

    const { error: itemError } = await supabase.from("evidence_submission_items").insert(rows);
    if (itemError) {
      if (uploadedPaths.length) await supabase.storage.from(BUCKET).remove(uploadedPaths);
      return json(req, { ok: false, error: "submission_items_failed" }, 500);
    }

    if (comment || owned.submission.version) {
      await supabase.from("evidence_submissions").update({ teacher_comment: comment || null }).eq("id", submissionId);
    }
    await supabase.from("activity_log").insert({
      expedient_id: owned.evidenceRequest.expedient_id,
      actor_type: "teacher",
      actor_teacher_id: teacherId,
      event_type: "evidence_submission_edited",
      message: "El docente agregó elementos a una entrega pendiente de revisión.",
      metadata: { request_id: requestId, submission_id: submissionId, added_items: rows.length },
    });

    return json(req, { ok: true, item_count: currentCount + rows.length });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(req, { ok: false, error: "invalid_json" }, 400);
  }

  const action = String(payload.action ?? "");
  const token = String(payload.token ?? "");
  const teacherId = await teacherFromToken(token);
  if (!teacherId) return json(req, { ok: false, error: "invalid_session" }, 401);

  if (action === "update-comment") {
    const submissionId = String(payload.submission_id ?? "");
    if (!validUuid(submissionId)) return json(req, { ok: false, error: "invalid_submission" }, 400);
    const owned = await loadOwnedSubmission(submissionId, teacherId);
    if (!owned) return json(req, { ok: false, error: "not_allowed" }, 403);
    if (owned.submission.status !== "submitted" || owned.submission.reviewed_at || owned.evidenceRequest.status !== "submitted") {
      return json(req, { ok: false, error: "submission_locked" }, 409);
    }
    const comment = String(payload.comment ?? "").trim().slice(0, 2000);
    const { error } = await supabase.from("evidence_submissions").update({ teacher_comment: comment || null }).eq("id", submissionId);
    if (error) return json(req, { ok: false, error: "update_failed" }, 500);
    return json(req, { ok: true });
  }

  if (action === "delete-item") {
    const itemId = String(payload.item_id ?? "");
    if (!validUuid(itemId)) return json(req, { ok: false, error: "invalid_item" }, 400);
    const { data: item } = await supabase
      .from("evidence_submission_items")
      .select("id, submission_id, kind, storage_path")
      .eq("id", itemId)
      .maybeSingle();
    if (!item) return json(req, { ok: false, error: "item_not_found" }, 404);
    const owned = await loadOwnedSubmission(String(item.submission_id), teacherId);
    if (!owned) return json(req, { ok: false, error: "not_allowed" }, 403);
    if (owned.submission.status !== "submitted" || owned.submission.reviewed_at || owned.evidenceRequest.status !== "submitted") {
      return json(req, { ok: false, error: "submission_locked" }, 409);
    }

    if (item.storage_path) {
      const { error: storageError } = await supabase.storage.from(BUCKET).remove([String(item.storage_path)]);
      if (storageError) return json(req, { ok: false, error: "storage_delete_failed" }, 500);
    }
    const { error: deleteError } = await supabase.from("evidence_submission_items").delete().eq("id", itemId);
    if (deleteError) return json(req, { ok: false, error: "delete_failed" }, 500);

    const { count } = await supabase
      .from("evidence_submission_items")
      .select("id", { count: "exact", head: true })
      .eq("submission_id", owned.submission.id);

    if ((count ?? 0) === 0) {
      await supabase.from("evidence_submissions").delete().eq("id", owned.submission.id);
      const { data: previous } = await supabase
        .from("evidence_submissions")
        .select("id, reviewed_at, review_comment")
        .eq("request_id", owned.evidenceRequest.id)
        .not("reviewed_at", "is", null)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      await supabase.from("evidence_requests").update({
        status: previous ? "correction_required" : "pending",
        updated_at: new Date().toISOString(),
      }).eq("id", owned.evidenceRequest.id);
    }

    await supabase.from("activity_log").insert({
      expedient_id: owned.evidenceRequest.expedient_id,
      actor_type: "teacher",
      actor_teacher_id: teacherId,
      event_type: "evidence_item_deleted",
      message: "El docente eliminó una evidencia antes de la revisión.",
      metadata: { request_id: owned.evidenceRequest.id, submission_id: owned.submission.id, item_id: itemId },
    });

    return json(req, { ok: true, remaining_items: count ?? 0 });
  }

  return json(req, { ok: false, error: "invalid_action" }, 400);
});
