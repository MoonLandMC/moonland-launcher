import { describe, it, expect } from 'vitest';
import { activityFor } from '../src/main/discord';

describe('activityFor', () => {
  it('launcher', () => {
    const a = activityFor('launcher')!;
    expect(a.details).toBe('В лаунчере MoonLand');
    expect(a.largeImageKey).toBe('logo');
    expect(a.buttons).toEqual([
      { label: 'Сайт сервера', url: 'https://moonlandmc.ru' },
      { label: 'Наш Discord', url: 'https://discord.gg/r3bWUCUbvw' },
    ]);
  });
  it('playing with timer', () => {
    const a = activityFor('playing', 1000)!;
    expect(a.details).toBe('Играет на MoonLand');
    expect(a.startTimestamp).toBe(1000);
  });
  it('off is null', () => { expect(activityFor('off')).toBeNull(); });
});
