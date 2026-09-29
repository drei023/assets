/**
 * aphrodesia-intake
 * Cloudflare Worker - 🫦Aphrodesia Community & Event Application intake handler
 * v1.0.0 - 2026-09-29
 * Author: Brother🤝Claude (Sonnet 5), for Andrei R. Knight / Tantric🌹Awakening™ Fellowship
 *
 * Receives POSTs from the Community & Event Application and Companion Form web pages.
 * On every submission:
 *   1. Writes a raw, unedited copy to the Submissions Log FIRST (safety net).
 *   2. Matches or creates the Person in 🌹 Aphrodesia People (by email, then phone).
 *   3. Creates the Application or Companion record, linked to Person + Event (+ parent
 *      Application, for a Companion).
 *   4. Creates a Care Request record when an Enjoyment/Safety request was written.
 *   5. Recomputes the non-blocking Gender Balance Flag on the parent Application.
 *   6. Upserts a Supporter Intelligence (SID) record and links it from People.
 *   7. Fires the 🫦Aphrodesia Flodesk segment assignment (via mcp-marketing's internal
 *      webhook) and an email to Andrei + Kendall (via mcp-google's internal route).
 * Steps 6-7 are best-effort: failures there are logged but never block the Airtable write,
 * which is the source of truth.
 *
 * KV binding: SID_CONFIG (shared with mcp-sid; supplies airtable_pat, already in use there)
 * Secrets: none required - reuses the existing Airtable PAT already stored in SID_CONFIG.
 */

const BASE_ID = "appyAbhVwEtHBCvc3";
const TABLES = {
  people: "tblNPFMH5TfMoY2zZ",
  applications: "tblHaF6A3JeIFv1s2",
  companions: "tbl5hFLLnqHAD9txA",
  careRequests: "tbl4BsSJpPp3U6fid",
  events: "tblxgoOhQ3UDb8zZh",
  sid: "tbl96tyzacjfFQ0HP",
  submissionsLog: "tblTJ2tqzGI4DLmyN",
};

const F_PEOPLE = {
  name: "fld4DZm5e2jupz7yG", pronouns: "fldLpQpE00KkvTpfy", gender: "fldnz9To7Nc2IoMCc",
  preference: "fldr4rF4rfKh6l5F3", city: "fldocyfIfxogF2LRU", email: "fldnrG19sZPkhPxFQ",
  phone: "fldIro8du52xdfQsU", instagram: "fldWRsQqcIKw50kOr", fetlife: "fldFofDThWlczJvuR",
  accessLevel: "fldCohxlCmVtTu82A", notes: "fldLwa0FHl4Ubquz2", referredBy: "fldqjiWjo6dme8nb2",
  sidLink: "fldcKcqHBwvOt8kSh", stage: "fldf6lfVC98R4cj2K",
};
const F_APP = {
  label: "fldmxc8ORPAOr5V7k", applicant: "fldAu1v6WKDi6nP7d", event: "flddgcx0QHIctBv2r",
  howHeard: "fldNgHayHeiACGV17", referredBy: "fldpBd79eSQwvbZSn", bringing: "fld5xBjcT3sIwxeay",
  companionNames: "fldIEGKQPz2yXH4im", relationshipDynamic: "fld0jbhDRfGO14l0b",
  priorExperience: "fldQypbXQ3LYWZf4S", comfortLevel: "fldQekoUAtBGOOp7O",
  observingParticipating: "fldWESgvrChv1dhU7", relationshipToEros: "fldWXro3SUAdfuo3C",
  lastSTIDate: "fldStHoGtWOQbmj0k", willingShare: "fld9PFYEECDNpSM29",
  testingDiscussion: "fld3k8tUMJGl995di", stiDocs: "fld5o9qutzVmffPmH", stiVerified: "fldQsB2WtAKQWQKT3",
  consentAskingNo: "fldEFPJP5vXdHu5g5", consentNoticing: "fldYOJeoLZc7ALp5X",
  aftercare: "fldePLZZvpfvmH6sL", consentDesireChanging: "fldjf4fhr7pNj4Kd3",
  hopes: "fld0Ib1IRnaD512T4", kinks: "fldKJoLVPIAORgdYs", nervous: "fldm9lrrv7rxl7oNU",
  hardLimits: "fldRm2QSuKTCwTbix", enjoymentSafety: "fldfXqOvcdLI8F9xN", introLink: "fldX31ixAL0be877q",
  covenant: "fldjQYakC1wqmtB2K", confirmed21: "fldFHj24GPwyiMjqT", status: "fld7P76EJyOTamno1",
  paymentStatus: "fld1Zsqxm2Y5fLANW", submitted: "fldYGQvC3I8WVBnOJ",
  companionsLink: "fldIsMInwOvckBvJp", careRequestsLink: "fldhyEV6ZHDtfv5H8",
  genderFlag: "fldtm9X9kPQp5lk9Z", genderNote: "fldi8V6HuvYEC7rVG",
};
const F_COMP = {
  label: "fldKR9beZfywxzSkB", application: "fldwoJ3Y7t4Jaktx6", person: "fldtccPzgjr0VC2X1",
  event: "fldB3Mf9thEfv9T0S", priorExperience: "fldF9A0ZxKe6vd0Y5", comfortLevel: "fldxNV525jNwrR4cp",
  observingParticipating: "fldn3XYOeYVbAfPGv", lastSTIDate: "fldU8HFotHwu5aOqC",
  willingShare: "fldxf1xGLdcM77GfG", testingDiscussion: "fldE9g3UrJz895UsU", stiDocs: "fldZF95sPSfWwLcI3",
  stiVerified: "fld2YivBXIEmjznoM", consentAskingNo: "flduMyTyGEUp5SSq4", consentNoticing: "fldWhsra2wIv9E7sx",
  aftercare: "fldylCUc2rH45nM2s", consentDesireChanging: "fldkPz9lo3wXe3aCx", hopes: "fld0RpNZhQutu4nwv",
  kinks: "fldZxsRbUtdgOfxhC", nervous: "fldbdhFft7MmVx5qp", hardLimits: "fldIxBVllOqSOXNGz",
  enjoymentSafety: "fldP1YiKyBLqxY9Xw", introLink: "fldOBdKH4z4KLYsQE", covenant: "fld5HGVmBIdRhiGfU",
  confirmed21: "fld5OvlRhv7mehokS", status: "fld8AHtlFzEIomegm", paymentStatus: "fldROGxfloarD4y2w",
  submitted: "fldLBuHKKoMTIpxfr", careRequestsLink: "fldf18SEIG8mpU5Xx",
};
const F_CARE = {
  summary: "fldkW4foIuQ6NZT3F", person: "fldxsndlyiTi4TYtM", event: "fldOf9WV60Pe5fl17",
  sourceApp: "fldZrb0YYqwfDXHa9", sourceCompanion: "fldJiNjTWh9x2iFce", category: "fldN9krEOoR1qEFRL",
  detail: "fld0lTdpBYTjQLDh6", recurring: "fldwQe2fM8dMXQlz0", status: "fldsDr7KKd9zDnarD",
};
const F_LOG = {
  label: "fldqMvzi8bgyyzI70", receivedAt: "fldZG1VDflC8qlJPf", formType: "fldMISg5e98td5yg3",
  email: "fldoDGBD2tvKiSiPj", phone: "fldLoZp7gpdRm9cUs", payload: "fldweyJHw3sn5iPej",
  status: "fld8QBM17DxTW3S3u", errorDetail: "fldCUZeDamREtQ36j",
};
const F_SID = {
  fullName: "fldYjxK7hO8dt2Urm", email: "fldxiOUBwGJrpdZ8S", journeyStage: "fldDhIDq4IAHes2lF",
  temperature: "fldZUapdsWOkzfPAI", sourceSystem: "fldN1eJTC5LBAnH2t", lastTouchDate: "fldYm2DPGKRypAkmF",
  lastTouchType: "fldzO7I5rLX7TrfWF", firstContactDate: "fldzb5Id4GWXjbzcI", eventsAttended: "fldyrM13x2mysqt7t",
  notes: "fldQU1bgRFdAlTepM", aphrodesiaPeopleLink: "fldFqapLPrQWvRVr9",
};

const DEFAULT_EVENT_ID = "recDihkJryzYyMQAG"; // Hex Appeal
const INTERNAL_KEY = "67f4bcd44f40427dbee11a9561066b811cdb288e15f37ce9";
const MARKETING_WEBHOOK = "https://crm.tantricawakening.net/webhook/aphrodesia";
const GOOGLE_DRAFT_ROUTE = "https://google.tantricawakening.net/internal/aphrodesia-draft";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" },
  });
}

async function at(env, method, tableId, path = "", body) {
  const pat = await env.SID_CONFIG.get("airtable_pat");
  if (!pat) throw new Error("airtable_pat not set in SID_CONFIG KV");
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}${path}`, {
    method,
    headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Airtable ${method} ${tableId} ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function findPersonByEmailOrPhone(env, email, phone) {
  const clauses = [];
  if (email) clauses.push(`LOWER({Email})=LOWER("${email.replace(/"/g, '\\"')}")`);
  if (phone) clauses.push(`{Phone}="${phone.replace(/"/g, '\\"')}"`);
  if (!clauses.length) return null;
  const formula = clauses.length > 1 ? `OR(${clauses.join(",")})` : clauses[0];
  const data = await at(env, "GET", TABLES.people, `?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`);
  return (data.records && data.records[0]) || null;
}

async function upsertPerson(env, p) {
  const existing = await findPersonByEmailOrPhone(env, p.email, p.phone);
  const fields = {};
  if (p.name) fields[F_PEOPLE.name] = p.name;
  if (p.pronouns) fields[F_PEOPLE.pronouns] = p.pronouns;
  if (p.physiologicalGender) fields[F_PEOPLE.gender] = p.physiologicalGender;
  if (p.sexualPreference) fields[F_PEOPLE.preference] = p.sexualPreference;
  if (p.city) fields[F_PEOPLE.city] = p.city;
  if (p.email) fields[F_PEOPLE.email] = p.email;
  if (p.phone) fields[F_PEOPLE.phone] = p.phone;
  if (p.instagram) fields[F_PEOPLE.instagram] = p.instagram;
  if (p.fetlife) fields[F_PEOPLE.fetlife] = p.fetlife;
  if (p.setStage) fields[F_PEOPLE.stage] = p.setStage;

  if (existing) {
    const data = await at(env, "PATCH", TABLES.people, `/${existing.id}`, { fields });
    return { id: data.id, created: false, fields: data.fields };
  }
  fields[F_PEOPLE.accessLevel] = "Public";
  const data = await at(env, "POST", TABLES.people, "", { records: [{ fields }] });
  return { id: data.records[0].id, created: true, fields: data.records[0].fields };
}

async function logSubmission(env, formType, email, phone, payload) {
  const label = `${formType} - ${email || phone || "unknown"} - ${new Date().toISOString()}`;
  const data = await at(env, "POST", TABLES.submissionsLog, "", {
    records: [{ fields: {
      [F_LOG.label]: label,
      [F_LOG.receivedAt]: new Date().toISOString(),
      [F_LOG.formType]: formType === "companion" ? "Companion" : "Application",
      [F_LOG.email]: email || "",
      [F_LOG.phone]: phone || "",
      [F_LOG.payload]: JSON.stringify(payload, null, 2).slice(0, 95000),
      [F_LOG.status]: "Processed",
    } }],
  });
  return data.records[0].id;
}

async function markLogError(env, logId, err) {
  try {
    await at(env, "PATCH", TABLES.submissionsLog, `/${logId}`, {
      fields: { [F_LOG.status]: "Error", [F_LOG.errorDetail]: String(err && err.message || err).slice(0, 19000) },
    });
  } catch { /* best effort */ }
}

function commonFieldMap(b, F) {
  const f = {};
  if (b.priorExperience) f[F.priorExperience] = b.priorExperience;
  if (b.comfortLevel) f[F.comfortLevel] = b.comfortLevel;
  if (b.observingParticipating) f[F.observingParticipating] = b.observingParticipating;
  if (b.lastSTITestDate) f[F.lastSTIDate] = b.lastSTITestDate;
  if (typeof b.willingShareResults === "boolean") f[F.willingShare] = b.willingShareResults;
  if (b.testingDiscussion) f[F.testingDiscussion] = b.testingDiscussion;
  if (b.consentAskingHearingNo) f[F.consentAskingNo] = b.consentAskingHearingNo;
  if (b.consentNoticingDiscomfort) f[F.consentNoticing] = b.consentNoticingDiscomfort;
  if (b.consentDesireChanging) f[F.consentDesireChanging] = b.consentDesireChanging;
  if (b.aftercareReflection) f[F.aftercare] = b.aftercareReflection;
  if (b.hopesForNight) f[F.hopes] = b.hopesForNight;
  if (b.kinksFantasies) f[F.kinks] = b.kinksFantasies;
  if (b.nervousSupport) f[F.nervous] = b.nervousSupport;
  if (b.hardLimits) f[F.hardLimits] = b.hardLimits;
  if (b.enjoymentSafetyRequest) f[F.enjoymentSafety] = b.enjoymentSafetyRequest;
  if (b.introLink) f[F.introLink] = b.introLink;
  f[F.covenant] = true; // submission itself only reaches here if the tick was checked client-side
  f[F.confirmed21] = true;
  f[F.status] = "Received";
  f[F.paymentStatus] = "Not Invoiced";
  f[F.submitted] = new Date().toISOString();
  return f;
}

async function createCareRequest(env, { personId, eventId, appId, companionId, text }) {
  const fields = {
    [F_CARE.summary]: `Enjoyment/safety request - ${new Date().toISOString().slice(0, 10)}`,
    [F_CARE.person]: [personId],
    [F_CARE.event]: [eventId],
    [F_CARE.category]: "Other",
    [F_CARE.detail]: text,
    [F_CARE.status]: "Open",
  };
  if (appId) fields[F_CARE.sourceApp] = [appId];
  if (companionId) fields[F_CARE.sourceCompanion] = [companionId];
  const data = await at(env, "POST", TABLES.careRequests, "", { records: [{ fields }] });
  return data.records[0].id;
}

async function recomputeGenderBalance(env, applicationId) {
  const app = await at(env, "GET", TABLES.applications, `/${applicationId}`);
  const applicantIds = app.fields[F_APP.applicant] || [];
  const companionAppLinks = app.fields[F_APP.companionsLink] || [];
  let men = 0, women = 0, other = 0;
  const genderOf = async (personId) => {
    const person = await at(env, "GET", TABLES.people, `/${personId}`);
    return person.fields[F_PEOPLE.gender];
  };
  for (const pid of applicantIds) {
    const g = await genderOf(pid);
    if (g === "Male") men++; else if (g === "Female") women++; else if (g) other++;
  }
  for (const compId of companionAppLinks) {
    const comp = await at(env, "GET", TABLES.companions, `/${compId}`);
    const personLink = comp.fields[F_COMP.person] || [];
    for (const pid of personLink) {
      const g = await genderOf(pid);
      if (g === "Male") men++; else if (g === "Female") women++; else if (g) other++;
    }
  }
  const flagged = men > women;
  const note = `Party tally as of last submission: ${women} women, ${men} men${other ? `, ${other} other/intersex` : ""}. Rule: women >= men. ${flagged ? "FLAGGED - men exceed women." : "Within rule."}`;
  await at(env, "PATCH", TABLES.applications, `/${applicationId}`, {
    fields: { [F_APP.genderFlag]: flagged, [F_APP.genderNote]: note },
  });
  return { flagged, note };
}

async function upsertSID(env, { name, email, personId, stage }) {
  const formula = `LOWER({Email})=LOWER("${(email || "").replace(/"/g, '\\"')}")`;
  const existing = email ? (await at(env, "GET", TABLES.sid, `?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`)).records[0] : null;
  const today = new Date().toISOString().slice(0, 10);
  const fields = {
    [F_SID.fullName]: name,
    [F_SID.email]: email,
    [F_SID.lastTouchDate]: today,
    [F_SID.lastTouchType]: "Event Booking",
    [F_SID.aphrodesiaPeopleLink]: [personId],
  };
  if (!existing) {
    fields[F_SID.journeyStage] = "Seeker";
    fields[F_SID.temperature] = "Warm";
    fields[F_SID.sourceSystem] = ["Manual"];
    fields[F_SID.firstContactDate] = today;
    const data = await at(env, "POST", TABLES.sid, "", { records: [{ fields }] });
    return data.records[0].id;
  }
  const data = await at(env, "PATCH", TABLES.sid, `/${existing.id}`, { fields });
  return data.id;
}

async function notifyMarketing(env, { email, name, stage }) {
  try {
    await fetch(MARKETING_WEBHOOK, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-key": INTERNAL_KEY },
      body: JSON.stringify({ email, first_name: name, stage }),
    });
  } catch (e) { console.error("marketing webhook failed", e.message); }
}

async function notifyGoogle(env, { subject, summary, applicantName, eventName, airtableUrl }) {
  try {
    await fetch(GOOGLE_DRAFT_ROUTE, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-key": INTERNAL_KEY },
      body: JSON.stringify({ subject, summary, applicantName, eventName, airtableUrl }),
    });
  } catch (e) { console.error("google draft route failed", e.message); }
}

async function handleSubmit(request, env, formType) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  if (!body.covenantAcknowledged || !body.confirmed21) {
    return json({ ok: false, error: "Covenant acknowledgment and 21+ confirmation are both required." }, 400);
  }

  const person = body.person || {};
  let logId;
  try {
    logId = await logSubmission(env, formType, person.email, person.phone, body);
  } catch (e) {
    console.error("CRITICAL: submissions log write failed", e.message);
  }

  try {
    const eventId = body.eventId || DEFAULT_EVENT_ID;

    const personResult = await upsertPerson(env, { ...person, setStage: "Prospect" });

    let referredById = null;
    if (body.referredByEmail) {
      const ref = await findPersonByEmailOrPhone(env, body.referredByEmail, null);
      if (ref) referredById = ref.id;
    }

    let recordId, careRequestId = null, genderResult = null;

    if (formType === "application") {
      const fields = {
        [F_APP.label]: `${person.name || "Applicant"} - ${eventId}`,
        [F_APP.applicant]: [personResult.id],
        [F_APP.event]: [eventId],
        ...commonFieldMap(body, F_APP),
      };
      if (body.howHeard) fields[F_APP.howHeard] = body.howHeard;
      if (referredById) fields[F_APP.referredBy] = [referredById];
      if (body.bringing) fields[F_APP.bringing] = body.bringing;
      if (body.companionNamesAsGiven) fields[F_APP.companionNames] = body.companionNamesAsGiven;
      if (body.relationshipDynamic) fields[F_APP.relationshipDynamic] = body.relationshipDynamic;
      if (body.relationshipToEros) fields[F_APP.relationshipToEros] = body.relationshipToEros;

      const data = await at(env, "POST", TABLES.applications, "", { records: [{ fields }] });
      recordId = data.records[0].id;

      if (body.enjoymentSafetyRequest) {
        careRequestId = await createCareRequest(env, { personId: personResult.id, eventId, appId: recordId, text: body.enjoymentSafetyRequest });
      }
      genderResult = await recomputeGenderBalance(env, recordId);
    } else {
      if (!body.applicationId) return json({ ok: false, error: "companion submissions require applicationId" }, 400);
      const fields = {
        [F_COMP.label]: `${person.name || "Companion"} - ${eventId}`,
        [F_COMP.application]: [body.applicationId],
        [F_COMP.person]: [personResult.id],
        [F_COMP.event]: [eventId],
        ...commonFieldMap(body, F_COMP),
      };
      const data = await at(env, "POST", TABLES.companions, "", { records: [{ fields }] });
      recordId = data.records[0].id;

      if (body.enjoymentSafetyRequest) {
        careRequestId = await createCareRequest(env, { personId: personResult.id, eventId, companionId: recordId, text: body.enjoymentSafetyRequest });
      }
      genderResult = await recomputeGenderBalance(env, body.applicationId);
    }

    let sidId = null;
    try { sidId = await upsertSID(env, { name: person.name, email: person.email, personId: personResult.id, stage: "Prospect" }); }
    catch (e) { console.error("SID upsert failed", e.message); }
    if (sidId) {
      try { await at(env, "PATCH", TABLES.people, `/${personResult.id}`, { fields: { [F_PEOPLE.sidLink]: [sidId] } }); }
      catch (e) { console.error("People->SID link failed", e.message); }
    }

    const tableForLink = formType === "application" ? TABLES.applications : TABLES.companions;
    const airtableUrl = `https://airtable.com/${BASE_ID}/${tableForLink}/${recordId}`;

    await Promise.all([
      notifyMarketing(env, { email: person.email, name: person.name, stage: "prospect" }),
      notifyGoogle(env, {
        subject: `🫦Aphrodesia - New ${formType === "companion" ? "Companion" : "Application"}: ${person.name || "Unnamed"}`,
        summary: `${person.name || "Someone"} (${person.email || "no email"}) just submitted the ${formType === "companion" ? "Companion Form" : "Community & Event Application"}.${genderResult && genderResult.flagged ? "\n\n⚠️ Gender balance flag: " + genderResult.note : ""}`,
        applicantName: person.name || "",
        eventName: eventId,
        airtableUrl,
      }),
    ]);

    return json({
      ok: true,
      personId: personResult.id,
      personCreated: personResult.created,
      recordId,
      careRequestId,
      genderBalance: genderResult,
      submissionsLogId: logId,
    });
  } catch (err) {
    console.error("Submission processing failed", err.message);
    if (logId) await markLogError(env, logId, err);
    return json({ ok: false, error: err.message, submissionsLogId: logId }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return json({}, 204);
    if (url.pathname === "/health") return json({ ok: true, worker: "aphrodesia-intake", version: "1.0.0" });
    if (request.method === "POST" && url.pathname === "/submit/application") return handleSubmit(request, env, "application");
    if (request.method === "POST" && url.pathname === "/submit/companion") return handleSubmit(request, env, "companion");
    return json({ ok: false, error: "Not found" }, 404);
  },
};
