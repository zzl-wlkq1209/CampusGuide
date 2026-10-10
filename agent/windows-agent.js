const fs = require("node:fs");
const net = require("node:net");
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
const REQABLE_CAPTURE_DIR = path.resolve(
  process.env.REQABLE_CAPTURE_DIR ||
    path.join(process.env.APPDATA || "", "Reqable", "capture"),
);
const REQABLE_PATH = process.env.REQABLE_PATH || "";
const WECHAT_PATH = process.env.WECHAT_PATH || "D:\\WeChat\\Weixin\\Weixin.exe";
const OPEN_COMMAND = process.env.CHARGING_OPEN_COMMAND || "";
const CLOSE_COMMAND = process.env.CHARGING_CLOSE_COMMAND || "";
const LEGACY_OPEN_URL = process.env.LEGACY_OPEN_URL || "";
const POLL_MS = Number(process.env.AGENT_POLL_MS || 3000);
const CAPTURE_TIMEOUT_MS = Number(process.env.CAPTURE_TIMEOUT_MS || 60000);
const REQABLE_READY_DELAY_MS = Number(
  process.env.REQABLE_READY_DELAY_MS || 10000,
);
const REOPEN_DELAY_MS = Number(process.env.REOPEN_DELAY_MS || 0);
const MAX_OPEN_ATTEMPTS = Math.max(
  1,
  Math.min(3, Number(process.env.MAX_OPEN_ATTEMPTS || 2)),
);
const CAPTURE_ATTEMPT_TIMEOUT_MS = Number(
  process.env.CAPTURE_ATTEMPT_TIMEOUT_MS || 20000,
);

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

const PROXY_REGISTRY_PATH =
  "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";

async function powershell(script) {
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true },
  );
  return stdout.trim();
}

const notifyProxyChanged = `
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class WinInetNotify { [DllImport("wininet.dll")] public static extern bool InternetSetOption(IntPtr h, int o, IntPtr b, int l); }' -ErrorAction SilentlyContinue
[WinInetNotify]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0) | Out-Null
[WinInetNotify]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0) | Out-Null
`;

async function setReqableSystemProxy() {
  await powershell(`
$path = '${PROXY_REGISTRY_PATH}'
Set-ItemProperty -Path $path -Name ProxyEnable -Value 1
Set-ItemProperty -Path $path -Name ProxyServer -Value '127.0.0.1:9000'
Set-ItemProperty -Path $path -Name ProxyOverride -Value '<-loopback>'
Remove-ItemProperty -Path $path -Name AutoConfigURL -ErrorAction SilentlyContinue
${notifyProxyChanged}
`);
}

function waitForReqableProxy(timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ host: "127.0.0.1", port: 9000 });
      socket.setTimeout(800);
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      const retry = () => {
        socket.destroy();
        if (Date.now() >= deadline) reject(new Error("Reqable 代理端口未启动"));
        else setTimeout(attempt, 300);
      };
      socket.once("error", retry);
      socket.once("timeout", retry);
    };
    attempt();
  });
}

function startReqable() {
  // 交给 Windows Explorer 启动，避免 Reqable 继承代理进程自身的
  // HTTP_PROXY/HTTPS_PROXY 等环境变量；这与用户双击启动的环境一致。
  const child = spawn("explorer.exe", [REQABLE_PATH], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
}

async function isReqableRunning() {
  const { stdout } = await execFileAsync(
    "tasklist.exe",
    ["/FI", "IMAGENAME eq Reqable.exe", "/NH"],
    { windowsHide: true },
  ).catch(() => ({ stdout: "" }));
  return /Reqable\.exe/i.test(stdout);
}

async function stopReqable() {
  await execFileAsync("taskkill.exe", ["/F", "/IM", "Reqable.exe", "/T"], {
    windowsHide: true,
  }).catch(() => {});
}

async function restartReqable() {
  console.log(`[${new Date().toLocaleString()}] 正在重启 Reqable`);
  await stopReqable();
  const deadline = Date.now() + 5000;
  while ((await isReqableRunning()) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  startReqable();
  await waitForReqableProxy(10000);
  await setReqableSystemProxy();
  console.log(`[${new Date().toLocaleString()}] Reqable 已重新启动，系统代理保持开启`);
}

async function openChargingProgram() {
  if (OPEN_COMMAND) return runCommand(OPEN_COMMAND);
  if (LEGACY_OPEN_URL) {
    const wechat = spawn(WECHAT_PATH, [LEGACY_OPEN_URL], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    wechat.unref();
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  const { scheme } = await api("open");
  await execFileAsync("rundll32.exe", ["url.dll,FileProtocolHandler", scheme], {
    windowsHide: true,
  });
}

async function closeChargingProgram() {
  if (CLOSE_COMMAND) return runCommand(CLOSE_COMMAND);
  // 新版微信将小程序窗口嵌入微信运行时，没有可安全单独关闭的窗口句柄。
  // 不终止 WeChatAppEx，避免连带退出微信主程序。
}

async function waitForCapture(startedAt, timeoutMs = CAPTURE_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const files = [CAPTURE_FILE];
    try {
      files.push(
        ...fs
          .readdirSync(REQABLE_CAPTURE_DIR)
          .filter((name) => name.endsWith("-res-raw-body.reqable"))
          .map((name) => path.join(REQABLE_CAPTURE_DIR, name)),
      );
    } catch {}
    for (const fileName of files) {
      try {
        const stat = fs.statSync(fileName);
        if (stat.mtimeMs < startedAt || stat.size > 16_384) continue;
        const text = fs.readFileSync(fileName, "utf8");
        const parsed = JSON.parse(text);
        if (
          parsed?.code === "00" &&
          parsed?.data?.authorization &&
          parsed?.data?.openId
        ) {
          return { text, fileName };
        }
      } catch {}
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("等待车充安授权响应超时");
}

async function refreshCredential(requestId) {
  // 真正领取到任务后，先重启 Reqable 并强制开启它的系统代理，
  // 再启动微信车充安进行捕获。完成后保持 Reqable 和代理开启。
  await restartReqable();
  const startedAt = Date.now();
  fs.mkdirSync(path.dirname(CAPTURE_FILE), { recursive: true });
  try {
    let capture;
    for (let attempt = 1; attempt <= MAX_OPEN_ATTEMPTS; attempt += 1) {
      if (attempt > 1) {
        console.warn(
          `[${new Date().toLocaleString()}] 第${attempt - 1}次未捕获，立即进行最后一次尝试`,
        );
        await new Promise((resolve) => setTimeout(resolve, REOPEN_DELAY_MS));
      }
      await openChargingProgram();
      try {
        capture = await waitForCapture(startedAt, CAPTURE_ATTEMPT_TIMEOUT_MS);
        break;
      } catch {}
    }
    if (!capture)
      throw new Error(`已尝试${MAX_OPEN_ATTEMPTS}次，未捕获授权响应`);
    console.log(
      `[${new Date().toLocaleString()}] 已捕获授权响应：${path.basename(capture.fileName)}`,
    );
    await api("credentials", { requestId, text: capture.text });
    console.log(`[${new Date().toLocaleString()}] 新凭证已验证并上传`);
  } finally {
    await closeChargingProgram();
  }
}

async function ensureReqableReady() {
  if (!(await isReqableRunning())) startReqable();
  await waitForReqableProxy();
  await setReqableSystemProxy();
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

async function main() {
  assertConfig();
  const oneShot = process.argv.includes("--once");
  const scheduledOnce = process.argv.includes("--scheduled-once");
  console.log("CampusGuide Windows 代理已启动");
  if (scheduledOnce) await api("request");
  await tick();
  if (!oneShot && !scheduledOnce) {
    setInterval(() => tick().catch(console.error), POLL_MS);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
