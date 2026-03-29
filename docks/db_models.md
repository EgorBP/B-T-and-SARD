## **Схема данных**

#### Модель `User`:

1. **id** - integer
2. **email** - string (unique)
3. **password_hash** - string
4. **name** - string
5. **created_at** - datetime
6. **tracks** - relationship (`Track`)

#### Модель `Track`:

1. **id** - integer
2. **title** - string
3. **filename** - string
4. **is_public** - boolean
5. **created_at** - datetime
6. **owner_id** - integer - внешний ключ (`User.id`)
