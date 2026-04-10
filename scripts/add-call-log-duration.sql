-- Run once: store voice/video call duration (seconds) when a call ends.

ALTER TABLE call_logs
  ADD COLUMN duration_seconds INT UNSIGNED NULL
  COMMENT 'Call length in seconds (set when call ends)';
