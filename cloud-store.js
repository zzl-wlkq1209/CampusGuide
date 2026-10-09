const crypto = require("node:crypto");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "";
const ENCRYPTION_KEY_TEXT = process.env.CREDENTIAL_ENCRYPTION_KEY || "";

function isCloudConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY && ENCRYPTION_KEY_TEXT);
}

function cloudConfigStatus() {
  return {
    supabaseUrl: Boolean(SUPABASE_URL),
    supabaseKey: Boolean(SUPABASE_KEY),
    encryptionKey: Boolean(ENCRYPTION_KEY_TEXT),
  };
}

function encryptionKey() {
  const key = Buffer.from(ENCRYPTION_KEY_TEXT, "base64");
  if (key.length !== 32) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY 必须是 32 字节 Base64 密钥");
  }
  return key;
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

function decrypt(payload) {
  const [version, iv, tag, ciphertext] = String(payload || "").split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) {
    throw new Error("云端凭证格式无效");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8"),
  );
}

async function supabase(path, options = {}) {
  if (!isCloudConfigured()) throw new Error("Supabase 尚未配置");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      authorization: `Bearer ${SUPABASE_KEY}`,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase 请求失败 (${response.status}): ${message}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function getStoredCredentials() {
  if (!isCloudConfigured()) return null;
  const rows = await supabase(
    "charging_credentials?select=encrypted_payload&id=eq.1&limit=1",
  );
  return rows?.[0]?.encrypted_payload
    ? decrypt(rows[0].encrypted_payload)
    : null;
}

async function saveStoredCredentials(credentials) {
  await supabase("charging_credentials?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      id: 1,
      encrypted_payload: encrypt(credentials),
      updated_at: new Date().toISOString(),
    }),
  });
}

async function refreshRow() {
  const rows = await supabase("credential_refresh?select=*&id=eq.1&limit=1");
  return rows?.[0] || null;
}

async function patchRefresh(fields) {
  await supabase("credential_refresh?id=eq.1", {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(fields),
  });
}

async function requestRefresh(source = "web") {
  const current = await refreshRow();
  if (["requested", "working"].includes(current?.status)) return current;
  if (current?.status === "failed" && current.source === source) {
    return { ...current, failedForSource: true };
  }
  const requestId = crypto.randomUUID();
  const record = {
    id: 1,
    status: "requested",
    request_id: requestId,
    source,
    requested_at: new Date().toISOString(),
    completed_at: null,
    error_message: null,
  };
  await supabase("credential_refresh?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(record),
  });
  return record;
}

module.exports = {
  cloudConfigStatus,
  getStoredCredentials,
  isCloudConfigured,
  patchRefresh,
  refreshRow,
  requestRefresh,
  saveStoredCredentials,
};
