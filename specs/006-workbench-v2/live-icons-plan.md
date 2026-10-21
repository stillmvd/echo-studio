# Фаза 4 — живые значки (стенд 304): как встанет в Echo

## Итог (21.10)

Выбран B для всех состояний, кроме dev_err/dev_down (A). Код: `src/lib/live-status.ts` (соответствие, цвета,
`SOLID_SCALE`, `FLAT_VIEWBOX`, `clipBox`, `underCover`), `src/components/workbench/live/engine.ts` (холст),
`LiveIcon.tsx` (слот). Видимый размер выровнен `projects-12` замером по альфе: сцена B — в `Group` со scale из
`SOLID_SCALE`, SVG A — по своему viewBox; любая фигура в среднем занимает 68% стороны значка. Вживую: обрезка краем
«Запущено», 0 кадров в скрытом разделе, `data-live-cover`/`data-live-top`, +30 значков ≈ +6 мс скрипта в секунду
(скриншоты `shots/p4-*.png`).

## План (до выбора)

План до выбора, кода нет. Исходник стенда: `live-statuses.html` (`STATES`, SVG-знаки A, `B[state]`/`C[state]` для
three r128, общий `WebGLRenderer` со scissor).

## Где значки сейчас

`StatusIcon` (`.wb-gl` 22px, `.sm` 18px; Lucide внутри) — «Запущено», вкладки ячеек, пульт, «Недавние», QuickSwitch,
Процессы. `DevDot` (`.wb-dv` 18px) — «Запущено», вкладка dev, капсула шапки. Одновременно на экране обычно 10–30.

## Соответствие состояний

| Echo | стенд |
|---|---|
| `working` + `phase: thinking` / `null` | `thinking` |
| `working` + `phase: tool` | `tool` |
| `working` + `phase: agents` | `agents` |
| `waiting`, `done`, `error`, `idle` | одноимённые |
| `new` | `idle` |
| `exited` | статичный серый |
| dev `running` / `errors` / `crashed` | `dev_run` / `dev_err` / `dev_down` |
| dev `starting` | `dev_run` без пульса |
| dev `stopped` | статичный серый |

Решено (`projects-12`, 21.10): состояния, которых нет на стенде, рисуются в варианте, выбранном для `idle`
(`new`, `exited`) и для `dev_run` (dev `starting`, `stopped`).

## Вариант A (плоские SVG со SMIL)

WebGL не нужен. `StatusIcon`/`DevDot` рисуют SVG стенда inline; на `prefers-reduced-motion`, скрытом окне
(`visibilitychange`) и скрытом разделе — `svg.pauseAnimations()`. Цена — ~0.

## Варианты B/C — общий холст

- `three` из npm (CSP `default-src 'self'` — CDN нельзя), модуль холста грузится `import()` при первом значке B/C,
  на старт Echo не влияет. Если по состояниям выбраны разные варианты — холст только для B/C-состояний.
- Один `<canvas>` на окно: `position: fixed; inset: 0; pointer-events: none; z-index: 30`. Контент ниже, меню,
  диалоги и поповеры (`z-50`) выше — перекрытие ими решается порядком слоёв, без расчётов. Проверить QuickSwitch и
  перетаскиваемую вкладку (`workbench.css` z 20/21 — пульт) — подтянуть их выше 30, если нужно.
- Слот: `<LiveIcon state size>` рендерит прозрачный `<span>` нужного размера (SVG варианта A внутри как запасной вид)
  и регистрируется в реестре холста (ref → Set). `IntersectionObserver` держит множество видимых; `offsetParent ===
  null` (скрытая вкладка, скрытый раздел) — не рисуется.
- Кадр: один `WebGLRenderer` (`alpha`, `setPixelRatio(devicePixelRatio)`, размер окна), clear → для каждого видимого
  слота `setViewport(rect)` + `setScissor(rect ∩ клип-контейнер)` → `render(scene[state])`. Клип-контейнер — ближайший
  предок с `overflow ≠ visible` (`.wb-runs`, полоса вкладок), находится один раз при регистрации: значок, наполовину
  уехавший под край списка, обрезается, а не висит поверх.
- Сцены — по одной на состояние (10 штук), геометрии/материалы общие; разные слоты одного состояния рисуют одну сцену
  в своих viewport'ах. Число слотов на память не влияет.
- Цикл `requestAnimationFrame` идёт, только пока есть видимые слоты и `document.visibilityState === 'visible'`;
  окно без фокуса — 30 к/с. Пустое множество / скрытое окно — цикл стоит, холст очищен.
- `prefers-reduced-motion` (слушатель `matchMedia`): цикла нет, один статичный кадр (`t` фиксирован, как на стенде)
  при изменениях — регистрация/снятие слота, смена состояния, `resize`, `scroll` (capture) и `ResizeObserver` слотов.
- `webglcontextlost` → у корня класс, слоты показывают SVG варианта A; `webglcontextrestored` → пересборка сцен.
- Проверки: юнит-тесты на соответствие состояний и на клип-прямоугольник (чистые функции); вживую на проверочном dev
  — скриншоты 1920×1032 и 900×600, замер кадра (Performance, ≤ 2 мс на кадр при 30 значках) и CPU при простое (цикл
  стоит, когда окно скрыто).
