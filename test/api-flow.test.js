const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

test("expired status creates a refresh job which the Windows agent can claim", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-secret";
  process.env.CREDENTIAL_ENCRYPTION_KEY = crypto
    .randomBytes(32)
    .toString("base64");
  process.env.CREDENTIAL_AGENT_KEY = "agent-test-secret";

  const tables = {
    charging_credentials: [],
    credential_refresh: [{ id: 1, status: "idle" }],
  };
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.hostname === "example.supabase.co") {
      const table = parsed.pathname.split("/").pop();
      const method = options.method || "GET";
      if (method === "GET") {
        return new Response(JSON.stringify(tables[table]), { status: 200 });
      }
      const body = JSON.parse(options.body);
      if (method === "POST") tables[table] = [{ ...body }];
      if (method === "PATCH")
        tables[table][0] = { ...tables[table][0], ...body };
      return new Response(null, { status: 204 });
    }
    if (parsed.hostname === "mini.99cda.com") {
      return Response.json({ code: "02", msg: "expired" });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const { handler } = require("../netlify/functions/api");
    const status = await handler({
      httpMethod: "POST",
      path: "/api/status",
      headers: {},
      body: "{}",
    });
    assert.equal(status.statusCode, 202);
    assert.equal(JSON.parse(status.body).refreshing, true);
    assert.equal(tables.credential_refresh[0].status, "requested");

    const poll = await handler({
      httpMethod: "POST",
      path: "/api/agent/poll",
      headers: { "x-agent-key": "agent-test-secret" },
      body: "{}",
    });
    assert.equal(poll.statusCode, 200);
    assert.equal(JSON.parse(poll.body).refresh.status, "working");
    assert.equal(tables.credential_refresh[0].status, "working");
  } finally {
    global.fetch = originalFetch;
  }
});
