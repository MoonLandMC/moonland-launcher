import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { packUrl, allowHttpPack } from './config';
import { gameDir, packStateFile } from './paths';
import { fetchBuffer, fetchJson } from './net';

export type PackManifest = { version: string; mrpack: string; sha256: string };
export type IndexFile = { path: string; hashes: { sha1: string; sha512?: string }; downloads: string[]; env?: { client?: string } };
export type MrIndex = { versionId: string; dependencies: Record<string, string>; files: IndexFile[] };
export type Stage = 'java' | 'minecraft' | 'fabric' | 'mods' | 'launch';
export type Progress = (stage: Stage, done: number, total: number) => void;
export type PackResult = { mcVersion: string; loaderVersion: string; version: string; offline: boolean };
type PackState = { version: string; index: MrIndex; overrides?: string[]; overrideMods?: Record<string, string>; mrpack?: string; mrpackSha256?: string };

export function parseManifest(json: unknown, allowLocalHttp = false): PackManifest {
  const o = json as Partial<PackManifest>;
  if (!o || typeof o.version !== 'string' || typeof o.mrpack !== 'string' || typeof o.sha256 !== 'string') throw new Error('bad pack.json');
  const localHttp = allowLocalHttp && o.mrpack.startsWith('http://localhost:');
  if (!o.mrpack.startsWith('https://') && !localHttp) throw new Error('mrpack must be https');
  if (!/^[0-9a-f]{64}$/i.test(o.sha256)) throw new Error('bad sha256');
  return { version: o.version, mrpack: o.mrpack, sha256: o.sha256.toLowerCase() };
}

const clientFiles = (i: MrIndex) => i.files.filter(f => f.env?.client !== 'unsupported');

export function diffIndex(prev: MrIndex | null, next: MrIndex): { download: IndexFile[]; remove: string[] } {
  const old = new Map((prev ? clientFiles(prev) : []).map(f => [f.path, f.hashes.sha1]));
  const nextFiles = clientFiles(next);
  const nextPaths = new Set(nextFiles.map(f => f.path));
  return {
    download: nextFiles.filter(f => old.get(f.path) !== f.hashes.sha1),
    remove: [...old.keys()].filter(p => !nextPaths.has(p)),
  };
}

/**
 * Записывает файл игры, даже если у него стоит атрибут «скрытый» или «только чтение». Некоторые моды (например, Euphoria Patches)
 * сами скрывают свои файлы, а Windows не даёт перезаписать такой файл обычной записью (EPERM). Тогда старый файл удаляется и пишется заново.
 */
export function writeGameFile(dest: string, data: Buffer | string): void {
  try { fs.writeFileSync(dest, data); }
  catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== 'EPERM' && code !== 'EACCES') throw e;
    fs.rmSync(dest, { force: true });
    fs.writeFileSync(dest, data);
  }
}

export const sha1Hex = (b: Buffer) => crypto.createHash('sha1').update(b).digest('hex');
export const sha256Hex = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');

/** SHA-1 файла потоком: не держит файл целиком в памяти и не блокирует главный поток лаунчера. null, если файла нет. */
export const sha1File = (file: string): Promise<string | null> => new Promise(resolve => {
  const h = crypto.createHash('sha1');
  const s = fs.createReadStream(file);
  s.on('data', d => h.update(d));
  s.on('error', () => resolve(null));
  s.on('end', () => resolve(h.digest('hex')));
});

export function safeJoin(root: string, rel: string): string {
  const full = path.resolve(root, rel);
  const base = path.resolve(root) + path.sep;
  if (!full.startsWith(base)) throw new Error(`unsafe path: ${rel}`);
  return full;
}

function readState(file = packStateFile()): PackState | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/** Версия уже установленной сборки, для отображения в интерфейсе. null — сборка ещё ни разу не ставилась. */
export function installedPackVersion(file = packStateFile()): string | null {
  return readState(file)?.version ?? null;
}

const result = (s: PackState, offline: boolean): PackResult => ({
  mcVersion: s.index.dependencies.minecraft, loaderVersion: s.index.dependencies['fabric-loader'], version: s.version, offline,
});

/**
 * Моды, которые прошлая версия сборки положила через overrides, а новая уже не кладёт (например, мод переименовали).
 * Их удаляют, иначе у игрока остаются две копии мода. Другие файлы из overrides (конфиги) не трогаем: игрок мог их менять.
 */
export function staleOverrideMods(prev: string[] | undefined, next: string[]): string[] {
  const keep = new Set(next);
  return (prev ?? []).filter(p => p.startsWith('mods/') && p.endsWith('.jar') && !keep.has(p));
}

/**
 * Моды в папке mods, которых нет в сборке: ни в индексе, ни среди модов из overrides. Это чужие или подменённые файлы
 * (читы, свои моды, переименованные копии). Возвращает пути вида mods/x.jar.
 */
export function foreignMods(present: string[], index: MrIndex, overrideMods: string[]): string[] {
  const allowed = new Set([...clientFiles(index).map(f => f.path), ...overrideMods]);
  return present.filter(p => p.startsWith('mods/') && !allowed.has(p));
}

/** Файлы, которые игрок меняет сам: при обновлении пакета не перезаписываем, если уже есть. */
const KEEP_IF_EXISTS = new Set(['options.txt', 'servers.dat']);

export async function installPack(progress: Progress, graphics: 'standard' | 'vulkan' = 'standard'): Promise<PackResult> {
  const state = readState();
  let manifest: PackManifest;
  try { manifest = parseManifest(await fetchJson(packUrl(graphics)), allowHttpPack()); }
  catch {
    if (state) return result(state, true);
    throw new Error('NO_NETWORK');
  }
  if (state && state.version === manifest.version) return result(state, false);

  progress('mods', 0, 1);
  const mrpack = await fetchBuffer(manifest.mrpack);
  if (sha256Hex(mrpack) !== manifest.sha256) throw new Error('PACK_HASH');
  const zip = new AdmZip(mrpack);
  const index = JSON.parse(zip.readAsText('modrinth.index.json')) as MrIndex;
  const root = gameDir();
  const { download, remove } = diffIndex(state?.index ?? null, index);
  for (const p of remove) fs.rmSync(safeJoin(root, p), { force: true });

  let done = 0;
  const queue = [...download];
  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      const dest = safeJoin(root, f.path);
      // Уже скачанный файл с верным хешем (например, после прерванной установки) не качаем заново.
      const have = (await sha1File(dest)) === f.hashes.sha1;
      if (!have) {
        let buf: Buffer | null = null;
        for (let i = 0; i < 3 && !buf; i++) {
          const b = await fetchBuffer(f.downloads[0]);
          if (sha1Hex(b) === f.hashes.sha1) buf = b;
        }
        if (!buf) throw new Error(`FILE_HASH:${f.path}`);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        writeGameFile(dest, buf);
      }
      progress('mods', ++done, download.length);
    }
  };
  progress('mods', 0, download.length);
  await Promise.all(Array.from({ length: Math.min(6, download.length) }, worker));

  const overrides: string[] = [];
  const overrideMods: Record<string, string> = {};
  for (const e of zip.getEntries()) {
    for (const prefix of ['overrides/', 'client-overrides/']) {
      if (e.isDirectory || !e.entryName.startsWith(prefix)) continue;
      const rel = e.entryName.slice(prefix.length);
      const dest = safeJoin(root, rel);
      overrides.push(rel);
      if (KEEP_IF_EXISTS.has(rel) && fs.existsSync(dest)) continue;
      const data = e.getData();
      if (rel.startsWith('mods/') && rel.endsWith('.jar')) overrideMods[rel] = sha1Hex(data);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      writeGameFile(dest, data);
    }
  }
  for (const p of staleOverrideMods(state?.overrides, overrides)) fs.rmSync(safeJoin(root, p), { force: true });
  fs.mkdirSync(root, { recursive: true });
  const next: PackState = { version: manifest.version, index, overrides, overrideMods, mrpack: manifest.mrpack, mrpackSha256: manifest.sha256 };
  fs.writeFileSync(packStateFile(), JSON.stringify(next));
  return result(next, false);
}

export type VerifyResult = { total: number; fixed: string[]; failed: string[] };

/**
 * Проверка целостности: сверяет каждый файл установленной сборки с хешем из индекса и перекачивает испорченные или пропавшие.
 * Чужие файлы (свои моды, шейдеры, скриншоты) не трогает.
 */
export async function verifyPack(progress?: (done: number, total: number) => void): Promise<VerifyResult> {
  const state = readState();
  if (!state) return { total: 0, fixed: [], failed: [] };
  const root = gameDir();
  const files = clientFiles(state.index);
  const fixed: string[] = [];
  const failed: string[] = [];
  let done = 0;
  const queue = [...files];
  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      const dest = safeJoin(root, f.path);
      const ok = (await sha1File(dest)) === f.hashes.sha1;
      if (!ok) {
        let buf: Buffer | null = null;
        for (let i = 0; i < 3 && !buf; i++) {
          try { const b = await fetchBuffer(f.downloads[0]); if (sha1Hex(b) === f.hashes.sha1) buf = b; } catch { /* следующая попытка */ }
        }
        if (buf) { fs.mkdirSync(path.dirname(dest), { recursive: true }); writeGameFile(dest, buf); fixed.push(f.path); }
        else failed.push(f.path);
      }
      progress?.(++done, files.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, files.length) }, worker));
  return { total: files.length, fixed, failed };
}

export type GuardResult = { checked: number; repaired: string[]; removed: string[] };

/**
 * Защита сборки перед каждым запуском игры: все файлы сборки сверяются с хешами и, если что-то испорчено или подменено, восстанавливаются;
 * моды, которых в сборке нет, переносятся в mods-removed (ничего не удаляется насовсем). Если восстановить не удалось (нет сети
 * или сборку не скачать), игра не запускается: лгать игроку, что всё в порядке, нельзя.
 */
export async function guardPack(): Promise<GuardResult> {
  const state = readState();
  if (!state) return { checked: 0, repaired: [], removed: [] };
  const root = gameDir();
  const verified = await verifyPack();
  if (verified.failed.length) throw new Error('PACK_DAMAGED');
  const repaired = [...verified.fixed];

  // Моды из overrides (наш мод) лежат внутри .mrpack, а не на Modrinth: их проверяют по хешам, записанным при установке.
  const bad: string[] = [];
  for (const [rel, sha] of Object.entries(state.overrideMods ?? {})) if ((await sha1File(safeJoin(root, rel))) !== sha) bad.push(rel);
  if (bad.length) {
    if (!state.mrpack || !state.mrpackSha256) throw new Error('PACK_DAMAGED');
    let zip: AdmZip;
    try {
      const buf = await fetchBuffer(state.mrpack);
      if (sha256Hex(buf) !== state.mrpackSha256) throw new Error('PACK_HASH');
      zip = new AdmZip(buf);
    } catch { throw new Error('PACK_DAMAGED'); }
    for (const rel of bad) {
      const e = zip.getEntry('overrides/' + rel) ?? zip.getEntry('client-overrides/' + rel);
      if (!e) throw new Error('PACK_DAMAGED');
      const dest = safeJoin(root, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      writeGameFile(dest, e.getData());
      repaired.push(rel);
    }
  }

  const modsDir = path.join(root, 'mods');
  const present = fs.existsSync(modsDir) ? fs.readdirSync(modsDir, { withFileTypes: true }).filter(d => d.isFile()).map(d => 'mods/' + d.name) : [];
  const removed: string[] = [];
  const foreign = foreignMods(present.filter(p => p.endsWith('.jar')), state.index, Object.keys(state.overrideMods ?? {}));
  if (foreign.length) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = path.join(root, 'mods-removed', stamp);
    fs.mkdirSync(dir, { recursive: true });
    for (const p of foreign) { fs.renameSync(safeJoin(root, p), path.join(dir, path.basename(p))); removed.push(path.basename(p)); }
  }
  return { checked: clientFiles(state.index).length + Object.keys(state.overrideMods ?? {}).length, repaired, removed };
}
