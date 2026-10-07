import fs from 'node:fs';

/**
 * Клавиши по умолчанию, которые модам сборки нельзя оставлять самим: в сборке не осталось свободных букв, и миникарта Xaero
 * по умолчанию заняла бы B (быстрый выбор эмоций) и Z (отладочный переключатель Presence Footsteps).
 * Вместо них ставятся свободные клавиши цифровой панели (значение «не назначено» игра сама сбрасывает на B и Z, проверено).
 * Строка добавляется только если в options.txt её ещё нет: что игрок выбрал сам, лаунчер не перезаписывает.
 */
export const KEY_DEFAULTS: Record<string, string> = {
  'key_gui.xaero_new_waypoint': 'key.keyboard.keypad.0',
  'key_gui.xaero_enlarge_map': 'key.keyboard.keypad.1',
};

export function withKeyDefaults(text: string, defaults: Record<string, string> = KEY_DEFAULTS): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const have = new Set(text.split(/\r?\n/).map(l => l.slice(0, Math.max(0, l.indexOf(':')))).filter(Boolean));
  const add = Object.entries(defaults).filter(([k]) => !have.has(k)).map(([k, v]) => `${k}:${v}`);
  if (!add.length) return text;
  const base = text.endsWith('\n') || text === '' ? text : text + eol;
  return base + add.join(eol) + eol;
}

export function ensureKeyDefaults(optionsFile: string): void {
  try {
    const text = fs.readFileSync(optionsFile, 'utf8');
    const next = withKeyDefaults(text);
    if (next !== text) fs.writeFileSync(optionsFile, next);
  } catch { /* нет файла или он занят: игра всё равно запустится */ }
}
