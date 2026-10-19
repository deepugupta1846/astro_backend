-- Platform-wide astrologer policy (single row id = 1)
CREATE TABLE IF NOT EXISTS astrologer_policy (
  id INT NOT NULL PRIMARY KEY DEFAULT 1,
  free_chat_minutes INT NOT NULL DEFAULT 0,
  withdrawal_platform_percent DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO astrologer_policy (id, free_chat_minutes, withdrawal_platform_percent)
VALUES (1, 0, 0.00)
ON DUPLICATE KEY UPDATE id = id;
