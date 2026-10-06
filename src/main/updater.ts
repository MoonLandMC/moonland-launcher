import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { autoUpdater } from 'electron-updater';
import { releaseRepo } from './config';
import { gameDir } from './paths';

let ready: string | null = null;
let notify: (version: string) => void = () => {};

/** Новая версия лаунчера, уже скачанная и готовая к установке, или null. */
export const updateReady = (): string | null => ready;

/** Журнал проверок: по нему видно, почему обновление не нашлось (нет сети, кэш GitHub, ошибка). */
function log(line: string): void {
  try {
    fs.mkdirSync(gameDir(), { recursive: true });
    const file = path.join(gameDir(), 'launcher-update.log');
    const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').slice(-200).join('\n') : '';
    fs.writeFileSync(file, `${old}${old ? '\n' : ''}${new Date().toISOString()} ${line}`);
  } catch { /* журнал не должен мешать работе */ }
}

const enabled = (): boolean => app.isPackaged && !!releaseRepo() && !process.env.MOONLAND_DEV_SERVER;

/**
 * Самообновление с GitHub Releases: проверка при запуске, раз в полчаса и по кнопке, тихая загрузка в фоне.
 * Скачанная версия ставится по кнопке «Перезапустить» или сама при следующем закрытии лаунчера.
 * Не работает в разработке и пока в release.json не указан владелец репозитория.
 */
export function startUpdater(onReady: (version: string) => void): void {
  const repo = releaseRepo();
  if (!enabled() || !repo) return;
  notify = onReady;
  autoUpdater.setFeedURL({ provider: 'github', owner: repo.owner, repo: repo.repo });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', e => log(`found ${e.version}, downloading`));
  autoUpdater.on('update-not-available', e => log(`up to date (latest ${e.version})`));
  autoUpdater.on('update-downloaded', e => { ready = e.version; log(`downloaded ${e.version}`); notify(e.version); });
  autoUpdater.on('error', err => log(`error: ${err?.message ?? err}`));
  log(`launcher ${app.getVersion()} started, checking`);
  void checkNow();
  setInterval(() => { void checkNow(); }, 30 * 60 * 1000);
}

export type CheckResult = { status: 'ready' | 'downloading' | 'current' | 'error' | 'disabled'; version?: string };

/** Проверка по требованию (кнопка в настройках). Скачивание идёт в фоне, о готовности скажет событие. */
export async function checkNow(): Promise<CheckResult> {
  if (!enabled()) return { status: 'disabled' };
  if (ready) return { status: 'ready', version: ready };
  try {
    const r = await autoUpdater.checkForUpdates();
    const v = r?.updateInfo?.version;
    if (v && r?.isUpdateAvailable) return { status: 'downloading', version: v };
    return { status: 'current', version: v };
  } catch (e) {
    log(`check failed: ${(e as Error).message}`);
    return { status: 'error' };
  }
}

/** Закрывает лаунчер, ставит скачанную версию без окон установщика и открывает её. */
export function installUpdate(): void {
  autoUpdater.quitAndInstall(true, true);
}
