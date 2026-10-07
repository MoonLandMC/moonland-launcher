import { describe, it, expect } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { tierOf, autoMemoryMb, jvmArgs, initialHeapMb, patchOptionsText, applyTierToGameDir, protectCustomOptions, isIntegratedGpu, resolveTier, OPTION_PRESETS, type Hardware } from '../src/main/perf';
import { classifyGpu } from '../src/main/gpu';

const gpu = (name: string) => ({ name, vendor: classifyGpu(name) });
const hw = (ramMb: number, cores: number, ...names: string[]): Hardware => ({ ramMb, cores, gpus: names.map(gpu) });

describe('integrated gpu', () => {
  it.each(['Intel(R) UHD Graphics 630', 'Intel(R) Iris(R) Xe Graphics', 'AMD Radeon(TM) Graphics', 'AMD Radeon(TM) Vega 8 Graphics', 'Intel(R) HD Graphics 4600'])('%s is integrated', n => expect(isIntegratedGpu(n)).toBe(true));
  it.each(['NVIDIA GeForce RTX 3060', 'AMD Radeon RX 6700 XT', 'Intel(R) Arc(TM) A770 Graphics', 'NVIDIA GeForce GTX 1050 Ti'])('%s is discrete', n => expect(isIntegratedGpu(n)).toBe(false));
});

describe('tierOf', () => {
  it('weak by RAM, cores or gpu regardless of the rest', () => {
    expect(tierOf(hw(6000, 16, 'NVIDIA GeForce RTX 4090'))).toBe('low');
    expect(tierOf(hw(32000, 2, 'NVIDIA GeForce RTX 4090'))).toBe('low');
    expect(tierOf(hw(32000, 16, 'Intel(R) UHD Graphics 630'))).toBe('low');
  });
  it('strong needs plenty of everything', () => {
    expect(tierOf(hw(32000, 12, 'NVIDIA GeForce RTX 3060'))).toBe('high');
    expect(tierOf(hw(16000, 8, 'AMD Radeon RX 6600'))).toBe('high');
  });
  it('the middle', () => {
    expect(tierOf(hw(8000, 6, 'NVIDIA GeForce GTX 1650'))).toBe('medium');
    expect(tierOf(hw(16000, 6, 'NVIDIA GeForce GTX 1660'))).toBe('medium');
  });
  it('unknown gpu list does not make a PC weak', () => { expect(tierOf(hw(16000, 8))).toBe('medium'); });
  it('custom touches nothing, a fixed mode wins over detection', () => {
    expect(resolveTier('custom', hw(32000, 16, 'NVIDIA GeForce RTX 4090'))).toBeNull();
    expect(resolveTier('low', hw(32000, 16, 'NVIDIA GeForce RTX 4090'))).toBe('low');
    expect(resolveTier('auto', hw(6000, 2))).toBe('low');
  });
});

describe('memory and jvm', () => {
  it('leaves the system at least 3 GB and respects the tier cap', () => {
    expect(autoMemoryMb(hw(8192, 6), 'medium')).toBe(4096);
    expect(autoMemoryMb(hw(32768, 16), 'high')).toBe(8192);
    expect(autoMemoryMb(hw(32768, 16), 'low')).toBe(3072);
    expect(autoMemoryMb(hw(4096, 2), 'low')).toBe(2048);
    expect(autoMemoryMb(hw(8192, 6), 'high') % 512).toBe(0);
  });
  it('initial heap never exceeds the maximum', () => {
    expect(initialHeapMb('high', 2048)).toBe(2048);
    expect(initialHeapMb('low', 3072)).toBe(1024);
  });
  it('experimental G1 flags always come after the unlock flag', () => {
    for (const t of ['low', 'medium'] as const) {
      const a = jvmArgs(t);
      const unlock = a.indexOf('-XX:+UnlockExperimentalVMOptions');
      expect(unlock).toBeGreaterThanOrEqual(0);
      expect(a.findIndex(x => x.startsWith('-XX:G1NewSizePercent'))).toBeGreaterThan(unlock);
    }
  });
  it('no tier uses ZGC: it made in-game ping worse on a real strong PC', () => {
    for (const t of ['low', 'medium', 'high'] as const) expect(jvmArgs(t).some(a => /ZGC|ZGenerational/.test(a))).toBe(false);
  });
  it('high and medium share the G1 flags', () => { expect(jvmArgs('high')).toEqual(jvmArgs('medium')); });
  it('never sets heap size (the launcher library does)', () => {
    for (const t of ['low', 'medium', 'high'] as const) expect(jvmArgs(t).some(x => /^-Xm[sx]/.test(x))).toBe(false);
  });
});

describe('options.txt patching', () => {
  it('replaces known keys, keeps the rest, appends missing', () => {
    const out = patchOptionsText('key_key.jump:key.keyboard.space\nrenderDistance:12\nfov:0.0\n', { renderDistance: '8', particles: '2' });
    expect(out).toBe('key_key.jump:key.keyboard.space\nrenderDistance:8\nfov:0.0\nparticles:2\n');
  });
  it('keeps CRLF', () => { expect(patchOptionsText('a:1\r\nb:2\r\n', { a: '9' })).toBe('a:9\r\nb:2\r\n'); });
  it('does not match a key by prefix', () => { expect(patchOptionsText('renderDistanceX:1\n', { renderDistance: '8' })).toBe('renderDistanceX:1\nrenderDistance:8\n'); });
});

describe('applyTierToGameDir', () => {
  const mk = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ml-perf-'));
    fs.mkdirSync(path.join(root, 'config'));
    fs.writeFileSync(path.join(root, 'options.txt'), 'renderDistance:24\nfov:0.5\n');
    return root;
  };
  it('applies once per tier and backs up options.txt', () => {
    const root = mk();
    const a1 = applyTierToGameDir(root, 'low', 8, {});
    expect(fs.readFileSync(path.join(root, 'options.txt'), 'utf8')).toContain('renderDistance:' + OPTION_PRESETS.low.renderDistance);
    expect(fs.readFileSync(path.join(root, 'options.txt'), 'utf8')).toContain('fov:0.5');
    expect(fs.readFileSync(path.join(root, 'options.txt.before-moonland'), 'utf8')).toBe('renderDistance:24\nfov:0.5\n');
    // the player raises the distance in game: the same tier must not overwrite it
    fs.writeFileSync(path.join(root, 'options.txt'), 'renderDistance:20\n');
    applyTierToGameDir(root, 'low', 8, a1);
    expect(fs.readFileSync(path.join(root, 'options.txt'), 'utf8')).toBe('renderDistance:20\n');
    // a different tier is a new choice
    applyTierToGameDir(root, 'high', 8, a1);
    expect(fs.readFileSync(path.join(root, 'options.txt'), 'utf8')).toContain('renderDistance:' + OPTION_PRESETS.high.renderDistance);
  });
  it('voxy config is merged, and applied later when the file appears', () => {
    const root = mk();
    const a1 = applyTierToGameDir(root, 'medium', 8, {});
    expect(a1['voxy']).toBeUndefined();
    fs.writeFileSync(path.join(root, 'config', 'voxy-config.json'), JSON.stringify({ enabled: true, sub_division_size: 64.0, section_render_distance: 16.0 }));
    const a2 = applyTierToGameDir(root, 'medium', 8, a1);
    const v = JSON.parse(fs.readFileSync(path.join(root, 'config', 'voxy-config.json'), 'utf8'));
    expect(v.section_render_distance).toBe(8); expect(v.sub_division_size).toBe(64);
    expect(a2['voxy']).toBe('medium');
  });
  it('low turns Voxy off', () => {
    const root = mk();
    fs.writeFileSync(path.join(root, 'config', 'voxy-config.json'), JSON.stringify({ enabled: true, enable_rendering: true }));
    applyTierToGameDir(root, 'low', 4, {});
    expect(JSON.parse(fs.readFileSync(path.join(root, 'config', 'voxy-config.json'), 'utf8')).enabled).toBe(false);
  });
  it('a broken voxy file is left alone', () => {
    const root = mk();
    fs.writeFileSync(path.join(root, 'config', 'voxy-config.json'), '{oops');
    const a = applyTierToGameDir(root, 'low', 4, {});
    expect(fs.readFileSync(path.join(root, 'config', 'voxy-config.json'), 'utf8')).toBe('{oops');
    expect(a['voxy']).toBeUndefined();
  });
});

describe('protectCustomOptions', () => {
  const dir = (text?: string) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ml-prot-'));
    if (text !== undefined) fs.writeFileSync(path.join(root, 'options.txt'), text);
    return root;
  };
  const custom = 'a:1\nb:2\nc:3\nd:4\n';
  it('a fresh install made by the launcher gets the level', () => {
    expect(protectCustomOptions(dir('onboardAccessibility:false\n'), {})).toEqual({});
    expect(protectCustomOptions(dir(), {})).toEqual({});
  });
  it('an existing customised file is kept until the player picks a level', () => {
    const root = dir(custom);
    const kept = protectCustomOptions(root, {});
    expect(kept['options.txt']).toBe('kept');
    expect(applyTierToGameDir(root, 'low', 8, kept)['options.txt']).toBe('kept');
    expect(fs.readFileSync(path.join(root, 'options.txt'), 'utf8')).toBe(custom);
  });
  it('an explicit choice lets the level through', () => {
    const root = dir(custom);
    expect(protectCustomOptions(root, { explicit: '1' })).toEqual({ explicit: '1' });
    expect(applyTierToGameDir(root, 'low', 8, { explicit: '1' })['options.txt']).toBe('low');
  });
});
