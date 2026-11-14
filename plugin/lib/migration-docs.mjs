import { plural } from './status.mjs';

const ECHO = 'C:/Program Files/Echo Studio/echo-studio.exe';
const OPENSSL = `nodejs_conf = nodejs_init

[nodejs_init]
ssl_conf = ssl_sect

[ssl_sect]
system_default = system_default_sect

[system_default_sect]
Groups = X25519:P-256:P-384`;

const date = (d) =>
  d
    ? `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
    : null;

const gb = (n) => `${(n / 2 ** 30).toFixed(1).replace('.', ',')} ГБ`;

export function readmeText({ plugin, memory, archive }) {
  const backup = archive
    ? `\`claude-home.tar.gz\` — весь \`~/.claude\` и \`~/.claude.json\`, ${gb(archive.size)}, от ${date(archive.mtime)}`
    : '`claude-home.tar.gz` — ещё не собран';
  return `# Переезд на Kimi Code

Папку обновляет плагин echo-memory: при старте сессии Claude или Kimi (не чаще раза в 30 минут), архив — задача Планировщика \`EchoStudio-ClaudeArchive\` по воскресеньям. Руками здесь ничего не правь: изменения перезапишутся.

## Как переехать

1. Купи план Kimi Code на \`kimi.ai/code\`. На ПК страницы Kimi грузятся плохо (провайдер душит их CDN), с телефона по мобильному интернету — нормально.
2. Открой терминал в \`~/Projects\`, запусти \`kimi\` и напиши: «Выполни план из \`~/Kimi Migration/ПЕРЕЕЗД.md\`».
3. Дальше Kimi всё делает сам и останавливается только там, где нужен ты: вход в аккаунт, вставка скриншота. Итог он запишет в \`ОТЧЁТ.md\`.

Обратно: \`"${ECHO}" --agent claude\`. Данные Kimi и Claude никуда не деваются.

## Что здесь лежит

| Что | Зачем |
|---|---|
| \`ПЕРЕЕЗД.md\` | план для Kimi: проверить, синхронизировать, переключить Echo, отчитаться |
| \`memory/\` | копия памяти echo-memory${memory ? `: ${memory.projects} ${plural(memory.projects, 'проект', 'проекта', 'проектов')}, ${memory.files} ${plural(memory.files, 'файл', 'файла', 'файлов')}` : ''} |
| \`hooks/\` | копия \`~/.claude/hooks\` |
| ${backup.split(' — ')[0]} | ${backup.split(' — ').slice(1).join(' — ')} |
| \`artifacts/\` | артефакты claude.ai в HTML от 01.11.2026, в том числе сравнение агентов \`plan-b/\` |
| \`v2rayn/\` | правило V2RayN «домены Kimi мимо прокси». Запускай сам: V2RayN перезапускается и рвёт сеть |
| \`Kimi в Firefox.cmd\` | Firefox с отдельным профилем для страниц Kimi |

Переписки Claude Kimi читает сам через skill \`claude-history\` (\`node "${plugin}/bin/claude-history.mjs" --help\`). В Echo Studio они остаются в «Переписках», вкладки «Kimi» и «Архив Claude».

## Чего здесь нет

- Чаты claude.ai: Настройки → Конфиденциальность → Экспорт данных, ссылка придёт на почту. Делается только из твоего браузера.
- Комментарии к артефактам и их базы данных.
`;
}

export function planText({ plugin, home }) {
  const sync = `node "${plugin}/bin/kimi-sync.mjs"`;
  const history = `node "${plugin}/bin/claude-history.mjs"`;
  return `# План переезда с Claude Code на Kimi Code

Ты — Kimi Code. Пользователь работал с Claude Code и переезжает на тебя. Выполни шаги по порядку. Каждый шаг проверяй, а не только запускай. Если что-то не сходится — почини, если это в твоей зоне, иначе запиши в отчёт и иди дальше. Останавливайся и спрашивай пользователя (AskUserQuestion) только там, где это сказано.

Твои инструкции (\`~/.kimi-code/AGENTS.md\`) собраны из \`~/.claude/CLAUDE.md\`, там упоминается Claude — это про тебя. Сгенерированные файлы (\`AGENTS.md\`, \`.kimi-code/*\`, \`config.toml\` между маркерами \`echo-sync\`, skills с пометкой \`echo-sync\`) руками не правь: их перезаписывает синхронизация. Источник — \`~/.claude\`.

Запрещено в этом плане: менять V2RayN и сеть, запускать рабочие браузеры пользователя, коммитить и пушить, удалять что-либо в \`~/.claude\`.

## 1. Kimi работает

- \`kimi --version\` и \`kimi doctor\` без ошибок.
- Пользовательская переменная \`OPENSSL_CONF\` = \`${home}/.kimi-code/openssl-no-pq.cnf\`, файл существует. Без неё провайдер режет TLS к серверам Kimi. Нет — создай файл и задай переменную через \`[Environment]::SetEnvironmentVariable('OPENSSL_CONF', '<путь>', 'User')\`:

\`\`\`
${OPENSSL}
\`\`\`

- Ты уже отвечаешь, значит вход и план есть. Посмотри \`default_model\` в \`~/.kimi-code/config.toml\` и список моделей там же. Если по плану доступна \`kimi-code/k3.1-pro\`, а стоит другая — спроси пользователя, ставить ли её по умолчанию.

## 2. Синхронизация из Claude

- \`${sync} --all\` — выведет JSON. Затем \`~/.kimi-code/echo-sync.json\`: \`pluginError\` пустой, \`warnings\` пустой, \`plugin.version\` есть.
- Каждое предупреждение разбери: текст говорит, что сделать.
- В \`config.toml\` каждый хук из блока \`echo-sync: hooks\` встречается ровно один раз (сравни число \`[[hooks]]\` с \`hooks\` в \`echo-sync.json\`, хуки самого Kimi сверх этого — норма). Есть блок \`echo-sync: top\` с \`extra_skill_dirs\`.
- \`~/.kimi-code/AGENTS.md\` есть, начинается с пометки \`echo-sync\`. В проектах \`~/Projects\` с \`CLAUDE.md\` есть \`.kimi-code/AGENTS.md\` (проверь 3–4 проекта).

## 3. Инструменты

- Skills: в \`~/.claude/skills\` и \`~/.kimi-code/skills\` есть \`SKILL.md\` — убедись, что они в твоём списке skills (их видно в системном промпте).
- MCP: сервера из \`~/.kimi-code/mcp.json\`. Вызови по одному безвредному инструменту у каждого (\`chrome-devtools\` — \`list_pages\`, \`codebase-memory-mcp\` — \`list_projects\`). Сервер не поднялся — выясни почему (путь, \`npx\`, переменные) и почини в источнике \`~/.claude.json\`, затем \`${sync} --all\`. Браузер после проверки закрой: \`~/.claude/tools/cleanup/close-mcp-browser.ps1\`.
- Хуки: попробуй Bash \`cat > /dev/null <<EOF\` — гвард \`heredoc-guard\` должен запретить. Не запретил — хуки не подключены, вернись к шагу 2.

## 4. Память и история

- В этом разговоре должен быть блок \`<memory-context\` или строка «Память проекта — …» от echo-memory. Нет — плагин не работает: \`~/.kimi-code/plugins/installed.json\`, \`echo-memory\` включён; лог ошибок \`%TEMP%/claude-memory/errors.log\`.
- \`${history} index\`, затем \`${history} search Kimi V2RayN\` — должны найтись сессии о переезде. Skill \`claude-history\` в списке skills.

## 5. Echo Studio

- \`"${ECHO}" --agent kimi\` — Рабочее место, Переписки и Инструменты переключатся на Kimi. Код 0 — готово, иначе текст ошибки в stderr.
- Echo не установлен или команда не знает \`--agent\` — попроси пользователя: Echo Studio → Настройки → Агент → «Перейти на Kimi».

## 6. Правила под Kimi

Прочитай \`~/.kimi-code/AGENTS.md\` и найди правила, которые ссылаются на то, чего у тебя нет или что называется иначе: инструмент Artifact и страницы claude.ai, \`model: "sonnet"/"haiku"\` у субагентов, команды и скиллы Claude Code. Для каждого предложи замену (например, страницы — локальный HTML, открытый через \`explorer.exe\`). Покажи пользователю таблицу «правило → как у Kimi» и спроси (AskUserQuestion), что принять. Принятое запиши в \`~/.claude/KIMI.md\` — синхронизация добавит его в конец \`AGENTS.md\`. Затем \`${sync} --all\`.

## 7. Скриншот

Попроси пользователя вставить скриншот любого окна (Win+Shift+S, затем Ctrl+V в терминал) и опиши, что на нём. Это главный непроверенный пункт переезда.

## 8. Отчёт

Запиши \`${home}/Kimi Migration/ОТЧЁТ.md\`: таблица «шаг → итог → что сделал», что не получилось и что нужно от пользователя. Пользователю — короткий итог и ссылка на файл.

Обратный ход, если понадобится: \`"${ECHO}" --agent claude\`.
`;
}
