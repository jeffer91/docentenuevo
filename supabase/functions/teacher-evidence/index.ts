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

function safeFileName(value: string) {
  const cleaned = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  return cleaned.slice(0, 120) || "evidencia";
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
    const files = form.getAll("file").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    const links = form.getAll("link")
      .map((entry) => normalizeHttpUrl(String(entry ?? "")))
      .filter((entry): entry is string => Boolean(entry));

    if (!token || !validUuid(requestId)) {
      return json(req, { ok: false, error: "invalid_request" }, 400);
    }
    if (files.length + links.length < 1 || files.length + links.length > MAX_ITEMS) {
      return json(req, { ok: false, error: "invalid_item_count", max_items: MAX_ITEMS }, 400);
    }

    const preparedFiles: Array<{ file: File; mime: string }> = [];
    for (const file of files) {
      if (file.size <= 0 || file.size > MAX_BYTES) {
        return json(req, { ok: false, error: "invalid_file_size", file_name: file.name }, 400);
      }
      const mime = normalizedMime(file);
      if (!mime) {
        return json(req, { ok: false, error: "unsupported_file_type", file_name: file.name }, 400);
      }
      preparedFiles.push({ file, mime });
    }

    const { data: sessionRows, error: sessionError } = await supabase.rpc("teacher_validate_device", { p_token: token });
    const session = !sessionError && Array.isArray(sessionRows) ? sessionRows[0] : null;
    const teacherId = session?.teacher_id ? String(session.teacher_id) : "";
    if (!teacherId) return json(req, { ok: false, error: "invalid_session" }, 401);

    const { data: evidenceRequest, error: requestError } = await supabase
      .from("evidence_requests")
      .select("id, expedient_id, status, title, criterion_id")
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

    const { data: approvedNa } = evidenceRequest.criterion_id
      ? await supabase
        .from("criterion_na_requests")
        .select("id")
        .eq("expedient_id", evidenceRequest.expedient_id)
        .eq("criterion_id", evidenceRequest.criterion_id)
        .eq("status", "approved")
        .limit(1)
        .maybeSingle()
      : { data: null };
    if (approvedNa) return json(req, { ok: false, error: "criterion_not_applicable" }, 409);

    const { data: previous } = await supabase
      .from("evidence_submissions")
      .select("version")
      .eq("request_id", requestId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const version = Number(previous?.version ?? 0) + 1;
    const submissionId = crypto.randomUUID();
    const uploadedPaths: string[] = [];
    const items: Array<Record<string, unknown>> = [];
    let position = 1;

    for (const prepared of preparedFiles) {
      const storagePath = `${evidenceRequest.expedient_id}/${requestId}/v${version}/${submissionId}/${position}-${crypto.randomUUID()}-${safeFileName(prepared.file.name)}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, prepared.file, {
        contentType: prepared.mime,
        upsert: false,
        cacheControl: "3600",
      });
      if (uploadError) {
        if (uploadedPaths.length) await supabase.storage.from(BUCKET).remove(uploadedPaths);
        return json(req, { ok: false, error: "upload_failed", file_name: prepared.file.name }, 500);
      }
      uploadedPaths.push(storagePath);
      items.push({
        submission_id: submissionId,
        position,
        kind: prepared.mime.startsWith("image/") ? "image" : "file",
        file_name: prepared.file.name,
        mime_type: prepared.mime,
        size_bytes: prepared.file.size,
        storage_path: storagePath,
        external_url: null,
      });
      position += 1;
    }

    for (const link of links) {
      items.push({
        submission_id: submissionId,
        position,
        kind: "link",
        file_name: null,
        mime_type: null,
        size_bytes: null,
        storage_path: null,
        external_url: link,
      });
      position += 1;
    }

    const firstFile = items.find((item) => item.kind === "image" || item.kind === "file");
    const { error: submissionError } = await supabase
      .from("evidence_submissions")
      .insert({
        id: submissionId,
        request_id: requestId,
        teacher_id: teacherId,
        version,
        file_name: firstFile?.file_name ?? null,
        mime_type: firstFile?.mime_type ?? null,
        size_bytes: firstFile?.size_bytes ?? null,
        storage_path: firstFile?.storage_path ?? null,
        teacher_comment: comment || null,
        status: "submitted",
      });

    if (submissionError) {
      if (uploadedPaths.length) await supabase.storage.from(BUCKET).remove(uploadedPaths);
      return json(req, { ok: false, error: "submission_failed" }, 500);
    }

    const { error: itemsError } = await supabase.from("evidence_submission_items").insert(items);
    if (itemsError) {
      await supabase.from("evidence_submissions").delete().eq("id", submissionId);
      if (uploadedPaths.length) await supabase.storage.from(BUCKET).remove(uploadedPaths);
      return json(req, { ok: false, error: "submission_items_failed" }, 500);
    }

    await supabase
      .from("evidence_submissions")
      .update({ status: "superseded" })
      .eq("request_id", requestId)
      .neq("id", submissionId)
      .in("status", ["submitted", "correction_required"]);

    await supabase.from("evidence_requests").update({ status: "submitted", updated_at: new Date().toISOString() }).eq("id", requestId);
    await supabase.from("activity_log").insert({
      expedient_id: evidenceRequest.expedient_id,
      actor_type: "teacher",
      actor_teacher_id: teacherId,
      event_type: "evidence_submitted",
      message: `El docente envió la evidencia: ${String(evidenceRequest.title ?? "Evidencia")}.`,
      metadata: { request_id: requestId, submission_id: submissionId, version, item_count: items.length },
    });

    return json(req, { ok: true, submission_id: submissionId, version, item_count: items.length });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(req, { ok: false, error: "invalid_json" }, 400);
  }

  const action = String(payload.action ?? "");

  if (action === "signed-item-url" || action === "staff-item-signed-url") {
    const itemId = String(payload.item_id ?? "");
    if (!validUuid(itemId)) return json(req, { ok: false, error: "invalid_item" }, 400);

    const { data: item } = await supabase
      .from("evidence_submission_items")
      .select("id, submission_id, kind, storage_path, external_url, file_name")
      .eq("id", itemId)
      .maybeSingle();
    if (!item) return json(req, { ok: false, error: "item_not_found" }, 404);

    const { data: submission } = await supabase
      .from("evidence_submissions")
      .select("id, request_id, teacher_id")
      .eq("id", item.submission_id)
      .maybeSingle();
    if (!submission) return json(req, { ok: false, error: "submission_not_found" }, 404);

    if (action === "signed-item-url") {
      const token = String(payload.token ?? "");
      const { data: sessionRows } = await supabase.rpc("teacher_validate_device", { p_token: token });
      const session = Array.isArray(sessionRows) ? sessionRows[0] : null;
      if (!session?.teacher_id || String(session.teacher_id) !== String(submission.teacher_id)) {
        return json(req, { ok: false, error: "not_allowed" }, 403);
      }
    } else {
      const staffId = String(payload.staff_id ?? "");
      if (!validUuid(staffId)) return json(req, { ok: false, error: "invalid_staff" }, 400);
      const { data: evidenceRequest } = await supabase.from("evidence_requests").select("expedient_id").eq("id", submission.request_id).maybeSingle();
      const { data: expedient } = evidenceRequest
        ? await supabase.from("expedients").select("coordinator_staff_id").eq("id", evidenceRequest.expedient_id).maybeSingle()
        : { data: null };
      const { data: staff } = await supabase.from("siacd_staff").select("id, role, active").eq("id", staffId).maybeSingle();
      const allowed = Boolean(staff?.active) && (String(staff?.role) === "admin" || String(expedient?.coordinator_staff_id ?? "") === staffId);
      if (!allowed) return json(req, { ok: false, error: "not_allowed" }, 403);
    }

    if (item.kind === "link") return json(req, { ok: true, url: item.external_url, kind: "link" });
    const { data: signed, error: signedError } = await supabase.storage.from(BUCKET).createSignedUrl(String(item.storage_path), 900, {
      download: String(item.file_name ?? "evidencia"),
    });
    if (signedError || !signed?.signedUrl) return json(req, { ok: false, error: "signed_url_failed" }, 500);
    return json(req, { ok: true, url: signed.signedUrl, kind: item.kind });
  }

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

  if (!submission.storage_path) {
    const { data: firstItem } = await supabase
      .from("evidence_submission_items")
      .select("storage_path, external_url, file_name, kind")
      .eq("submission_id", submission.id)
      .order("position")
      .limit(1)
      .maybeSingle();
    if (!firstItem) return json(req, { ok: false, error: "item_not_found" }, 404);
    if (firstItem.kind === "link") return json(req, { ok: true, url: firstItem.external_url, kind: "link" });
    const { data: signed, error: signedError } = await supabase.storage.from(BUCKET).createSignedUrl(String(firstItem.storage_path), 900, {
      download: String(firstItem.file_name ?? "evidencia"),
    });
    if (signedError || !signed?.signedUrl) return json(req, { ok: false, error: "signed_url_failed" }, 500);
    return json(req, { ok: true, url: signed.signedUrl, kind: firstItem.kind });
  }

  const { data: signed, error: signedError } = await supabase.storage.from(BUCKET).createSignedUrl(String(submission.storage_path), 900, {
    download: String(submission.file_name ?? "evidencia"),
  });
  if (signedError || !signed?.signedUrl) return json(req, { ok: false, error: "signed_url_failed" }, 500);
  return json(req, { ok: true, url: signed.signedUrl });
});
