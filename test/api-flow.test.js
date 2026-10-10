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
      body: JSON.stringify({ queryId: "initial-query" }),
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

    tables.credential_refresh[0] = {
      id: 1,
      status: "failed",
      request_id: "failed-job",
      source: "web:failed-query",
    };
    const failedSameQuery = await handler({
      httpMethod: "POST",
      path: "/api/status",
      headers: {},
      body: JSON.stringify({ queryId: "failed-query" }),
    });
    assert.equal(failedSameQuery.statusCode, 503);
    assert.equal(JSON.parse(failedSameQuery.body).code, "REFRESH_FAILED");
    assert.match(
      JSON.parse(failedSameQuery.body).errorPoint,
      /电脑代理执行失败/,
    );
    assert.equal(tables.credential_refresh[0].request_id, "failed-job");

    const immediateRetry = await handler({
      httpMethod: "POST",
      path: "/api/status",
      headers: {},
      body: JSON.stringify({ queryId: "next-click" }),
    });
    assert.equal(immediateRetry.statusCode, 202);
    assert.notEqual(tables.credential_refresh[0].request_id, "failed-job");

    tables.credential_refresh[0] = {
      id: 1,
      status: "requested",
      request_id: "unclaimed-job",
      source: "web:offline-query",
      requested_at: new Date(Date.now() - 90_000).toISOString(),
    };
    const agentOffline = await handler({
      httpMethod: "POST",
      path: "/api/status",
      headers: {},
      body: JSON.stringify({ queryId: "offline-query" }),
    });
    assert.equal(agentOffline.statusCode, 503);
    assert.match(JSON.parse(agentOffline.body).errorPoint, /未执行代理任务/);
    assert.equal(tables.credential_refresh[0].status, "failed");
  } finally {
    global.fetch = originalFetch;
  }
});
