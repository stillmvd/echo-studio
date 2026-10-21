# Бриф E «menu» — контекстное меню Kockers DS (пачка 3)

Имя сессии: `v2-menu`. Worktree: `.claude/worktrees/v2-menu`, ветка `v2-menu` от `workbench-v2`. Порты: vite 1427,
CDP 9228.

## Задачи (tasks.md): T038, T039, T040, T043 — сразу; T041 — после сообщения координатора «пачка 2 в workbench-v2»
(тогда `git merge workbench-v2` и подключай меню по местам).

## Файлы

Этап 1 (параллельно с D): `src/components/ui/ContextMenu.tsx`, `src/lib/context-menu.ts` (+ `.test.ts`),
`src/components/workbench/menus.ts` (+ `.test.ts`), `src/styles/globals.css` (только `user-select`/`:active` для
`[role="menuitem"]`, если нет). Этап 2 (после D): `src/components/workbench/ProjectTree.tsx`, `Cell.tsx`, `DevCapsule.tsx`,
`Processes.tsx`, `RunningList.tsx`, `SessionStrip.tsx`, `WorkbenchLayout.tsx` (хост меню).

## Источник стиля — Kockers DS (только чтение, не менять)

`C:\Users\stillmvd\Projects\Kockers DS`: `css/kockers.css` строки 212–231 (`.t-menu`), `js/kockers.js` строки 82–105
(`PRESETS.menu`, `show`/`hide`), `docs/components/Menu.md`, `docs/motion.md`, `tokens/tokens.json` (длительности
`dur-hover` 200, `dur-out-menu` 150, `ease`). Токены Echo — `src/styles/tokens.css` (`--color-bg-tertiary` ≈ cosmic,
`--color-border` ≈ line, `--color-danger`, `--color-text-muted` ≈ dim).

## Детали

- Существующее `ContextMenu.tsx` уже используется в conversations/memory/tooling — сохрани совместимость API
  (`items`, `x`, `y`, `onClose`; `ContextMenuAction.onSelect`) или обнови все вызовы (`grep -rn ContextMenu src`).
  Новое: `MenuItem` с подменю (`items`), `disabled`, `hint` (подсказка клавиши справа, `kb` стиль), `origin`.
- Анимация: WAAPI `element.animate` вход `[{opacity:0, transform:'translateY(-4px) scale(.96)'}, {opacity:1,
  transform:'none'}]` 200 мс, `easing: cubic-bezier(.2,0,0,1)`; выход — обратные кадры 150 мс `fill: 'forwards'`;
  размонтирование только после `finished` (держи `closing` state); `matchMedia('(prefers-reduced-motion: reduce)')`
  → без анимации. `transform-origin` — угол меню, ближайший к точке клика (меню сдвинуто внутрь окна — origin всё
  равно у курсора).
- Клавиатура: стрелки/Home/End по пунктам (есть), Enter/Space — выбрать, Esc — закрыть, Tab — закрыть; подменю:
  → или Enter открывает, ← закрывает; фокус возвращается на элемент, с которого открыли (запомни
  `document.activeElement` при открытии).
- Закрытие: `pointerdown` мимо, `contextmenu` мимо (открывает новое у новой точки), blur окна, resize, scroll
  контейнера (`capture`).
- `menus.ts` — чистые фабрики, возвращают `MenuItem[]`; действия приходят параметрами (`actions`), чтобы тесты были
  без React. Тест: состав пунктов по контексту (например: вкладка живой сессии содержит «Завершить сессию» последним
  и `danger`; dev-вкладка без порта — «Открыть в браузере» `disabled`; раскладка 1×1 — «Переместить в ячейку…»
  отсутствует или `disabled`).
- Подменю «Переместить в ячейку…»: пункты «Ячейка 1…N» по `CELL_COUNT[layout]` текущего режима (в режиме «Проект» —
  раскладка проекта; в пульте — ячейки пульта), текущая — `disabled`. Действие — `moveTab` из стора (D добавит).
- Хост меню — один в `WorkbenchLayout.tsx`: `useContextMenu()` возвращает `{ open(e, items), element }`; компоненты
  получают `onContextMenu` через проп или контекст — выбери проще, не плоди порталы.
- ПКМ по терминалу xterm и по полям ввода — не перехватывать (guard `installNativeMenuGuard` уже есть).
- «Завершить» процесса с `guard` — через существующий `ConfirmDialog` в `Processes` (вызов `onKill(row)`).
- «Скрыть из дерева» — `hideProject` из стора (F2 сделал в пачке 1).

## Живая проверка (обязательно)

quickstart.md §8 на своём dev (1427/9228): все пять мест, клавиатура, край окна, подменю, анимации (скриншот
середины анимации не нужен — проверь, что выход не мгновенный: `getAnimations()` на элементе при закрытии).
