/**
 * Netlify Function: generateTeamID
 *
 * Prevents duplicate email registrations and generates sequential Team IDs:
 *   INV-001, INV-002, ...
 *
 * IMPORTANT NOTE:
 * - Netlify Functions run in a serverless environment. Writing to the deployed
 *   code directory is typically NOT persistent (and can be read-only).
 * - This implementation reads the bundled `counter.json` as the initial value,
 *   then tries to persist updates (counter + submissions) in the runtime temp directory.
 *
 * For production-grade, globally unique sequential IDs across multiple instances,
 * use a persistent store (Netlify Blobs/KV/DB).
 */

const fs = require("fs/promises");
const path = require("path");
const os = require("os");

function pad3(n) {
  return String(n).padStart(3, "0");
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function parseEmailFromEvent(event) {
  // Expected frontend body: { "email": "..." }
  if (!event || !event.body) return "";

  // 1) Try JSON
  try {
    const obj = JSON.parse(event.body);
    if (obj && obj.email) return obj.email;
  } catch (e) {}

  // 2) Try x-www-form-urlencoded
  try {
    const params = new URLSearchParams(event.body);
    return params.get("email") || "";
  } catch (e) {}

  return "";
}

exports.handler = async function handler(event) {
  // Allow GET or POST (front-end will use POST)
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const email = normalizeEmail(parseEmailFromEvent(event));
  if (!email) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ error: "Email is required" }),
    };
  }

  // 1) Read counter.json (bundled with the function)
  const bundledCounterPath = path.join(__dirname, "counter.json");
  const bundledSubmissionsPath = path.join(__dirname, "submissions.json");

  // 2) Use a writable runtime file for best-effort persistence between warm invocations
  const runtimeCounterPath = path.join(os.tmpdir(), "invenza-counter.json");
  const runtimeSubmissionsPath = path.join(os.tmpdir(), "invenza-submissions.json");

  // Load submissions (prefer runtime, else bundled)
  const submissions =
    (await readJsonIfExists(runtimeSubmissionsPath)) ||
    (await readJsonIfExists(bundledSubmissionsPath)) ||
    { registrations: [] };

  const registrations = Array.isArray(submissions.registrations) ? submissions.registrations : [];
  const emailExists = registrations.some((r) => normalizeEmail(r && r.email) === email);

  // If email exists, do NOT generate a new Team ID
  if (emailExists) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ error: "Email already registered" }),
    };
  }

  // Prefer the runtime counter if it exists, otherwise fall back to bundled counter.json
  const current =
    (await readJsonIfExists(runtimeCounterPath)) ||
    (await readJsonIfExists(bundledCounterPath)) ||
    { count: 0 };

  const nextCount = (Number(current.count) || 0) + 1; // starts from 1 when initial is 0
  const teamID = "INV-" + pad3(nextCount);

  const updated = { count: nextCount };

  // Save updated counter
  try {
    await writeJson(runtimeCounterPath, updated);
  } catch (e) {
    // If we can't write, still return an ID (but persistence won't work)
  }

  // Attempt to write back to bundled file too (usually read-only in production)
  try {
    await writeJson(bundledCounterPath, updated);
  } catch (e) {}

  // Save submissions (best-effort)
  const updatedSubmissions = {
    registrations: registrations.concat([{ teamID, email }]),
  };

  try {
    await writeJson(runtimeSubmissionsPath, updatedSubmissions);
  } catch (e) {}

  try {
    await writeJson(bundledSubmissionsPath, updatedSubmissions);
  } catch (e) {}

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify({ teamID }),
  };
};

