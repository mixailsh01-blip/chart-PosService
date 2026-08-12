# Runtime-unused modules

Этот файл фиксирует каталоги, которые не участвуют в рантайме текущей версии приложения.

## Перенесённые папки

- `js/legacy/ui/`
- `js/legacy/calendar/`
- `js/legacy/authN8n.js`, `employeesFromPyrus.js`, `pyrusAuth.js`, `scheduleFromPyrus.js`, `shiftsCatalog.js`
- `js/legacy/state/config.js`, `js/legacy/state/shiftDraftCache.js`

Дублирующие копии этих файлов вне `js/legacy/` (в `js/api/`, `js/state/`, `js/ui/`, `js/calendar/`) удалены — они были побайтово идентичны архивным версиям и не входили в import-цепочку `app.js`. `js/firstClient.js` удалён как бесхозный: ссылался на DOM-элементы, отсутствующие в текущем `index.html`, и нигде не подключался.

## Почему это безопасно

Runtime entrypoints — `js/app.js` и `js/shift-colors.js` (через `index.html`).
Если модуль не достижим через import-цепочку `app.js`, он не участвует в работе сайта.

## Как восстановить

Если понадобится вернуть модуль в рантайм:

1. Переместите папку обратно в `js/`.
2. Добавьте импорт в `js/app.js` (или его зависимости).
