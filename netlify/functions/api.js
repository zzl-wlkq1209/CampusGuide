const {
  DEVICES,
  credentialsFromPayload,
  generateScheme,
  queryAllStatus,
  queryMiniDevice,
  setRuntimeCredentials,
} = require("../../server");

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

exports.handler = async (event) => {
  try {
    const route = event.path.replace(/^\/\.netlify\/functions\/api/, "");
    if (event.httpMethod === "POST" && route === "/status") {
      return response(200, { ok: true, data: await queryAllStatus() });
    }
    if (event.httpMethod === "POST" && route === "/credentials") {
      const candidate = credentialsFromPayload(JSON.parse(event.body || "{}"));
      await queryMiniDevice(DEVICES.find((device) => device.mode === "mini"), candidate);
      setRuntimeCredentials(candidate);
      return response(200, { ok: true, message: "查询凭证已更新" });
    }
    if (event.httpMethod === "POST" && route === "/open") {
      const payload = JSON.parse(event.body || "{}");
      const device = DEVICES.find((item) => item.id === payload.id);
      if (!device) return response(400, { ok: false, message: "未知设备" });
      return response(200, { ok: true, scheme: await generateScheme(device) });
    }
    if (event.httpMethod === "GET" && route === "/health") {
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
