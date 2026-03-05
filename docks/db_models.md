## **Схема данных**


#### Модель `User`:

1. **id** — integer
2. **username** — string
3. **password_hash** — string
4. **tracks** — relationship (`Track`)

#### Модель `Track`:

1. **id** — integer
2. **title** — string
3. **filename** — string
4. **is_public** — boolean
5. **owner_id** — integer — внешний ключ (`users.id`)
