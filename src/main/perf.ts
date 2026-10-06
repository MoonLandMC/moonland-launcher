import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Gpu } from './gpu';

/** Три уровня железа и «custom»: в нём лаунчер ничего не трогает в настройках игры. */
export type Tier = 'low' | 'medium' | 'high';
export type PerfMode = 'auto' | Tier | 'custom';
export const PERF_MODES: readonly PerfMode[] = ['auto', 'low', 'medium', 'high', 'custom'];

export type Hardware = { ramMb: number; cores: number; gpus: Gpu[] };

export const detectHardware = (gpus: Gpu[]): Hardware => ({ ramMb: Math.round(os.totalmem() / 1048576), cores: os.cpus().length || 1, gpus });

/** Встроенные видеокарты: Intel UHD/HD/Iris, AMD «Radeon Graphics» и Vega без приставки RX. */
export function isIntegratedGpu(name: string): boolean {
  const n = name.toLowerCase();
  if (/\barc\b.*\ba\d{3}|\barc\b.*\bb\d{3}/.test(n)) return false;
  if (/intel/.test(n) && /uhd|hd graphics|iris|graphics/.test(n)) return true;
  if (/radeon/.test(n) && !/\brx\b|\bpro\b|\bvii\b|\br[579]\b\s*\d{3}/.test(n) && /graphics|vega|\b[78]\d{2}m\b/.test(n)) return true;
  return false;
}
export const isDiscreteGpu = (g: Gpu): boolean => (g.vendor === 'nvidia' || g.vendor === 'amd' || g.vendor === 'intel') && !isIntegratedGpu(g.name);

/**
 * Уровень ПК по трём признакам, каждый даёт 0, 1 или 2 очка. Нулевое очко по памяти, ядрам или видеокарте сразу означает «слабый»:
 * игру тянет самое слабое звено. «Мощный» только если все три признака на максимуме: ZGC и дальние чанки Voxy нужны запас ядер, памяти и видеокарты.
 */
export function tierOf(h: Hardware): Tier {
  const ram = h.ramMb < 7000 ? 0 : h.ramMb < 15000 ? 1 : 2;
  const cpu = h.cores < 4 ? 0 : h.cores < 8 ? 1 : 2;
  const gpu = h.gpus.length === 0 ? 1 : h.gpus.some(isDiscreteGpu) ? 2 : h.gpus.some(g => g.vendor !== 'other') ? 0 : 1;
  if (ram === 0 || cpu === 0 || gpu === 0) return 'low';
  return ram === 2 && cpu === 2 && gpu === 2 ? 'high' : 'medium';
}

export const resolveTier = (mode: PerfMode, h: Hardware): Tier | null => mode === 'custom' ? null : mode === 'auto' ? tierOf(h) : mode;

/** Память для игры в МБ: не больше половины оперативки и не меньше 3 ГБ остаётся системе, потолок зависит от уровня. */
export function autoMemoryMb(h: Hardware, tier: Tier): number {
  const cap = { low: 3072, medium: 6144, high: 8192 }[tier];
  const byRam = Math.min(Math.floor(h.ramMb / 2), h.ramMb - 3072);
  const mb = Math.min(cap, byRam);
  return Math.max(2048, Math.floor(mb / 512) * 512);
}

/** Начальный размер кучи: чем мощнее ПК, тем раньше выделяем память целиком, чтобы игра не тратила время на её расширение. */
export const initialHeapMb = (tier: Tier, memoryMb: number): number => Math.min(memoryMb, { low: 1024, medium: 2048, high: 4096 }[tier]);

/**
 * Опции Java. Уровни выбраны так, чтобы не требовать ничего сверх Java 21, которую ставит лаунчер:
 * слабый и средний ПК остаются на G1 (на малом числе ядер его потоки не мешают игре), мощный получает поколенческий ZGC с короткими паузами.
 */
export function jvmArgs(tier: Tier): string[] {
  if (tier === 'high') return ['-XX:+UseZGC', '-XX:+ZGenerational'];
  const g1 = ['-XX:+UnlockExperimentalVMOptions', '-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled', '-XX:MaxGCPauseMillis=50', '-XX:G1NewSizePercent=20', '-XX:G1ReservePercent=20'];
  if (tier === 'low') return g1;
  return [...g1, '-XX:G1HeapRegionSize=8M', '-XX:InitiatingHeapOccupancyPercent=15', '-XX:SurvivorRatio=32', '-XX:MaxTenuringThreshold=1'];
}

/** Ключи options.txt; значения в формате игры. */
export const OPTION_PRESETS: Record<Tier, Record<string, string>> = {
  low: { renderDistance: '8', simulationDistance: '6', particles: '2', entityShadows: 'false', ao: 'false', biomeBlendRadius: '0', mipmapLevels: '1', entityDistanceScaling: '0.6', cloudRange: '32', weatherRadius: '5', maxAnisotropyBit: '0', improvedTransparency: 'false', chunkSectionFadeInTime: '0.0', maxFps: '60' },
  medium: { renderDistance: '12', simulationDistance: '8', particles: '1', entityShadows: 'false', ao: 'true', biomeBlendRadius: '2', mipmapLevels: '2', entityDistanceScaling: '0.8', cloudRange: '64', weatherRadius: '8', maxAnisotropyBit: '1', improvedTransparency: 'false', chunkSectionFadeInTime: '0.5', maxFps: '120' },
  high: { renderDistance: '16', simulationDistance: '12', particles: '0', entityShadows: 'true', ao: 'true', biomeBlendRadius: '3', mipmapLevels: '4', entityDistanceScaling: '1.0', cloudRange: '128', weatherRadius: '10', maxAnisotropyBit: '2', improvedTransparency: 'false', chunkSectionFadeInTime: '0.75', maxFps: '165' },
};

/** Voxy (далёкие чанки) самый тяжёлый мод сборки: на слабом ПК он выключается, на среднем сужается. Файл config/voxy-config.json. */
export function voxyPreset(tier: Tier, cores: number): Record<string, unknown> {
  if (tier === 'low') return { enabled: false, enable_rendering: false, ingest_enabled: false };
  if (tier === 'medium') return { enabled: true, enable_rendering: true, ingest_enabled: true, section_render_distance: 8.0, service_threads: Math.max(1, Math.min(2, Math.floor(cores / 4))) };
  return { enabled: true, enable_rendering: true, ingest_enabled: true, section_render_distance: 16.0, service_threads: Math.max(2, Math.min(6, Math.floor(cores / 2))) };
}

/** Меняет или добавляет ключи в тексте options.txt, остальное (клавиши, звук, ресурспаки) не трогает. */
export function patchOptionsText(text: string, kv: Record<string, string>): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const seen = new Set<string>();
  const out = lines.map(l => {
    const i = l.indexOf(':');
    const k = i > 0 ? l.slice(0, i) : '';
    if (k && k in kv) { seen.add(k); return `${k}:${kv[k]}`; }
    return l;
  });
  while (out.length && out[out.length - 1] === '') out.pop();
  for (const k of Object.keys(kv)) if (!seen.has(k)) out.push(`${k}:${kv[k]}`);
  return out.join(eol) + eol;
}

export type Applied = Record<string, string>;

/**
 * Применяет уровень к файлам игры один раз на уровень: после этого игрок волен менять настройки в игре, лаунчер их не перезапишет.
 * Файл мода, которого ещё нет (создаётся при первом запуске), пропускается и применяется, когда появится.
 * Перед первым изменением options.txt рядом кладётся копия options.txt.before-moonland.
 */
export function applyTierToGameDir(root: string, tier: Tier, cores: number, applied: Applied): Applied {
  const next: Applied = { ...applied };
  const optionsFile = path.join(root, 'options.txt');
  if (applied['options.txt'] !== tier && applied['options.txt'] !== 'kept' && fs.existsSync(optionsFile)) {
    const text = fs.readFileSync(optionsFile, 'utf8');
    const backup = optionsFile + '.before-moonland';
    if (!fs.existsSync(backup)) fs.writeFileSync(backup, text);
    fs.writeFileSync(optionsFile, patchOptionsText(text, OPTION_PRESETS[tier]));
    next['options.txt'] = tier;
  }
  const voxyFile = path.join(root, 'config', 'voxy-config.json');
  if (applied['voxy'] !== tier && fs.existsSync(voxyFile)) {
    try {
      const cur = JSON.parse(fs.readFileSync(voxyFile, 'utf8'));
      fs.writeFileSync(voxyFile, JSON.stringify({ ...cur, ...voxyPreset(tier, cores) }, null, 2));
      next['voxy'] = tier;
    } catch { /* повреждённый файл не трогаем */ }
  }
  return next;
}

/**
 * Игрок, который уже настраивал графику (в options.txt больше трёх строк), не должен обнаружить после обновления лаунчера чужие значения.
 * Пока он сам не выбрал уровень в настройках лаунчера (отметка 'explicit'), options.txt ему не меняем: 'kept' означает «не трогать».
 * Новая установка (файл создан лаунчером) получает уровень сразу.
 */
export function protectCustomOptions(root: string, applied: Applied): Applied {
  if (applied['options.txt'] || applied['explicit']) return applied;
  try {
    const lines = fs.readFileSync(path.join(root, 'options.txt'), 'utf8').split(/\r?\n/).filter(Boolean);
    if (lines.length > 3) return { ...applied, 'options.txt': 'kept' };
  } catch { /* файла нет: применим уровень */ }
  return applied;
}
