-- VoyageAI v9.1: additive MySQL/TiDB migration, apply BEFORE registering budgets.
-- No existing trip/expense records are touched; no foreign keys on legacy tables.
CREATE TABLE IF NOT EXISTS `trip_budgets` (
  `tripId` INT NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `currency` VARCHAR(3) NOT NULL,
  `warningPercent` INT NOT NULL DEFAULT 80,
  `updatedBy` INT NOT NULL,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`tripId`)
);
