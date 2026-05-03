# Phase 10 — Settings + Theme Polish

## Goal

Активная Settings-вкладка с полезной info: где живут данные EchoVault
и Conversations, какой embedding model настроен, список backup'ов с
размерами и кнопкой «открыть в Explorer», build/about info.
Plus polish: Geist шрифты (self-hosted), общий design-token review.

## Definition of Done

- [ ] `read_echovault_config()` Rust команда — читает `~/.config/
      echovault/config.yaml` и возвращает structured info: memoryHome,
      homeSource, embeddingProvider, embeddingModel, ollamaBaseUrl.
- [ ] `reveal_in_explorer(path)` Rust команда — `explorer /select,<path>`.
- [ ] SettingsLayout с секциями: EchoVault (paths + embedding) /
      Backups (list with size, date, reveal) / Conversations (root
      path) / About (version + links).
- [ ] Geist Sans/Mono подключены через @fontsource* (self-hosted).
- [ ] Все pre-commit checks зелёные.

## Закрывает требования

- **FR-COM-01** Dark theme — точный clone (уже есть из Phase 0/2,
  здесь полировка)
- **FR-COM-03** Settings page с display всех путей
- **FR-COM-04** Status bar (уже из Phase 6)

## Tasks

### T-10.1 — Backend echovault config reader

```rust
#[derive(Serialize)]
pub struct EchoVaultConfig {
    pub memory_home: String,
    pub home_source: String,           // env | config | default
    pub embedding_provider: String,    // ollama
    pub embedding_model: String,       // nomic-embed-text
    pub ollama_base_url: Option<String>,
}

#[tauri::command]
pub async fn read_echovault_config(state: State<...>) -> Result<EchoVaultConfig, String>
```

Reads `~/.memory/config.yaml` (новая локация) если есть, fallback на
defaults. Показывает actual в use values.

### T-10.2 — reveal_in_explorer

`explorer /select,"<absolute_path>"` для Windows. На non-windows —
fallback ничего не делать (или error).

### T-10.3 — Frontend SettingsLayout

Single column scrollable, max-w-3xl:
- Section: EchoVault — memoryHome, homeSource badge, embedding pill
- Section: Backups — table из useDbBackups hook (newest 20), кнопка
  Reveal на каждом
- Section: Conversations — path `~/.claude/projects/`, kол-во
  проектов из useConversationProjects
- Section: About — Echo Studio v0.1.0, brief description, hints

### T-10.4 — Geist fonts

```
pnpm add @fontsource/geist-sans @fontsource/geist-mono
```

В globals.css:
```
@import "@fontsource/geist-sans/400.css";
@import "@fontsource/geist-sans/500.css";
@import "@fontsource/geist-sans/600.css";
@import "@fontsource/geist-mono/400.css";
@import "@fontsource/geist-mono/500.css";
```

### T-10.5 — Polish

- Hover transitions на cards/rows унифицировать (transition-colors
  duration-150).
- Focus rings: уже есть `*:focus-visible`. Убедиться что button'ы
  имеют focus ring.
- Sidebar/main padding consistency review.

### T-10.6 — Smoke + commit

`feat(10): settings page + geist fonts + polish`

## Не делаем в Phase 10

- ❌ Restore from backup — backlog (юзер может вручную скопировать
  index.db из .backups/)
- ❌ Light theme switch — backlog
- ❌ Full keybinding map — backlog
- ❌ Open EchoVault config.yaml в редакторе (только показ значений)
