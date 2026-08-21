CREATE TABLE `api_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`name` varchar(80) NOT NULL,
	`key_prefix` varchar(24) NOT NULL,
	`key_hash` varchar(128) NOT NULL,
	`scopes` json NOT NULL,
	`last_used_at` timestamp,
	`revoked_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `api_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `api_keys_key_hash_unique` UNIQUE(`key_hash`)
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`event_type` enum('api_key_created','api_key_revoked','drift_submitted','feedback_submitted','login','logout','prediction_submitted') NOT NULL,
	`entity_type` varchar(64) NOT NULL,
	`entity_id` varchar(128),
	`request_id` varchar(128),
	`metadata` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `drift_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`external_job_id` varchar(128) NOT NULL,
	`status` enum('completed','failed','offline','pending','unknown') NOT NULL,
	`drift_detected` boolean,
	`drifted_features` json NOT NULL,
	`ks_statistic` decimal(8,6),
	`psi_score` decimal(8,6),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `drift_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `drift_job_user_external_unique` UNIQUE(`user_id`,`external_job_id`)
);
--> statement-breakpoint
CREATE TABLE `feedback_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`prediction_id` int NOT NULL,
	`user_id` int NOT NULL,
	`signal` enum('up','down') NOT NULL,
	`correction_label` enum('real','fake'),
	`idempotency_key` varchar(96) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `feedback_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `feedback_user_idempotency_unique` UNIQUE(`user_id`,`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `prediction_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`article_length` int NOT NULL,
	`title_length` int NOT NULL,
	`label` enum('real','fake','unavailable') NOT NULL,
	`probability_real` decimal(6,5),
	`probability_fake` decimal(6,5),
	`model_name` varchar(200) NOT NULL,
	`artifact_version` varchar(200) NOT NULL,
	`source` enum('live','offline') NOT NULL,
	`request_id` varchar(128),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `prediction_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `telemetry_preferences` (
	`user_id` int NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `telemetry_preferences_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
ALTER TABLE `api_keys` ADD CONSTRAINT `api_keys_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_events` ADD CONSTRAINT `audit_events_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `drift_jobs` ADD CONSTRAINT `drift_jobs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `feedback_records` ADD CONSTRAINT `feedback_records_prediction_id_prediction_records_id_fk` FOREIGN KEY (`prediction_id`) REFERENCES `prediction_records`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `feedback_records` ADD CONSTRAINT `feedback_records_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `prediction_records` ADD CONSTRAINT `prediction_records_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `telemetry_preferences` ADD CONSTRAINT `telemetry_preferences_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `api_key_user_created_idx` ON `api_keys` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_user_event_created_idx` ON `audit_events` (`user_id`,`event_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `drift_job_user_created_idx` ON `drift_jobs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `feedback_prediction_idx` ON `feedback_records` (`prediction_id`);--> statement-breakpoint
CREATE INDEX `prediction_user_created_idx` ON `prediction_records` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `prediction_model_created_idx` ON `prediction_records` (`model_name`,`created_at`);