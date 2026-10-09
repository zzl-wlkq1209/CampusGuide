const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

test("encrypted credentials and refresh requests round-trip through Supabase REST", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-secret";
  process.env.CREDENTIAL_ENCRYPTION_KEY = crypto
    .randomBytes(32)
    .toString("base64");

  const tables = {
    charging_credentials: [],
    credential_refresh: [{ id: 1, status: "idle" }],
  };
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    const table = parsed.pathname.split("/").pop();
    const method = options.method || "GET";
    if (method === "GET") {
      return new Response(JSON.stringify(tables[table]), { status: 200 });
    }
    const body = JSON.parse(options.body);
    if (method === "POST") tables[table] = [{ ...body }];
    if (method === "PATCH") tables[table][0] = { ...tables[table][0], ...body };
    return new Response(null, { status: 204 });
  };

  try {
    const store = require("../cloud-store");
    const credential = {
      authorization: "temporary-secret",
      openId: "openid",
      operatorId: "100664",
      gid: "FFFF000102115980",
    };
    await store.saveStoredCredentials(credential);
    assert.match(tables.charging_credentials[0].encrypted_payload, /^v1\./);
    assert.doesNotMatch(
      tables.charging_credentials[0].encrypted_payload,
      /temporary-secret/,
    );
    assert.deepEqual(await store.getStoredCredentials(), credential);

    const refresh = await store.requestRefresh("test");
    assert.equal(refresh.status, "requested");
    assert.equal((await store.refreshRow()).request_id, refresh.request_id);
    await store.patchRefresh({ status: "completed" });
    assert.equal((await store.refreshRow()).status, "completed");
  } finally {
    global.fetch = originalFetch;
  }
});
