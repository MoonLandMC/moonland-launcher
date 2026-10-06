import { describe, it, expect } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { loadSettings, saveSettings, DEFAULTS } from '../src/main/settings';

describe('settings', () => {
  it('defaults when missing', () => {
    expect(loadSettings(path.join(os.tmpdir(), 'nope-' + Date.now() + '.json'))).toEqual(DEFAULTS);
  });
  it('roundtrip and discord default on', () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ml-')), 's.json');
    saveSettings({ ...DEFAULTS, username: 'x', memoryMb: 6144 }, f);
    expect(loadSettings(f)).toEqual({ memoryMb: 6144, memoryAuto: true, discord: true, username: 'x', graphics: 'standard', vulkanOfferSeen: false, perf: 'auto', perfApplied: {} });
  });
  it('garbage in the perf fields falls back to safe values', () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ml-')), 's.json');
    fs.writeFileSync(f, JSON.stringify({ perf: 'ultra', memoryAuto: 'yes', perfApplied: [1] }));
    const s = loadSettings(f);
    expect(s.perf).toBe('auto'); expect(s.memoryAuto).toBe(true); expect(s.perfApplied).toEqual({});
  });
});
