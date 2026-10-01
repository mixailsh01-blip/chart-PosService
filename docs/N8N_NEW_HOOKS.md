# Новые типы хуков для n8n /graph (порт из SPRT-chart)

Все запросы: POST `graphHookUrl`, JSON `{ type, ...payload }`. В новых запросах всегда есть
`user_id` (Pyrus-id сотрудника) и `user_login` — по ним n8n проверяет права (роли → линии).

| type | payload | ответ |
|---|---|---|
| `pyrus_save` (изменён) | как раньше; в `edit.task[]` добавлено `clear_template: true` — очистить поле «Шаблон» (кастомная смена); `item_id: null` у кастомной смены | `{ tasks?: [...созданные/изменённые задачи], deletedIds?: [], errors?: [{op,message}] }` — всё необязательно |
| `vacation_create` | `employee_id, start_date (YYYY-MM-DD), days, line, start_utc (ISO), duration_minutes` | `{ task: <задача Pyrus формы отпусков> }`; период пишется как `start_utc` + `duration_minutes` |
| `vacation_delete` | `task_id` | `{ ok: true }` |
| `schedule_swap` | `task_id, target_task_id` (обмен) или `task_id, target_employee_id` (передача) | `{ tasks: [...] }` — меняется только «Сотрудник»; отказ, если получится две смены в день |
| `lunch_status` | — | `{ onShift, shiftEnd, lunch: {status: active\|scheduled, start_utc, end_utc, remainingSec}\|null, lunchMinutes, budgetRemainingSec, canStart }` |
| `lunch_start` | `start_at?` (ISO) | тот же статус |
| `lunch_end` | — | тот же статус (отмена запланированного или возврат в линию) |

Обед: бэкенд убирает сотрудника из группы Mango, таймер раз в минуту возвращает его по истечении лимита.
Без обработки `lunch_*` кнопка «Обед» просто не показывается.
