import { SITE } from './config';

export type LoginResult = { ok: true; username: string } | { ok: false; error: 'bad_credentials' | 'network' | 'server' };

/** Проверка пароля через /api/login сайта (тот же AuthMe, что и в игре). */
export async function checkLogin(username: string, password: string, fetchImpl: typeof fetch = fetch): Promise<LoginResult> {
  try {
    const r = await fetchImpl(`${SITE}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }), signal: AbortSignal.timeout(15_000),
    });
    if (r.status === 401) return { ok: false, error: 'bad_credentials' };
    if (!r.ok) return { ok: false, error: 'server' };
    const j = await r.json() as { ok?: boolean; username?: string };
    return j.ok && j.username ? { ok: true, username: j.username } : { ok: false, error: 'server' };
  } catch { return { ok: false, error: 'network' }; }
}

export function encryptPassword(p: string): string {
  const { safeStorage } = require('electron') as typeof import('electron');
  return safeStorage.encryptString(p).toString('base64');
}

export function decryptPassword(s: string): string {
  const { safeStorage } = require('electron') as typeof import('electron');
  return safeStorage.decryptString(Buffer.from(s, 'base64'));
}
