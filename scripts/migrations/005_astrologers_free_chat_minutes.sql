-- Per-astrologer free chat minutes (admin sets via PUT /api/v1/admin/astrologers/:id)
ALTER TABLE astrologers
  ADD COLUMN free_chat_minutes INT NOT NULL DEFAULT 0
  COMMENT 'Free billable chat minutes per session for this astrologer only';
