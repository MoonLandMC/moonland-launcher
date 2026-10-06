import { describe, it, expect, vi } from 'vitest';
import { checkLogin } from '../src/main/auth';

const res = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('checkLogin', () => {
  it('ok returns canonical username', async () => {
    const f = vi.fn(() => res(200, { ok: true, username: 'AelisFx' }));
    expect(await checkLogin('aelisfx', 'p', f as any)).toEqual({ ok: true, username: 'AelisFx' });
    const [url, init] = (f.mock.calls[0] as unknown) as [string, RequestInit];
    expect(url).toBe('https://moonlandmc.ru/api/login');
    expect(JSON.parse(init.body as string)).toEqual({ username: 'aelisfx', password: 'p' });
  });
  it('401 is bad_credentials', async () => {
    expect(await checkLogin('a', 'b', (() => res(401, { error: 'bad_credentials' })) as any)).toEqual({ ok: false, error: 'bad_credentials' });
  });
  it('500 is server', async () => {
    expect(await checkLogin('a', 'b', (() => res(500, {})) as any)).toEqual({ ok: false, error: 'server' });
  });
  it('throw is network', async () => {
    expect(await checkLogin('a', 'b', (() => Promise.reject(new Error('x'))) as any)).toEqual({ ok: false, error: 'network' });
  });
});
