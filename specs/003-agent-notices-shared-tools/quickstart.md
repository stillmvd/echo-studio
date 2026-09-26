# Quickstart — проверка фичи 003

Запуск: `pnpm tauri dev`. Проверки кода: `pnpm biome check src`, `pnpm typecheck`, `pnpm test`, `pnpm build`,
`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`,
`cargo test --manifest-path src-tauri/Cargo.toml`.

1. **Перекрытие global → project.** Создать `~/.claude/skills/qs-demo/SKILL.md` и
   `<проект>/.claude/skills/qs-demo/SKILL.md`. Tools → проект: проектный `qs-demo` — «Overridden by global»,
   глобальный — «Overrides project»; чип «1 overridden» фильтрует до двух строк (свой сверху, глобальный в раскрытой группе). Выключить глобальный —
   пометки и чип исчезают. Удалить обе папки после проверки.
2. **Skill против команды.** В проекте `commands/qs-x.md` и `skills/qs-x/SKILL.md` — команда «Overridden by
   skill».
3. **Плагин не конфликтует.** Skill плагина chisle и свой skill `chisle` (если есть) — без пометок.
4. **Inherited from Global.** Проект Echo Studio: свои инструменты сверху, ниже свёрнутая «Inherited from
   Global · N»; раскрытие запоминается после перезапуска; поиск по имени глобального skill показывает его
   без раскрытия; «Project only» нет.
5. **Also in N projects.** Echo Studio → `redesign-stand`: в строке «also in 3 projects»; в деталях «Also found
   in» — Booked, Horizon, Markdown, у каждого Same/Differs, у Differs дата; «Show in folder» открывает папку.
6. **Уведомления агентов.** Conversations → Unmasking_Julia → сессия `7c2e3786`: уведомления — шаги «Agent
   "…" finished · completed» без «You»; отчёт свёрнут, раскрывается markdown. Экспорт сессии — блок «Agent».
7. **Запись.** После шагов 1–6 в `%APPDATA%/<app id>/config-backups` не появилось новых копий, файлы
   инструментов не изменены.
