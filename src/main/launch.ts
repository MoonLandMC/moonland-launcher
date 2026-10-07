import fs from 'node:fs';
import path from 'node:path';
import { Client, Authenticator } from 'minecraft-launcher-core';
import { gameDir } from './paths';
import { serverHost, isDev } from './config';
import { serversDat } from './servers';
import { ensureKeyDefaults } from './keys';

export type LaunchOptions = {
  javaPath: string; versionId: string; mcVersion: string; username: string; password: string; memoryMb: number;
  /** Начальный размер кучи и опции Java из perf.ts (пусто в режиме «Свои настройки»). */
  initialMb?: number; jvmArgs?: string[];
  /** Вызывается после того, как options.txt и servers.dat на месте, до запуска Java. */
  prepare?: () => void;
};

export async function launchGame(
  o: LaunchOptions,
  onClose: (code: number) => void,
  onLog: (line: string) => void,
  onProgress: (done: number, total: number) => void = () => {},
): Promise<void> {
  const client = new Client();
  client.on('data', (d: unknown) => onLog(String(d)));
  client.on('debug', (d: unknown) => onLog(String(d)));
  client.on('progress', (p: { task: number; total: number }) => onProgress(p.task, p.total));
  client.on('close', (c: number) => onClose(c));
  // Первый запуск: ванильный экран «Специальные возможности?» перехватывает quickPlay и игра не заходит на сервер.
  const options = path.join(gameDir(), 'options.txt');
  if (!fs.existsSync(options)) fs.writeFileSync(options, 'onboardAccessibility:false\n');
  else {
    const text = fs.readFileSync(options, 'utf8');
    if (text.includes('onboardAccessibility:true')) fs.writeFileSync(options, text.replace('onboardAccessibility:true', 'onboardAccessibility:false'));
  }
  ensureKeyDefaults(options);
  const host = serverHost();
  const servers = path.join(gameDir(), 'servers.dat');
  if (!fs.existsSync(servers)) fs.writeFileSync(servers, serversDat('MoonLand', host));
  o.prepare?.();
  const customArgs = [...(o.jvmArgs ?? []), ...(isDev() ? [`-Dmoonland.devHost=${host}`] : [])];
  // MCLC спавнит Java без опции env: игра наследует process.env лаунчера (проверено по исходнику 3.18.2).
  // launch() резолвится уже после child.spawn, поэтому переменную можно сразу убрать.
  process.env.MOONLAND_AUTOLOGIN = o.password;
  try {
    const proc = await client.launch({
      root: gameDir(),
      javaPath: o.javaPath,
      version: { number: o.mcVersion, type: 'release', custom: o.versionId },
      memory: { max: `${o.memoryMb}M`, min: `${o.initialMb ?? 1024}M` },
      authorization: Authenticator.getAuth(o.username),
      quickPlay: { type: 'multiplayer', identifier: host },
      customArgs,
      overrides: { detached: false },
    } as any);
    // MCLC глотает свои ошибки и возвращает null (launcher.js, catch в launch()).
    if (!proc) throw new Error('LAUNCH_FAILED');
  } finally {
    delete process.env.MOONLAND_AUTOLOGIN;
  }
}
