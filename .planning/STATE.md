# Echo Studio — STATE

> Текущее состояние проекта. Обновляется на каждом значимом шаге.

## Status: Planning (pre-Phase-0)

- 2026-05-02: проект создан, зафиксированы PROJECT.md, REQUIREMENTS.md (37 FR/NFR), ROADMAP.md (13 phases).
- Текущая ветка: `main`
- Активная фаза: подготовка к Phase 0 (skeleton)

## Зафиксированные решения

См. `PROJECT.md → Ключевые архитектурные решения` (A-01..A-08).

## Открытые вопросы

- Brand: точный clone Claude Desktop vs «inspired by» — пока clone (для личного использования). Если будет публичный релиз — переключим на собственный бренд.
- Code-signing: отложено до v0.2.0.
- Embeddings provider: используем дефолт EchoVault (Ollama + nomic-embed-text). Если пользователь меняет в `~/.memory/config.yaml` — мы только читаем; не переопределяем.

## Следующий шаг

`/gsd:plan-phase 0` — детальный план Phase 0 (skeleton + tooling).
