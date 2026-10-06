const UA = 'MoonLandLauncher/1.0 (+https://moonlandmc.ru)';

export async function fetchBuffer(url: string, onBytes?: (n: number) => void, attempts = 3): Promise<Buffer> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000), headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      onBytes?.(buf.length);
      return buf;
    } catch (e) { last = e; }
  }
  throw last;
}

export async function fetchJson<T>(url: string): Promise<T> {
  return JSON.parse((await fetchBuffer(url)).toString('utf8')) as T;
}
