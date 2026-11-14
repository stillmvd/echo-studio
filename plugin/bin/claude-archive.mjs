import { spawn, spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kimiHome } from '../lib/agent.mjs';

export const ARCHIVE = 'claude-home.tar.gz';
export const TASK = 'EchoStudio-ClaudeArchive';
export const STATUS_FILE = 'echo-archive.json';
export const WEEK_MS = 7 * 864e5;
const LOCK_STALE_MS = 3 * 3600e3;
const EXCLUDE = [
  '.claude/shell-snapshots',
  '.claude/debug',
  '.claude/statsig',
  '.claude/telemetry',
  '.claude/.credentials.json',
];

function tar() {
  const system = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
  return existsSync(system) ? system : 'tar';
}

export function readArchiveStatus(kimi = kimiHome()) {
  try {
    return JSON.parse(readFileSync(join(kimi, STATUS_FILE), 'utf8'));
  } catch {
    return {};
  }
}

export function writeArchiveStatus(patch, kimi = kimiHome()) {
  const file = join(kimi, STATUS_FILE);
  mkdirSync(dirname(file), { recursive: true });
  const next = { ...readArchiveStatus(kimi), ...patch };
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(tmp, file);
  return next;
}

export function lock(path, now = Date.now()) {
  try {
    closeSync(openSync(path, 'wx'));
    return () => rmSync(path, { force: true });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (now - statSync(path).mtimeMs < LOCK_STALE_MS) return null;
    rmSync(path, { force: true });
    return lock(path, now);
  }
}

export function archive({ home = homedir(), out = join(home, 'Kimi Migration') } = {}) {
  if (!existsSync(out)) return Promise.reject(new Error(`Нет папки ${out}`));
  const target = join(out, ARCHIVE);
  const release = lock(`${target}.lock`);
  if (!release) return Promise.resolve(null);
  const tmp = `${target}.${process.pid}.tmp`;
  const sources = ['.claude', '.claude.json'].filter((p) => existsSync(join(home, p)));
  const args = ['-czf', tmp, ...EXCLUDE.flatMap((e) => ['--exclude', e]), '-C', home, ...sources];
  return new Promise((done, fail) => {
    const child = spawn(tar(), args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let errors = '';
    child.stderr.on('data', (d) => {
      errors += d;
    });
    child.on('error', (error) => {
      release();
      fail(error);
    });
    child.on('close', (code) => {
      try {
        const size = existsSync(tmp) ? statSync(tmp).size : 0;
        if (size < 1024 * 1024) {
          rmSync(tmp, { force: true });
          return fail(new Error(`tar завершился с кодом ${code}: ${errors.slice(-500)}`));
        }
        renameSync(tmp, target);
        done({ path: target, size, warnings: code === 0 ? null : errors.slice(-500) });
      } catch (error) {
        fail(error);
      } finally {
        release();
      }
    });
  });
}

const psQuote = (text) => `'${String(text).replaceAll("'", "''")}'`;

export function taskScript(node, script) {
  return [
    `$a = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument ${psQuote(`--headless "${node}" "${script}"`)}`,
    `$t = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 13:00`,
    `$s = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2)`,
    `Register-ScheduledTask -TaskName ${psQuote(TASK)} -Action $a -Trigger $t -Settings $s -Description 'Еженедельный архив ~/.claude в Kimi Migration (echo-memory)' -Force | Out-Null`,
  ].join('; ');
}

export function installTask(script = fileURLToPath(import.meta.url)) {
  const res = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', taskScript(process.execPath, script)],
    { encoding: 'utf8', windowsHide: true },
  );
  if (res.status !== 0) throw new Error(`задача Планировщика не создана: ${res.stderr?.trim()}`);
  return TASK;
}

export function stableScript(kimi = kimiHome()) {
  const managed = join(kimi, 'plugins', 'managed', 'echo-memory', 'bin', 'claude-archive.mjs');
  return existsSync(managed) ? managed : fileURLToPath(import.meta.url);
}

export function needsEnsure(kimi = kimiHome()) {
  return readArchiveStatus(kimi).task?.script !== stableScript(kimi);
}

async function main(argv) {
  const kimi = kimiHome();
  if (argv.includes('--install-task') || argv.includes('--ensure')) {
    const script = stableScript(kimi);
    installTask(script);
    writeArchiveStatus({ task: { name: TASK, script } }, kimi);
    console.log(`задача ${TASK} → ${script}`);
    if (argv.includes('--install-task')) return;
    const file = join(homedir(), 'Kimi Migration', ARCHIVE);
    if (existsSync(file) && Date.now() - statSync(file).mtimeMs < WEEK_MS) return;
  }
  const result = await archive();
  if (!result) {
    console.log('архив уже собирается');
    return;
  }
  writeArchiveStatus(
    { archive: { at: new Date().toISOString(), size: result.size, warnings: result.warnings } },
    kimi,
  );
  console.log(`${result.path} — ${(result.size / 2 ** 30).toFixed(2)} ГБ`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
