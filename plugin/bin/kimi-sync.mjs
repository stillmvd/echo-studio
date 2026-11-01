import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kimiHome } from '../lib/agent.mjs';
import {
  pluginFingerprint,
  pluginLock,
  projectRoots,
  readStatus,
  syncGlobal,
  syncProject,
  takeLock,
  writeStatus,
} from '../lib/kimi-sync.mjs';
import { projectRoot } from '../lib/paths.mjs';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXE = process.platform === 'win32' ? 'kimi.exe' : 'kimi';
export const EXIT_BUSY = 3;
export const EXIT_NO_KIMI = 4;

export function kimiExe(kimi = kimiHome(), env = process.env) {
  if (env.KIMI_EXE && existsSync(env.KIMI_EXE)) return env.KIMI_EXE;
  return (
    [join(kimi, 'bin', EXE), join(homedir(), '.kimi-code', 'bin', EXE)].find((p) =>
      existsSync(p),
    ) ?? EXE
  );
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const PLUGIN_ID = 'echo-memory';

async function api(port, token, method, path, body) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { code: -1, msg: `HTTP ${res.status}: ${text.slice(0, 200)}` };
  }
}

function managedCopy(kimi) {
  const managed = resolve(kimi, 'plugins', 'managed').toLowerCase();
  return resolve(pluginRoot).toLowerCase().startsWith(managed);
}

export async function installPlugin(kimi = kimiHome()) {
  try {
    return await install(kimi);
  } finally {
    rmSync(pluginLock(), { force: true });
  }
}

async function install(kimi) {
  if (managedCopy(kimi)) return 'пропущено: запущено из копии в Kimi, источник — плагин Claude';
  const fingerprint = pluginFingerprint(pluginRoot);
  if (readStatus(kimi).plugin?.fingerprint === fingerprint) return 'актуален';
  const fail = (message) => {
    writeStatus({ pluginError: message }, kimi);
    return new Error(message);
  };
  const port = 58800 + Math.floor(Math.random() * 100);
  let spawnError = null;
  const server = spawn(kimiExe(kimi), ['web', '--no-open', '--port', String(port)], {
    env: { ...process.env, KIMI_CODE_HOME: kimi },
    stdio: 'ignore',
    windowsHide: true,
  });
  server.on('error', (e) => {
    spawnError = e;
  });
  let stopped = false;
  try {
    let ready = false;
    for (let i = 0; i < 60 && !ready && !spawnError; i++) {
      await wait(500);
      ready = await fetch(`http://127.0.0.1:${port}/api/v1/healthz`, {
        signal: AbortSignal.timeout(2000),
      }).then(
        (r) => r.ok,
        () => false,
      );
    }
    if (spawnError) throw fail(`kimi web не запустился: ${spawnError.message}`);
    if (!ready) throw fail('kimi web не поднялся');
    const token = readFileSync(join(kimi, 'server.token'), 'utf8').trim();
    const installed = await api(port, token, 'GET', '/api/v1/plugins');
    if (installed.code !== 0) throw fail(`список плагинов: ${installed.msg}`);
    if ((installed.data?.plugins ?? []).some((p) => p.id === PLUGIN_ID)) {
      const removed = await api(port, token, 'POST', `/api/v1/plugins/${PLUGIN_ID}:remove`);
      if (removed.code !== 0) throw fail(`снятие старой версии: ${removed.msg}`);
      rmSync(join(kimi, 'plugins', 'managed', PLUGIN_ID), { recursive: true, force: true });
    }
    const managed = join(kimi, 'plugins', 'managed');
    let res = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt) await wait(1500 * attempt);
      res = await api(port, token, 'POST', '/api/v1/plugins', {
        source: pluginRoot.replaceAll('\\', '/'),
      });
      if (res.code === 0 || !/EPERM|EBUSY|EACCES/.test(res.msg ?? '')) break;
      for (const name of existsSync(managed) ? readdirSync(managed) : []) {
        if (name.startsWith(`${PLUGIN_ID}-`))
          rmSync(join(managed, name), { recursive: true, force: true });
      }
    }
    if (res.code !== 0) throw fail(`установка плагина: ${res.msg}`);
    writeStatus(
      {
        pluginError: null,
        plugin: { fingerprint, version: res.data?.version, at: new Date().toISOString() },
      },
      kimi,
    );
    stopped = await api(port, token, 'POST', '/api/v1/shutdown').then(
      () => true,
      () => false,
    );
    return `установлен ${res.data?.version}`;
  } catch (error) {
    throw readStatus(kimi).pluginError === error.message ? error : fail(error.message);
  } finally {
    if (stopped) await wait(1500);
    server.kill();
  }
}

async function main(argv) {
  const kimi = kimiHome();
  const report = {};
  const global = syncGlobal({ kimi });
  if (!global) {
    console.error(`Папки Kimi Code нет (${kimi}) — запусти kimi один раз и повтори`);
    process.exitCode = EXIT_NO_KIMI;
    return;
  }
  report.global = global;
  const projects = [];
  if (argv.includes('--all')) projects.push(...projectRoots(join(homedir(), 'Projects')));
  const at = argv.indexOf('--project');
  if (at >= 0 && argv[at + 1]) projects.push(projectRoot(argv[at + 1]));
  report.projects = projects.map((root) => ({ root, changed: syncProject(root) }));
  writeStatus(
    {
      at: new Date().toISOString(),
      warnings: global.warnings,
      hooks: global.hooks,
      commands: global.commands,
      skippedHooks: global.skippedHooks,
    },
    kimi,
  );
  if (argv.includes('--plugin') || argv.includes('--all')) {
    if (argv.includes('--locked') || takeLock(Date.now())) {
      report.plugin = await installPlugin(kimi);
    } else {
      report.plugin = 'уже ставится другой сессией';
      process.exitCode = EXIT_BUSY;
    }
  }
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
