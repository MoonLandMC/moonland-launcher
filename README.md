# MoonLand

Лаунчер игрового сервера MoonLand для Windows. Он ставит игру и моды сервера, обновляет их и подключает к серверу одной кнопкой. Сайт сервера: https://moonlandmc.ru, описание лаунчера: https://moonlandmc.ru/wiki/launcher

Скачать установщик: раздел [Releases](https://github.com/MoonLandMC/moonland-launcher/releases/latest) справа или https://moonlandmc.ru/launcher.

The MoonLand launcher is a Windows desktop app (Electron) for the MoonLand Minecraft server. It installs the game and the server's mods, keeps them updated and connects to the server.

## Сборка

Нужны Node.js 22 и Windows.

```
npm ci
npm test
npm run build
npx electron-builder --win nsis --publish never
```

Установщик появится в папке `release` (её можно сменить переменной `MOONLAND_RELEASE_DIR`). Для проверки без боевого сервера: `MOONLAND_DEV_SERVER=localhost:25566`.

## Что лаунчер отправляет и куда

- На https://moonlandmc.ru: ник и пароль при входе и при запуске игры (проверка через тот же аккаунт, что и в игре), новости, число игроков онлайн, скин при его загрузке. Пароль на диске хранится зашифрованным средствами системы (Electron safeStorage).
- На GitHub (MoonLandMC): список файлов сборки игры, сами файлы и обновления лаунчера.
- На cdn.modrinth.com: файлы модов сборки.
- В Mojang: файлы игры Minecraft (адреса выбирает библиотека minecraft-launcher-core).
- На meta.fabricmc.net и api.adoptium.net: загрузчик Fabric и Java.
- На mc-heads.net: запрос аватара для главного экрана, при этом передаётся ваш ник.
- В Discord на этом же компьютере: статус «В лаунчере» или «Играет», если вы оставили эту настройку включённой.

Объём памяти, число ядер и название видеокарты лаунчер определяет на вашем компьютере, чтобы подобрать настройки, и никуда их не отправляет. Лаунчер не собирает аналитику.

Установка идёт в профиль пользователя без прав администратора. Удаление: «Параметры Windows, Приложения, MoonLand».

## Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by [SignPath Foundation](https://signpath.org/). This section applies after the project is approved by SignPath Foundation. Until then, installers are published unsigned.

- Only installers built from this repository by the GitHub Actions workflow in `.github/workflows` are signed. Nothing else is signed.
- Committers and reviewers: the MoonLand team, [MoonLandMC](https://github.com/MoonLandMC). Approver: the repository owner.
- Privacy: see "Что лаунчер отправляет и куда" above. The launcher sends no data to any system other than the ones listed there. The same list is on https://moonlandmc.ru/wiki/launcher#privacy.

## Лицензия

[MIT](LICENSE). Шрифт Geologica распространяется по лицензии SIL OFL, текст лежит в `src/renderer/fonts/OFL.txt`.
