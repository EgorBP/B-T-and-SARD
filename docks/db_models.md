## **Схема данных**


#### Модель `User`:

1. **id** - Integer, PK
2. **email** - String
3. **password_hash** - String
4. **recovery_phrase** - String
5. **avatar_filename** - String
6. **name** - String
7. **created_at** - Datetime
8. **tracks** - Relationship (`Track`)

#### Модель `Track`:

1. **id** - Integer, PK
2. **title** - String
3. **filename** - String
4. **cover_filename** - String
5. **description** - String
6. **is_public** - Boolean
7. **created_at** - Datetime
8. **owner_id** - Integer — внешний ключ (`User.id`)
9. **owner** - Relationship (`User`)
