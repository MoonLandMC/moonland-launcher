import { describe, it, expect, vi } from 'vitest';
import { checkSkinPng, uploadSkin } from '../src/main/skin';

function png(w: number, h: number, extra = 0): Buffer {
  const b = Buffer.alloc(33 + extra);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}
const res = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('checkSkinPng', () => {
  it('accepts 64x64 and 64x32', () => {
    expect(checkSkinPng(png(64, 64))).toEqual({ ok: true, width: 64, height: 64 });
    expect(checkSkinPng(png(64, 32))).toEqual({ ok: true, width: 64, height: 32 });
  });
  it('rejects other sizes', () => {
    expect(checkSkinPng(png(128, 128))).toEqual({ ok: false, error: 'BAD_SIZE' });
    expect(checkSkinPng(png(64, 48))).toEqual({ ok: false, error: 'BAD_SIZE' });
  });
  it('rejects a file that is not a PNG', () => {
    expect(checkSkinPng(Buffer.from('GIF89a'.padEnd(40, 'x')))).toEqual({ ok: false, error: 'NOT_PNG' });
    expect(checkSkinPng(Buffer.alloc(10))).toEqual({ ok: false, error: 'NOT_PNG' });
  });
  it('rejects a huge file', () => {
    expect(checkSkinPng(png(64, 64, 70 * 1024))).toEqual({ ok: false, error: 'TOO_BIG' });
  });
});

describe('uploadSkin', () => {
  it('sends credentials, variant and the file', async () => {
    const f = vi.fn(() => res(200, { ok: true }));
    expect(await uploadSkin('Aelis', 'pw', png(64, 64), 'slim', f as any)).toEqual({ ok: true });
    const [, init] = (f.mock.calls[0] as unknown) as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.username).toBe('Aelis'); expect(body.variant).toBe('slim');
    expect(Buffer.from(body.png, 'base64').length).toBe(33);
  });
  it('401 is bad_credentials', async () => {
    expect(await uploadSkin('a', 'b', png(64, 64), 'classic', (() => res(401, {})) as any)).toEqual({ ok: false, error: 'bad_credentials' });
  });
  it('passes the cooldown through with the seconds left', async () => {
    expect(await uploadSkin('a', 'b', png(64, 64), 'classic', (() => res(429, { error: 'cooldown', remaining: 3600 })) as any))
      .toEqual({ ok: false, error: 'cooldown', remaining: 3600 });
  });
  it('an unknown error becomes server and a throw becomes network', async () => {
    expect(await uploadSkin('a', 'b', png(64, 64), 'classic', (() => res(500, { error: 'boom' })) as any)).toMatchObject({ ok: false, error: 'server' });
    expect(await uploadSkin('a', 'b', png(64, 64), 'classic', (() => Promise.reject(new Error('x'))) as any)).toEqual({ ok: false, error: 'network' });
  });
});
