import { fetchJson } from './net';
import { NEWS_URL } from './config';

export type NewsItem = { channel: 'news' | 'updates'; title: string; body: string; url: string; ts: string };

export function parseNews(raw: unknown): NewsItem[] {
  const items = (raw as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  const out: NewsItem[] = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const o = it as Record<string, unknown>;
    if (o.channel !== 'news' && o.channel !== 'updates') continue;
    if (typeof o.title !== 'string' || !o.title.trim()) continue;
    if (typeof o.body !== 'string' || typeof o.url !== 'string' || typeof o.ts !== 'string') continue;
    out.push({ channel: o.channel, title: o.title, body: o.body, url: o.url, ts: o.ts });
  }
  return out;
}

export async function fetchNews(): Promise<NewsItem[]> {
  try { return parseNews(await fetchJson(NEWS_URL)); } catch { return []; }
}
