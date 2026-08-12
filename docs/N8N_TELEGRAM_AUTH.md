# n8n: Telegram-авторизация через одноразовый токен

Ниже — практическая схема развёртывания двух n8n-флоу:

- `auth_telegram_init`: по никнейму проверяет сотрудника, генерирует одноразовый токен (TTL 5–10 минут), отправляет пользователю deep‑link на сайт (`?tg_token=...`).
- `auth_telegram_verify`: сайт отправляет токен в n8n, n8n валидирует, выдаёт `ACCESS_GRANTED` и `user/permissions`, токен помечается использованным.

Дополнительно включены защита и аудит: rate‑limit, TTL, “one‑time” использование, логирование.

---

## 1) Предварительные требования

- **BotFather**: получите `TELEGRAM_BOT_TOKEN`.
- **Публичный n8n Webhook URL**: `N8N_WEBHOOK_URL` (например, `https://n8n.example.com/webhook/`).
- **Хранилище** (рекомендация):
  - n8n **Data Store** (встроенное), либо
  - внешняя БД (Postgres/Redis) для более строгой rate‑limit/TTL.

### Рекомендуемая структура записи токена

**Коллекция/таблица:** `tg_auth_tokens`

| Поле | Тип | Описание |
| --- | --- | --- |
| `token` | string | Одноразовый токен (32–64 bytes random, hex/base64url) |
| `username` | string | Telegram username без `@` |
| `telegramUserId` | string | ID пользователя Telegram |
| `permissions` | object/array | Список ролей/разрешений |
| `createdAt` | datetime | Время генерации |
| `expiresAt` | datetime | TTL 5–10 минут |
| `usedAt` | datetime/null | Когда токен был использован |
| `requestIp` | string | IP запроса (для verify) |
| `status` | string | `active` / `used` / `expired` |

Дополнительно можно хранить `requestId` (UUID) и `auditTrail` для логирования.

---

## 2) Flow: `auth_telegram_init`

### Триггер
- **Telegram Trigger** (или Webhook, если инициируете не из Telegram, а из сайта/CRM).
- Событие: `message`.

### Логика узлов (предлагаемая схема)

1. **Telegram Trigger**
   - Получаем `message.from.username`, `message.from.id`, `chat.id`.

2. **Code (Function) — нормализация username**
   ```js
   const usernameRaw = $json.message?.from?.username || '';
   const username = usernameRaw.replace(/^@/, '').trim().toLowerCase();

   return [{
     ...$json,
     username,
     telegramUserId: String($json.message?.from?.id || ''),
     chatId: String($json.message?.chat?.id || ''),
   }];
   ```

3. **Employee lookup**
   - **HTTP Request** к HR/CRM API **или** **Data Store** (если локальная таблица сотрудников).
   - Выход: `user` (ID, имя, `permissions`).

4. **IF: сотрудник найден?**
   - **false**: ответ пользователю (Telegram Send Message) — «Пользователь не найден».
   - **true**: перейти дальше.

5. **Rate limit (per username/IP/chatId)**
   - Рекомендуется: хранить `lastRequestAt` и `requestCount` в отдельной коллекции `tg_auth_rate`.
   - Пример политики:
     - 3 запроса в минуту на пользователя;
     - 10 запросов за 10 минут на IP.
   - Если превышено — отправить уведомление и прекратить выполнение.

6. **Code — генерация токена**
   ```js
   const crypto = require('crypto');
   const token = crypto.randomBytes(32).toString('hex');

   const now = new Date();
   const ttlMinutes = 10;
   const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

   return [{
     token,
     createdAt: now.toISOString(),
     expiresAt: expiresAt.toISOString(),
     status: 'active',
   }];
   ```

7. **Data Store / DB — сохранить токен**
   - Записать `token`, `username`, `telegramUserId`, `permissions`, `createdAt`, `expiresAt`, `status=active`.

8. **Telegram Send Message — deep‑link**
   - Ссылка: `https://site.example.com/login?tg_token={{$json.token}}`
   - Текст: «Перейдите по ссылке для входа. Ссылка действует 10 минут.»

9. **Log**
   - В Data Store `tg_auth_logs` или внешнюю систему (Sentry/ELK): `auth_telegram_init`, `username`, `telegramUserId`, `token`, `createdAt`, `status`.

---

## 3) Flow: `auth_telegram_verify`

### Триггер
- **Webhook** (POST) `https://n8n.example.com/webhook/auth_telegram_verify`
- Тело запроса: `{ "token": "...", "ip": "..." }`

### Логика узлов

1. **Webhook** — получает `token`.

2. **IF: token присутствует?**
   - Если нет: ответ 400 `{ "status": "INVALID_REQUEST" }`.

3. **Data Store / DB — поиск токена**
   - По `token`.

4. **IF: токен найден?**
   - Если нет: ответ 401 `{ "status": "INVALID_TOKEN" }`.

5. **IF: токен не истёк и не использован?**
   - Условия:
     - `status === 'active'`
     - `usedAt == null`
     - `expiresAt > now`
   - Если нет: ответ 401 `{ "status": "TOKEN_EXPIRED_OR_USED" }`.

6. **Mark as used**
   - Обновить запись: `usedAt = now`, `status = 'used'`, `requestIp = ip`.

7. **Ответ**
   ```json
   {
     "status": "ACCESS_GRANTED",
     "user": {
       "username": "...",
       "telegramUserId": "...",
       "permissions": ["..."]
     }
   }
   ```

8. **Log**
   - Записать `auth_telegram_verify`, `token`, `status`, `requestIp`, `timestamp`.

---

## 4) Защита: rate‑limit, TTL, one‑time

### Rate‑limit
- **Минимальная версия**: хранить счётчик в Data Store:
  - ключ: `rate:<username>` и `rate:<ip>`
  - поля: `count`, `windowStart`.
- На превышение лимита возвращать статус `429` и отправлять уведомление в Telegram.

### TTL
- Любой токен имеет `expiresAt`.
- В `auth_telegram_verify` всегда проверять `expiresAt > now`.
- По возможности — настроить cron‑node для периодической очистки истёкших токенов.

### One‑time
- После успешного `verify` обязательно выставлять `usedAt` и `status=used`.
- Повторный `verify` возвращает `TOKEN_EXPIRED_OR_USED`.

---

## 5) Логирование и аудит

Рекомендуемые поля в логах:
- `event`: `auth_telegram_init` / `auth_telegram_verify`
- `username`, `telegramUserId`
- `token`
- `status`
- `timestamp`
- `requestIp`

Логи можно хранить:
- в Data Store `tg_auth_logs`,
- в внешней БД,
- в SIEM (ELK/Splunk) через Webhook/HTTP Request.

---

## 6) Быстрая проверка

1. Написать боту `@your_bot` в Telegram.
2. Получить ссылку `?tg_token=...`.
3. Отправить токен POST‑запросом в `auth_telegram_verify`.
4. Убедиться, что повторный запрос с тем же токеном возвращает `TOKEN_EXPIRED_OR_USED`.

---

## 7) Пример минимальных ответов (рекомендуемый контракт)

**Success**
```json
{
  "status": "ACCESS_GRANTED",
  "user": {
    "username": "ivan",
    "permissions": ["admin", "reports"]
  }
}
```

**Error**
```json
{
  "status": "INVALID_TOKEN"
}
```

---

## 8) Примечания

- Генерацию токена выполняйте **только** на стороне n8n.
- Не используйте username как единственный фактор — храните `telegramUserId`.
- Если требуется высокий уровень защиты — используйте Redis для rate‑limit и хранения TTL‑ключей.
