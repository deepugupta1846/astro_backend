-- Stores hashed OTPs so the app can send SMS and verify locally (no Twilio Verify).
CREATE TABLE IF NOT EXISTS `phone_otps` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `phone` VARCHAR(25) NOT NULL,
  `otp_hash` VARCHAR(64) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `attempts` INT NOT NULL DEFAULT 0,
  `last_sent_at` DATETIME NOT NULL,
  `createdAt` DATETIME NOT NULL,
  `updatedAt` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `phone_otps_phone_unique` (`phone`)
);
