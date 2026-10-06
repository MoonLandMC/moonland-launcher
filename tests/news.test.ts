import { describe, it, expect } from 'vitest';
import { parseNews } from '../src/main/news';

describe('parseNews', () => {
  it('keeps well-formed items', () => {
    const raw = { items: [
      { channel: 'news', title: 'Голосование за лаунчер', body: 'Текст', url: 'https://discord.com/channels/1/2/3', ts: '2026-09-23T19:14:41.537000+00:00' },
      { channel: 'updates', title: 'Луна и боевой пропуск', body: 'Текст', url: 'https://discord.com/channels/1/2/4', ts: '2026-09-22T15:27:42.779000+00:00' },
    ] };
    expect(parseNews(raw)).toHaveLength(2);
    expect(parseNews(raw)[0].channel).toBe('news');
  });
  it('drops entries missing a title or malformed channel', () => {
    const raw = { items: [
      { channel: 'news', title: '', body: '', url: 'https://x', ts: '2026-09-23T19:14:41.537000+00:00' },
      { channel: 'gossip', title: 'x', body: '', url: 'https://x', ts: '2026-09-23T19:14:41.537000+00:00' },
      { channel: 'news', title: 'Ok', body: '', url: 'https://x', ts: '2026-09-23T19:14:41.537000+00:00' },
    ] };
    expect(parseNews(raw)).toHaveLength(1);
  });
  it('never throws on garbage input', () => {
    expect(parseNews(null)).toEqual([]);
    expect(parseNews(undefined)).toEqual([]);
    expect(parseNews({})).toEqual([]);
    expect(parseNews({ items: 'nope' })).toEqual([]);
    expect(parseNews({ items: [null, 5, 'x'] })).toEqual([]);
  });
});
