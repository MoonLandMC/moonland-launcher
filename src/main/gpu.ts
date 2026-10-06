import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export type Vendor = 'amd' | 'nvidia' | 'intel' | 'other';
export type Gpu = { name: string; vendor: Vendor };

export function classifyGpu(name: string): Vendor {
  const n = name.toLowerCase();
  if (/nvidia|geforce|quadro|\brtx\b|\bgtx\b/.test(n)) return 'nvidia';
  if (/\bamd\b|radeon|\bati\b/.test(n)) return 'amd';
  if (/intel|\biris\b|\buhd\b|\barc\b/.test(n)) return 'intel';
  return 'other';
}

/** Виртуальные адаптеры (удалённый стол, мониторы-эмуляторы): это не видеокарты игрока. */
const VIRTUAL = /microsoft basic|remote|virtual|parsec|displaylink|meta |oculus|vmware|hyper-v|citrix/i;

/** Имена видеокарт из вывода PowerShell (по одному в строке). */
export function parseGpuList(text: string): Gpu[] {
  return text.split(/\r?\n/).map(s => s.trim()).filter(s => s && !VIRTUAL.test(s)).map(name => ({ name, vendor: classifyGpu(name) }));
}

/**
 * Предлагаем режим Vulkan, когда в компьютере есть видеокарта AMD и нет NVIDIA, а Vulkan-драйвер установлен.
 * Если рядом есть NVIDIA (ноутбук с двумя картами), не предлагаем: у игры может быть выбрана именно она, и мы не знаем, какая рисует.
 */
export function offerVulkan(gpus: Gpu[], vulkanDriver: boolean): boolean {
  return vulkanDriver && gpus.some(g => g.vendor === 'amd') && !gpus.some(g => g.vendor === 'nvidia');
}

/** Загрузчик Vulkan (vulkan-1.dll) ставится вместе с драйвером видеокарты. */
export const vulkanDriverPresent = (): boolean => fs.existsSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'vulkan-1.dll'));

export function detectGpus(): Promise<Gpu[]> {
  const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return new Promise(resolve => {
    execFile(ps, ['-NoProfile', '-NonInteractive', '-Command', '[Console]::OutputEncoding=[Text.Encoding]::UTF8; (Get-CimInstance Win32_VideoController).Name'],
      { timeout: 8000, windowsHide: true }, (err, stdout) => resolve(err ? [] : parseGpuList(String(stdout))));
  });
}
