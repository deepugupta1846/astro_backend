-- Run manually if you use sync() without alter (e.g. production).
-- App maps Sequelize `profileImageUrl` → DB column name in .env (default profile_image_url).

ALTER TABLE `users`
  ADD COLUMN `profile_image_url` VARCHAR(500) NULL
  COMMENT 'Public URL to profile photo'
  AFTER `name`;

-- If you prefer camelCase in MySQL instead, add `profileImageUrl` and set in .env:
-- USER_PROFILE_IMAGE_DB_COLUMN=profileImageUrl

-- If role enum is missing astrologer (registration / verify errors):
-- ALTER TABLE `users`
--   MODIFY COLUMN `role` ENUM('user', 'admin', 'astrologer') NOT NULL DEFAULT 'user';
