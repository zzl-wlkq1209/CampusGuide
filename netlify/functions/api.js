const {
  DEVICES,
  credentialsFromPayload,
  generateScheme,
  queryAllStatus,
  queryMiniDevice,
  setRuntimeCredentials,
} = require("../../server");
const {
  cloudConfigStatus,
  getStoredCredentials,
  isCloudConfigured,
  patchRefresh,
  refreshRow,
  requestRefresh,
  saveStoredCredentials,
} = require("../../cloud-store");

const AGENT_KEY = process.env.CREDENTIAL_AGENT_KEY || "";
const BUILD_VERSION = "2026-10-09-retry-v2";
const AGENT_CLAIM_TIMEOUT_MS = 15_000;
const AGENT_WORK_TIMEOUT_MS = 90_000;

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

function refreshError(errorPoint, action, detail) {
  return response(503, {
    ok: false,
    code: "REFRESH_FAILED",
    message: `${errorPoint}。${action}`,
    errorPoint,
    action,
    detail: detail || null,
  });
}

function failedRefreshMessage(refresh) {
  const detail = String(refresh.error_message || "本地代理返回未知错误");
  if (/未捕获|授权响应超时/.test(detail)) {
    return refreshError(
      "故障点：Reqable 未捕获微信授权响应",
      "请确认微信已登录、Reqable 抓包和脚本开关已开启，然后点击重新查询",
      detail,
    );
  }
  if (/验证失败|凭证/.test(detail)) {
    return refreshError(
      "故障点：新凭证验证失败",
      "请确认车充安已完成授权，然后点击重新查询",
      detail,
    );
  }
  return refreshError(
    "故障点：电脑代理执行失败",
    "请检查查询电脑上的代理日志、微信和 Reqable，然后点击重新查询",
    detail,
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
        const refreshSource = payload.queryId
          ? `web:${String(payload.queryId).slice(0, 100)}`
          : "web-legacy";
        const refresh = await requestRefresh(refreshSource);
        if (refresh.failedForSource) {
          return failedRefreshMessage(refresh);
        }
        const taskAge = Date.now() - new Date(refresh.requested_at).getTime();
        if (refresh.status === "requested" && taskAge > AGENT_CLAIM_TIMEOUT_MS) {
          await patchRefresh({
            status: "failed",
            completed_at: new Date().toISOString(),
            error_message: "电脑代理未在15秒内领取任务",
          });
          return refreshError(
            "故障点：查询电脑未执行代理任务",
            "请确认电脑已开机并登录 Windows，且“CampusGuide Credential Agent”计划任务正在运行，然后点击重新查询",
          );
        }
        if (refresh.status === "working" && taskAge > AGENT_WORK_TIMEOUT_MS) {
          await patchRefresh({
            status: "failed",
            completed_at: new Date().toISOString(),
            error_message: "电脑代理领取任务后90秒内未完成",
          });
          return refreshError(
            "故障点：电脑代理执行超时",
            "请检查电脑上的微信、Reqable 和网络状态，确认代理仍在运行后点击重新查询",
          );
        }
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
      return response(200, {
        ok: true,
        cloud: isCloudConfigured(),
        config: {
          ...cloudConfigStatus(),
          agentKey: Boolean(AGENT_KEY),
        },
        build: BUILD_VERSION,
      });
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
