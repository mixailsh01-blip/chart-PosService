# Архитектура приложения

Проект — SPA на vanilla JS с ES modules. Архитектура разделяет UI-слой, API-клиенты, кеш и доменные сервисы.

## Слои и ответственность

```
js/
  app.js                  # orchestration + UI state, без прямых fetch
  config.js               # чтение и нормализация конфигурации

  api/
    graphClient.js        # единая точка общения с n8n (/graph)
    pyrusClient.js        # прокси к Pyrus через graphClient

  cache/
    requestCache.js       # in-flight dedupe + TTL memory cache

  services/
    membersService.js     # сотрудники и индексы
    catalogsService.js    # справочники (смены)
    vacationsService.js   # отпуска по месяцам
    scheduleService.js    # расписание, short TTL + latest-only
    prodCalendarService.js# производственный календарь РФ

  utils/
    logger.js             # логгер без alert

  legacy/
    *                     # устаревшие модули (не подключаются)
```

## Поток данных

1. `app.js` инициализирует конфиг и создает клиентов/сервисы.
2. UI-события вызывают сервисы (members, catalogs, schedule).
3. Сервисы используют `requestCache.cached` для дедупликации и TTL.
4. `graphClient` — единственная точка сетевого обмена с n8n `/graph`.

## Runtime entrypoints

- `index.html` → `js/shift-colors.js` (script)
- `index.html` → `js/app.js` (module)
- Дальше всё — только через import-цепочку из `app.js`.

Правило: код считается частью приложения только если он достижим из import-цепочки `app.js`.

## Гарантии

- `app.js` не делает `fetch` и не содержит API-логики.
- Сервис `membersService` обеспечивает единый запрос `/v4/members` за сессию.
- `scheduleService` защищает от гонок при быстром переключении месяцев и использует короткий TTL.
