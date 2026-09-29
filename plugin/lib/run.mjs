import { appendFileSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const workDir = join(tmpdir(), 'claude-memory');

export function logError(hook, error) {
  try {
    mkdirSync(workDir, { recursive: true });
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    appendFileSync(join(workDir, 'errors.log'), `${new Date().toISOString()} ${hook} ${message}\n`);
  } catch {}
}

export function writeAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, text);
    renameSync(tmp, path);
  } catch (error) {
    rmSync(tmp, { force: true });
    throw error;
  }
}

function readStdin(timeoutMs) {
  return new Promise((resolve, reject) => {
    let data = '';
    const timer = setTimeout(() => reject(new Error('stdin timeout')), timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      clearTimeout(timer);
      resolve(data);
    });
    process.stdin.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

export async function run(hook, handler) {
  let output = null;
  try {
    const input = JSON.parse(await readStdin(2000));
    output = await handler(input);
  } catch (error) {
    logError(hook, error);
    output = null;
  }
  if (output) process.stdout.write(JSON.stringify(output));
  process.exit(0);
}
