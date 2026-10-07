import { describe, it, expect } from 'vitest';
import { classifyGpu, parseGpuList, offerVulkan } from '../src/main/gpu';

describe('classifyGpu', () => {
  it('recognises the vendors from real adapter names', () => {
    expect(classifyGpu('AMD Radeon RX 6600')).toBe('amd');
    expect(classifyGpu('AMD Radeon(TM) Graphics')).toBe('amd');
    expect(classifyGpu('NVIDIA GeForce RTX 3060 Laptop GPU')).toBe('nvidia');
    expect(classifyGpu('Intel(R) UHD Graphics 630')).toBe('intel');
    expect(classifyGpu('Intel(R) Arc(TM) A380 Graphics')).toBe('intel');
    expect(classifyGpu('Something Else')).toBe('other');
  });
});

describe('parseGpuList', () => {
  it('splits lines and skips virtual adapters', () => {
    const g = parseGpuList('AMD Radeon RX 580\r\nMicrosoft Basic Display Adapter\r\n\r\nParsec Virtual Display Adapter\r\n');
    expect(g).toEqual([{ name: 'AMD Radeon RX 580', vendor: 'amd' }]);
  });
  it('returns an empty list for empty output', () => {
    expect(parseGpuList('')).toEqual([]);
  });
});

describe('offerVulkan', () => {
  const amd = { name: 'AMD Radeon RX 580', vendor: 'amd' as const };
  const nv = { name: 'NVIDIA GeForce GTX 1650', vendor: 'nvidia' as const };
  const intel = { name: 'Intel(R) UHD Graphics', vendor: 'intel' as const };
  it('offers it for an AMD card with a Vulkan driver', () => { expect(offerVulkan([amd], true)).toBe(true); });
  it('does not offer it without a Vulkan driver', () => { expect(offerVulkan([amd], false)).toBe(false); });
  it('does not offer it for NVIDIA or Intel only', () => {
    expect(offerVulkan([nv], true)).toBe(false);
    expect(offerVulkan([intel], true)).toBe(false);
  });
  it('does not offer it when an NVIDIA card is next to the AMD one', () => { expect(offerVulkan([amd, nv], true)).toBe(false); });
  it('offers it for an AMD card inside a laptop with Intel graphics', () => { expect(offerVulkan([intel, amd], true)).toBe(true); });
  it('does not offer it for integrated AMD graphics (its Vulkan driver crashed the game on start)', () => {
    const ryzen = { name: 'AMD Radeon(TM) Graphics', vendor: 'amd' as const };
    expect(offerVulkan([ryzen], true)).toBe(false);
    expect(offerVulkan([{ name: 'AMD Radeon(TM) Vega 8 Graphics', vendor: 'amd' as const }], true)).toBe(false);
  });
});

import { packUrl } from '../src/main/config';
import { loadSettings } from '../src/main/settings';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('packUrl', () => {
  it('points at the Vulkan manifest for the Vulkan variant', () => {
    expect(packUrl('vulkan')).toMatch(/pack-vulkan\.json$/);
    expect(packUrl('standard')).toMatch(/pack\.json$/);
    expect(packUrl('standard')).not.toMatch(/vulkan/);
  });
});

describe('graphics setting', () => {
  const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ml-set-')), 'launcher.json');
  it('defaults to standard', () => { expect(loadSettings(tmp()).graphics).toBe('standard'); });
  it('keeps vulkan and replaces unknown values with standard', () => {
    const f = tmp(); fs.writeFileSync(f, JSON.stringify({ graphics: 'vulkan' }));
    expect(loadSettings(f).graphics).toBe('vulkan');
    fs.writeFileSync(f, JSON.stringify({ graphics: 'opengl-ultra' }));
    expect(loadSettings(f).graphics).toBe('standard');
  });
});
