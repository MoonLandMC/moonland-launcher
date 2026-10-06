// Сборка установщика лаунчера. Владелец и репозиторий релизов берутся из release.json: тот же файл читает и сам лаунчер.
const release = require('./release.json');

module.exports = {
  appId: 'ru.moonland.launcher',
  productName: 'MoonLand',
  directories: { output: process.env.MOONLAND_RELEASE_DIR || 'release' },
  files: ['dist/**', 'package.json', 'release.json'],
  win: { target: 'nsis', icon: 'build/icon.ico' },
  // Предохранители Electron: лаунчер запускается только из app.asar, а целостность asar проверяется при каждом старте.
  // Подменить код лаунчера в папке установки или подключить отладчик через переменные окружения нельзя.
  electronFuses: {
    runAsNode: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
  },
  // Установка в профиль пользователя без прав администратора: так electron-updater обновляет лаунчер без окна UAC.
  nsis: { oneClick: true, perMachine: false, artifactName: 'MoonLand-Setup-${version}.exe', shortcutName: 'MoonLand', createDesktopShortcut: true },
  publish: release.owner ? [{ provider: 'github', owner: release.owner, repo: release.repo, releaseType: 'release' }] : null,
};
