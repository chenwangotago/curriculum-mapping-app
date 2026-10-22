import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const BUCKET = "curriculum-documents";
const TABLE = "curriculum_workspace_documents";
const MAX_FILE_BYTES = 6 * 1024 * 1024;
const MAX_BODY_BYTES = MAX_FILE_BYTES + 64 * 1024;
const CATEGORIES = ["Programme design", "Proposal", "Policy", "Course documentation", "Other"];
const TYPES = {
  pdf: "application/pdf", doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain", csv: "text/csv"
};
const PUBLIC_FIELDS = "id,filename,content_type,size_bytes,title,category,version,notes,uploaded_by,created_at,updated_at,archived_at";

class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function text(value, max, label, required = false) {
  if (typeof value !== "string" && value != null) throw new RequestError(400, `Invalid ${label}.`);
  const result = String(value || "").trim();
  if ((required && !result) || result.length > max) throw new RequestError(400, `${label} must ${required ? "contain 1 to" : "not exceed"} ${max} characters.`);
  return result;
}

function metadata(input) {
  const category = text(input.category, 50, "Category", true);
  if (!CATEGORIES.includes(category)) throw new RequestError(400, "Choose a valid document category.");
  return { title: text(input.title, 200, "Title", true), category,
    version: text(input.version, 100, "Version"), notes: text(input.notes, 10000, "Notes") };
}

async function boundedBody(request) {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) throw new RequestError(413, "Choose a file no larger than 6 MB.");
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, "Missing request body.");
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new RequestError(413, "Choose a file no larger than 6 MB."); }
    chunks.push(value);
  }
  const result = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

async function validateFile(file) {
  if (!(file instanceof File) || !file.size || file.size > MAX_FILE_BYTES) throw new RequestError(400, "Choose a non-empty file no larger than 6 MB.");
  const filename = file.name.replace(/[\x00-\x1f\x7f/\\]/g, "_").trim();
  if (!filename || filename.length > 240) throw new RequestError(400, "Use a filename of no more than 240 characters.");
  const extension = filename.split(".").pop().toLowerCase();
  if (!Object.hasOwn(TYPES, extension)) throw new RequestError(400, "Unsupported file type. Choose PDF, Word, Excel, PowerPoint, text, or CSV. Macro-enabled Office extensions are not supported.");
  const header = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const starts = bytes => bytes.every((byte, i) => header[i] === byte);
  if (extension === "pdf" && !starts([37, 80, 68, 70, 45])) throw new RequestError(400, "The file does not have a PDF header.");
  if (["docx", "xlsx", "pptx"].includes(extension) && !starts([80, 75, 3, 4])) throw new RequestError(400, "The file does not have an Office document container header.");
  if (["doc", "xls", "ppt"].includes(extension) && !starts([208, 207, 17, 224, 161, 177, 26, 225])) throw new RequestError(400, "The file does not have a supported Office document header.");
  if (["txt", "csv"].includes(extension) && header.includes(0)) throw new RequestError(400, "Use a UTF-8 text or CSV file.");
  // Header checks reject obvious mismatches; they are not a malware scan.
  return { filename, extension, contentType: TYPES[extension] };
}

export function createDocumentHandler(client, options = {}) {
  const origins = options.origins || ["https://chenwangotago.github.io"];
  return async request => {
    const origin = request.headers.get("origin");
    const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin" };
    if (origin && origins.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "authorization, x-client-info, apikey, content-type";
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    const reply = (status, data) => new Response(JSON.stringify(data), { status, headers });
    try {
      if (origin && !origins.includes(origin)) throw new RequestError(403, "This website is not allowed to use the document gateway.");
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
      if (request.method !== "POST") throw new RequestError(405, "Use POST for document requests.");
      const body = await boundedBody(request);
      const type = request.headers.get("content-type") || "";
      let input, file;
      if (type.startsWith("multipart/form-data")) {
        const form = await new Response(body, { headers: { "Content-Type": type } }).formData();
        input = Object.fromEntries([...form.entries()].filter(([key]) => key !== "file"));
        file = form.get("file");
      } else if (type.startsWith("application/json")) {
        try { input = JSON.parse(new TextDecoder().decode(body)); } catch { throw new RequestError(400, "Invalid request JSON."); }
      } else throw new RequestError(400, "Use JSON or a multipart file upload.");
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new RequestError(400, "Invalid document request.");
      const action = text(input.action, 20, "Action", true);
      if (!["list", "upload", "update", "archive", "download"].includes(action)) throw new RequestError(400, "Unknown document action.");
      const workspace = text(input.workspace, 240, "Workspace", true);
      const token = text(input.token, 128, "Access token", true);
      const { data: access, error: accessError } = await client.rpc("resolve_curriculum_document_access", { workspace_slug: workspace, access_token: token });
      if (accessError) throw new RequestError(503, "The Documents backend needs its Supabase database setup. Mapping data is unaffected.");
      const permission = access?.[0];
      if (!permission) throw new RequestError(403, "Workspace not found or access link invalid.");
      if (["upload", "update", "archive"].includes(action) && !permission.can_edit) throw new RequestError(403, "This review-only link cannot change documents.");
      const workspaceId = permission.workspace_id;
      if (action === "list") {
        const documents = [];
        for (let offset = 0; ; offset += 500) {
          const { data, error } = await client.from(TABLE).select(PUBLIC_FIELDS).eq("workspace_id", workspaceId).order("created_at", { ascending: false }).order("id").range(offset, offset + 499);
          if (error) throw new Error("Document list failed");
          documents.push(...data);
          if (data.length < 500) break;
        }
        return reply(200, { documents });
      }
      const author = text(input.author, 120, "Name");
      const log = async (event, title, id) => {
        const { error } = await client.from("curriculum_workspace_activity").insert({ workspace_id: workspaceId, author: author || "Unknown", action: event, target: title, details: { documentId: id } });
        if (error) console.warn("Document activity could not be recorded");
      };
      if (action === "upload") {
        const details = metadata(input);
        const info = await validateFile(file);
        const id = crypto.randomUUID();
        const path = `${workspaceId}/${id}.${info.extension}`;
        const { error: uploadError } = await client.storage.from(BUCKET).upload(path, file, { contentType: info.contentType, upsert: false });
        if (uploadError) throw new RequestError(503, "Upload failed. Check private storage setup and available storage space; no document was added to the library.");
        const { data, error } = await client.from(TABLE).insert({ id, workspace_id: workspaceId, storage_path: path, filename: info.filename,
          content_type: info.contentType, size_bytes: file.size, uploaded_by: author, ...details }).select(PUBLIC_FIELDS).single();
        if (error) {
          await client.storage.from(BUCKET).remove([path]);
          throw new RequestError(503, "Document details could not be saved. Please retry; mapping data is unaffected.");
        }
        await log("Uploaded document", details.title, id);
        return reply(201, { document: data });
      }
      const id = text(input.id, 36, "Document ID", true);
      if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) throw new RequestError(400, "Invalid document ID.");
      const { data: existing, error: findError } = await client.from(TABLE).select("*").eq("workspace_id", workspaceId).eq("id", id).maybeSingle();
      if (findError) throw new Error("Document lookup failed");
      if (!existing) throw new RequestError(404, "Document not found in this workspace.");
      if (action === "download") {
        if (!existing.storage_path.startsWith(`${workspaceId}/`)) throw new RequestError(403, "Document storage location is invalid.");
        const { data, error } = await client.storage.from(BUCKET).createSignedUrl(existing.storage_path, 60, { download: existing.filename });
        if (error) throw new RequestError(503, "Download unavailable. The original file may be missing; contact the workspace admin.");
        return reply(200, { url: data.signedUrl });
      }
      const expected = text(input.expectedUpdatedAt, 64, "Document revision", true);
      if (action === "archive" && typeof input.archived !== "boolean") throw new RequestError(400, "Invalid archive state.");
      const changes = action === "update" ? metadata(input) : { archived_at: input.archived ? new Date().toISOString() : null };
      const { data, error } = await client.from(TABLE).update(changes).eq("workspace_id", workspaceId).eq("id", id).eq("updated_at", expected).select(PUBLIC_FIELDS).maybeSingle();
      if (error) throw new Error("Document update failed");
      if (!data) throw new RequestError(409, "Someone else changed this document's details. Refresh the list, then review and retry your changes.");
      await log(action === "update" ? "Updated document details" : input.archived ? "Archived document" : "Restored document", data.title, id);
      return reply(200, { document: data });
    } catch (error) {
      if (error instanceof RequestError) return reply(error.status, { error: error.message });
      // Do not log request bodies, workspace tokens, signed URLs, or service credentials.
      console.error("Document gateway request failed");
      return reply(500, { error: "Document storage request failed. Please retry or contact the workspace admin." });
    }
  };
}

const url = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !serviceKey) throw new Error("Supabase server credentials are not configured.");
const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const origins = (Deno.env.get("DOCUMENT_ALLOWED_ORIGINS") || "https://chenwangotago.github.io").split(",").map(value => value.trim()).filter(Boolean);
Deno.serve(createDocumentHandler(client, { origins }));
