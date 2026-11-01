import { spawn } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
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
  writeStatus,
} from '../lib/kimi-sync.mjs';
import { projectRoot } from '../lib/paths.mjs';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const kimiExe = join(
  homedir(),
  '.kimi-code',
  'bin',
  process.platform === 'win32' ? 'kimi.exe' : 'kimi',
);
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
  });
  return res.json();
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
  const port = 58800 + Math.floor(Math.random() * 100);
  const server = spawn(kimiExe, ['web', '--no-open', '--port', String(port)], {
    env: { ...process.env, KIMI_CODE_HOME: kimi },
    stdio: 'ignore',
    windowsHide: true,
  });
  try {
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
      await wait(500);
      ready = await fetch(`http://127.0.0.1:${port}/api/v1/healthz`).then(
        (r) => r.ok,
        () => false,
      );
    }
    const fail = (message) => {
      writeStatus({ pluginError: message }, kimi);
      return new Error(message);
    };
    if (!ready) throw fail('kimi web не поднялся');
    const token = readFileSync(join(kimi, 'server.token'), 'utf8').trim();
    const installed = await api(port, token, 'GET', '/api/v1/plugins');
    if (installed.code !== 0) throw fail(`список плагинов: ${installed.msg}`);
    if ((installed.data?.plugins ?? []).some((p) => p.id === PLUGIN_ID)) {
      const removed = await api(port, token, 'POST', `/api/v1/plugins/${PLUGIN_ID}:remove`);
      if (removed.code !== 0) throw fail(`снятие старой версии: ${removed.msg}`);
      rmSync(join(kimi, 'plugins', 'managed', PLUGIN_ID), { recursive: true, force: true });
    }
    const res = await api(port, token, 'POST', '/api/v1/plugins', {
      source: pluginRoot.replaceAll('\\', '/'),
    });
    if (res.code !== 0) throw fail(`установка плагина: ${res.msg}`);
    writeStatus(
      {
        pluginError: null,
        plugin: { fingerprint, version: res.data?.version, at: new Date().toISOString() },
      },
      kimi,
    );
    await api(port, token, 'POST', '/api/v1/shutdown').catch(() => {});
    return `установлен ${res.data?.version}`;
  } finally {
    setTimeout(() => server.kill(), 1500).unref();
  }
}

async function main(argv) {
  const kimi = kimiHome();
  const report = {};
  const global = syncGlobal({ kimi });
  if (!global) {
    console.log('Kimi Code не установлен — синхронизировать некуда');
    return;
  }
  report.global = global;
  const projects = [];
  if (argv.includes('--all')) projects.push(...projectRoots(join(homedir(), 'Projects')));
  const at = argv.indexOf('--project');
  if (at >= 0 && argv[at + 1]) projects.push(projectRoot(argv[at + 1]));
  report.projects = projects.map((root) => ({ root, changed: syncProject(root) }));
  if (argv.includes('--plugin') || argv.includes('--all'))
    report.plugin = await installPlugin(kimi);
  writeStatus(
    {
      at: new Date().toISOString(),
      warnings: global.warnings,
      hooks: global.hooks,
      commands: global.commands,
    },
    kimi,
  );
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
