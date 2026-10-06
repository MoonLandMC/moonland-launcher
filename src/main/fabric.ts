import fs from 'node:fs';
import path from 'node:path';
import { gameDir } from './paths';
import { fetchBuffer } from './net';

/** Кладёт профиль Fabric в versions/, MCLC подтянет его через version.custom. */
export async function ensureFabric(mc: string, loader: string): Promise<string> {
  const id = `fabric-loader-${loader}-${mc}`;
  const file = path.join(gameDir(), 'versions', id, `${id}.json`);
  if (!fs.existsSync(file)) {
    const json = await fetchBuffer(`https://meta.fabricmc.net/v2/versions/loader/${mc}/${loader}/profile/json`);
    JSON.parse(json.toString('utf8'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, json);
  }
  return id;
}
