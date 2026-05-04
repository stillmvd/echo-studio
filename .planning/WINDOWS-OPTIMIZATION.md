# Windows Optimization Notes

Что уже сделано и что специфично для Windows-сборки.

## Применено в Phase 12

### Cargo `[profile.release]`

```toml
opt-level = "s"      # optimize for size
lto = true           # link-time optimization (cross-crate inlining)
codegen-units = 1    # один codegen unit → лучшая оптимизация LTO
strip = true         # remove debug symbols (огромное сжатие)
panic = "abort"      # no unwinding tables, smaller binary

[profile.release.package."*"]
opt-level = "s"      # apply size opt to all dependencies too
```

Эффект: ожидаем 2-3× меньше .exe vs default release profile (default это
`opt-level = 3, lto = false, codegen-units = 16, strip = false`).

### Tauri config

- `windows[0].theme: "Dark"` — Title bar matches dark UI (Win 10 1809+
  / Win 11). До этого title bar был system-default (white в light mode
  системы).
- `windows[0].decorations: true` — native chrome (frame + caption + min/
  max/close). Снимает ответственность за custom titlebar.
- `bundle.windows.webviewInstallMode: "downloadBootstrapper"` — если
  WebView2 не установлен (Win10 без обновлений) Tauri скачает loader
  на 150 КБ и установит runtime. На Win11 / актуальной Win10 —
  no-op (runtime preinstalled).
- `bundle.publisher`, `bundle.copyright`, `bundle.shortDescription`,
  `bundle.longDescription`, `bundle.category` — попадают в file
  metadata .exe (Properties → Details в проводнике) и в реестр при
  установке.

### Rust source

- `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`
  в `main.rs` — не открывает консольное окно при запуске release-build.
- `tauri-plugin-window-state` — сохраняет position / size / maximized
  состояние окна между сеансами в `%LOCALAPPDATA%\com.stillmvd.
  echo-studio\window-state.json`.

### Build flags для portable

```powershell
pnpm tauri build --bundles none
# → src-tauri/target/release/echo-studio.exe (single file, no installer)
```

`--bundles none` пропускает создание NSIS / MSI installer, выдаёт
только raw .exe. Это и есть портативный режим.

## Что НЕ применяется (намеренно)

- **Code signing** — нужен EV-cert (~$300/год), деferred.
  Последствие: SmartScreen покажет «Windows protected your PC» при
  первом запуске. Юзер кликает «More info → Run anyway».
  Альтернатива: self-signed cert + публикация SHA-256 в README.

- **Embed WebView2 runtime** (`offlineInstaller` или `fixedVersion`) —
  +150 МБ к binary. Не нужно на современных Windows.

- **MSI installer / NSIS installer** — owner попросил только
  portable. NSIS остаётся в bundle.targets для будущего, если
  передумаем.

- **Auto-updater** (tauri-plugin-updater) — для personal-use не
  нужен. В будущем можно добавить, GitHub Releases как source.

## Что можно докрутить позднее

- **`tauri.conf.json bundle.windows.nsis.installMode: "currentUser"`**
  — если когда-то решим поставлять NSIS installer (без admin прав).
- **DPI awareness** — Tauri WebView2 уже DPI-aware по умолчанию.
- **Acrylic / Mica** background — `windows[0].windowEffects: { effects:
  ["mica"], state: "active" }` для Win11. Косметика; пока матовый темный
  фон выглядит хорошо без эффектов.
- **Single-instance lock** — `tauri-plugin-single-instance` чтобы при
  повторном запуске .exe фокусировалось существующее окно вместо
  открытия второго. Полезно если pin to taskbar.

## Замеры (после release build)

Будут заполнены после первого `tauri build`:

- Final .exe size: __ MB
- Cold start time: __ ms
- Memory at idle: __ MB

## Внешние зависимости рантайма

| Что | Где | Когда нужно |
|---|---|---|
| WebView2 runtime | system / `Program Files (x86)\Microsoft\EdgeWebView` | всегда (UI рендерится в нём) |
| Ollama | `localhost:11434` | только при semantic search |
| `memory.exe` | PATH или `%LOCALAPPDATA%\Python\pythoncore-*\Scripts\` | только для кнопки Reindex embeddings |
