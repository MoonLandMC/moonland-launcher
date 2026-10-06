import { describe, it, expect } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { parseManifest, diffIndex, staleOverrideMods, foreignMods, writeGameFile, sha1Hex, sha256Hex, safeJoin, installedPackVersion, type MrIndex } from '../src/main/pack';

const f = (path: string, sha1: string) => ({ path, hashes: { sha1 }, downloads: [`https://cdn/${path}`] });
const idx = (files: ReturnType<typeof f>[]): MrIndex => ({ versionId: 'x', dependencies: { minecraft: '1.21.11', 'fabric-loader': '0.19.3' }, files });

describe('parseManifest', () => {
  it('accepts valid', () => {
    expect(parseManifest({ version: '1.0.4', mrpack: 'https://moonlandmc.ru/launcher/MoonPack-1.0.4.mrpack', sha256: 'a'.repeat(64) }).version).toBe('1.0.4');
  });
  it('rejects non-https or missing fields', () => {
    expect(() => parseManifest({ version: '1', mrpack: 'http://x', sha256: 'a'.repeat(64) })).toThrow();
    expect(() => parseManifest({ version: '1' })).toThrow();
  });
  it('allows http://localhost only in dev mode', () => {
    const m = { version: '1', mrpack: 'http://localhost:8765/p.mrpack', sha256: 'a'.repeat(64) };
    expect(() => parseManifest(m)).toThrow();
    expect(parseManifest(m, true).mrpack).toBe(m.mrpack);
    expect(() => parseManifest({ ...m, mrpack: 'http://evil.example/p.mrpack' }, true)).toThrow();
  });
});

describe('diffIndex', () => {
  it('first install downloads all', () => {
    expect(diffIndex(null, idx([f('mods/a.jar', '1'), f('mods/b.jar', '2')])).download).toHaveLength(2);
  });
  it('only changed and removed', () => {
    const d = diffIndex(idx([f('mods/a.jar', '1'), f('mods/b.jar', '2')]), idx([f('mods/a.jar', '1'), f('mods/c.jar', '3'), f('mods/b.jar', '9')]));
    expect(d.download.map(x => x.path).sort()).toEqual(['mods/b.jar', 'mods/c.jar']);
    expect(d.remove).toEqual([]);
  });
  it('removes dropped files', () => {
    expect(diffIndex(idx([f('mods/a.jar', '1'), f('mods/old.jar', '2')]), idx([f('mods/a.jar', '1')])).remove).toEqual(['mods/old.jar']);
  });
  it('skips server-only files', () => {
    const n = idx([f('mods/a.jar', '1')]);
    (n.files[0] as any).env = { client: 'unsupported' };
    expect(diffIndex(null, n).download).toHaveLength(0);
  });
});

describe('hashes', () => {
  it('sha1 and sha256 of "abc"', () => {
    expect(sha1Hex(Buffer.from('abc'))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(sha256Hex(Buffer.from('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('installedPackVersion', () => {
  it('null when no state file exists yet', () => {
    expect(installedPackVersion(path.join(os.tmpdir(), 'nope-' + Date.now() + '.json'))).toBeNull();
  });
  it('reads the version from a real state file', () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ml-')), 'pack-state.json');
    fs.writeFileSync(f, JSON.stringify({ version: '1.0.5', index: { versionId: '1.0.5', dependencies: {}, files: [] } }));
    expect(installedPackVersion(f)).toBe('1.0.5');
  });
});

describe('safeJoin', () => {
  it('blocks traversal', () => {
    expect(() => safeJoin('C:\\g', '../evil.exe')).toThrow();
    expect(() => safeJoin('C:\\g', 'mods/../../x')).toThrow();
    expect(safeJoin('C:\\g', 'mods/a.jar')).toMatch(/mods[\\/]a\.jar$/);
  });
});

describe('staleOverrideMods', () => {
  it('removes a mod that the new pack no longer ships, keeps the rest', () => {
    expect(staleOverrideMods(['mods/moonland-client-1.0.0.jar', 'mods/a.jar', 'config/x.json'], ['mods/moonland-client-1.1.0.jar', 'mods/a.jar']))
      .toEqual(['mods/moonland-client-1.0.0.jar']);
  });
  it('never touches configs or other files, even when they disappear from the pack', () => {
    expect(staleOverrideMods(['config/x.json', 'shaderpacks/s.zip', 'mods/readme.txt'], [])).toEqual([]);
  });
  it('does nothing for an old state file without the list', () => {
    expect(staleOverrideMods(undefined, ['mods/a.jar'])).toEqual([]);
  });
});

describe('foreignMods', () => {
  const index = idx([f('mods/a.jar', '1'), f('mods/b.jar', '2')]);
  it('flags jars that are neither in the pack index nor shipped in overrides', () => {
    expect(foreignMods(['mods/a.jar', 'mods/moonland-client-1.0.0.jar', 'mods/xray.jar', 'mods/b.jar'], index, ['mods/moonland-client-1.0.0.jar'])).toEqual(['mods/xray.jar']);
  });
  it('allows everything the pack ships', () => {
    expect(foreignMods(['mods/a.jar', 'mods/b.jar'], index, [])).toEqual([]);
  });
  it('only looks at the mods folder', () => {
    expect(foreignMods(['config/x.jar', 'resourcepacks/y.zip'], index, [])).toEqual([]);
  });
});

describe('writeGameFile', () => {
  it('overwrites a hidden file that plain writing cannot touch (Windows EPERM)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ml-hidden-'));
    const file = path.join(dir, '.data.json');
    fs.writeFileSync(file, 'old');
    if (process.platform === 'win32') execSync(`attrib +h "${file}"`);
    writeGameFile(file, 'new');
    expect(fs.readFileSync(file, 'utf8')).toBe('new');
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('creates a file that does not exist yet', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ml-new-'));
    writeGameFile(path.join(dir, 'a.txt'), 'x');
    expect(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8')).toBe('x');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('sha1File', () => {
  it('matches sha1Hex of the same bytes and is null for a missing file', async () => {
    const { sha1File, sha1Hex } = await import('../src/main/pack');
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ml-sha-')), 'a.bin');
    const data = Buffer.alloc(300_000, 7);
    fs.writeFileSync(f, data);
    expect(await sha1File(f)).toBe(sha1Hex(data));
    expect(await sha1File(f + '.nope')).toBeNull();
  });
});
