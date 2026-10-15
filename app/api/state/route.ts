import { env } from "cloudflare:workers";

const WORKSPACE_ID = "persona-builder-default";
const MAX_STATE_BYTES = 1_800_000;

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function requestUser(request: Request) {
  const userId = request.headers.get("oai-authenticated-user-id");
  if (userId) return userId;
  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost"
    ? "local-preview"
    : null;
}

export async function GET(request: Request) {
  if (!requestUser(request)) return json({ error: "Sign in is required." }, 401);
  if (!env.DB) return json({ error: "Cloud database is unavailable." }, 503);

  const row = await env.DB.prepare(
    "SELECT state_json, revision, updated_at, updated_by FROM workspace_state WHERE workspace_id = ?",
  )
    .bind(WORKSPACE_ID)
    .first<{
      state_json: string;
      revision: number;
      updated_at: string;
      updated_by: string;
    }>();

  if (!row) return json({ state: null, revision: null });
  return json({
    state: JSON.parse(row.state_json),
    revision: row.revision,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  });
}

export async function PUT(request: Request) {
  const userId = requestUser(request);
  if (!userId) return json({ error: "Sign in is required." }, 401);
  if (!env.DB) return json({ error: "Cloud database is unavailable." }, 503);

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_STATE_BYTES) {
    return json(
      { error: "The repository is too large to sync. Remove large attachments and try again." },
      413,
    );
  }

  let payload: { state?: unknown; revision?: number | null };
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON payload." }, 400);
  }
  if (!payload.state || typeof payload.state !== "object") {
    return json({ error: "A valid repository state is required." }, 400);
  }

  const current = await env.DB.prepare(
    "SELECT revision FROM workspace_state WHERE workspace_id = ?",
  )
    .bind(WORKSPACE_ID)
    .first<{ revision: number }>();

  const expectedRevision = payload.revision ?? null;
  if (current && expectedRevision !== current.revision) {
    return json(
      { error: "This workspace changed on another device. Reload before saving.", revision: current.revision },
      409,
    );
  }
  if (!current && expectedRevision !== null) {
    return json({ error: "Cloud state was reset. Reload before saving.", revision: null }, 409);
  }

  const updatedAt = new Date().toISOString();
  const stateJson = JSON.stringify(payload.state);
  const nextRevision = (current?.revision ?? 0) + 1;

  if (current) {
    const result = await env.DB.prepare(
      "UPDATE workspace_state SET state_json = ?, revision = ?, updated_at = ?, updated_by = ? WHERE workspace_id = ? AND revision = ?",
    )
      .bind(stateJson, nextRevision, updatedAt, userId, WORKSPACE_ID, current.revision)
      .run();
    if (!result.meta.changes) {
      return json({ error: "This workspace changed on another device. Reload before saving." }, 409);
    }
  } else {
    await env.DB.prepare(
      "INSERT INTO workspace_state (workspace_id, state_json, revision, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(WORKSPACE_ID, stateJson, nextRevision, updatedAt, userId)
      .run();
  }

  return json({ revision: nextRevision, updatedAt });
}
