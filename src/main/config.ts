import fs from 'node:fs';
import path from 'node:path';

export const SITE = 'https://moonlandmc.ru';

/** Репозиторий релизов из release.json (один источник для лаунчера и сборщика). null, пока владелец не указан. */
export const releaseRepo = (): { owner: string; repo: string; packRepo: string } | null => {
  try {
    const r = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'release.json'), 'utf8'));
    return r && typeof r.owner === 'string' && r.owner && typeof r.repo === 'string' && r.repo ? { owner: r.owner, repo: r.repo, packRepo: typeof r.packRepo === 'string' && r.packRepo ? r.packRepo : r.repo } : null;
  } catch { return null; }
};

/**
 * Где лаунчер берёт описание сборки игры. С релизами на GitHub это pack.json последнего релиза репозитория сборок (постоянная ссылка),
 * иначе файл на сайте. MOONLAND_DEV_PACK: тестовый pack.json с localhost (только для разработки).
 */
export const packUrl = (graphics: 'standard' | 'vulkan' = 'standard'): string => {
  const file = graphics === 'vulkan' ? 'pack-vulkan.json' : 'pack.json';
  if (process.env.MOONLAND_DEV_PACK) return graphics === 'vulkan' ? process.env.MOONLAND_DEV_PACK.replace(/pack\.json$/, file) : process.env.MOONLAND_DEV_PACK;
  const r = releaseRepo();
  return r ? `https://github.com/${r.owner}/${r.packRepo}/releases/latest/download/${file}` : `${SITE}/launcher/${file}`;
};
export const allowHttpPack = (): boolean => !!process.env.MOONLAND_DEV_PACK;
export const DISCORD_APP_ID = '1552636550657871933';
export const NEWS_URL = `${SITE}/api/launcher/news`;
export const DISCORD_INVITE = 'https://discord.gg/r3bWUCUbvw';
export const serverHost = (): string => process.env.MOONLAND_DEV_SERVER || 'moonlandmc.ru';
export const isDev = (): boolean => !!process.env.MOONLAND_DEV_SERVER;
