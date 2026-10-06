import { describe, it, expect } from 'vitest';
import { serversDat } from '../src/main/servers';

describe('serversDat', () => {
  it('matches the NBT layout the game writes', () => {
    const b = serversDat('MoonLand', 'moonlandmc.ru');
    expect(b.subarray(0, 14)).toEqual(Buffer.from('0a0000090007736572766572730a', 'hex'));
    expect(b.readInt32BE(14)).toBe(1);
    const s = b.toString('latin1');
    expect(s).toContain('\x08\x00\x04name\x00\x08MoonLand');
    expect(s).toContain('\x08\x00\x02ip\x00\x0dmoonlandmc.ru');
    expect(s).toContain('\x01\x00\x0eacceptTextures\x01');
    expect(b.subarray(-2)).toEqual(Buffer.from([0, 0]));
  });
});
