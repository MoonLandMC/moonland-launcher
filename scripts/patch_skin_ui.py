import re, io
root = r"C:\Users\aelis\OneDrive\Рабочий стол\Сервер\launcher\app" + "\\"

def edit(path, fn):
    s = open(root + path, encoding="utf-8").read()
    s2 = fn(s)
    assert s2 != s, path
    open(root + path, "w", encoding="utf-8").write(s2)

# ---- index.html: nav item + pane ----
NAV = '''      <button id="navSkin" class="navlink"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.6-3.6 3.4-5.5 7-5.5s6.4 1.9 7 5.5"/></svg>Скин</button>
'''
PANE = '''      <section id="skin" class="pane" hidden>
        <h1>Скин</h1>
        <p class="lead">Выберите PNG-файл скина 64×64 (или 64×32). Скин увидят все игроки сервера.</p>
        <div class="skin-grid">
          <div class="skin-stage"><canvas id="skinView" width="16" height="32" aria-label="Предпросмотр скина"></canvas></div>
          <div class="skin-form">
            <div class="row"><span>Файл <b id="skinFile" class="muted">не выбран</b></span><button id="skinPick" class="btn btn-line">Выбрать файл</button></div>
            <div class="row"><span>Руки</span>
              <span class="seg" id="skinVariant"><button data-v="classic" class="on">Обычные</button><button data-v="slim">Тонкие</button></span></div>
            <div class="skin-actions"><button id="skinApply" class="btn btn-moon" disabled>Установить скин</button><span id="skinMsg" class="skin-msg"></span></div>
            <p class="skin-note">Менять скин можно раз в сутки. Новый скин появится на сервере сразу, а в игре у тех, кто рядом, после перезахода.</p>
          </div>
        </div>
      </section>

'''
def html(s):
    s = s.replace('      <button id="navSettings"', NAV + '      <button id="navSettings"', 1)
    s = s.replace('      <section id="settings" class="pane" hidden>', PANE + '      <section id="settings" class="pane" hidden>', 1)
    return s
edit(r"src\renderer\index.html", html)

# ---- styles ----
CSS = '''
/* ---------- Скин ---------- */
#skin h1 { margin-bottom: 4px; }
.skin-grid { margin-top: 26px; display: grid; grid-template-columns: 200px 1fr; gap: 36px; align-items: start; }
.skin-stage { height: 300px; border-radius: var(--r); border: 1px solid var(--line-strong); background: var(--dusk); display: grid; place-items: center; }
.skin-stage canvas { height: 240px; width: 120px; image-rendering: pixelated; }
.seg { display: inline-flex; border: 1px solid var(--line-strong); border-radius: var(--r); overflow: hidden; }
.seg button { border: 0; background: transparent; color: var(--dust-2); height: 38px; padding: 0 16px; cursor: pointer; font: 500 var(--t-sm) var(--font); }
.seg button.on { background: var(--light); color: var(--night); }
.skin-actions { margin-top: 20px; display: flex; align-items: center; gap: 16px; }
.skin-msg { font-size: var(--t-sm); color: var(--dust-2); }
.skin-msg.bad { color: var(--danger); }
.skin-msg.good { color: var(--live); }
.skin-note { margin: 16px 0 0; color: var(--dust); font-size: 13px; max-width: 32em; }
'''
edit(r"src\renderer\styles.css", lambda s: s.replace("@media (prefers-reduced-motion", CSS + "\n@media (prefers-reduced-motion", 1))

# ---- preload ----
def preload(s):
    return s.replace("  online:", "  skinPick: () => ipcRenderer.invoke('ml:skinPick'),\n  skinApply: (v: string) => ipcRenderer.invoke('ml:skinApply', v),\n  online:", 1)
edit(r"src\preload.ts", preload)

# ---- main ----
MAIN = '''
let pickedSkin: Buffer | null = null;
ipcMain.handle('ml:skinPick', async () => {
  if (!win) return { cancelled: true };
  const r = await dialog.showOpenDialog(win, { title: 'Выберите скин', properties: ['openFile'], filters: [{ name: 'Скин (PNG)', extensions: ['png'] }] });
  if (r.canceled || !r.filePaths[0]) return { cancelled: true };
  let buf: Buffer;
  try { buf = fs.readFileSync(r.filePaths[0]); } catch { return { error: 'READ' }; }
  const check = checkSkinPng(buf);
  if (!check.ok) return { error: check.error };
  pickedSkin = buf;
  return { name: path.basename(r.filePaths[0]), width: check.width, height: check.height, dataUrl: 'data:image/png;base64,' + buf.toString('base64') };
});
ipcMain.handle('ml:skinApply', async (_e, variant: string) => {
  if (!pickedSkin || !settings.username || !settings.passwordEnc) return { ok: false, error: 'bad_file' };
  return uploadSkin(settings.username, decryptPassword(settings.passwordEnc), pickedSkin, variant === 'slim' ? 'slim' : 'classic');
});
'''
def main(s):
    s = s.replace("import { app, BrowserWindow, ipcMain, shell } from 'electron';", "import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';", 1)
    s = s.replace("import { fetchNews } from './news';", "import { fetchNews } from './news';\nimport { checkSkinPng, uploadSkin } from './skin';", 1)
    s = s.replace("ipcMain.handle('ml:online'", MAIN.lstrip("\n") + "ipcMain.handle('ml:online'", 1)
    return s
edit(r"src\main\main.ts", main)

# ---- renderer ----
TYPES = "  skinPick(): Promise<{ cancelled: true } | { error: string } | { name: string; width: number; height: number; dataUrl: string }>;\n  skinApply(variant: string): Promise<{ ok: true } | { ok: false; error: string; remaining?: number }>;\n"
JS = '''
/* ---------- Скин ---------- */
const SKIN_ERRORS: Record<string, string> = {
  NOT_PNG: 'Это не PNG-файл.', BAD_SIZE: 'Нужен скин 64×64 или 64×32 пикселя.', TOO_BIG: 'Файл слишком большой для скина.', READ: 'Не получилось прочитать файл.',
  bad_credentials: 'Пароль изменился. Выйдите из аккаунта и войдите заново.', bad_file: 'Сайт не принял файл.', busy: 'Скин уже устанавливается, подождите.',
  network: 'Нет связи с сервером. Проверьте интернет.', server: 'Сайт ответил ошибкой. Попробуйте через минуту.',
  skin_failed: 'Не удалось установить скин. Попробуйте ещё раз или другой файл.', timeout: 'Сервер долго отвечает. Попробуйте позже.',
};
let skinImg: HTMLImageElement | null = null, skinSlim = false;
const rect = (g: CanvasRenderingContext2D, img: HTMLImageElement, sx: number, sy: number, w: number, h: number, dx: number, dy: number) => g.drawImage(img, sx, sy, w, h, dx, dy, w, h);
function drawSkin() {
  const cv = $<HTMLCanvasElement>('skinView'), g = cv.getContext('2d')!;
  g.clearRect(0, 0, cv.width, cv.height);
  if (!skinImg) return;
  const img = skinImg, old = img.height === 32, aw = skinSlim ? 3 : 4, ax = 4 + (4 - aw);
  // Тело спереди: голова, торс, руки и ноги. Старый формат 64x32 зеркалит правую сторону для левой.
  const flip = (sx: number, sy: number, w: number, h: number, dx: number, dy: number) => { g.save(); g.translate(dx + w, dy); g.scale(-1, 1); g.drawImage(img, sx, sy, w, h, 0, 0, w, h); g.restore(); };
  rect(g, img, 8, 8, 8, 8, 4, 0); rect(g, img, 20, 20, 8, 12, 4, 8);
  rect(g, img, 44, 20, aw, 12, 4 - aw, 8);
  if (old) flip(44, 20, aw, 12, 12, 8); else rect(g, img, 36, 52, aw, 12, 12, 8);
  rect(g, img, 4, 20, 4, 12, 4, 20);
  if (old) flip(4, 20, 4, 12, 8, 20); else rect(g, img, 20, 52, 4, 12, 8, 20);
  rect(g, img, 40, 8, 8, 8, 4, 0);
  if (!old) { rect(g, img, 20, 36, 8, 12, 4, 8); rect(g, img, 44, 36, aw, 12, 4 - aw, 8); rect(g, img, 52, 52, aw, 12, 12, 8); rect(g, img, 4, 36, 4, 12, 4, 20); rect(g, img, 4, 52, 4, 12, 8, 20); }
  void ax;
}
function skinStatus(text: string, kind: '' | 'bad' | 'good' = '') { const m = $('skinMsg'); m.textContent = text; m.className = 'skin-msg ' + kind; }
const hoursText = (s: number) => `${Math.floor(s / 3600)} ч ${Math.floor((s % 3600) / 60)} мин`;
$('navSkin').onclick = () => showPane('skin');
$('skinPick').onclick = async () => {
  const r = await ml.skinPick();
  if ('cancelled' in r) return;
  if ('error' in r) { skinStatus(SKIN_ERRORS[r.error] ?? 'Файл не подходит.', 'bad'); return; }
  $('skinFile').textContent = r.name;
  const img = new Image();
  img.onload = () => { skinImg = img; drawSkin(); $<HTMLButtonElement>('skinApply').disabled = false; skinStatus(''); };
  img.src = r.dataUrl;
};
$('skinVariant').onclick = e => {
  const b = (e.target as HTMLElement).closest('button'); if (!b) return;
  document.querySelectorAll('#skinVariant button').forEach(x => x.classList.toggle('on', x === b));
  skinSlim = b.getAttribute('data-v') === 'slim'; drawSkin();
};
$('skinApply').onclick = async () => {
  const btn = $<HTMLButtonElement>('skinApply'); btn.disabled = true; skinStatus('Устанавливаю…');
  const r = await ml.skinApply(skinSlim ? 'slim' : 'classic');
  btn.disabled = false;
  if (r.ok) skinStatus('Скин установлен.', 'good');
  else if (r.error === 'cooldown') skinStatus(r.remaining ? `Менять скин можно раз в сутки. Следующая смена через ${hoursText(r.remaining)}.` : 'Менять скин можно раз в сутки.', 'bad');
  else skinStatus(SKIN_ERRORS[r.error] ?? 'Что-то пошло не так.', 'bad');
};
'''
def rend(s):
    s = s.replace("function showPane(id: 'home' | 'news' | 'settings') {\n  for (const s of ['home', 'news', 'settings']) $(s).hidden = s !== id;",
                  "function showPane(id: 'home' | 'news' | 'settings' | 'skin') {\n  for (const s of ['home', 'news', 'settings', 'skin']) $(s).hidden = s !== id;\n  $('navSkin').classList.toggle('active', id === 'skin');", 1)
    s = s.replace("  openDir(): Promise<void>;", "  openDir(): Promise<void>;\n" + TYPES.rstrip("\n"), 1)
    s = s.replace("$('logout').onclick", JS.lstrip("\n") + "$('logout').onclick", 1)
    return s
edit(r"src\renderer\renderer.ts", rend)
print("ok")
