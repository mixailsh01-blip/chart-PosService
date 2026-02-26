# Карта сетевых запросов

## n8n `/graph` (graphHookUrl)

Все запросы проходят через `js/api/graphClient.js`.

### Типы запросов

- `type: "auth"` — логин/пароль (может использоваться n8n-флоу при необходимости).
- `type: "email"` — отправка одноразового кода (email-авторизация).
- `type: "pyrus_api"` — прокси запросов Pyrus.
- `type: "pyrus_save"` — сохранение изменений смен.

## Pyrus API (через `pyrus_api`)

Вызовы выполняются через сервисы:

- **`/v4/members`** — `membersService.getMembers()`
  - Используется для загрузки сотрудников и проверки email.
  - Дедуп + TTL 12h, не более 1 запроса за сессию.

- **`/v4/members/{id}`** — `membersService.getMemberDetails()`
  - Получение ролей для email-авторизации.
  - TTL 1h.

- **`/v4/catalogs/{shifts}`** — `catalogsService.getShiftsCatalog()`
  - Справочник смен.
  - TTL 3 дня.

- **`/v4/forms/{otpusk}/register`** — `vacationsService.getVacationsForMonth()`
  - Отпуска по месяцу.
  - TTL 3 часа.

- **`/v4/forms/{smeni}/register`** — `scheduleService.loadMonthSchedule()`
  - Расписание по месяцу.
  - In-flight dedupe + latest-only.

## Внешние источники

- **isdayoff.ru** — `prodCalendarService.getProdCalendarForMonth()`
  - Производственный календарь РФ.
  - TTL и ключи берутся из `config.calendar.prodCal`.
