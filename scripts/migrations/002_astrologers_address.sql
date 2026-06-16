-- Add correspondence address to astrologers (run if DB_SYNC_ALTER is off).
ALTER TABLE `astrologers`
  ADD COLUMN `address` TEXT NULL
  COMMENT 'Residential / correspondence address'
  AFTER `birthPlace`;
