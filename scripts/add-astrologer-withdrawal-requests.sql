-- Astrologer withdrawal requests (run once on MySQL)
CREATE TABLE IF NOT EXISTS astrologer_withdrawal_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  astrologer_id INT NOT NULL,
  requested_by_user_id INT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  status ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
  account_holder_name VARCHAR(120) NOT NULL,
  account_number VARCHAR(34) NOT NULL,
  ifsc_code VARCHAR(11) NOT NULL,
  bank_name VARCHAR(120) NOT NULL,
  branch_name VARCHAR(120) NULL,
  rejection_reason VARCHAR(300) NULL,
  wallet_transaction_id INT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_astro_withdraw_status (astrologer_id, status),
  INDEX idx_astro_withdraw_user (requested_by_user_id)
);
