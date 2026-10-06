// servers.dat: несжатый NBT. Формат сверен с файлом, который пишет сама игра 1.21.11 при quickPlay.

const str = (s: string) => { const b = Buffer.from(s, 'utf8'); const len = Buffer.alloc(2); len.writeUInt16BE(b.length); return Buffer.concat([len, b]); };
const tagString = (name: string, v: string) => Buffer.concat([Buffer.from([0x08]), str(name), str(v)]);
const tagByte = (name: string, v: number) => Buffer.concat([Buffer.from([0x01]), str(name), Buffer.from([v])]);

/** Одна запись: сервер виден в списке, набор ресурсов сервера принимается без вопроса. */
export function serversDat(name: string, ip: string): Buffer {
  const entry = Buffer.concat([tagString('name', name), tagString('ip', ip), tagByte('acceptTextures', 1), tagByte('hidden', 0), Buffer.from([0x00])]);
  const count = Buffer.alloc(4); count.writeInt32BE(1);
  return Buffer.concat([Buffer.from([0x0a]), str(''), Buffer.from([0x09]), str('servers'), Buffer.from([0x0a]), count, entry, Buffer.from([0x00])]);
}
