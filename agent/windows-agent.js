const fs = require("node:fs");
const path = require("node:path");
const { exec, execFile, spawn } = require("node:child_process");
const { promisify } = require("node:util");

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

function loadEnv(fileName) {
  if (!fs.existsSync(fileName)) return;
  for (const line of fs.readFileSync(fileName, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined)
      process.env[match[1]] = match[2];
  }
}

loadEnv(path.join(__dirname, "agent.env"));

const SITE_URL = (process.env.SITE_URL || "").replace(/\/$/, "");
const AGENT_KEY = process.env.CREDENTIAL_AGENT_KEY || "";
const CAPTURE_FILE = path.resolve(
  process.env.CREDENTIAL_CAPTURE_FILE ||
    path.join(__dirname, "..", "runtime", "credential-response.json"),
);
const REQABLE_PATH = process.env.REQABLE_PATH || "";
const OPEN_COMMAND = process.env.CHARGING_OPEN_COMMAND || "";
const CLOSE_COMMAND = process.env.CHARGING_CLOSE_COMMAND || "";
const POLL_MS = Number(process.env.AGENT_POLL_MS || 3000);
const CAPTURE_TIMEOUT_MS = Number(process.env.CAPTURE_TIMEOUT_MS || 60000);

function assertConfig() {
  const missing = [];
  if (!SITE_URL) missing.push("SITE_URL");
  if (!AGENT_KEY) missing.push("CREDENTIAL_AGENT_KEY");
  if (!REQABLE_PATH) missing.push("REQABLE_PATH");
  if (missing.length) throw new Error(`缺少代理配置：${missing.join(", ")}`);
}

async function api(route, body = {}) {
  const response = await fetch(`${SITE_URL}/api/agent/${route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-agent-key": AGENT_KEY,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    throw new Error(result.message || `代理接口失败 (${response.status})`);
  }
  return result;
}

function runCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, { windowsHide: true }, (error) =>
      error ? reject(error) : resolve(),
    );
  });
}

function startReqable() {
  const child = spawn(REQABLE_PATH, [], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
}

async function stopReqable() {
  await execFileAsync("taskkill.exe", ["/IM", "Reqable.exe", "/T"], {
    windowsHide: true,
  }).catch(() => {});
}

async function openChargingProgram() {
  if (OPEN_COMMAND) return runCommand(OPEN_COMMAND);
  const { scheme } = await api("open");
  await execFileAsync(
    "rundll32.exe",
    ["url.dll,FileProtocolHandler", scheme],
    { windowsHide: true },
  );
}

async function closeChargingProgram() {
  if (CLOSE_COMMAND) return runCommand(CLOSE_COMMAND);
  await execFileAsync("taskkill.exe", ["/IM", "WeChatAppEx.exe", "/T"], {
    windowsHide: true,
  }).catch(() => {});
}

async function waitForCapture(startedAt) {
  const deadline = Date.now() + CAPTURE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const stat = fs.statSync(CAPTURE_FILE);
      if (stat.mtimeMs >= startedAt) {
        const text = fs.readFileSync(CAPTURE_FILE, "utf8");
        const parsed = JSON.parse(text);
        if (
          parsed?.code === "00" &&
          parsed?.data?.authorization &&
          parsed?.data?.openId
        ) {
          return text;
        }
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("等待车充安授权响应超时");
}

async function refreshCredential(requestId) {
  const startedAt = Date.now();
  fs.mkdirSync(path.dirname(CAPTURE_FILE), { recursive: true });
  startReqable();
  try {
    await new Promise((resolve) => setTimeout(resolve, 1800));
    await openChargingProgram();
    const text = await waitForCapture(startedAt);
    await api("credentials", { requestId, text });
  } finally {
    await closeChargingProgram().catch(() => {});
    await stopReqable();
  }
}

let busy = false;
let lastScheduledDate = "";

async function checkWeeklySchedule() {
  const now = new Date();
  const date = now.toLocaleDateString("sv-SE");
  if (
    [0, 3].includes(now.getDay()) &&
    now.getHours() === 0 &&
    now.getMinutes() < 5 &&
    lastScheduledDate !== date
  ) {
    lastScheduledDate = date;
    await api("request");
  }
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    await checkWeeklySchedule();
    const { refresh } = await api("poll");
    if (refresh?.status !== "working" || !refresh.request_id) return;
    console.log(`[${new Date().toLocaleString()}] 开始刷新凭证`);
    try {
      await refreshCredential(refresh.request_id);
      console.log(`[${new Date().toLocaleString()}] 凭证刷新与查询完成`);
    } catch (error) {
      await api("fail", { message: error.message }).catch(() => {});
      console.error(`[${new Date().toLocaleString()}] ${error.message}`);
    }
  } finally {
    busy = false;
  }
}

assertConfig();
console.log("CampusGuide Windows 代理已启动");
tick().catch(console.error);
setInterval(() => tick().catch(console.error), POLL_MS);
