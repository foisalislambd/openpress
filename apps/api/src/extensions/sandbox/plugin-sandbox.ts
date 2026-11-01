import { ChildProcess, fork } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { Logger } from '@nestjs/common';
import { PluginManifest } from '../plugin-manifest';

export interface PluginRegistration {
  id: string;
  kind: string;
  event?: string;
  priority?: number;
  slug?: string;
  title?: string;
  menuTitle?: string;
  fields?: { key: string; label: string; type?: string }[];
  widgetId?: string;
  name?: string;
  tag?: string;
  description?: string;
  method?: string;
  path?: string;
  handle?: string;
  file?: string;
  assetKind?: 'style' | 'script';
}

interface ReadyMessage {
  type: 'ready';
  registrations: PluginRegistration[];
  error?: string;
}

type ParentMessage =
  | ReadyMessage
  | { type: 'rpc'; id: string; method: string; args: unknown[] }
  | { type: 'invoke-result'; callId: string; ok: boolean; result?: unknown; error?: string }
  | { type: 'log'; level: string; message: string };

export interface SandboxHandle {
  registrations: PluginRegistration[];
  invoke(hookId: string, args: unknown[]): Promise<unknown>;
  dispose(): void;
}

const WALL_MS = 30_000;
const ACTIVATE_MS = 10_000;
const MEMORY_MB = 128;

export function workerFile() {
  const beside = join(__dirname, 'plugin-worker.cjs');
  if (existsSync(beside)) return beside;
  return join(process.cwd(), 'src/extensions/sandbox/plugin-worker.cjs');
}

export function isPublicHostname(host: string) {
  const name = host.trim().toLowerCase().replace(/\.$/, '');
  if (!name || name === 'localhost' || name.endsWith('.local') || name.endsWith('.internal')) return false;
  if (name.includes(':')) return false;
  const ipv4 = name.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    return true;
  }
  return /^[a-z0-9.-]+$/.test(name);
}

export function hostAllowed(hostname: string, allowlist: string[]) {
  const host = hostname.toLowerCase();
  if (!isPublicHostname(host)) return false;
  return allowlist.some((entry) => {
    const rule = entry.toLowerCase();
    if (rule.startsWith('*.')) return host === rule.slice(2) || host.endsWith(rule.slice(1));
    return host === rule;
  });
}

/**
 * Runs activate() and hook handlers in a child process. Declared permissions
 * are enforced by the parent when the child asks for content, storage, mail,
 * or HTTP. The child cannot read arbitrary files or open sockets itself.
 */
export function startPluginSandbox(options: {
  dir: string;
  manifest: PluginManifest;
  onCall: (method: string, args: unknown[]) => Promise<unknown>;
  logger?: Logger;
}): Promise<SandboxHandle> {
  const worker = workerFile();
  const nodeRoot = dirname(process.execPath);
  const execArgv = [
    '--permission',
    `--allow-fs-read=${resolve(options.dir)}`,
    `--allow-fs-read=${resolve(worker)}`,
    `--allow-fs-read=${nodeRoot}`,
    `--max-old-space-size=${MEMORY_MB}`,
  ];
  const child = fork(worker, [], {
    execArgv,
    cwd: options.dir,
    env: {
      PATH: process.env.PATH || '',
      OPENPRESS_PLUGIN_DIR: resolve(options.dir),
      OPENPRESS_PLUGIN_MAIN: options.manifest.main,
      OPENPRESS_PLUGIN_MANIFEST: JSON.stringify(options.manifest),
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const logger = options.logger ?? new Logger(`plugin:${options.manifest.id}`);
  let stderr = '';
  child.stderr?.on('data', (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-2000);
  });

  return new Promise((resolveReady, rejectReady) => {
    const invokes = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer?: NodeJS.Timeout }>();
    let settled = false;
    let invokeSeq = 0;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      rejectReady(error);
    };
    const activateTimer = setTimeout(() => fail(new Error('Plugin activate() timed out')), ACTIVATE_MS);

    const onMessage = (raw: ParentMessage) => {
      if (!raw || typeof raw !== 'object') return;
      if (raw.type === 'log') {
        logger.log(raw.message);
        return;
      }
      if (raw.type === 'rpc') {
        Promise.resolve()
          .then(() => options.onCall(raw.method, raw.args))
          .then(
            (result) => child.send({ type: 'rpc-result', id: raw.id, ok: true, result }),
            (error: unknown) =>
              child.send({
                type: 'rpc-result',
                id: raw.id,
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              }),
          );
        return;
      }
      if (raw.type === 'invoke-result') {
        const waiter = invokes.get(raw.callId);
        if (!waiter) return;
        invokes.delete(raw.callId);
        if (raw.ok) waiter.resolve(raw.result);
        else waiter.reject(new Error(raw.error || 'Plugin hook failed'));
        return;
      }
      if (raw.type === 'ready') {
        clearTimeout(activateTimer);
        if (raw.error) {
          fail(new Error(raw.error));
          return;
        }
        settled = true;
        resolveReady(handle(child, raw.registrations || [], invokes, () => ++invokeSeq));
      }
    };

    child.on('message', onMessage);
    child.on('error', (error) => fail(error));
    child.on('exit', (code) => {
      if (!settled) fail(new Error(stderr.trim() || `Plugin process exited (${code ?? 'unknown'})`));
    });
  });
}

function handle(
  child: ChildProcess,
  registrations: PluginRegistration[],
  invokes: Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer?: NodeJS.Timeout }>,
  nextId: () => number,
): SandboxHandle {
  let dead = false;
  const crash = () => {
    dead = true;
    for (const waiter of invokes.values()) {
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.reject(new Error('Plugin process stopped'));
    }
    invokes.clear();
  };
  child.on('exit', crash);
  return {
    registrations,
    invoke(hookId, args) {
      if (dead) return Promise.reject(new Error('Plugin process stopped'));
      const callId = `call-${nextId()}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          invokes.delete(callId);
          child.kill('SIGKILL');
          reject(new Error('Plugin hook exceeded 30s'));
        }, WALL_MS);
        invokes.set(callId, {
          resolve: (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
          timer,
        });
        child.send({ type: 'invoke', callId, hookId, args });
      });
    },
    dispose() {
      dead = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 1000).unref?.();
    },
  };
}
