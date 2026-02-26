# Кеширование и дедупликация

## requestCache.cached

Базовый контракт:

```
cached(key, { ttlMs, force }, fetcher)
```

- **in-flight dedupe**: параллельные запросы с одинаковым `key` объединяются в один Promise.
- **TTL**: ответы хранятся в памяти на `ttlMs`.
- **force**: принудительно игнорирует кеш и перезапрашивает данные.

## TTL по умолчанию

- **members**: 12 часов (можно менять при создании сервиса).
- **catalogs**: 3 дня.
- **vacations**: 3 часа.
- **schedule**: без TTL, только in-flight dedupe + latest-only.
- **prod calendar**: TTL берется из `config.calendar.prodCal.ttlMs`, хранится в `localStorage`.

## ttlMs = 0: inflight-only dedupe

Если `ttlMs <= 0`, `requestCache` не сохраняет значение в memory cache (value-cache),
но продолжает дедуплицировать запросы, пока Promise в полёте.

## Schedule short TTL cache

- **Ключи**: `pyrus:schedule:{YYYY-MM}`.
- **TTL**: 90 секунд, чтобы уменьшить повторные запросы при переключениях месяцев.
- **Инвалидация**: после сохранения смен вызывается `invalidateMonthSchedule(monthKey)`.
- **latest-only**: ответы со старым токеном не применяются к UI.

## Дополнительные кеши

В `app.js` сохраняются UI-данные в `localStorage`:

- кеш расписания по месяцам;
- кеш справочника смен;
- настройки пользователя (тема, фильтры, линия, сессия).

Эти кеши не заменяют сетевой `requestCache`, а дополняют его.
