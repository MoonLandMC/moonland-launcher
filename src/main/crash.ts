import fs from 'node:fs';
import path from 'node:path';

/**
 * Игра в режиме Vulkan могла упасть в самом драйвере: Java пишет отчёт hs_err_pid*.log в папку игры.
 * Смотрим только отчёты, появившиеся после запуска (since, мс), и только их начало, где лежит стек упавшего потока.
 */
const VULKAN_FRAME = /vulkanmod|org\.lwjgl\.vulkan|vulkan-1\.dll/i;

export function vulkanCrashReport(dir: string, since: number): boolean {
  let names: string[];
  try { names = fs.readdirSync(dir).filter(n => /^hs_err_pid\d+\.log$/.test(n)); } catch { return false; }
  for (const n of names) {
    try {
      const file = path.join(dir, n);
      if (fs.statSync(file).mtimeMs < since - 5000) continue;
      const fd = fs.openSync(file, 'r');
      try {
        const buf = Buffer.alloc(65536);
        const len = fs.readSync(fd, buf, 0, buf.length, 0);
        if (VULKAN_FRAME.test(buf.toString('utf8', 0, len))) return true;
      } finally { fs.closeSync(fd); }
    } catch { /* нечитаемый отчёт пропускаем */ }
  }
  return false;
}
