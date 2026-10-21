# Бриф F1 «front-sessions» — внешние сессии, отключение, скелетон, watching (пачка 1)

Имя сессии: `v2-front-sessions`. Worktree: `.claude/worktrees/v2-front-sessions`, ветка `v2-front-sessions`. Порты:
vite 1427, CDP 9228.

## Задачи (tasks.md): T006, T007, T008, T009, T010, T011, T012, T013, T014, T015, T016

Порядок: сначала без IPC — T006 (Popover), T010/T011/T012/T013/T014 (agent view), T015 (скелетон), T016 (watching);
затем, когда координатор сообщит о контракте в `workbench-v2`, — `git merge workbench-v2`, T007, T008, T009.

## Файлы (только они)

`src/components/workbench/RunningList.tsx`, `SessionStrip.tsx`, `ClaudeTerminal.tsx`, `terminals.ts`, `Cell.tsx`,
`EmptyProject.tsx`, новый `externalSession.tsx`, `src/components/ui/Popover.tsx` (новый),
`src/components/layout/StatusBar.tsx` (удалить), `src/components/layout/AppShell.tsx`, `src/lib/workbench.ts` и
`workbench.test.ts`, `src/styles/workbench.css`, и **одна строка** в `WorkbenchLayout.tsx` — проброс `onStart` в
`RunningList` (другое в нём не трогать).

## Детали

- Agent view (T010/T011): сними маркеры вживую: в своём worktree запусти dev Echo (порты выше), открой пробную сессию
  `claude --bg` в Echo Studio, в терминале набери `/exit` — скопируй текст экрана agent view (через CDP
  `term.buffer.active` или скриншот). Детектор — по 2–3 устойчивым строкам, без привязки к id. Проверь, что обычный
  экран Claude (приветствие, ответ, список `/` команд) детектор не ловит — добавь негативные тесты. Дебаунс 200 мс,
  проверка только последних 30 строк. После детекции — `detach(terminalId)` (это убивает attach-клиент, сессия
  живёт), состояние `detached`. Повторное `reattach` должно работать не хуже, чем сейчас «Переподключить».
- Проверь Ctrl+Z и двойную «←» на пустом поле — тоже agent view? Если да — детектор их покрывает. Проверь, что
  Ctrl+C во время ответа Claude прерывает ответ, а не отсоединяет.
- `ClaudeTerminal`: оверлей «Отключено от сессии» — тот же `.wb-term-note` стиль, две кнопки: «Вернуться»
  (`wb-btn p`) и «Завершить сессию» (`wb-btn` с заполненным квадратом danger, `.wb-stop`). «Завершить» — через проп
  `onStop` → `Cell` открывает свой `ConfirmDialog` (один диалог на ячейку).
- `Cell`: кнопка в шапке — «Завершить сессию» с подписью текстом, не только значком (пользователь не понимал, как
  завершить). Крестик — подсказка «Скрыть вкладку — сессия продолжит работать».
- Поповер (T006): без зависимостей; позиционирование под якорем (`getBoundingClientRect`), если не влезает снизу —
  сверху; ширина `max-content` ≤ 320; анимация WAAPI вход 200/выход 150 мс, `hidden` только в `finished`
  (`desktop-app-peeves` п. 11); `prefers-reduced-motion` — мгновенно; закрытие — клик мимо (`pointerdown` вне),
  Esc, blur окна, resize; фокус на первую кнопку внутри и возврат на якорь.
- Внешняя сессия (T007–T009): логика выбора действия — чистая функция `externalAction` с тестом. `vscode` →
  `open()` из `@tauri-apps/plugin-shell` (как в `Markdown.tsx`). `focusSessionWindow` бросил ошибку → тот же
  поповер с текстом ошибки второй строкой (мелко, `wb-dim`). Для сессии без `projectPath` (корень Projects) клик
  — тоже фокус; в поповере нет «Открыть папку» если `cwd` нет.
- Скелетон (T015): силуэты — `.wb-rr.sk` с `background: --color-bg-tertiary`, два «слова» разной ширины внутри (как
  строка списка), высота ровно `ROW` (46), 4 штуки; блок «Продолжить» с заголовком показывается и в состоянии
  загрузки. Проверка: скриншот до и после ответа — кнопки на тех же координатах.
- Watching (T016): `useToolingWatch` импортируется из `@/hooks/use-tooling`. `SessionStrip` виден только в «Рабочем
  месте» — это ок, слежение продолжает работать везде через `AppShell`. Индикатор — точка 8 px `--color-success` со
  свечением, `title` по-русски; без текста «watching».

## Живая проверка (обязательно)

quickstart.md §1 (внешняя сессия: запусти `claude` в Windows Terminal в папке Tolk через `wt -p "Git Bash" -d
"<путь>" bash -l -c "claude; exec bash -l"` без `CLAUDE*` переменных в окружении; после проверки закрой это окно),
§3, §4 (только watching), §6. Свой dev Echo на портах 1427/9228. Результаты — в отчёт координатору.
