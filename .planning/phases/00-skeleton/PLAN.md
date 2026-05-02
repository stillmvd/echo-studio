# Phase 0 — Skeleton

## Goal

Получить пустое окно Tauri-приложения, запускающееся через `pnpm tauri dev`, с настроенным tooling (Biome, lefthook pre-commit) и базовой структурой каталогов. Никакой бизнес-логики, никаких иконок, минимальный UI «Hello, Echo Studio».

## Definition of Done

- [ ] `pnpm tauri dev` поднимает окно с заголовком «Echo Studio» и текстом «Hello, world»
- [ ] `pnpm tauri build` собирает release-версию (.exe в `src-tauri/target/release/`)
- [ ] `pnpm biome check` проходит без ошибок
- [ ] `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` проходит
- [ ] Pre-commit hook (lefthook) запускает `biome check` + `cargo clippy` + `tsc --noEmit`
- [ ] Window state (size, position) сохраняется через `tauri-plugin-window-state` (FR-COM-06)
- [ ] Размер release .exe < 15 MB (резерв до NFR-03 = 20 MB)

## Tasks

### T-0.1 — Скаффолдинг Tauri 2 + React + TS + Vite

```powershell
cd "C:\Projects\Windows Apps\Echo-Studio"
pnpm create tauri-app@latest .
# Выбрать: TypeScript, React, Vite, pnpm
```

После: проверить, что `src-tauri/tauri.conf.json` имеет `productName: "Echo Studio"`, `identifier: "com.stillmvd.echo-studio"`.

### T-0.2 — Tailwind 4 + shadcn

```bash
pnpm add -D tailwindcss@next @tailwindcss/vite
pnpm dlx shadcn@latest init
```

- В `vite.config.ts` подключить `@tailwindcss/vite`
- Создать `src/styles/tokens.css` с дизайн-токенами (см. PROJECT.md палитра)
- Создать `src/styles/globals.css` с `@import "tailwindcss"` + `@theme` блоком из tokens
- Установить shadcn-компоненты: `button`, `card`, `input`, `tabs`, `separator`, `tooltip`, `dialog`

### T-0.3 — Структура каталогов

```
Echo-Studio/
├── src/
│   ├── app/                  (роутинг через TanStack Router file-based)
│   │   ├── __root.tsx
│   │   ├── index.tsx         (placeholder home)
│   │   └── _layout.tsx
│   ├── components/ui/        (shadcn)
│   ├── components/           (own)
│   ├── lib/                  (utils, ipc client wrappers)
│   ├── hooks/
│   ├── styles/
│   │   ├── tokens.css
│   │   └── globals.css
│   └── main.tsx
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   └── commands/
│   │       └── mod.rs        (пустой namespace, заполнится в Phase 1)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── icons/                (placeholder из template)
└── .planning/                (уже создано)
```

### T-0.4 — Базовые зависимости

**`package.json`:**
```json
{
  "dependencies": {
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-shell": "^2",
    "@tauri-apps/plugin-dialog": "^2",
    "@tauri-apps/plugin-fs": "^2",
    "react": "^19",
    "react-dom": "^19",
    "@tanstack/react-router": "^1",
    "@tanstack/react-query": "^5",
    "@tanstack/react-virtual": "^3",
    "zustand": "^5"
  },
  "devDependencies": {
    "@biomejs/biome": "^1",
    "@tauri-apps/cli": "^2",
    "@vitejs/plugin-react-swc": "^3",
    "@tailwindcss/vite": "^4",
    "tailwindcss": "^4",
    "typescript": "^5.6",
    "vite": "^6",
    "vitest": "^2",
    "@testing-library/react": "^16",
    "lefthook": "^1"
  }
}
```

**`src-tauri/Cargo.toml`:**
```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
tauri-plugin-window-state = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
thiserror = "1"
anyhow = "1"
# rusqlite/sqlite-vec/notify добавим в Phase 1
```

### T-0.5 — Biome config

`biome.json`:
```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": { "useExhaustiveDependencies": "warn", "noUnusedImports": "error" },
      "style": { "noNonNullAssertion": "off" }
    }
  },
  "javascript": { "formatter": { "quoteStyle": "single", "semicolons": "always" } }
}
```

`tsconfig.json`: strict + `noUncheckedIndexedAccess: true`, `paths: { "@/*": ["./src/*"] }`.

### T-0.6 — Lefthook pre-commit

`lefthook.yml`:
```yaml
pre-commit:
  parallel: true
  commands:
    biome:
      glob: "*.{ts,tsx,js,jsx,json}"
      run: pnpm biome check {staged_files}
    typecheck:
      glob: "*.{ts,tsx}"
      run: pnpm tsc --noEmit
    rust-clippy:
      glob: "*.rs"
      run: cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
    rust-fmt:
      glob: "*.rs"
      run: cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```

### T-0.7 — Window state plugin

В `src-tauri/src/lib.rs`:
```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### T-0.8 — Hello world UI

`src/app/index.tsx`:
```tsx
export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[--bg-primary]">
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-[--text-primary]">Echo Studio</h1>
        <p className="mt-2 text-sm text-[--text-muted]">v0.1.0 — Phase 0 skeleton</p>
      </div>
    </div>
  );
}
```

### T-0.9 — Smoke-проверка release-сборки

```bash
pnpm tauri build --bundles none
ls -la src-tauri/target/release/echo-studio.exe   # размер < 15 MB
./src-tauri/target/release/echo-studio.exe        # окно открывается
```

### T-0.10 — Atomic commit

Один commit на всю фазу: `chore(00): tauri+react skeleton with biome/lefthook tooling`

## Верификация

- DoD-чек выше пройден полностью.
- `pnpm tauri dev` показывает чёрный фон + заголовок «Echo Studio».
- Закрытие/открытие окна сохраняет размер и позицию.
- Pre-commit hook блокирует commit с биом-ошибкой.

## Риски

| Риск | План B |
|---|---|
| Tauri 2 + React 19 несовместимости | Откатиться на React 18.3 — Tauri 2 нейтрален к версии React |
| `tauri-plugin-window-state` 2.x ещё не stable | Использовать 2.0.0-beta или собственную реализацию через `LocalStorage` |
| Tailwind 4 ломает shadcn | Использовать tailwindcss@3.4 + shadcn legacy preset; апгрейд после Phase 6 |

## Что НЕ делаем в Phase 0

- ❌ Никакой работы с SQLite / EchoVault (Phase 1)
- ❌ Никакого роутинга по реальным страницам (placeholder home)
- ❌ Никаких icons / branding ассетов (Phase 10)
- ❌ Никаких CI/release workflow (Phase 12)
