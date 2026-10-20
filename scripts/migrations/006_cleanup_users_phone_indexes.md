# Fix `ER_TOO_MANY_KEYS` on `users` (duplicate `phone` indexes)

Caused by repeated `sequelize.sync({ alter: true })` trying to re-apply `UNIQUE` on `phone`.

1. **Stop** setting `DB_SYNC_ALTER=true` on the server. Use `scripts/migrations/*.sql` for new columns.

2. Inspect indexes:

```sql
SHOW INDEX FROM users WHERE Column_name = 'phone';
```

3. Keep **one** unique index on `phone` (often named `phone` or `users_phone_unique`). Drop extras, e.g.:

```sql
-- Example only — use actual Key_name values from SHOW INDEX
-- ALTER TABLE users DROP INDEX phone_2;
-- ALTER TABLE users DROP INDEX phone_3;
```

4. Restart the API with `DB_SYNC_ALTER` **not** set to `true`.
