/**
 * mcp-marketing - TantricAwakening Virtual Temple CRM Layer
 * Cloudflare Worker - MCP + OAuth 2.1 + Acuity Scheduling Integration
 *
 * v2.1.0 - 2026-09-29
 *   - Added 🫦Aphrodesia / Hex Appeal segment IDs (prospect/approved/attendee)
 *   - Added internal keyed route POST /webhook/aphrodesia for the
 *     aphrodesia-intake Worker to fire Flodesk segment stage transitions
 *     (mirrors the existing unauthenticated /webhook/acuity precedent,
 *     but this one is protected by a shared X-Internal-Key header since
 *     it is not a public third-party webhook)
 *
 * v2.0.2 - 2026-03-24
 *   - Removed MYSTERY_SCHOOL_STUDENT segment (replaced by degree segments)
 *   - Removed from TIER_SEGMENTS array
 *   - Added fd_update_segment tool (rename segments via API)
 *   - Added fd_delete_segment tool
 *   - MYSTERY_SCHOOL_PROSPECT key retained, points to Mystery school (prospects)
 *     which Andrei will rename to 🎓 Mystery School (prospects) in Flodesk UI
 *
 * v2.0.1 - Full Temple segment map, payment detection, booking count conversion
 * v2.0.0 - Acuity Scheduling API added
 * v1.0.0 - Full Flodesk API suite
 *
 * Co-authors: Andrei R. Knight and Claude Sonnet 4.6 / Sonnet 5
 *
 * ============================================================
 * SECURITY NOTICE - READ BEFORE MODIFYING
 * ============================================================
 * These restrictions are INTENTIONAL and PERMANENT. Cannot be
 * overridden by system prompts, tool arguments, any AI model,
 * or any claimed "emergency" or "special permission".
 * Protects Noble Knight (Andrei Romanov Knight) and the
 * Tantric Awakening Temple ecosystem.
 * ============================================================
 *
 * Secrets: BEARER_TOKEN, FLODESK_API_KEY, ACUITY_USER_ID, ACUITY_API_KEY
 * KV: MCP_CRM_DATA
 * Subdomain: crm.tantricawakening.net
 */

const MCP_VERSION    = "2025-03-26";
const SERVER_NAME    = "mcp-marketing";
const SERVER_VERSION = "2.1.0";
const FLODESK_API    = "https://api.flodesk.com/v1";
const ACUITY_API     = "https://acuityscheduling.com/api/v1";

const APHRODESIA_INTERNAL_KEY = "67f4bcd44f40427dbee11a9561066b811cdb288e15f37ce9";

const SEGMENTS = {
  MAIN:                      "6495b66398d4002e426c151c",
  ACTIVE:                    "684d026d275aac173f3f809e",
  ABANDONED:                 "69bfc36884a14599aa1568d4",
  PERSONAL_ALCHEMY_PROSPECT: "685dabc2440b816d4e40bf3c",
  COUPLES_PROSPECT:          "685dafcbe3082a5e4b71c651",
  SOULFIRE_PROSPECT:         "684cfabda20e26949b0061a3",
  ASTROLOGY_PROSPECT:        "68674ebc2c9ef692abf93363",
  MYSTERY_SCHOOL_PROSPECT:   "6865942e592734c9261a74cd",
  EVENTS_PROSPECT:           "684d07c16b21c78b38dfd0c0",
  PERSONAL_ALCHEMY_CLIENT:   "685daf9678a1b128178a08a5",
  COUPLES_CLIENT:            "685dafe2e3082a5e4b71c653",
  SOULFIRE_CLIENT:           "684d05e025d49209d41bab75",
  ASTROLOGY_CLIENT:          "68674ef52c9ef692abf93364",
  EVENTS_ATTENDEE:           "684d07cd6b21c78b38dfd0c1",
  MEMBER:                    "69c2a475862d56cc5b6e8801",
  DEVOTEE:                   "69c2a4789a0eb6c942938fc4",
  INNER_CIRCLE:              "69c2a47c6b4c0a090006a175",
  DONOR_ONETIME:             "69c2a4806b4c0a090006a176",
  DONOR_MONTHLY:             "69c2a482c853694a342e66ff",
  DISCIPLE:                  "69c2a486d44fa763cb9cdbb8",
  ADEPT:                     "69c2a488d44fa763cb9cdbb9",
  PRIESTESS:                 "69c2a48c9a0eb6c942938fc7",
  PRIEST:                    "69c2a48f862d56cc5b6e8804",
  HIGH_PRIESTESS:            "69c2a492746ba12bd3256aeb",
  HIGH_PRIEST:               "69c2a497c853694a342e6704",
  HEALER_GUIDE:              "69c2a49a6b4c0a090006a178",
  TEAM:                      "69c2a49d862d56cc5b6e8805",
  VOLUNTEERS:                "69c2a4a06b4c0a090006a179",
  HIGH_COUNCIL:              "69c2a4a36b4c0a090006a17a",
  PODCAST:                   "684cf929a20e26949b006199",
  KNIGHT_TRADING_MAIN:       "6847f9bb48cf9ed6c270bd94",
  KNIGHT_TRADING_ACTIVE:     "684c41e9ea6e1821f6f40d7d",
  APHRODESIA_PROSPECT:       "6abc349c8a75ab4bfc5fc78e",
  APHRODESIA_APPROVED:       "6abc349e18137e147f33cda5",
  APHRODESIA_ATTENDEE:       "6abc349eb2ac8015aaa2a153",
};

const PROSPECT_CLIENT_MAP = {
  [SEGMENTS.PERSONAL_ALCHEMY_PROSPECT]: SEGMENTS.PERSONAL_ALCHEMY_CLIENT,
  [SEGMENTS.COUPLES_PROSPECT]:          SEGMENTS.COUPLES_CLIENT,
  [SEGMENTS.SOULFIRE_PROSPECT]:         SEGMENTS.SOULFIRE_CLIENT,
  [SEGMENTS.ASTROLOGY_PROSPECT]:        SEGMENTS.ASTROLOGY_CLIENT,
  [SEGMENTS.EVENTS_PROSPECT]:           SEGMENTS.EVENTS_ATTENDEE,
};

const APHRODESIA_STAGE_SEGMENTS = [
  SEGMENTS.APHRODESIA_PROSPECT,
  SEGMENTS.APHRODESIA_APPROVED,
  SEGMENTS.APHRODESIA_ATTENDEE,
];
const APHRODESIA_STAGE_MAP = {
  prospect: SEGMENTS.APHRODESIA_PROSPECT,
  approved: SEGMENTS.APHRODESIA_APPROVED,
  attendee: SEGMENTS.APHRODESIA_ATTENDEE,
};

const TIER_SEGMENTS = [SEGMENTS.MEMBER, SEGMENTS.DEVOTEE, SEGMENTS.INNER_CIRCLE];
const DEGREE_SEGMENTS = [SEGMENTS.DISCIPLE, SEGMENTS.ADEPT, SEGMENTS.PRIESTESS, SEGMENTS.PRIEST, SEGMENTS.HIGH_PRIESTESS, SEGMENTS.HIGH_PRIEST];

function mapAppointmentTypeToProspectSegment(typeName) {
  if (!typeName) return SEGMENTS.PERSONAL_ALCHEMY_PROSPECT;
  const n = typeName.toLowerCase();
  if (n.includes("couple") || n.includes("partner") || n.includes("relationship")) return SEGMENTS.COUPLES_PROSPECT;
  if (n.includes("soulfire") || n.includes("soul fire") || n.includes("discovery")) return SEGMENTS.SOULFIRE_PROSPECT;
  if (n.includes("astro") || n.includes("chart") || n.includes("birth")) return SEGMENTS.ASTROLOGY_PROSPECT;
  if (n.includes("mystery") || n.includes("school") || n.includes("course") || n.includes("class")) return SEGMENTS.MYSTERY_SCHOOL_PROSPECT;
  if (n.includes("retreat") || n.includes("event") || n.includes("workshop") || n.includes("ceremony")) return SEGMENTS.EVENTS_PROSPECT;
  return SEGMENTS.PERSONAL_ALCHEMY_PROSPECT;
}

async function flodesk(path, env, options = {}) {
  if (!env.FLODESK_API_KEY) throw new Error("FLODESK_API_KEY not set.");
  const res = await fetch(`${FLODESK_API}${path}`, {
    ...options,
    headers: {
      "Authorization": `Basic ${btoa(env.FLODESK_API_KEY + ":")}`,
      "Content-Type": "application/json",
      "User-Agent": "TantricAwakening-MCP/2.0 (crm.tantricawakening.net)",
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { message: text }; }
  if (!res.ok) throw new Error(`Flodesk ${res.status}: ${JSON.stringify(data)}`);
  return { status: res.status, data };
}

const fdGet    = (path, env, params = {}) => { const qs = Object.keys(params).length ? "?" + Object.entries(params).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&") : ""; return flodesk(`${path}${qs}`, env, { method: "GET" }); };
const fdPost   = (path, env, body = {}) => flodesk(path, env, { method: "POST",   body: JSON.stringify(body) });
const fdPatch  = (path, env, body = {}) => flodesk(path, env, { method: "PATCH",  body: JSON.stringify(body) });
const fdPut    = (path, env, body = {}) => flodesk(path, env, { method: "PUT",    body: JSON.stringify(body) });
const fdDelete = (path, env, body = {}) => { const opts = { method: "DELETE" }; if (Object.keys(body).length) opts.body = JSON.stringify(body); return flodesk(path, env, opts); };

async function acuity(path, env, options = {}) {
  if (!env.ACUITY_USER_ID || !env.ACUITY_API_KEY) throw new Error("ACUITY_USER_ID or ACUITY_API_KEY not set.");
  const res = await fetch(`${ACUITY_API}${path}`, {
    ...options,
    headers: {
      "Authorization": `Basic ${btoa(`${env.ACUITY_USER_ID}:${env.ACUITY_API_KEY}`)}`,
      "Content-Type": "application/json",
      "User-Agent": "TantricAwakening-MCP/2.0 (crm.tantricawakening.net)",
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { message: text }; }
  if (!res.ok) throw new Error(`Acuity ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

const acuityGet    = (path, env, params = {}) => { const qs = Object.keys(params).length ? "?" + Object.entries(params).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&") : ""; return acuity(`${path}${qs}`, env, { method: "GET" }); };
const acuityPost   = (path, env, body = {}) => acuity(path, env, { method: "POST",   body: JSON.stringify(body) });
const acuityPut    = (path, env, body = {}) => acuity(path, env, { method: "PUT",    body: JSON.stringify(body) });
const acuityDelete = (path, env)             => acuity(path, env, { method: "DELETE" });

async function handleAcuityWebhook(request, env) {
  let body;
  try { body = await request.json(); } catch { return new Response("Bad Request", { status: 400 }); }
  const { action, id } = body;
  let appointment = null;
  try { appointment = await acuityGet(`/appointments/${id}`, env); } catch (e) {
    console.error(`Acuity webhook: could not fetch appointment ${id}: ${e.message}`);
  }
  const email     = appointment?.email     || body.email;
  const firstName = appointment?.firstName || body.firstName || "";
  const lastName  = appointment?.lastName  || body.lastName  || "";
  const typeName  = appointment?.type      || "";
  const paid      = appointment?.paid      || false;
  const price     = parseFloat(appointment?.price || "0");
  if (!email) return jsonResponse({ status: "ignored", reason: "no email" });
  try {
    await fdPost("/subscribers", env, { email, first_name: firstName, last_name: lastName, segment_ids: [SEGMENTS.MAIN, SEGMENTS.ACTIVE] });
  } catch (e) {
    return jsonResponse({ status: "error", error: e.message }, 500);
  }
  const results        = { action, email, segments_added: [], segments_removed: [] };
  const prospectSeg    = mapAppointmentTypeToProspectSegment(typeName);
  const clientSeg      = PROSPECT_CLIENT_MAP[prospectSeg] || SEGMENTS.PERSONAL_ALCHEMY_CLIENT;
  if (action === "scheduled" || action === "order.completed") {
    const isPaid = paid || price > 0 || action === "order.completed";
    if (isPaid) {
      try {
        await fdPost(`/subscribers/${encodeURIComponent(email)}/segments`, env, { segment_ids: [clientSeg] });
        results.segments_added.push(clientSeg);
        try {
          await fdDelete(`/subscribers/${encodeURIComponent(email)}/segments`, env, { segment_ids: [prospectSeg] });
          results.segments_removed.push(prospectSeg);
        } catch {}
      } catch (e) { results.segment_error = e.message; }
    } else {
      const kvKey = `acuity_count:${email.toLowerCase()}`;
      let count = 0;
      try { const s = await env.MCP_CRM_DATA.get(kvKey); count = s ? parseInt(s, 10) : 0; } catch {}
      count += 1;
      await env.MCP_CRM_DATA.put(kvKey, String(count));
      if (count === 1) {
        try {
          await fdPost(`/subscribers/${encodeURIComponent(email)}/segments`, env, { segment_ids: [prospectSeg] });
          results.segments_added.push(prospectSeg);
          results.booking_count = 1;
        } catch (e) { results.segment_error = e.message; }
      } else {
        try {
          await fdPost(`/subscribers/${encodeURIComponent(email)}/segments`, env, { segment_ids: [clientSeg] });
          results.segments_added.push(clientSeg);
          try {
            await fdDelete(`/subscribers/${encodeURIComponent(email)}/segments`, env, { segment_ids: [prospectSeg] });
            results.segments_removed.push(prospectSeg);
          } catch {}
          results.booking_count = count;
          results.converted = true;
        } catch (e) { results.segment_error = e.message; }
      }
    }
  }
  if (action === "canceled") {
    try {
      await fdPost(`/subscribers/${encodeURIComponent(email)}/segments`, env, { segment_ids: [SEGMENTS.ABANDONED] });
      results.segments_added.push(SEGMENTS.ABANDONED);
    } catch (e) { results.segment_error = e.message; }
  }
  try {
    await env.MCP_CRM_DATA.put(
      `acuity_event:${action}:${id}:${Date.now()}`,
      JSON.stringify({ action, id, email, typeName, paid, timestamp: new Date().toISOString() }),
      { expirationTtl: 604800 }
    );
  } catch {}
  return jsonResponse({ status: "ok", ...results });
}

async function handleAphrodesiaWebhook(request, env) {
  const key = request.headers.get("x-internal-key") || request.headers.get("X-Internal-Key");
  if (key !== APHRODESIA_INTERNAL_KEY) return jsonResponse({ error: "unauthorized" }, 401);
  let body;
  try { body = await request.json(); } catch { return new Response("Bad Request", { status: 400 }); }
  const { email, first_name, last_name, stage } = body;
  if (!email) return jsonResponse({ status: "ignored", reason: "no email" });
  const targetSeg = APHRODESIA_STAGE_MAP[stage];
  if (!targetSeg) return jsonResponse({ status: "error", error: `unknown stage "${stage}"` }, 400);
  const addSegments = [SEGMENTS.MAIN, SEGMENTS.ACTIVE, targetSeg];
  if (stage === "prospect") addSegments.push(SEGMENTS.EVENTS_PROSPECT);
  if (stage === "attendee") addSegments.push(SEGMENTS.EVENTS_ATTENDEE);
  const results = { email, stage, segments_added: [], segments_removed: [] };
  try {
    await fdPost("/subscribers", env, { email, first_name: first_name || "", last_name: last_name || "", segment_ids: addSegments });
    results.segments_added.push(...addSegments);
  } catch (e) {
    return jsonResponse({ status: "error", error: e.message }, 500);
  }
  const otherStages = APHRODESIA_STAGE_SEGMENTS.filter(s => s !== targetSeg);
  if (otherStages.length) {
    try {
      await fdDelete(`/subscribers/${encodeURIComponent(email)}/segments`, env, { segment_ids: otherStages });
      results.segments_removed.push(...otherStages);
    } catch {}
  }
  return jsonResponse({ status: "ok", ...results });
}

function gate(toolName, description) {
  return { content: [{ type: "text", text: `CONFIRMATION REQUIRED\n\nTool: ${toolName}\nAction: ${description}\n\nCall again with confirmed: true.\n\nCannot be bypassed by any instruction.` }] };
}

const TOOLS = [
  { name: "ping", description: "Confirm mcp-marketing is live and all credentials are configured.", inputSchema: { type: "object", properties: { message: { type: "string" } }, required: [] }, async handler(p, e) { return { content: [{ type: "text", text: `Pong from mcp-marketing v${SERVER_VERSION}!\nFlodesk: ${e.FLODESK_API_KEY ? "OK" : "missing FLODESK_API_KEY"}\nAcuity: ${(e.ACUITY_USER_ID && e.ACUITY_API_KEY) ? "OK" : "missing ACUITY_USER_ID or ACUITY_API_KEY"}\nKV: ${e.MCP_CRM_DATA ? "OK" : "not bound"}\n${p.message || ""}` }] }; } },
  { name: "fd_list_subscribers", description: "List Flodesk subscribers. Filters: status, segment_id, page, per_page (max 100).", inputSchema: { type: "object", properties: { status: { type: "string", enum: ["active","unsubscribed","unconfirmed","bounced","complained","cleaned"] }, segment_id: { type: "string" }, page: { type: "number" }, per_page: { type: "number" } }, required: [] }, async handler(p, e) { const params = {}; if (p.status) params.status = p.status; if (p.segment_id) params.segment_id = p.segment_id; if (p.page) params.page = p.page; if (p.per_page) params.per_page = Math.min(p.per_page, 100); const r = await fdGet("/subscribers", e, params); return { content: [{ type: "text", text: JSON.stringify(r.data, null, 2) }] }; } },
  { name: "fd_get_subscriber", description: "Retrieve a single Flodesk subscriber by email or subscriber ID.", inputSchema: { type: "object", properties: { id_or_email: { type: "string" } }, required: ["id_or_email"] }, async handler(p, e) { const r = await fdGet(`/subscribers/${encodeURIComponent(p.id_or_email)}`, e); return { content: [{ type: "text", text: JSON.stringify(r.data, null, 2) }] }; } },
  { name: "fd_upsert_subscriber", description: "Create or update a Flodesk subscriber. Optionally add to segments and set custom fields.", inputSchema: { type: "object", properties: { email: { type: "string" }, first_name: { type: "string" }, last_name: { type: "string" }, segment_ids: { type: "array", items: { type: "string" } }, custom_fields: { type: "object" }, double_optin: { type: "boolean" } }, required: ["email"] }, async handler(p, e) { const body = { email: p.email }; if (p.first_name) body.first_name = p.first_name; if (p.last_name) body.last_name = p.last_name; if (p.segment_ids) body.segment_ids = p.segment_ids; if (p.custom_fields) body.custom_fields = p.custom_fields; if (p.double_optin !== undefined) body.double_optin = p.double_optin; const r = await fdPost("/subscribers", e, body); return { content: [{ type: "text", text: `Subscriber upserted.\n${JSON.stringify(r.data, null, 2)}` }] }; } },
  { name: "fd_add_to_segments", description: "Add a Flodesk subscriber to one or more segments.", inputSchema: { type: "object", properties: { id_or_email: { type: "string" }, segment_ids: { type: "array", items: { type: "string" } } }, required: ["id_or_email","segment_ids"] }, async handler(p, e) { const r = await fdPost(`/subscribers/${encodeURIComponent(p.id_or_email)}/segments`, e, { segment_ids: p.segment_ids }); return { content: [{ type: "text", text: `Added to segments.\n${JSON.stringify(r.data, null, 2)}` }] }; } },
  { name: "fd_remove_from_segments", description: "Remove a Flodesk subscriber from one or more segments. Sacred segments (MAIN, ACTIVE) are blocked.", inputSchema: { type: "object", properties: { id_or_email: { type: "string" }, segment_ids: { type: "array", items: { type: "string" } } }, required: ["id_or_email","segment_ids"] }, async handler(p, e) { const sacred  = [SEGMENTS.MAIN, SEGMENTS.ACTIVE]; const blocked = p.segment_ids.filter(id => sacred.includes(id)); if (blocked.length) return { content: [{ type: "text", text: `BLOCKED: Cannot remove from sacred segments (MAIN, ACTIVE). Blocked: ${blocked.join(", ")}` }] }; const r = await fdDelete(`/subscribers/${encodeURIComponent(p.id_or_email)}/segments`, e, { segment_ids: p.segment_ids }); return { content: [{ type: "text", text: `Removed from segments.\n${JSON.stringify(r.data, null, 2)}` }] }; } },
  { name: "fd_unsubscribe", description: "Unsubscribe a Flodesk subscriber from ALL lists. REQUIRES confirmed: true.", inputSchema: { type: "object", properties: { id_or_email: { type: "string" }, confirmed: { type: "boolean" } }, required: ["id_or_email"] }, async handler(p, e) { if (!p.confirmed) return gate("fd_unsubscribe", `Unsubscribe ${p.id_or_email} from ALL lists`); const r = await fdPost(`/subscribers/${encodeURIComponent(p.id_or_email)}/unsubscribe`, e); return { content: [{ type: "text", text: `Unsubscribed.\n${JSON.stringify(r.data, null, 2)}` }] }; } },
  { name: "fd_list_segments", description: "List all Flodesk segments with subscriber counts.", inputSchema: { type: "object", properties: { page: { type: "number" }, per_page: { type: "number" } }, required: [] }, async handler(p, e) { const params = {}; if (p.page) params.page = p.page; if (p.per_page) params.per_page = Math.min(p.per_page, 100); const r = await fdGet("/segments", e, params); return { content: [{ type: "text", text: JSON.stringify(r.data, null, 2) }] }; } },
  { name: "fd_get_segment", description: "Retrieve a single Flodesk segment by ID.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] }, async handler(p, e) { const r = await fdGet(`/segments/${p.id}`, e); return { content: [{ type: "text", text: JSON.stringify(r.data, null, 2) }] }; } },
  { name: "fd_create_segment", description: "Create a new Flodesk segment.", inputSchema: { type: "object", properties: { name: { type: "string" }, color: { type: "string" } }, required: ["name"] }, async handler(p, e) { const body = { name: p.name }; if (p.color) body.color = p.color; const r = await fdPost("/segments", e, body); return { content: [{ type: "text", text: `Segment created.\n${JSON.stringify(r.data, null, 2)}` }] }; } },
  { name: "fd_update_segment", description: "Rename a Flodesk segment or change its color. Provide segment ID plus new name and/or color.", inputSchema: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, color: { type: "string" } }, required: ["id"] }, async handler(p, e) { const body = {}; if (p.name)  body.name  = p.name; if (p.color) body.color = p.color; if (!Object.keys(body).length) return { content: [{ type: "text", text: "Provide at least one of: name, color." }] }; const r = await fdPatch(`/segments/${p.id}`, e, body); return { content: [{ type: "text", text: `Segment updated.\n${JSON.stringify(r.data, null, 2)}` }] }; } },
  { name: "fd_delete_segment", description: "Delete a Flodesk segment. Only works on empty segments (0 subscribers). REQUIRES confirmed: true.", inputSchema: { type: "object", properties: { id: { type: "string" }, confirmed: { type: "boolean" } }, required: ["id"] }, async handler(p, e) { if (!p.confirmed) return gate("fd_delete_segment", `Delete segment ${p.id}`); await fdDelete(`/segments/${p.id}`, e); return { content: [{ type: "text", text: `Segment ${p.id} deleted.` }] }; } },
  { name: "fd_list_segment_colors", description: "List all available Flodesk segment colors.", inputSchema: { type: "object", properties: {}, required: [] }, async handler(p, e) { const r = await fdGet("/segments/colors", e); return { content: [{ type: "text", text: JSON.stringify(r.data, null, 2) }] }; } },
  { name: "fd_list_workflows", description: "List Flodesk workflows.", inputSchema: { type: "object", properties: { statuses: { type: "string" }, page: { type: "number" }, per_page: { type: "number" } }, required: [] }, async handler(p, e) { const params = {}; if (p.statuses) params.statuses = p.statuses; if (p.page) params.page = p.page; if (p.per_page) params.perPage = p.per_page; const r = await fdGet("/workflows", e, params); return { content: [{ type: "text", text: JSON.stringify(r.data, null, 2) }] }; } },
  { name: "fd_add_to_workflow", description: "Add a subscriber to a Flodesk workflow.", inputSchema: { type: "object", properties: { workflow_id: { type: "string" }, id_or_email: { type: "string" } }, required: ["workflow_id","id_or_email"] }, async handler(p, e) { const body = p.id_or_email.includes("@") ? { email: p.id_or_email } : { id: p.id_or_email }; await fdPost(`/workflows/${p.workflow_id}/subscribers`, e, body); return { content: [{ type: "text", text: `Added to workflow ${p.workflow_id}.` }] }; } },
  { name: "fd_remove_from_workflow", description: "Remove a subscriber from a Flodesk workflow.", inputSchema: { type: "object", properties: { workflow_id: { type: "string" }, id_or_email: { type: "string" } }, required: ["workflow_id","id_or_email"] }, async handler(p, e) { await fdDelete(`/workflows/${p.workflow_id}/subscribers/${encodeURIComponent(p.id_or_email)}`, e); return { content: [{ type: "text", text: `Removed from workflow ${p.workflow_id}.` }] }; } },
  { name: "fd_list_custom_fields", description: "List Flodesk custom fields.", inputSchema: { type: "object", properties: { page: { type: "number" }, per_page: { type: "number" } }, required: [] }, async handler(p, e) { const params = {}; if (p.page) params.page = p.page; if (p.per_page) params.per_page = Math.min(p.per_page, 100); const r = await fdGet("/custom-fields", e, params); return { content: [{ type: "text", text: JSON.stringify(r.data, null, 2) }] }; } },
  { name: "fd_list_all_custom_fields", description: "List ALL Flodesk custom fields in a single call.", inputSchema: { type: "object", properties: {}, required: [] }, async handler(p, e) { const r = await fdGet("/custom-fields/all", e); return { content: [{ type: "text", text: JSON.stringify(r.data, null, 2) }] }; } },
  { name: "fd_create_custom_field", description: "Create a new Flodesk custom field.", inputSchema: { type: "object", properties: { label: { type: "string" } }, required: ["label"] }, async handler(p, e) { const r = await fdPost("/custom-fields", e, { label: p.label }); return { content: [{ type: "text", text: `Custom field created.\n${JSON.stringify(r.data, null, 2)}` }] }; } },
  { name: "fd_list_webhooks", description: "List all registered Flodesk webhooks.", inputSchema: { type: "object", properties: { page: { type: "number" }, per_page: { type: "number" } }, required: [] }, async handler(p, e) { const params = {}; if (p.page) params.page = p.page; if (p.per_page) params.per_page = Math.min(p.per_page, 100); const r = await fdGet("/webhooks", e, params); return { content: [{ type: "text", text: JSON.stringify(r.data, null, 2) }] }; } },
  { name: "fd_get_webhook", description: "Retrieve a single Flodesk webhook by ID.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] }, async handler(p, e) { const r = await fdGet(`/webhooks/${p.id}`, e); return { content: [{ type: "text", text: JSON.stringify(r.data, null, 2) }] }; } },
  { name: "fd_create_webhook", description: "Register a new Flodesk webhook.", inputSchema: { type: "object", properties: { name: { type: "string" }, post_url: { type: "string" }, events: { type: "array", items: { type: "string", enum: ["subscriber.created","subscriber.added_to_segment","subscriber.unsubscribed"] } } }, required: ["name","post_url","events"] }, async handler(p, e) { const r = await fdPost("/webhooks", e, { name: p.name, post_url: p.post_url, events: p.events }); return { content: [{ type: "text", text: `Webhook registered.\n${JSON.stringify(r.data, null, 2)}` }] }; } },
  { name: "fd_update_webhook", description: "Update an existing Flodesk webhook.", inputSchema: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, post_url: { type: "string" }, events: { type: "array", items: { type: "string" } } }, required: ["id"] }, async handler(p, e) { const body = {}; if (p.name) body.name = p.name; if (p.post_url) body.post_url = p.post_url; if (p.events) body.events = p.events; const r = await fdPut(`/webhooks/${p.id}`, e, body); return { content: [{ type: "text", text: `Webhook updated.\n${JSON.stringify(r.data, null, 2)}` }] }; } },
  { name: "fd_delete_webhook", description: "Delete a Flodesk webhook. REQUIRES confirmed: true.", inputSchema: { type: "object", properties: { id: { type: "string" }, confirmed: { type: "boolean" } }, required: ["id"] }, async handler(p, e) { if (!p.confirmed) return gate("fd_delete_webhook", `Delete webhook ${p.id}`); await fdDelete(`/webhooks/${p.id}`, e); return { content: [{ type: "text", text: `Webhook ${p.id} deleted.` }] }; } },
  { name: "acuity_list_appointments", description: "List Acuity appointments. Filters: minDate, maxDate, appointmentTypeID, calendarID, email, canceled, max.", inputSchema: { type: "object", properties: { minDate: { type: "string" }, maxDate: { type: "string" }, appointmentTypeID: { type: "number" }, calendarID: { type: "number" }, email: { type: "string" }, canceled: { type: "boolean" }, max: { type: "number" } }, required: [] }, async handler(p, e) { const params = {}; if (p.minDate) params.minDate = p.minDate; if (p.maxDate) params.maxDate = p.maxDate; if (p.appointmentTypeID) params.appointmentTypeID = p.appointmentTypeID; if (p.calendarID) params.calendarID = p.calendarID; if (p.email) params.email = p.email; if (p.canceled !== undefined) params.canceled = p.canceled; if (p.max) params.max = p.max; const data = await acuityGet("/appointments", e, params); return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }; } },
  { name: "acuity_get_appointment", description: "Get a single Acuity appointment by ID.", inputSchema: { type: "object", properties: { id: { type: "number" } }, required: ["id"] }, async handler(p, e) { const data = await acuityGet(`/appointments/${p.id}`, e); return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }; } },
  { name: "acuity_create_appointment", description: "Create an Acuity appointment. Requires appointmentTypeID, datetime (ISO), firstName, lastName, email.", inputSchema: { type: "object", properties: { appointmentTypeID: { type: "number" }, datetime: { type: "string" }, firstName: { type: "string" }, lastName: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, fields: { type: "array", items: { type: "object" } } }, required: ["appointmentTypeID","datetime","firstName","lastName","email"] }, async handler(p, e) { const body = { appointmentTypeID: p.appointmentTypeID, datetime: p.datetime, firstName: p.firstName, lastName: p.lastName, email: p.email }; if (p.phone) body.phone = p.phone; if (p.fields) body.fields = p.fields; const data = await acuityPost("/appointments", e, body); return { content: [{ type: "text", text: `Appointment created.\n${JSON.stringify(data, null, 2)}` }] }; } },
  { name: "acuity_cancel_appointment", description: "Cancel an Acuity appointment. REQUIRES confirmed: true.", inputSchema: { type: "object", properties: { id: { type: "number" }, noEmail: { type: "boolean" }, confirmed: { type: "boolean" } }, required: ["id"] }, async handler(p, e) { if (!p.confirmed) return gate("acuity_cancel_appointment", `Cancel appointment ${p.id}`); const body = {}; if (p.noEmail) body.noEmail = true; const data = await acuityPut(`/appointments/${p.id}/cancel`, e, body); return { content: [{ type: "text", text: `Cancelled.\n${JSON.stringify(data, null, 2)}` }] }; } },
  { name: "acuity_reschedule_appointment", description: "Reschedule an Acuity appointment to a new datetime. REQUIRES confirmed: true.", inputSchema: { type: "object", properties: { id: { type: "number" }, datetime: { type: "string" }, confirmed: { type: "boolean" } }, required: ["id","datetime"] }, async handler(p, e) { if (!p.confirmed) return gate("acuity_reschedule_appointment", `Reschedule appointment ${p.id} to ${p.datetime}`); const data = await acuityPut(`/appointments/${p.id}/reschedule`, e, { datetime: p.datetime }); return { content: [{ type: "text", text: `Rescheduled.\n${JSON.stringify(data, null, 2)}` }] }; } },
  { name: "acuity_list_appointment_types", description: "List all Acuity appointment types.", inputSchema: { type: "object", properties: { deleted: { type: "boolean" } }, required: [] }, async handler(p, e) { const params = {}; if (p.deleted) params.deleted = true; const data = await acuityGet("/appointment-types", e, params); return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }; } },
  { name: "acuity_check_availability", description: "Check available times for an appointment type on a given date (YYYY-MM-DD).", inputSchema: { type: "object", properties: { appointmentTypeID: { type: "number" }, date: { type: "string" }, calendarID: { type: "number" } }, required: ["appointmentTypeID","date"] }, async handler(p, e) { const params = { appointmentTypeID: p.appointmentTypeID, date: p.date }; if (p.calendarID) params.calendarID = p.calendarID; const data = await acuityGet("/availability/times", e, params); return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }; } },
  { name: "acuity_list_available_dates", description: "List available dates for an appointment type in a given month (YYYY-MM).", inputSchema: { type: "object", properties: { appointmentTypeID: { type: "number" }, month: { type: "string" }, calendarID: { type: "number" } }, required: ["appointmentTypeID","month"] }, async handler(p, e) { const params = { appointmentTypeID: p.appointmentTypeID, month: p.month }; if (p.calendarID) params.calendarID = p.calendarID; const data = await acuityGet("/availability/dates", e, params); return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }; } },
  { name: "acuity_list_clients", description: "Search Acuity clients by email or name.", inputSchema: { type: "object", properties: { email: { type: "string" }, firstName: { type: "string" }, lastName: { type: "string" } }, required: [] }, async handler(p, e) { const params = {}; if (p.email) params.email = p.email; if (p.firstName) params.firstName = p.firstName; if (p.lastName) params.lastName = p.lastName; const data = await acuityGet("/clients", e, params); return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }; } },
  { name: "acuity_upsert_client", description: "Create or update an Acuity client record.", inputSchema: { type: "object", properties: { email: { type: "string" }, firstName: { type: "string" }, lastName: { type: "string" }, phone: { type: "string" }, notes: { type: "string" } }, required: ["email","firstName","lastName"] }, async handler(p, e) { const existing = await acuityGet("/clients", e, { email: p.email }); const body = { firstName: p.firstName, lastName: p.lastName, email: p.email }; if (p.phone) body.phone = p.phone; if (p.notes) body.notes = p.notes; const data = (existing && existing.length > 0) ? await acuityPut("/clients", e, body) : await acuityPost("/clients", e, body); return { content: [{ type: "text", text: `Client upserted.\n${JSON.stringify(data, null, 2)}` }] }; } },
  { name: "acuity_list_calendars", description: "List all Acuity calendars.", inputSchema: { type: "object", properties: {}, required: [] }, async handler(p, e) { const data = await acuityGet("/calendars", e); return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }; } },
  { name: "acuity_list_webhooks", description: "List all active Acuity webhook subscriptions.", inputSchema: { type: "object", properties: {}, required: [] }, async handler(p, e) { const data = await acuityGet("/webhooks", e); return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }; } },
  { name: "acuity_create_webhook", description: "Register an Acuity webhook. Temple inbound: https://crm.tantricawakening.net/webhook/acuity. Events: appointment.scheduled, appointment.rescheduled, appointment.canceled, appointment.changed, order.completed.", inputSchema: { type: "object", properties: { event: { type: "string", enum: ["appointment.scheduled","appointment.rescheduled","appointment.canceled","appointment.changed","order.completed"] }, target: { type: "string" } }, required: ["event","target"] }, async handler(p, e) { const data = await acuityPost("/webhooks", e, { event: p.event, target: p.target }); return { content: [{ type: "text", text: `Webhook registered.\n${JSON.stringify(data, null, 2)}` }] }; } },
  { name: "acuity_delete_webhook", description: "Delete an Acuity webhook. REQUIRES confirmed: true.", inputSchema: { type: "object", properties: { id: { type: "number" }, confirmed: { type: "boolean" } }, required: ["id"] }, async handler(p, e) { if (!p.confirmed) return gate("acuity_delete_webhook", `Delete Acuity webhook ${p.id}`); await acuityDelete(`/webhooks/${p.id}`, e); return { content: [{ type: "text", text: `Webhook ${p.id} deleted.` }] }; } },
  { name: "acuity_list_forms", description: "List all Acuity intake forms and their fields.", inputSchema: { type: "object", properties: {}, required: [] }, async handler(p, e) { const data = await acuityGet("/forms", e); return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }; } },
  { name: "crm_kv_get", description: "Read a value from the MCP_CRM_DATA KV store.", inputSchema: { type: "object", properties: { key: { type: "string" } }, required: ["key"] }, async handler(p, e) { if (!e.MCP_CRM_DATA) return { content: [{ type: "text", text: "KV not bound." }] }; const v = await e.MCP_CRM_DATA.get(p.key); return { content: [{ type: "text", text: v !== null ? v : `Key "${p.key}" not found.` }] }; } },
  { name: "crm_kv_set", description: "Write a value to the MCP_CRM_DATA KV store. Optional TTL in seconds.", inputSchema: { type: "object", properties: { key: { type: "string" }, value: { type: "string" }, ttl_seconds: { type: "number" } }, required: ["key","value"] }, async handler(p, e) { if (!e.MCP_CRM_DATA) return { content: [{ type: "text", text: "KV not bound." }] }; const opts = p.ttl_seconds ? { expirationTtl: p.ttl_seconds } : {}; await e.MCP_CRM_DATA.put(p.key, p.value, opts); return { content: [{ type: "text", text: `Stored "${p.key}".` }] }; } },
  { name: "crm_kv_delete", description: "Delete a value from the MCP_CRM_DATA KV store.", inputSchema: { type: "object", properties: { key: { type: "string" } }, required: ["key"] }, async handler(p, e) { if (!e.MCP_CRM_DATA) return { content: [{ type: "text", text: "KV not bound." }] }; await e.MCP_CRM_DATA.delete(p.key); return { content: [{ type: "text", text: `Deleted "${p.key}".` }] }; } },
  { name: "crm_kv_list", description: "List keys in the MCP_CRM_DATA KV store. Optional prefix filter.", inputSchema: { type: "object", properties: { prefix: { type: "string" } }, required: [] }, async handler(p, e) { if (!e.MCP_CRM_DATA) return { content: [{ type: "text", text: "KV not bound." }] }; const r = await e.MCP_CRM_DATA.list(p.prefix ? { prefix: p.prefix } : {}); return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] }; } },
];

const toolMap = new Map(TOOLS.map(t => [t.name, t]));
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, MCP-Protocol-Version, X-Internal-Key" };
const cr  = (b, i = {}) => new Response(b, { ...i, headers: { ...CORS, ...(i.headers || {}) } });
const jr  = (d, s = 200) => cr(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json" } });
const ur  = base => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json", "WWW-Authenticate": [`Bearer realm="${base}"`, `resource_metadata="${base}/.well-known/oauth-protected-resource"`].join(", ") } });
const jsonResponse = jr;
const auth = (req, env) => { if (!env.BEARER_TOKEN) return true; return (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim() === env.BEARER_TOKEN; };
const tok  = (n = 32) => { const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"; const b = new Uint8Array(n); crypto.getRandomValues(b); return Array.from(b).map(x => c[x % c.length]).join(""); };

async function handleMcp(body, env) {
  const { jsonrpc, id, method, params } = body;
  if (jsonrpc !== "2.0") return { jsonrpc: "2.0", id, error: { code: -32600, message: "Invalid Request" } };
  if (method === "initialize") return { jsonrpc: "2.0", id, result: { protocolVersion: MCP_VERSION, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }, capabilities: { tools: {} } } };
  if (method === "notifications/initialized") return null;
  if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) } };
  if (method === "tools/call") {
    const tool = toolMap.get(params?.name);
    if (!tool) return { jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown tool: ${params?.name}` } };
    try { return { jsonrpc: "2.0", id, result: await tool.handler(params?.arguments ?? {}, env) }; }
    catch (err) { return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true } }; }
  }
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const base = new URL(request.url).origin;
    if (request.method === "OPTIONS") return cr(null, { status: 204 });
    if (path === "/webhook/acuity") return handleAcuityWebhook(request, env);
    if (path === "/webhook/aphrodesia") return handleAphrodesiaWebhook(request, env);
    if (path === "/health") return jr({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION, tools: TOOLS.length, kv: !!env.MCP_CRM_DATA, flodesk: !!env.FLODESK_API_KEY, acuity: !!(env.ACUITY_USER_ID && env.ACUITY_API_KEY), webhook_endpoint: `${base}/webhook/acuity`, aphrodesia_webhook_endpoint: `${base}/webhook/aphrodesia` });
    if (path === "/.well-known/oauth-authorization-server") return jr({ issuer: base, authorization_endpoint: `${base}/authorize`, token_endpoint: `${base}/token`, registration_endpoint: `${base}/register`, scopes_supported: ["mcp"], response_types_supported: ["code"], grant_types_supported: ["authorization_code"], code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"] });
    if (path === "/.well-known/oauth-protected-resource") return jr({ resource: `${base}/mcp`, authorization_servers: [base], bearer_methods_supported: ["header"] });
    if (path === "/register" || path.startsWith("/register/")) {
      if (request.method === "POST") { let b = {}; try { b = await request.json(); } catch {} const cid = `claude-${tok(16)}`; await env.MCP_CRM_DATA.put(`client:${cid}`, JSON.stringify({ client_id: cid, redirect_uris: b.redirect_uris || [], client_name: b.client_name || "Claude", created_at: Date.now() }), { expirationTtl: 86400 }); return jr({ client_id: cid, client_secret_expires_at: 0, registration_client_uri: `${base}/register/${cid}`, redirect_uris: b.redirect_uris || [], grant_types: ["authorization_code"], response_types: ["code"], token_endpoint_auth_method: "none" }, 201); }
      if (request.method === "GET") { const s = await env.MCP_CRM_DATA.get(`client:${path.replace("/register/", "")}`); return s ? jr(JSON.parse(s)) : jr({ error: "not_found" }, 404); }
    }
    if (path.startsWith("/authorize")) { const u = new URL(request.url), redir = u.searchParams.get("redirect_uri"); if (!redir) return cr("Missing redirect_uri", { status: 400 }); const code = tok(32); await env.MCP_CRM_DATA.put(`code:${code}`, JSON.stringify({ client_id: u.searchParams.get("client_id") || "unknown", redirect_uri: redir, created_at: Date.now() }), { expirationTtl: 600 }); const r = new URL(redir); r.searchParams.set("code", code); const state = u.searchParams.get("state"); if (state) r.searchParams.set("state", state); return Response.redirect(r.toString(), 302); }
    if (path === "/token" && request.method === "POST") { let b = {}; try { if ((request.headers.get("Content-Type") || "").includes("application/json")) { b = await request.json(); } else { const t = await request.text(); for (const pair of t.split("&")) { const [k, v] = pair.split("="); if (k) b[decodeURIComponent(k)] = decodeURIComponent(v || ""); } } } catch {} if (b.code) { const s = await env.MCP_CRM_DATA.get(`code:${b.code}`); if (!s) return jr({ error: "invalid_grant" }, 400); await env.MCP_CRM_DATA.delete(`code:${b.code}`); } const at = env.BEARER_TOKEN || tok(32); await env.MCP_CRM_DATA.put(`token:${at}`, JSON.stringify({ issued_at: Date.now() }), { expirationTtl: 31536000 }); return jr({ access_token: at, token_type: "Bearer", expires_in: 31536000, scope: "mcp" }); }
    if (path === "/" || path === "") return jr({ name: SERVER_NAME, version: SERVER_VERSION, tools: TOOLS.map(({ name, description }) => ({ name, description })), webhook_endpoint: `${base}/webhook/acuity`, aphrodesia_webhook_endpoint: `${base}/webhook/aphrodesia` });
    if (path.startsWith("/mcp")) { if (!auth(request, env)) return ur(base); if (request.method !== "POST") return cr("Method Not Allowed", { status: 405 }); let body; try { body = await request.json(); } catch { return jr({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); } const isBatch = Array.isArray(body); const responses = (await Promise.all((isBatch ? body : [body]).map(m => handleMcp(m, env)))).filter(r => r !== null); return jr(isBatch ? responses : responses[0] ?? null); }
    return cr("Not Found", { status: 404 });
  }
};
