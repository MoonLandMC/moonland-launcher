import fs from 'node:fs';
import path from 'node:path';
import { settingsFile } from './paths';
import { PERF_MODES, type PerfMode, type Applied } from './perf';

export type Graphics = 'standard' | 'vulkan';
/**
 * graphics: какой вариант сборки ставить; vulkanOfferSeen: предложение режима Vulkan уже показывали;
 * perf: уровень производительности (auto подбирается по железу); memoryAuto: память подбирается сама, memoryMb используется только при ручном выборе;
 * perfApplied: какой уровень уже применён к файлам игры (чтобы не затирать настройки, которые игрок поменял сам).
 */
export type Settings = {
  username?: string; passwordEnc?: string; memoryMb: number; memoryAuto: boolean; discord: boolean; graphics: Graphics; vulkanOfferSeen: boolean;
  perf: PerfMode; perfApplied: Applied;
};
export const DEFAULTS: Settings = { memoryMb: 4096, memoryAuto: true, discord: true, graphics: 'standard', vulkanOfferSeen: false, perf: 'auto', perfApplied: {} };

export function loadSettings(file = settingsFile()): Settings {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file, 'utf8')) } as Settings;
    if (s.graphics !== 'vulkan') s.graphics = 'standard';   // любое чужое значение в файле считаем стандартным
    if (!PERF_MODES.includes(s.perf)) s.perf = 'auto';
    if (typeof s.memoryAuto !== 'boolean') s.memoryAuto = true;
    if (!s.perfApplied || typeof s.perfApplied !== 'object' || Array.isArray(s.perfApplied)) s.perfApplied = {};
    return s;
  } catch { return { ...DEFAULTS }; }
}

export function saveSettings(s: Settings, file = settingsFile()): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(s, null, 2));
}
