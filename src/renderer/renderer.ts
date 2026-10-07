import { initMoon, drawSky } from './moon.js';
import { cleanDiscordText } from './discord-text.js';

type Graphics = 'standard' | 'vulkan';
type Perf = 'auto' | 'low' | 'medium' | 'high' | 'custom';
type PerfInfo = { ramMb: number; cores: number; gpu: string; detected: 'low' | 'medium' | 'high'; tier: 'low' | 'medium' | 'high' | null; autoMemoryMb: number };
type State = { loggedIn: boolean; username?: string; settings: { memoryMb: number; memoryAuto: boolean; discord: boolean; graphics: Graphics; perf: Perf }; perf: PerfInfo; gpu: { names: string[]; offerVulkan: boolean; vulkanDriver: boolean }; running: boolean; packVersion: string | null; appVersion: string; updateReady: string | null };
type NewsItem = { channel: string; title: string; body: string; url: string; ts: string };
declare const ml: {
  state(): Promise<State>;
  login(u: string, p: string): Promise<{ ok: true; username: string } | { ok: false; error: string }>;
  logout(): Promise<void>;
  play(): Promise<void>;
  settings(patch: Partial<State['settings']> & { vulkanOfferSeen?: boolean }): Promise<void>;
  openDir(): Promise<void>;
  skinPick(): Promise<{ cancelled: true } | { error: string } | { name: string; width: number; height: number; dataUrl: string }>;
  skinApply(variant: string): Promise<{ ok: true } | { ok: false; error: string; remaining?: number }>;
  verify(): Promise<{ total: number; fixed: string[]; failed: string[] } | { error: string }>;
  online(): Promise<{ online: number | null }>;
  news(): Promise<NewsItem[]>;
  minimize(): Promise<void>;
  close(): Promise<void>;
  onProgress(cb: (p: { stage: string; done: number; total: number }) => void): void;
  onStatus(cb: (s: { kind: string; message?: string; detail?: string; offline?: boolean }) => void): void;
  installUpdate(): Promise<{ error?: string }>;
  checkUpdate(): Promise<{ status: 'ready' | 'downloading' | 'current' | 'error' | 'disabled'; version?: string }>;
  onUpdate(cb: (u: { version: string }) => void): void;
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);

const STAGES: Record<string, string> = { java: 'Устанавливаем Java', mods: 'Скачиваем моды', fabric: 'Готовим Fabric', minecraft: 'Скачиваем игру', launch: 'Запускаем' };
const ERRORS: Record<string, string> = {
  bad_credentials: 'Неверный ник или пароль.',
  network: 'Нет связи с сервером. Проверьте интернет.',
  server: 'Сайт ответил ошибкой. Попробуйте через минуту.',
  NO_NETWORK: 'Нет связи с сервером. Проверьте интернет и нажмите «Играть» ещё раз.',
  PACK_HASH: 'Сборка скачалась с ошибкой. Нажмите «Играть» ещё раз.',
  FILE_LOCKED: 'Не получилось записать файл игры. Закройте Minecraft, если он запущен, и нажмите «Играть» ещё раз.',
  PACK_DAMAGED: 'Файлы игры повреждены, и восстановить их не получилось. Проверьте интернет и нажмите «Играть» ещё раз.',
  JAVA_EXTRACT: 'Не получилось установить Java. Нажмите «Играть» ещё раз.',
  LAUNCH_FAILED: 'Игра не запустилась. Подробности в файле launcher-last.log в папке игры.',
  CRASH: 'Игра закрылась с ошибкой. Подробности в файле launcher-last.log в папке игры.',
  VULKAN_CRASH: 'Режим Vulkan не запустился на этом компьютере, лаунчер вернул стандартную графику. Нажмите «Играть» ещё раз.',
};
const errText = (m: string) => m.startsWith('FILE_HASH:')
  ? `Файл ${m.slice(10)} три раза подряд скачался с ошибкой. Нажмите «Играть» ещё раз.`
  : ERRORS[m] ?? 'Что-то пошло не так. Подробности в файле launcher-last.log в папке игры.';

function showPane(id: 'home' | 'news' | 'settings') {
  for (const s of ['home', 'news', 'settings']) $(s).hidden = s !== id;
  $('navHome').classList.toggle('active', id === 'home');
  $('navNews').classList.toggle('active', id === 'news');
  $('navSettings').classList.toggle('active', id === 'settings');
  $('playbar').hidden = id === 'settings';
}

drawSky($<HTMLCanvasElement>('sky'));
{
  const c = $('login').querySelector<HTMLCanvasElement>('canvas[data-moon]')!;
  initMoon(c, c.parentElement!.querySelector<HTMLElement>('.moon-caption')!);
}
for (const id of ['min', 'minLogin']) $(id).onclick = () => ml.minimize();
for (const id of ['cls', 'clsLogin']) $(id).onclick = () => ml.close();

/* ---------- Пиксельная миниатюра для карточки новости (тот же алгоритм, что фон неба) ---------- */
function rand(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function paintThumb(canvas: HTMLCanvasElement, seed: number) {
  const B = 3, w = canvas.width = 100, h = canvas.height = 30, R = rand(seed);
  const g = canvas.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#16203a'); sky.addColorStop(1, '#0c1226');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) { const x = Math.floor(R() * w), y = Math.floor(R() * h * .7), a = .2 + R() * .5; g.fillStyle = `rgba(174,188,255,${a.toFixed(2)})`; g.fillRect(x, y, 1, 1); }
  const base = h * .78;
  for (let c = 0; c < w / B; c++) { const hh = base + Math.sin(c * .4 + seed) * 3; g.fillStyle = 'rgba(20,26,46,.9)'; g.fillRect(c * B, hh, B, h - hh); }
}

// Новость читается в самом лаунчере: ссылки на Discord есть не у всех игроков, а сайт открывается у каждого.
function openReader(it: NewsItem) {
  const upd = it.channel === 'updates';
  $('readerTag').textContent = upd ? 'Обновление' : 'Новость';
  $('readerTag').className = 'tag' + (upd ? ' upd' : '');
  $('readerTitle').textContent = cleanDiscordText(it.title).replace(/\s+/g, ' ');
  const d = new Date(it.ts);
  $('readerDate').textContent = isNaN(d.getTime()) ? '' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const text = cleanDiscordText(it.body);
  $('readerBody').textContent = text || 'В этом сообщении только картинка. Все новости и подробности смотрите на сайте.';
  $('readerSite').textContent = upd ? 'Все обновления на сайте' : 'Открыть сайт';
  $<HTMLAnchorElement>('readerSite').href = upd ? 'https://moonlandmc.ru/updates' : 'https://moonlandmc.ru';
  $<HTMLAnchorElement>('readerDiscord').href = it.url;
  $('reader').hidden = false;
  $('readerClose').focus();
}
const closeReader = () => { $('reader').hidden = true; };
$('readerClose').addEventListener('click', closeReader);
$('reader').addEventListener('click', e => { if (e.target === $('reader')) closeReader(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('reader').hidden) closeReader(); });

function renderNews(items: NewsItem[], gridId = 'newsGrid', emptyId = 'newsEmpty', limit = 8) {
  const grid = $(gridId);
  if (!items.length) { grid.hidden = true; $(emptyId).hidden = false; return; }
  grid.innerHTML = '';
  items.slice(0, limit).forEach((it, i) => {
    const a = document.createElement('button'); a.type = 'button'; a.className = 'news-card'; a.addEventListener('click', () => openReader(it));
    const thumb = document.createElement('div'); thumb.className = 'thumb';
    const cv = document.createElement('canvas'); thumb.appendChild(cv);
    const tag = document.createElement('span'); tag.className = 'tag' + (it.channel === 'updates' ? ' upd' : ''); tag.textContent = it.channel === 'updates' ? 'Обновление' : 'Новость';
    thumb.appendChild(tag);
    const body = document.createElement('div'); body.className = 'body';
    const b = document.createElement('b'); b.textContent = cleanDiscordText(it.title).replace(/\s+/g, ' ');
    body.append(b);
    a.append(thumb, body);
    grid.appendChild(a);
    paintThumb(cv, 100 + i * 37);
  });
  grid.hidden = false;
  $(emptyId).hidden = true;
}

async function goHome() {
  const st = await ml.state();
  $('nick').textContent = st.username ?? '';
  $('sideNick').textContent = st.username ?? '';
  const face = `https://mc-heads.net/avatar/${encodeURIComponent(st.username ?? 'MHF_Steve')}/56`;
  $<HTMLImageElement>('face').src = face;
  $<HTMLImageElement>('sideFace').src = face;
  $('ver').textContent = `Лаунчер ${st.appVersion}` + (st.packVersion ? `, сборка ${st.packVersion}` : '');
  if (st.updateReady) showUpdate(st.updateReady);
  showVulkanOffer(st);
  $('pbSub').textContent = st.packVersion ? `Сервер moonlandmc.ru · сборка ${st.packVersion}` : 'Сервер moonlandmc.ru';
  $('shell').hidden = false;
  $('login').hidden = true;
  showPane('home');
  if (st.running) playing();
  const o = await ml.online();
  $('online').textContent = o.online == null ? '?' : String(o.online);
  ml.news().then(renderNews);
}

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('loginErr'); err.hidden = true;
  const u = input('u').value.trim(), p = input('p').value;
  if (!u || !p) { err.textContent = 'Введите ник и пароль.'; err.hidden = false; return; }
  const btn = $<HTMLButtonElement>('loginBtn'); btn.disabled = true; btn.textContent = 'Проверяем…';
  const r = await ml.login(u, p);
  btn.disabled = false; btn.textContent = 'Войти';
  if (r.ok) { input('p').value = ''; goHome(); }
  else { err.textContent = errText(r.error); err.hidden = false; }
});

function setPlay(busy: boolean, label: string) {
  $<HTMLButtonElement>('play').disabled = busy; $('playLabel').textContent = label;
}

function playing() {
  setPlay(true, 'Игра запущена'); $('prog').hidden = false; $('barFill').style.width = '100%';
  $('stage').textContent = 'Игра запущена'; $('count').textContent = '';
}

$('play').onclick = () => {
  $('homeErr').hidden = true; setPlay(true, 'Запуск…'); $('prog').hidden = false; $('barFill').style.width = '0';
  $('stage').textContent = 'Проверяем аккаунт'; $('count').textContent = '';
  ml.play();
};
ml.onProgress(p => {
  $('stage').textContent = STAGES[p.stage] ?? p.stage;
  $('count').textContent = p.total > 1 ? `${p.done} из ${p.total}` : '';
  $('barFill').style.width = p.total > 1 ? `${Math.round(100 * p.done / p.total)}%` : '100%';
});
$('checkUpd').addEventListener('click', async () => {
  const btn = $<HTMLButtonElement>('checkUpd'), msg = $('updMsg');
  btn.disabled = true; msg.textContent = 'Проверяем…';
  const r = await ml.checkUpdate();
  btn.disabled = false;
  msg.textContent = r.status === 'ready' ? `Версия ${r.version} готова, нажмите «Перезапустить» на главной`
    : r.status === 'downloading' ? `Нашли версию ${r.version}, скачиваем`
    : r.status === 'current' ? 'У вас последняя версия'
    : r.status === 'disabled' ? 'Проверка работает только в установленном лаунчере'
    : 'Не получилось проверить. Проверьте интернет';
});
// Новая версия лаунчера скачана: плашка с перезапуском. Во время игры кнопка не перезапускает, версия встанет при закрытии.
function showUpdate(version: string) {
  $('updText').textContent = `Новая версия лаунчера ${version} готова`;
  $('upd').hidden = false;
}
ml.onUpdate(u => showUpdate(u.version));
$('updBtn').addEventListener('click', async () => {
  const r = await ml.installUpdate();
  if (r.error === 'RUNNING') $('updText').textContent = 'Обновление встанет, когда вы закроете лаунчер после игры';
});
ml.onStatus(s => {
  if (s.kind === 'playing') {
    playing();
    return;
  }
  // Сообщение по ходу запуска: прогресс и кнопку не трогаем.
  if (s.kind === 'notice') {
    if (s.message === 'FOREIGN_MODS') $('pbSub').textContent = `Лишние моды перенесены в папку mods-removed: ${s.detail}`;
    return;
  }
  $('prog').hidden = true; setPlay(false, 'Играть');
  if (s.kind !== 'error') return;
  if (s.message === 'RELOGIN') {
    $('shell').hidden = true; $('login').hidden = false;
    $('loginErr').textContent = 'Пароль изменился. Войдите заново.'; $('loginErr').hidden = false;
    return;
  }
  $('homeErr').textContent = errText(s.message ?? ''); $('homeErr').hidden = false;
});

// ---------- Графика: стандартная или Vulkan ----------
function paintGraphics(g: Graphics) {
  document.querySelectorAll<HTMLElement>('#gfxSeg button').forEach(b => b.classList.toggle('on', b.dataset.g === g));
}
function showVulkanOffer(st: State) {
  $('vkOffer').hidden = !st.gpu.offerVulkan;
  if (st.gpu.offerVulkan) $('vkGpu').textContent = st.gpu.names.find(n => /amd|radeon|ati/i.test(n)) ?? '';
}
$('vkOn').addEventListener('click', async () => {
  await ml.settings({ graphics: 'vulkan', vulkanOfferSeen: true });
  $('vkOffer').hidden = true;
  $('pbSub').textContent = 'Режим Vulkan включится при запуске игры. Вернуться можно в настройках.';
});
$('vkNo').addEventListener('click', async () => { await ml.settings({ vulkanOfferSeen: true }); $('vkOffer').hidden = true; });
document.querySelectorAll<HTMLElement>('#gfxSeg button').forEach(b => b.addEventListener('click', async () => {
  const g = (b.dataset.g === 'vulkan' ? 'vulkan' : 'standard') as Graphics;
  paintGraphics(g);
  await ml.settings({ graphics: g, vulkanOfferSeen: true });
  $('gfxMsg').textContent = 'Применится при запуске игры';
}));

const memText = (v: number) => `${(v / 1024).toString().replace('.', ',')} ГБ`;
const TIER_RU = { low: 'слабый', medium: 'средний', high: 'мощный' } as const;
function paintPerf(st: State) {
  const { perf } = st.settings, i = st.perf;
  document.querySelectorAll<HTMLElement>('#perfSeg button').forEach(b => b.classList.toggle('on', b.dataset.p === perf));
  const pc = `${(i.ramMb / 1024).toFixed(0)} ГБ памяти, ${i.cores} потоков${i.gpu ? ', ' + i.gpu : ''}`;
  $('perfInfo').textContent = perf === 'custom'
    ? 'Лаунчер не меняет настройки игры и параметры Java.'
    : perf === 'auto'
      ? `Ваш ПК: ${pc}. Подобран уровень «${TIER_RU[i.detected]}».`
      : `Выбран уровень «${TIER_RU[perf]}». Ваш ПК: ${pc}.`;
  const auto = st.settings.memoryAuto && perf !== 'custom';
  input('memAuto').checked = st.settings.memoryAuto;
  input('mem').disabled = auto;
  const mb = auto ? i.autoMemoryMb : st.settings.memoryMb;
  input('mem').value = String(mb); $('memVal').textContent = memText(mb);
}
document.querySelectorAll<HTMLElement>('#perfSeg button').forEach(b => b.addEventListener('click', async () => {
  const perf = (b.dataset.p ?? 'auto') as Perf;
  await ml.settings({ perf });
  $('perfMsg').textContent = perf === 'custom' ? '' : 'Применится при запуске игры';
  paintPerf(await ml.state());
}));
input('memAuto').onchange = async () => { await ml.settings({ memoryAuto: input('memAuto').checked }); paintPerf(await ml.state()); };
$('navHome').onclick = () => showPane('home');
$('navNews').onclick = () => showPane('news');
$('acct').onclick = () => $('navSettings').click();
$('navSettings').onclick = async () => {
  const st = await ml.state();
  paintPerf(st); $('perfMsg').textContent = '';
  input('dc').checked = st.settings.discord;
  paintGraphics(st.settings.graphics);
  $('gfxMsg').textContent = '';
  $('gfxVk').hidden = !st.gpu.vulkanDriver;
  $('setNick').textContent = st.username ?? '';
  showPane('settings');
};
input('mem').oninput = () => { $('memVal').textContent = memText(+input('mem').value); };
input('mem').onchange = () => ml.settings({ memoryMb: +input('mem').value, memoryAuto: false });
input('dc').onchange = () => ml.settings({ discord: input('dc').checked });
$('openDir').onclick = () => ml.openDir();
$('verify').onclick = async () => {
  const btn = $<HTMLButtonElement>('verify'), msg = $('verifyMsg');
  btn.disabled = true; msg.textContent = 'Проверяю…';
  const r = await ml.verify();
  btn.disabled = false;
  if ('error' in r) msg.textContent = r.error === 'RUNNING' ? 'Закройте игру и повторите' : 'Не удалось проверить, попробуйте позже';
  else if (r.total === 0) msg.textContent = 'Сборка ещё не установлена, нажмите «Играть»';
  else if (r.failed.length) msg.textContent = `Не удалось восстановить файлов: ${r.failed.length}`;
  else if (r.fixed.length) msg.textContent = `Восстановлено файлов: ${r.fixed.length}`;
  else msg.textContent = `Всё в порядке, файлов проверено: ${r.total}`;
};
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
$('logout').onclick = async () => {
  await ml.logout(); input('u').value = '';
  $('shell').hidden = true; $('login').hidden = false;
};

(async () => {
  const st = await ml.state();
  if (st.loggedIn) goHome();
  else { if (st.username) input('u').value = st.username; $('login').hidden = false; }
})();
