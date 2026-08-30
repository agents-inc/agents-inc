CREATE TABLE `rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`count` integer NOT NULL,
	`last_request` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_limits_key_unique` ON `rate_limits` (`key`);--> statement-breakpoint
ALTER TABLE `sessions` DROP COLUMN `timezone`;--> statement-breakpoint
ALTER TABLE `sessions` DROP COLUMN `city`;--> statement-breakpoint
ALTER TABLE `sessions` DROP COLUMN `country`;--> statement-breakpoint
ALTER TABLE `sessions` DROP COLUMN `region`;--> statement-breakpoint
ALTER TABLE `sessions` DROP COLUMN `region_code`;--> statement-breakpoint
ALTER TABLE `sessions` DROP COLUMN `colo`;--> statement-breakpoint
ALTER TABLE `sessions` DROP COLUMN `latitude`;--> statement-breakpoint
ALTER TABLE `sessions` DROP COLUMN `longitude`;