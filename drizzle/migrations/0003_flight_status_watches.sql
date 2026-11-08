-- Additive flight status watches and dormant scheduled-job configuration.
-- All observation timestamps are UTC epoch milliseconds; display in Hong Kong.
CREATE TABLE IF NOT EXISTS flight_status_watches (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  sourceKind VARCHAR(10) NOT NULL,
  sourceId INT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  lastSignature VARCHAR(64) NULL,
  lastObservation JSON NULL,
  lastCheckedAt BIGINT NULL,
  revision INT NOT NULL DEFAULT 0,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY flight_status_watch_user_source (userId, sourceKind, sourceId),
  KEY flight_status_watch_due (enabled, lastCheckedAt)
);

CREATE TABLE IF NOT EXISTS flight_status_schedule (
  id INT NOT NULL PRIMARY KEY,
  schedule_cron_task_uid VARCHAR(65) NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY flight_status_schedule_uid (schedule_cron_task_uid)
);
