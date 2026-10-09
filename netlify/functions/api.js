const {
  DEVICES,
  credentialsFromPayload,
  generateScheme,
  queryAllStatus,
  queryMiniDevice,
  setRuntimeCredentials,
} = require("../../server");
const {
  getStoredCredentials,
  isCloudConfigured,
  patchRefresh,
  refreshRow,
  requestRefresh,
  saveStoredCredentials,
} = require("../../cloud-store");

const AGENT_KEY = process.env.CREDENTIAL_AGENT_KEY || "";

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
    body: JSON.stringify(body),
  };
}

function agentAuthorized(event) {
  const provided = event.headers["x-agent-key"] || "";
  if (!AGENT_KEY || provided.length !== AGENT_KEY.length) return false;
  return require("node:crypto").timingSafeEqual(
    Buffer.from(provided),
    Buffer.from(AGENT_KEY),
  );
}

function credentialsExpired(data) {
  return data.devices.some(
    (device) => !device.ok && device.message.includes("凭证"),
  );
}

exports.handler = async (event) => {
  try {
    const route = event.path.replace(
      /^\/(?:\.netlify\/functions\/api|api)/,
      "",
    );
    if (event.httpMethod === "POST" && route === "/status") {
      const payload = JSON.parse(event.body || "{}");
      const credentials = payload.credentialText
        ? credentialsFromPayload({ text: payload.credentialText })
        : await getStoredCredentials();
      const data = await queryAllStatus(credentials);
      if (credentialsExpired(data) && isCloudConfigured()) {
        const refresh = await requestRefresh("web");
        return response(202, {
          ok: true,
          refreshing: true,
          requestId: refresh.request_id,
        });
      }
      return response(200, {
        ok: true,
        data,
      });
    }
    if (event.httpMethod === "POST" && route === "/credentials") {
      const candidate = credentialsFromPayload(JSON.parse(event.body || "{}"));
      await queryMiniDevice(
        DEVICES.find((device) => device.mode === "mini"),
        candidate,
      );
      setRuntimeCredentials(candidate);
      if (isCloudConfigured()) await saveStoredCredentials(candidate);
      return response(200, { ok: true, message: "查询凭证已更新" });
    }
    if (event.httpMethod === "POST" && route === "/open") {
      const payload = JSON.parse(event.body || "{}");
      const device = DEVICES.find((item) => item.id === payload.id);
      if (!device) return response(400, { ok: false, message: "未知设备" });
      const credentials = payload.credentialText
        ? credentialsFromPayload({ text: payload.credentialText })
        : await getStoredCredentials();
      return response(200, {
        ok: true,
        scheme: await generateScheme(device, credentials),
      });
    }
    if (event.httpMethod === "GET" && route === "/health") {
      return response(200, { ok: true, cloud: isCloudConfigured() });
    }
    if (route.startsWith("/agent/") && !agentAuthorized(event)) {
      return response(401, { ok: false, message: "代理密钥无效" });
    }
    if (event.httpMethod === "POST" && route === "/agent/poll") {
      const refresh = await refreshRow();
      if (refresh?.status === "requested") {
        await patchRefresh({ status: "working" });
        refresh.status = "working";
      }
      return response(200, { ok: true, refresh });
    }
    if (event.httpMethod === "POST" && route === "/agent/request") {
      return response(200, {
        ok: true,
        refresh: await requestRefresh("schedule"),
      });
    }
    if (event.httpMethod === "POST" && route === "/agent/open") {
      const credentials = await getStoredCredentials();
      return response(200, {
        ok: true,
        scheme: await generateScheme(
          DEVICES.find((device) => device.mode === "mini"),
          credentials,
        ),
      });
    }
    if (event.httpMethod === "POST" && route === "/agent/credentials") {
      const payload = JSON.parse(event.body || "{}");
      const candidate = credentialsFromPayload({ text: payload.text });
      const data = await queryAllStatus(candidate);
      if (credentialsExpired(data)) {
        throw Object.assign(new Error("新凭证验证失败"), { code: "02" });
      }
      await saveStoredCredentials(candidate);
      await patchRefresh({
        status: "completed",
        completed_at: new Date().toISOString(),
        error_message: null,
      });
      return response(200, { ok: true, queriedAt: data.queriedAt });
    }
    if (event.httpMethod === "POST" && route === "/agent/fail") {
      const payload = JSON.parse(event.body || "{}");
      await patchRefresh({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: String(payload.message || "本地刷新失败").slice(0, 500),
      });
      return response(200, { ok: true });
    }
    return response(404, { ok: false, message: "未找到页面" });
  } catch (error) {
    const expired = error.code === "02";
    return response(expired ? 401 : 502, {
      ok: false,
      code: error.code || "UPSTREAM_ERROR",
      message: expired ? "微信查询凭证已失效，请重新抓取请求" : error.message,
    });
  }
};
