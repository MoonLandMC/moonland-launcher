import path from 'node:path';

export const gameDir = () => path.join(process.env.APPDATA || '', '.moonland');
export const runtimeDir = () => path.join(gameDir(), 'runtime');
export const settingsFile = () => path.join(gameDir(), 'launcher.json');
export const packStateFile = () => path.join(gameDir(), 'pack-state.json');
