import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vulkanCrashReport } from '../src/main/crash';

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ml-crash-'));
const report = (d: string, name: string, body: string) => fs.writeFileSync(path.join(d, name), body);

describe('vulkanCrashReport', () => {
  it('finds a Vulkan frame in a fresh hs_err report', () => {
    const d = dir();
    report(d, 'hs_err_pid21652.log', '# A fatal error\nJava frames:\nj  net.vulkanmod.vulkan.Vulkan.createInstance()V+126\n');
    expect(vulkanCrashReport(d, Date.now() - 1000)).toBe(true);
  });
  it('ignores a crash that has nothing to do with Vulkan', () => {
    const d = dir();
    report(d, 'hs_err_pid1.log', '# A fatal error\nJava frames:\nj  org.lwjgl.opengl.GL11.glClear(I)V+0\n');
    expect(vulkanCrashReport(d, Date.now() - 1000)).toBe(false);
  });
  it('ignores an old report from an earlier run', () => {
    const d = dir();
    const f = path.join(d, 'hs_err_pid2.log');
    report(d, 'hs_err_pid2.log', 'net.vulkanmod.vulkan.Vulkan');
    const old = new Date(Date.now() - 3600_000);
    fs.utimesSync(f, old, old);
    expect(vulkanCrashReport(d, Date.now() - 1000)).toBe(false);
  });
  it('is false without reports or without the folder', () => {
    expect(vulkanCrashReport(dir(), 0)).toBe(false);
    expect(vulkanCrashReport(path.join(os.tmpdir(), 'ml-no-such-dir-x'), 0)).toBe(false);
  });
});
