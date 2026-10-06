import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { loadSettings, saveSettings, type Settings } from './settings';
import { checkLogin, encryptPassword, decryptPassword } from './auth';
import { installPack, installedPackVersion, verifyPack, guardPack, type Stage } from './pack';
import { ensureJava } from './java';
import { ensureFabric } from './fabric';
import { launchGame } from './launch';
import { Presence } from './discord';
import { gameDir } from './paths';
import { fetchJson } from './net';
import { SITE } from './config';
import { fetchNews } from './news';
import { checkSkinPng, uploadSkin } from './skin';
import { startUpdater, installUpdate, updateReady, checkNow } from './updater';
import { detectGpus, offerVulkan, vulkanDriverPresent, type Gpu } from './gpu';
import { detectHardware, resolveTier, tierOf, autoMemoryMb, jvmArgs, initialHeapMb, applyTierToGameDir, protectCustomOptions, PERF_MODES, type PerfMode } from './perf';

let win: BrowserWindow | null = null;
let settings: Settings = loadSettings();
const presence = new Presence();
let running = false;
let lastFocusCheck = Date.now();
// Видеокарты определяются один раз при старте: от этого зависит, предлагать ли режим Vulkan.
let gpus: Gpu[] = [];
const gpuReady = detectGpus().then(g => { gpus = g; });

const send = (ch: string, p: unknown) => { if (win && !win.isDestroyed()) win.webContents.send(ch, p); };

function create() {
  win = new BrowserWindow({
    width: 960, height: 600, resizable: false, maximizable: false, frame: false, backgroundColor: '#06080f', show: false,
    title: 'MoonLand', icon: path.join(__dirname, '..', 'renderer', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win?.show());
  // Открыли или вернули окно: заодно проверяем, не вышла ли новая версия (после срочного исправления ждать полчаса не нужно).
  win.on('focus', () => { if (Date.now() - lastFocusCheck > 5 * 60 * 1000) { lastFocusCheck = Date.now(); void checkNow(); } });
  win.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('https://')) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', e => e.preventDefault());
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    create();
    startUpdater(version => send('ml:update', { version }));
    if (settings.discord) presence.start().then(() => presence.set('launcher'));
  });
  app.on('window-all-closed', async () => { await presence.stop(); app.quit(); });
}

/** Что лаунчер знает о ПК и что из этого выбрал: показывается в настройках. */
function perfInfo() {
  const hw = detectHardware(gpus);
  const detected = tierOf(hw);
  const tier = resolveTier(settings.perf, hw);
  return { ramMb: hw.ramMb, cores: hw.cores, gpu: gpus.map(g => g.name).join(', '), detected, tier, autoMemoryMb: autoMemoryMb(hw, tier ?? detected) };
}

const publicState = () => ({
  loggedIn: !!settings.passwordEnc, username: settings.username,
  settings: { memoryMb: settings.memoryMb, memoryAuto: settings.memoryAuto, discord: settings.discord, graphics: settings.graphics, perf: settings.perf }, running,
  perf: perfInfo(),
  gpu: { names: gpus.map(g => g.name), offerVulkan: settings.graphics === 'standard' && !settings.vulkanOfferSeen && offerVulkan(gpus, vulkanDriverPresent()), vulkanDriver: vulkanDriverPresent() },
  packVersion: installedPackVersion(),
  appVersion: app.getVersion(), updateReady: updateReady(),
});

ipcMain.handle('ml:state', async () => { await gpuReady; return publicState(); });

// Перезапуск ради обновления не предлагается, пока идёт игра: версия поставится сама, когда лаунчер закроют.
ipcMain.handle('ml:checkUpdate', () => checkNow());
ipcMain.handle('ml:installUpdate', () => { if (running || !updateReady()) return { error: running ? 'RUNNING' : 'NONE' }; installUpdate(); return {}; });

ipcMain.handle('ml:login', async (_e, username: string, password: string) => {
  const r = await checkLogin(String(username).trim(), String(password));
  if (r.ok) { settings = { ...settings, username: r.username, passwordEnc: encryptPassword(password) }; saveSettings(settings); }
  return r;
});

ipcMain.handle('ml:logout', () => { settings = { ...settings, passwordEnc: undefined }; saveSettings(settings); });

ipcMain.handle('ml:settings', async (_e, patch: Partial<Settings>) => {
  const discordBefore = settings.discord;
  const mem = Number(patch.memoryMb);
  settings = {
    ...settings,
    memoryMb: Number.isFinite(mem) && mem >= 2048 && mem <= 16384 ? mem : settings.memoryMb,
    memoryAuto: typeof patch.memoryAuto === 'boolean' ? patch.memoryAuto : settings.memoryAuto,
    perf: PERF_MODES.includes(patch.perf as PerfMode) ? patch.perf as PerfMode : settings.perf,
    // Уровень выбран руками: следующий запуск применит его и к options.txt, даже если игрок настраивал графику раньше.
    perfApplied: PERF_MODES.includes(patch.perf as PerfMode) ? { explicit: '1' } : settings.perfApplied,
    discord: typeof patch.discord === 'boolean' ? patch.discord : settings.discord,
    graphics: patch.graphics === 'vulkan' || patch.graphics === 'standard' ? patch.graphics : settings.graphics,
    vulkanOfferSeen: typeof patch.vulkanOfferSeen === 'boolean' ? patch.vulkanOfferSeen : settings.vulkanOfferSeen,
  };
  saveSettings(settings);
  if (discordBefore !== settings.discord) {
    if (settings.discord) { await presence.start(); presence.set(running ? 'playing' : 'launcher', Date.now()); }
    else await presence.stop();
  }
});

ipcMain.handle('ml:openDir', () => { fs.mkdirSync(gameDir(), { recursive: true }); return shell.openPath(gameDir()); });
ipcMain.handle('ml:verify', async () => {
  if (running) return { error: 'RUNNING' };
  try { return await verifyPack(); } catch (e) { return { error: (e as Error).message }; }
});
let pickedSkin: Buffer | null = null;
ipcMain.handle('ml:skinPick', async () => {
  if (!win) return { cancelled: true };
  const r = await dialog.showOpenDialog(win, { title: 'Выберите скин', properties: ['openFile'], filters: [{ name: 'Скин (PNG)', extensions: ['png'] }] });
  if (r.canceled || !r.filePaths[0]) return { cancelled: true };
  let buf: Buffer;
  try { buf = fs.readFileSync(r.filePaths[0]); } catch { return { error: 'READ' }; }
  const check = checkSkinPng(buf);
  if (!check.ok) return { error: check.error };
  pickedSkin = buf;
  return { name: path.basename(r.filePaths[0]), width: check.width, height: check.height, dataUrl: 'data:image/png;base64,' + buf.toString('base64') };
});
ipcMain.handle('ml:skinApply', async (_e, variant: string) => {
  if (!pickedSkin || !settings.username || !settings.passwordEnc) return { ok: false, error: 'bad_file' };
  return uploadSkin(settings.username, decryptPassword(settings.passwordEnc), pickedSkin, variant === 'slim' ? 'slim' : 'classic');
});
ipcMain.handle('ml:online', async () => {
  try { return { online: (await fetchJson<{ online: number }>(`${SITE}/api/online`)).online }; } catch { return { online: null }; }
});
ipcMain.handle('ml:minimize', () => win?.minimize());
ipcMain.handle('ml:close', () => win?.close());

ipcMain.handle('ml:news', () => fetchNews());

ipcMain.handle('ml:play', async () => {
  if (running || !settings.username || !settings.passwordEnc) return;
  running = true;
  const progress = (stage: Stage, done: number, total: number) => send('ml:progress', { stage, done, total });
  const log: string[] = [];
  try {
    const password = decryptPassword(settings.passwordEnc);
    const check = await checkLogin(settings.username, password);
    if (!check.ok && check.error === 'bad_credentials') {
      settings = { ...settings, passwordEnc: undefined }; saveSettings(settings);
      throw new Error('RELOGIN');
    }
    const javaPath = await ensureJava(progress);
    const pack = await installPack(progress, settings.graphics);
    const guard = await guardPack();
    if (guard.removed.length) send('ml:status', { kind: 'notice', message: 'FOREIGN_MODS', detail: guard.removed.join(', ') });
    progress('fabric', 0, 1);
    const versionId = await ensureFabric(pack.mcVersion, pack.loaderVersion);
    progress('minecraft', 0, 1);
    const started = Date.now();
    await gpuReady;
    const hw = detectHardware(gpus);
    const tier = resolveTier(settings.perf, hw);
    const memoryMb = settings.memoryAuto ? autoMemoryMb(hw, tier ?? tierOf(hw)) : settings.memoryMb;
    await launchGame(
      {
        javaPath, versionId, mcVersion: pack.mcVersion, username: settings.username, password, memoryMb,
        initialMb: tier ? initialHeapMb(tier, memoryMb) : undefined, jvmArgs: tier ? jvmArgs(tier) : undefined,
        prepare: () => {
          if (!tier) return;
          const applied = applyTierToGameDir(gameDir(), tier, hw.cores, protectCustomOptions(gameDir(), settings.perfApplied));
          if (JSON.stringify(applied) !== JSON.stringify(settings.perfApplied)) { settings = { ...settings, perfApplied: applied }; saveSettings(settings); }
        },
      },
      code => {
        running = false;
        presence.set('launcher');
        if (code === 0) { send('ml:status', { kind: 'closed' }); return; }
        try { fs.writeFileSync(path.join(gameDir(), 'launcher-last.log'), log.join('')); } catch {}
        send('ml:status', { kind: 'error', message: 'CRASH' });
      },
      line => { log.push(line.endsWith('\n') ? line : line + '\n'); if (log.length > 2000) log.shift(); },
      (done, total) => progress('minecraft', done, total),
    );
    presence.set('playing', started);
    send('ml:status', { kind: 'playing', offline: pack.offline });
  } catch (e) {
    running = false;
    try { fs.mkdirSync(gameDir(), { recursive: true }); fs.writeFileSync(path.join(gameDir(), 'launcher-last.log'), `${(e as Error).stack}\n\n${log.join('')}`); } catch {}
    const code = (e as NodeJS.ErrnoException).code;
    send('ml:status', { kind: 'error', message: code === 'EPERM' || code === 'EBUSY' || code === 'EACCES' ? 'FILE_LOCKED' : (e as Error).message });
  }
});
