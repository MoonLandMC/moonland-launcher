import { SITE } from './config';

export type SkinVariant = 'classic' | 'slim';
export type SkinCheck = { ok: true; width: number; height: number } | { ok: false; error: 'NOT_PNG' | 'BAD_SIZE' | 'TOO_BIG' };
export type SkinResult =
  | { ok: true }
  | { ok: false; error: 'cooldown' | 'bad_credentials' | 'bad_file' | 'busy' | 'network' | 'server' | 'skin_failed' | 'timeout'; remaining?: number };

/** Верхняя граница размера файла: обычный скин весит несколько килобайт, больше значит, что это не скин. */
export const MAX_SKIN_BYTES = 64 * 1024;

/** Проверяет PNG-подпись и размер из заголовка IHDR: скин бывает только 64x64 или 64x32. */
export function checkSkinPng(buf: Buffer): SkinCheck {
  if (buf.length > MAX_SKIN_BYTES) return { ok: false, error: 'TOO_BIG' };
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 33 || !buf.subarray(0, 8).equals(sig) || buf.subarray(12, 16).toString('latin1') !== 'IHDR') return { ok: false, error: 'NOT_PNG' };
  const width = buf.readUInt32BE(16), height = buf.readUInt32BE(20);
  if (width !== 64 || (height !== 64 && height !== 32)) return { ok: false, error: 'BAD_SIZE' };
  return { ok: true, width, height };
}

/** MOONLAND_DEV_SKIN_API: адрес тестового API скинов (только для разработки). */
export const skinApiUrl = (): string => process.env.MOONLAND_DEV_SKIN_API || `${SITE}/api/launcher/skin`;

/** Отправляет скин на сайт: сайт проверяет пароль, файл и ограничение на частоту, а сервер применяет скин. */
export async function uploadSkin(
  username: string, password: string, png: Buffer, variant: SkinVariant, fetchImpl: typeof fetch = fetch,
): Promise<SkinResult> {
  try {
    const r = await fetchImpl(skinApiUrl(), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, variant, png: png.toString('base64') }), signal: AbortSignal.timeout(60_000),
    });
    if (r.status === 401) return { ok: false, error: 'bad_credentials' };
    let j: { ok?: boolean; error?: string; remaining?: number } = {};
    try { j = await r.json() as typeof j; } catch { /* тело не JSON */ }
    if (r.ok && j.ok) return { ok: true };
    const known = ['cooldown', 'bad_file', 'busy', 'skin_failed', 'timeout'] as const;
    const err = known.find(k => k === j.error);
    return { ok: false, error: err ?? 'server', remaining: typeof j.remaining === 'number' ? j.remaining : undefined };
  } catch { return { ok: false, error: 'network' }; }
}
