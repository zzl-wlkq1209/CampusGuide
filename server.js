const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { URLSearchParams } = require("node:url");
const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const API_BASE = "https://mini.99cda.com/cda-mini-program/";
const SCHEME_URL = "http://wx.99cda.com/cda-wx/generateScheme.do";
const PUBLIC_DIR = path.join(__dirname, "public");
const DEFAULT_HAR_PATH = path.join(
  __dirname,
  "captures",
  "mini.99cda.com_2026_10_09_01_31_25.har",
);
const DEFAULT_LEGACY_HAR_PATH = path.join(
  __dirname,
  "captures",
  "wx.99cda.com_2026_10_09_01_01_44.har",
);
let runtimeCredentials = null;
const DEVICES = [
  {
    id: "building-13-1",
    name: "13号楼1号机",
    q: "0400000000022269",
    gid: "FFFF000102116079",
    operatorId: "100664",
    mode: "mini",
  },
  {
    id: "building-13-2",
    name: "13号楼2号机",
    q: "0400000000022818",
    gid: "FFFF000102115980",
    operatorId: "100664",
    mode: "mini",
  },
  {
    id: "building-7-1",
    name: "7号楼1号机",
    q: "0400000000023982",
    gid: "FFFF000102120435",
    operatorId: "100664",
    mode: "mini",
  },
  {
    id: "building-7-2",
    name: "7号楼2号机",
    q: "0400000000027455",
    gid: "FFFF000102133318",
    operatorId: "100664",
    mode: "mini",
  },
  {
    id: "building-12-1",
    name: "12号楼1号机",
    q: "0400000000021978",
    gid: "FFFF000102115982",
    operatorId: "100664",
    mode: "mini",
  },
  {
    id: "building-12-2",
    name: "12号楼2号机",
    q: "0400000000022277",
    gid: "FFFF000102116731",
    operatorId: "100664",
    mode: "mini",
  },
  {
    id: "building-11-1",
    name: "11号楼1号机",
    q: "0400000000022229",
    gid: "FFFF000102116794",
    operatorId: "100664",
    mode: "mini",
  },
  {
    id: "building-11-2",
    name: "11号楼2号机",
    q: "0400000000022314",
    gid: "FFFF000102116140",
    operatorId: "100664",
    mode: "mini",
  },
  {
    id: "defense-1",
    name: "国防科技园1号机",
    q: "0400000000022530",
    gid: "FFFF000102117180",
    operatorId: "103745",
    mode: "legacy",
  },
  {
    id: "defense-2",
    name: "国防科技园2号机",
    q: "0400000000022753",
    gid: "FFFF000102111097",
    operatorId: "103745",
    mode: "legacy",
  },
  {
    id: "new-building-1",
    name: "新1学生公寓",
    q: "0400000000013573",
    gid: "FFFF000102099537",
    operatorId: "100664",
    mode: "mini",
  },
];

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--har") result.harPath = args[index + 1];
    if (args[index] === "--legacy-har") result.legacyHarPath = args[index + 1];
  }
  return result;
}

function legacyRequestFromHar(harPath) {
  if (!harPath) return null;
  const har = JSON.parse(fs.readFileSync(path.resolve(harPath), "utf8"));
  const entry = har.log.entries.find(({ request }) =>
    request.url.includes("wx.99cda.com/cda-wx/chargingBike.do"),
  );
  if (!entry) throw new Error("旧版 HAR 中没有找到 chargingBike.do 请求");
  const allowed = new Set([
    "cookie",
    "user-agent",
    "accept",
    "accept-language",
    "cache-control",
  ]);
  const headers = Object.fromEntries(
    entry.request.headers
      .filter((header) => allowed.has(header.name.toLowerCase()))
      .map((header) => [header.name, header.value]),
  );
  if (!Object.keys(headers).some((name) => name.toLowerCase() === "cookie")) {
    throw new Error("旧版 HAR 缺少 SESSION Cookie");
  }
  const openId = new URL(entry.request.url).searchParams.get("openId");
  if (!openId) throw new Error("旧版 HAR 缺少 openId");
  return { headers, openId };
}

function loadLegacyRequest() {
  const args = parseArgs();
  const harPath =
    args.legacyHarPath ||
    process.env.CHARGING_LEGACY_HAR_PATH ||
    (fs.existsSync(DEFAULT_LEGACY_HAR_PATH) ? DEFAULT_LEGACY_HAR_PATH : null);
  return legacyRequestFromHar(harPath);
}

function credentialsFromHar(harPath) {
  if (!harPath) return null;
  const har = JSON.parse(fs.readFileSync(path.resolve(harPath), "utf8"));
  const entry = har.log.entries.find(({ request }) =>
    request.url.includes("mini.99cda.com/cda-mini-program/chargingBike.do"),
  );
  let authorization;
  let openId;
  let params = new URLSearchParams();
  if (entry) {
    authorization = entry.request.headers.find(
      (header) => header.name.toLowerCase() === "authorization",
    )?.value;
    params = new URLSearchParams(entry.request.postData?.text || "");
    openId = params.get("openId");
  } else {
    const authorizationEntry = har.log.entries.find(({ request }) =>
      request.url.includes(
        "mini.99cda.com/cda-mini-program/userAuthorization.do",
      ),
    );
    if (!authorizationEntry) throw new Error("HAR 中没有找到小程序授权请求");
    const responseText = authorizationEntry.response.content?.text || "";
    const response = JSON.parse(responseText);
    if (response.code !== "00")
      throw new Error(response.msg || "HAR 中的小程序授权失败");
    authorization = response.data?.authorization;
    openId = response.data?.openId;
  }
  if (!authorization || !openId) {
    throw new Error("HAR 缺少 authorization 或 openId");
  }
  return {
    authorization,
    openId,
    operatorId: params.get("operatorId") || "100664",
    gid: params.get("GID") || "FFFF000102115980",
  };
}

function loadCredentials() {
  if (runtimeCredentials) return runtimeCredentials;
  const args = parseArgs();
  const harPath =
    args.harPath ||
    process.env.CHARGING_HAR_PATH ||
    (fs.existsSync(DEFAULT_HAR_PATH) ? DEFAULT_HAR_PATH : null);
  const fromHar = credentialsFromHar(harPath);
  if (fromHar) return fromHar;
  const credentials = {
    authorization: process.env.CHARGING_AUTHORIZATION,
    openId: process.env.CHARGING_OPEN_ID,
    operatorId: process.env.CHARGING_OPERATOR_ID || "100664",
    gid: process.env.CHARGING_GID || "FFFF000102115980",
  };
  if (!credentials.authorization || !credentials.openId) {
    throw new Error(
      "请使用 --har <文件路径> 启动，或设置 CHARGING_AUTHORIZATION 和 CHARGING_OPEN_ID",
    );
  }
  return credentials;
}

function credentialsFromPayload(payload) {
  let source = payload;
  if (typeof payload.text === "string") {
    const text = payload.text.trim();
    try {
      source = JSON.parse(text);
    } catch {
      const marker = text.lastIndexOf('{"msg"');
      const jsonStart = marker >= 0 ? marker : text.lastIndexOf("{");
      if (jsonStart < 0) throw new Error("粘贴内容中没有找到 JSON 响应");
      try {
        source = JSON.parse(text.slice(jsonStart).trim());
      } catch {
        const authorization = text.match(
          /"authorization"\s*:\s*"([^"]+)"/,
        )?.[1];
        const openId = text.match(/"openId"\s*:\s*"([^"]+)"/)?.[1];
        if (!authorization || !openId)
          throw new Error("无法解析响应中的凭证字段");
        source = { authorization, openId };
      }
    }
  }
  const data =
    source?.data && typeof source.data === "object" ? source.data : source;
  const authorization = String(data?.authorization || "").trim();
  const openId = String(data?.openId || "").trim();
  if (!authorization || !openId)
    throw new Error("没有找到 authorization 或 openId");
  if (authorization.length > 512 || openId.length > 128)
    throw new Error("凭证格式无效");
  return {
    authorization,
    openId,
    operatorId: "100664",
    gid: "FFFF000102115980",
  };
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(payload);
}

function serveFile(res, fileName, contentType) {
  const filePath = path.join(PUBLIC_DIR, fileName);
  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": body.length,
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

function getHttpText(url, headers, redirects = 0) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { headers }, (response) => {
      if (
        [301, 302, 303, 307, 308].includes(response.statusCode) &&
        response.headers.location
      ) {
        response.resume();
        if (redirects >= 4) return reject(new Error("旧版页面重定向过多"));
        return resolve(
          getHttpText(
            new URL(response.headers.location, url).toString(),
            headers,
            redirects + 1,
          ),
        );
      }
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () =>
        resolve({ status: response.statusCode || 0, body }),
      );
    });
    request.setTimeout(12_000, () =>
      request.destroy(new Error("旧版页面查询超时")),
    );
    request.on("error", reject);
  });
}

async function getLegacyPage(url, headers = {}) {
  if (process.env.NETLIFY) {
    const result = await getHttpText(url, headers);
    if (result.status < 200 || result.status >= 400) {
      throw new Error(`旧版服务返回 HTTP ${result.status}`);
    }
    return result.body;
  }
  // The legacy host is only reachable through the system proxy on this PC.
  // curl honors that proxy configuration, while Node's native http client does not.
  const command = process.platform === "win32" ? "curl.exe" : "curl";
  const args = ["-sS", "-L", "--compressed", "--max-time", "12"];
  const proxy = process.env.HTTP_PROXY || process.env.http_proxy;
  if (proxy) args.push("--proxy", proxy);
  for (const [name, value] of Object.entries(headers))
    args.push("--header", `${name}: ${value}`);
  args.push(url);
  const { stdout } = await execFileAsync(command, args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  return stdout;
}

function normalizeDevice(device, data) {
  const channels = Object.entries(data.channelMap || {})
    .map(([number, channel]) => ({
      number: Number(number),
      status: channel.channelStatus || "?",
    }))
    .sort((a, b) => a.number - b.number);
  const available = channels.filter((channel) => channel.status === "I").length;
  const busy = channels.filter((channel) =>
    ["C", "O", "P", "E"].includes(channel.status),
  ).length;
  return {
    id: device.id,
    name: device.name,
    reportedName: data.deviceName || device.name,
    gid: device.gid,
    ok: true,
    summary: {
      total: channels.length,
      available,
      busy,
      unavailable: channels.length - available - busy,
    },
    channels,
  };
}

async function queryMiniDevice(device, credentials) {
  const body = new URLSearchParams({
    timestamp: String(Date.now()),
    operatorId: device.operatorId,
    openId: credentials.openId,
    GID: device.gid,
  });
  const response = await fetch(`${API_BASE}chargingBike.do`, {
    method: "POST",
    headers: {
      authorization: credentials.authorization,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`上游服务返回 HTTP ${response.status}`);
  const result = await response.json();
  if (result.code !== "00") {
    const error = new Error(result.msg || "查询失败");
    error.code = result.code;
    throw error;
  }

  return normalizeDevice(device, result.data || {});
}

async function queryLegacyDevice(device, credentials) {
  const legacyRequest = loadLegacyRequest();
  if (!legacyRequest)
    throw new Error("缺少国防科技园 HAR，请用 --legacy-har 指定");
  const url = `http://wx.99cda.com/cda-wx/chargingBike.do?q=${encodeURIComponent(device.q)}&qType=device&openId=${encodeURIComponent(legacyRequest.openId)}`;
  const html = await getLegacyPage(url, legacyRequest.headers);
  const match = html.match(/details\s*=\s*(\{[\s\S]*?\});/);
  if (!match) throw new Error("未能读取旧版设备状态");
  return normalizeDevice(device, JSON.parse(match[1]));
}

async function queryAllStatus(credentialsOverride = null) {
  let credentials = credentialsOverride;
  let credentialError = null;
  if (!credentials) {
    try {
      credentials = loadCredentials();
    } catch (error) {
      credentialError = new Error("微信凭证缺失，请粘贴最新授权响应");
      credentialError.code = "02";
    }
  }
  const devices = await Promise.all(
    DEVICES.map(async (device) => {
      try {
        if (device.mode !== "legacy" && !credentials) throw credentialError;
        return device.mode === "legacy"
          ? await queryLegacyDevice(device, credentials)
          : await queryMiniDevice(device, credentials);
      } catch (error) {
        return {
          id: device.id,
          name: device.name,
          gid: device.gid,
          ok: false,
          message: error.code === "02" ? "微信凭证已失效" : error.message,
        };
      }
    }),
  );
  const successful = devices.filter((device) => device.ok);
  return {
    queriedAt: new Date().toISOString(),
    summary: {
      devices: DEVICES.length,
      successful: successful.length,
      available: successful.reduce(
        (total, device) => total + device.summary.available,
        0,
      ),
      total: successful.reduce(
        (total, device) => total + device.summary.total,
        0,
      ),
    },
    devices,
  };
}

async function generateScheme(device, credentialsOverride = null) {
  if (device.mode === "legacy") {
    const legacyRequest = loadLegacyRequest();
    if (!legacyRequest)
      throw new Error("缺少国防科技园 HAR，请用 --legacy-har 指定");
    return `http://wx.99cda.com/cda-wx/chargingBike.do?q=${encodeURIComponent(device.q)}&qType=device&openId=${encodeURIComponent(legacyRequest.openId)}`;
  }
  const credentials = credentialsOverride || loadCredentials();
  const query = new URLSearchParams({
    operatorId: device.operatorId,
    GID: device.gid,
    programNo: credentials.openId,
    wechatNo: credentials.openId,
  }).toString();
  const body = new URLSearchParams({
    path: "pages/startCharging/startCharging",
    query,
    envVersion: "trial",
  });
  const response = await fetch(SCHEME_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(12_000),
  });
  const result = await response.json();
  if (result.code !== 0 || !result.data)
    throw new Error("无法生成微信跳转链接");
  return result.data;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let tooLarge = false;
    req.on("data", (chunk) => {
      if (!tooLarge) body += chunk;
      if (body.length > 2_097_152) tooLarge = true;
    });
    req.on("end", () => {
      if (tooLarge)
        return reject(new Error("粘贴内容超过 2 MB，请只复制响应文本"));
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("请求格式无效"));
      }
    });
    req.on("error", reject);
  });
}

async function handleRequest(req, res) {
  try {
    if (
      req.method === "GET" &&
      (req.url === "/" || req.url === "/index.html")
    ) {
      return serveFile(res, "index.html", "text/html; charset=utf-8");
    }
    if (
      req.method === "GET" &&
      /^\/qrcodes\/takeout-[1-4]\.png$/.test(req.url)
    ) {
      return serveFile(res, req.url.slice(1), "image/png");
    }
    if (req.method === "POST" && req.url === "/api/status") {
      const payload = await readJson(req);
      const credentials = payload.credentialText
        ? credentialsFromPayload({ text: payload.credentialText })
        : null;
      return json(res, 200, {
        ok: true,
        data: await queryAllStatus(credentials),
      });
    }
    if (req.method === "POST" && req.url === "/api/credentials") {
      const candidate = credentialsFromPayload(await readJson(req));
      await queryMiniDevice(
        DEVICES.find((device) => device.mode === "mini"),
        candidate,
      );
      runtimeCredentials = candidate;
      return json(res, 200, { ok: true, message: "查询凭证已更新" });
    }
    if (req.method === "POST" && req.url === "/api/open") {
      const payload = await readJson(req);
      const device = DEVICES.find((item) => item.id === payload.id);
      if (!device) return json(res, 400, { ok: false, message: "未知设备" });
      const credentials = payload.credentialText
        ? credentialsFromPayload({ text: payload.credentialText })
        : null;
      return json(res, 200, {
        ok: true,
        scheme: await generateScheme(device, credentials),
      });
    }
    if (req.method === "GET" && req.url === "/health") {
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { ok: false, message: "未找到页面" });
  } catch (error) {
    const expired = error.code === "02";
    return json(res, expired ? 401 : 502, {
      ok: false,
      code: error.code || "UPSTREAM_ERROR",
      message: expired ? "微信查询凭证已失效，请重新抓取请求" : error.message,
    });
  }
}

if (require.main === module) {
  const server = http.createServer(handleRequest);
  server.listen(PORT, HOST, () => {
    console.log(`充电桩状态页：http://${HOST}:${PORT}`);
  });
}

module.exports = {
  DEVICES,
  credentialsFromPayload,
  generateScheme,
  queryAllStatus,
  queryMiniDevice,
  setRuntimeCredentials(credentials) {
    runtimeCredentials = credentials;
  },
};
