# Проверено на живом Kimi Code 2.4.1 (01.11.2026)

Стенд: `KIMI_CODE_HOME` во временной папке, провайдер `type = "openai"` → Ollama `qwen3:4b` с `num_ctx 32768` (с окном 4K модель видит только хвост системного промпта и не вызывает инструменты). Хук-логгер на все события, `kimi -p` в git-папке.

## Payload хуков (реальный stdin)

Общие поля: `hook_event_name`, `session_id` (`session_<uuid>`), `cwd` (абсолютный, обратные слэши), `client_type: "kimi_code_cli"`. Окружение хука из `config.toml`: только `KIMI_CODE_HOME` (если задан); `KIMI_PLUGIN_ROOT` — только у хуков плагина.

| Событие | Поля сверх общих |
|---|---|
| `SessionStart` | `source: "startup"`, `model`, `profile` |
| `UserPromptSubmit` | `prompt` — **массив частей** `[{type:"text",text}]`, `is_steer` |
| `TurnStarted` | `turn_id`, `origin_kind`, `prompt` (строка) |
| `PreToolUse` | `tool_name`, `tool_input`, `tool_call_id` |
| `PostToolUse` | то же + `tool_output` (строка) |
| `Stop` | `stop_hook_active` |

`tool_input`: `Write {path, content}`, `Edit {path, old_string, new_string}`, `Bash {command}`; **`path` относительный** к `cwd`. `transcript_path` нет. `SessionEnd` в режиме `-p` не пришёл.

## Что попадает в контекст модели

| Вывод хука (exit 0) | Результат |
|---|---|
| plain text из `UserPromptSubmit` | ✓ — добавляется к сообщению пользователя как `<hook_result hook_event="UserPromptSubmit">…</hook_result>` |
| plain text из `SessionStart`, `PreToolUse`, `PostToolUse` | ✗ — не попадает |
| JSON `hookSpecificOutput.additionalContext` (формат Claude) любого события | ✗ — не попадает |

Вывод: контекст в Kimi передаётся только через `UserPromptSubmit` (plain text) и через блок `Stop` (exit 2 + stderr — по докам модель продолжает ход с этим текстом).

## wire.jsonl (protocol_version 1.5)

- Сообщение пользователя: `context.append_message`, `message.role = "user"`, `message.content[]`. Служебные вставки — такие же сообщения с текстом `<system-reminder>…`; результат хука — отдельная часть `<hook_result …>` в том же сообщении.
- Текст ассистента: `context.append_loop_event` с `event.type = "content.part"`, `event.part.type = "text"` (размышления — `"think"`).
- Вызов инструмента: `event.type = "tool.call"`, `event.name`, `event.args` (те же поля, что `tool_input`); результат — `tool.result`.
- Конец шага: `step.end` с `finishReason` (`tool_use` / `end_turn`).
- Путь: `$KIMI_CODE_HOME/sessions/<workDirKey>/<session_id>/agents/main/wire.jsonl`; `sessionDir` — в `session_index.jsonl` по `sessionId`.
