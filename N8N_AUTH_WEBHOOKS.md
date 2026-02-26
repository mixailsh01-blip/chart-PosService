# n8n: Вебхуки авторизации по email

Документ описывает два webhook‑флоу для авторизации по email в n8n:

- `auth_email_init` — инициация входа, генерация кода, отправка письма.
- `auth_email_verify` — проверка кода, лимитов, TTL, выдача доступа.

## Общие параметры

### Входные данные (ожидаемые поля)

- `email` — адрес пользователя (строка).
- `sessionId` — идентификатор сессии/устройства (строка, генерируется на фронте).

### Хранилище

Использовать n8n Data Store **или** Redis/kv в зависимости от доступности.

**Ключ:** `auth_email:{email}:{sessionId}`

**Значение (JSON):**

- `hash` — хэш кода (рекомендуется HMAC SHA‑256 с server‑secret).
- `expiresAt` — timestamp (ms) истечения TTL.
- `attemptsLeft` — оставшиеся попытки ввода кода.
- `sentAt` — timestamp отправки письма.
- `lockUntil` — timestamp блокировки после превышения лимитов (опционально).

### Рекомендации по безопасности

- Код — 6 цифр, TTL 5–10 минут.
- Попытки — 3–5 на сессию.
- Ограничить повторную отправку (например, не чаще 1 раза в минуту).
- Хранить только хэш, не хранить код в явном виде.

### Логирование

Все ключевые события логировать (в n8n логах или отдельный лог‑sink):

- `auth_email_init_requested`
- `auth_email_init_sent`
- `auth_email_verify_ok`
- `auth_email_verify_fail`
- `auth_email_verify_locked`

---

## 1) Webhook: `auth_email_init`

### Назначение
Инициация входа: проверка email, генерация кода, сохранение хэша и отправка письма.

### Минимальная схема флоу (узлы)

1. **Webhook** (`POST /auth_email_init`)
2. **Set / Function** — нормализация email, чтение `sessionId`, валидация.
3. **Pyrus / Таблица сотрудников** — проверка, что email существует (например, запрос к Pyrus/таблице сотрудников).
4. **IF** — нет пользователя → ответ `NOT_FOUND`.
5. **Function** — генерация 6‑значного кода, расчёт TTL, HMAC‑хэш.
6. **Data Store / Redis** — сохранить `{hash, expiresAt, attemptsLeft, sentAt}` с TTL.
7. **Email (SMTP / Email node)** — отправить письмо.
8. **Respond to Webhook** — `{ status: "CODE_SENT" }`.

### Логика узлов (детали)

**Проверка пользователя**
- Запрос к Pyrus/таблице сотрудников по email.
- Если нет записи, возвращать `NOT_FOUND` (без раскрытия деталей).

**Генерация кода**
- `code = random 6 digits`.
- `hash = HMAC_SHA256(code, AUTH_EMAIL_SECRET)`.

**TTL / попытки**
- `expiresAt = now + TTL_MS` (например, 10 минут).
- `attemptsLeft = 5`.

**Отправка**
- Шаблон письма:
  - Тема: `Код входа`.
  - Текст: `Ваш код входа: {{code}}. Код действует 10 минут.`

---

## 2) Webhook: `auth_email_verify`

### Назначение
Проверка кода и лимитов, выдача результата `ACCESS_GRANTED` и данных пользователя.

### Минимальная схема флоу (узлы)

1. **Webhook** (`POST /auth_email_verify`)
2. **Set / Function** — нормализация `email`, `sessionId`, `code`.
3. **Data Store / Redis** — получить запись по ключу.
4. **IF** — нет записи → `CODE_EXPIRED`.
5. **IF** — TTL истёк → `CODE_EXPIRED`.
6. **IF** — `attemptsLeft <= 0` или `lockUntil > now` → `LOCKED`.
7. **Function** — HMAC‑хэш входного `code`, сравнить с сохранённым.
8. **IF** — не совпало → уменьшить `attemptsLeft`, сохранить, вернуть `INVALID_CODE`.
9. **Pyrus / Таблица сотрудников** — получить `user/permissions`.
10. **Data Store / Redis** — удалить запись (или пометить использованной).
11. **Respond to Webhook** — `ACCESS_GRANTED` + данные пользователя.

### Ответы (пример)

**Успех**
```json
{
  "status": "ACCESS_GRANTED",
  "user": {
    "id": "123",
    "email": "user@example.com",
    "permissions": ["schedule:read", "schedule:write"]
  }
}
```

**Ошибки**
```json
{ "status": "NOT_FOUND" }
{ "status": "CODE_EXPIRED" }
{ "status": "INVALID_CODE", "attemptsLeft": 2 }
{ "status": "LOCKED" }
```

---

## Хранилище: варианты реализации

### n8n Data Store
- Создать коллекцию `auth_email`.
- Записывать `key` = `auth_email:{email}:{sessionId}`.
- `value` = JSON с параметрами.

### Redis/kv
- `SET key value EX <ttl>` для TTL.
- `HSET` можно использовать для хранения полей.

---

## Интеграция с Pyrus

1. Проверка существования email в таблице сотрудников.
2. Возврат необходимых данных (`user`, `permissions`) при успешной проверке.

---

## Пример payload для вызова `auth_email_init`

```json
{
  "email": "user@example.com",
  "sessionId": "browser_abc123"
}
```

## Пример payload для `auth_email_verify`

```json
{
  "email": "user@example.com",
  "sessionId": "browser_abc123",
  "code": "123456"
}
```
