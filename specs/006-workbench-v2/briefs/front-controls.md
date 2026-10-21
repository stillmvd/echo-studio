# Бриф F2 «front-controls» — Стоп/раскладка, значок Chrome, процессы, скрытие из дерева (пачка 1)

Имя сессии: `v2-front-controls`. Worktree: `.claude/worktrees/v2-front-controls`, ветка `v2-front-controls`. Порты:
vite 1428, CDP 9229.

## Задачи (tasks.md): T018, T019, T020, T021, T022, T023, T024, T025, T027, T028

Порядок: T018/T021/T023/T024 параллельно → T019, T020, T022, T025 → после сообщения координатора о контракте —
`git merge workbench-v2` → T027, T028 (нужны `ProjectTree.root` и `exitedAt`).

## Файлы (только они)

`src/components/workbench/DevCapsule.tsx`, `Wall.tsx` (**только** функция `LayoutPicker` и её константы),
`ProjectHeader.tsx`, `Processes.tsx`, `Overview.tsx` (проброс `sessions` в `Processes`), `ProjectTree.tsx`,
`src/components/ui/ChromeIcon.tsx` (новый), `src/lib/overview.ts` и `overview.test.ts`,
`src/state/workbench-store.ts` и `workbench-store.test.ts` (только `hiddenProjects`), `src/components/layout/SettingsLayout.tsx`,
`src/styles/workbench-v2.css` (новый), `src/styles/globals.css` (только строка `@import`).

Стили F2 — только в `workbench-v2.css` (F1 владеет `workbench.css`). Если нужно переопределить существующий класс из
`workbench.css` — пиши более специфичный селектор в своём файле, не правь чужой.

## Детали

- «Стоп» (T023): lucide `<Square fill="currentColor" strokeWidth={2} />`, цвет `--color-danger`, при наведении фон
  `--color-danger-soft`; `title="Остановить dev-сервер"`. Проверь все места с `Square`: `DevCapsule` (2 кнопки + крупный
  режим), `Cell.tsx` (его правит F1 — не трогай, F1 делает то же по своему T013), `LayoutPicker` — там `Square` для
  1×1 остаётся контурным внутри сегмента.
- Сегмент раскладки (T024): `.wl-seg` сейчас в `workbench.css` (чужой файл) — переопредели в `workbench-v2.css` через
  `.wb-ph .wl-seg, .wl-tb .wl-seg`: капсула с фоном `--color-bg-tertiary`, внутренний отступ 2, кнопки 28×28 с
  `radius-full`, разделители 1 px `--color-border` между кнопками (`button + button::before` абсолютно слева или
  `gap` + `background` псевдоэлемента), активная — фон `--color-bg-primary` + `box-shadow` ring. Между капсулой
  dev и сегментом — `.wb-ph-sep` (1 px линия высотой 18, отступы 6) в `ProjectHeader`.
- Chrome (T021/T022): простой SVG: круг r=7 с тремя секторами (красный верх `#DB4437`, зелёный слева-снизу `#0F9D58`,
  жёлтый справа-снизу `#F4B400`), в центре круг r=2.8 `#4285F4` с белой обводкой 1. `aria-hidden`, размер 14 (класс
  как у lucide в чипе: `h-3.5 w-3.5`).
- Процессы (T027/T028): сигнатура `groupProcesses(rows, root, sessions)`; `sessions: Pick<ClaudeSession, 'sessionId'
  | 'name' | 'status' | 'since' | 'phase' | 'tool'>[]`. Подгруппа сессии: заголовок `.wb-ps` — `StatusIcon small` +
  имя (или «Claude <id8>») + память суммарно; строки под ней с отступом слева 20. Группа корня — имя «Projects
  (корень)», значок lucide `FolderTree`. Сортировка групп — по памяти, как было; сессии внутри — по срочности
  (`byUrgency` из `lib/workbench.ts`). «Без проекта» — подсказка у заголовка. Проверь, что «Завершить все» по-прежнему
  берёт только `stray` без `guard`.
- Скрытие (T018–T020): `hiddenProjects` сравнивать через `samePath`. В `ProjectTree` группа без видимых проектов не
  рендерится. `SettingsLayout`: найди, как там устроены разделы (прочитай файл), добавь раздел «Рабочее место» с
  подразделом «Скрытые проекты» и кнопкой «Вернуть» у каждой строки; при пустом списке — одна строка-подсказка.
  Пункт «Скрыть из дерева» в меню делает пачка 3 — тебе достаточно действия в сторе.

## Живая проверка (обязательно)

Свой dev Echo на 1428/9229: quickstart §4 (скриншот шапки проекта Echo Studio с работающим dev — запусти dev именно
в своём worktree Echo Studio через капсулу dev в Echo, он займёт порт по умолчанию 1420? — **нет**: 1420 занят
пользователем, dev-сервер упадёт. Вместо этого проверь «Стоп» на Tolk или Booked: запусти их dev через капсулу,
посмотри, остановись через «Стоп»), §5 (Обзор → Процессы: группа «Projects (корень)» с сессией пользователя,
сессии под строками), §2 (скрыть/вернуть). Остановить свой dev и MCP-браузер в конце.
