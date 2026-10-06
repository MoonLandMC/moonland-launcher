import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { runtimeDir } from './paths';
import { fetchBuffer } from './net';
import type { Progress } from './pack';

const JRE_URL = 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse';

function findJavaw(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  for (const d of fs.readdirSync(dir)) {
    const p = path.join(dir, d, 'bin', 'javaw.exe');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function ensureJava(progress: Progress): Promise<string> {
  const existing = findJavaw(runtimeDir());
  if (existing) return existing;
  progress('java', 0, 1);
  const zip = new AdmZip(await fetchBuffer(JRE_URL));
  fs.mkdirSync(runtimeDir(), { recursive: true });
  zip.extractAllTo(runtimeDir(), true);
  const javaw = findJavaw(runtimeDir());
  if (!javaw) throw new Error('JAVA_EXTRACT');
  progress('java', 1, 1);
  return javaw;
}
