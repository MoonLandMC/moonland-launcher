import { describe, it, expect } from 'vitest';
import { withKeyDefaults, KEY_DEFAULTS } from '../src/main/keys';

describe('withKeyDefaults', () => {
  it('adds the missing keys once', () => {
    const once = withKeyDefaults('fov:70\nrenderDistance:12\n');
    expect(once).toContain('key_gui.xaero_new_waypoint:key.keyboard.keypad.0');
    expect(once).toContain('key_gui.xaero_enlarge_map:key.keyboard.keypad.1');
    expect(withKeyDefaults(once)).toBe(once);
  });
  it('never overwrites what the player chose', () => {
    const t = 'key_gui.xaero_new_waypoint:key.keyboard.n\nkey_gui.xaero_enlarge_map:key.keyboard.m\n';
    expect(withKeyDefaults(t)).toBe(t);
  });
  it('keeps CRLF and a missing final newline', () => {
    expect(withKeyDefaults('a:1\r\nb:2')).toBe('a:1\r\nb:2\r\n' + Object.entries(KEY_DEFAULTS).map(([k, v]) => `${k}:${v}`).join('\r\n') + '\r\n');
  });
  it('a key whose name only starts like ours is not ours', () => {
    expect(withKeyDefaults('key_gui.xaero_new_waypoint_x:key.keyboard.n\n')).toContain('key_gui.xaero_new_waypoint:key.keyboard.keypad.0');
  });
});
