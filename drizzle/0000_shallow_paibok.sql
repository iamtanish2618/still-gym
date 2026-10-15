CREATE TABLE `bookings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`session_id` integer NOT NULL,
	`status` text NOT NULL,
	`code` text NOT NULL,
	`created_at` integer NOT NULL,
	`checked_in_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "valid_status" CHECK("bookings"."status" IN ('confirmed','waitlisted','cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_code_unique` ON `bookings` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_active_booking` ON `bookings` (`user_id`,`session_id`) WHERE "bookings"."status" IN ('confirmed','waitlisted');--> statement-breakpoint
CREATE INDEX `session_queue` ON `bookings` (`session_id`,`status`,`id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`start` integer NOT NULL,
	`capacity` integer DEFAULT 20 NOT NULL,
	`title` text DEFAULT 'Open practice' NOT NULL,
	CONSTRAINT "twenty_mats" CHECK("sessions"."capacity"=20),
	CONSTRAINT "ist_hour" CHECK(("sessions"."start"+19800000)%3600000=0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_start_unique` ON `sessions` (`start`);--> statement-breakpoint
CREATE TABLE `tokens` (
	`hash` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	CONSTRAINT "valid_role" CHECK("users"."role" IN ('member','admin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TRIGGER booking_insert_guard BEFORE INSERT ON bookings BEGIN
 SELECT CASE WHEN (SELECT start FROM sessions WHERE id=NEW.session_id)<=unixepoch()*1000 THEN RAISE(ABORT,'SESSION_STARTED') END;
 SELECT CASE WHEN NEW.status='confirmed' AND (SELECT count(*) FROM bookings WHERE session_id=NEW.session_id AND status='confirmed')>=20 THEN RAISE(ABORT,'SESSION_FULL') END;
 SELECT CASE WHEN NEW.status='waitlisted' AND (SELECT count(*) FROM bookings WHERE session_id=NEW.session_id AND status='confirmed')<20 THEN RAISE(ABORT,'SEATS_AVAILABLE') END;
END;
--> statement-breakpoint
CREATE TRIGGER booking_promote_guard BEFORE UPDATE OF status ON bookings WHEN NEW.status='confirmed' AND OLD.status!='confirmed' BEGIN
 SELECT CASE WHEN (SELECT start FROM sessions WHERE id=NEW.session_id)<=unixepoch()*1000 THEN RAISE(ABORT,'SESSION_STARTED') END;
 SELECT CASE WHEN (SELECT count(*) FROM bookings WHERE session_id=NEW.session_id AND status='confirmed')>=20 THEN RAISE(ABORT,'SESSION_FULL') END;
END;
--> statement-breakpoint
CREATE TRIGGER booking_cancel_promotes AFTER UPDATE OF status ON bookings WHEN OLD.status='confirmed' AND NEW.status='cancelled' BEGIN
 UPDATE bookings SET status='confirmed' WHERE id=(SELECT b.id FROM bookings b JOIN sessions s ON s.id=b.session_id WHERE b.session_id=NEW.session_id AND b.status='waitlisted' AND s.start>unixepoch()*1000 ORDER BY b.id LIMIT 1);
END;
