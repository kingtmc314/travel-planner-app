CREATE TABLE `accommodations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tripId` int NOT NULL,
	`city` varchar(255) NOT NULL,
	`hotelName` varchar(255) NOT NULL,
	`checkIn` varchar(20) NOT NULL,
	`checkOut` varchar(20),
	`nights` int,
	`notes` text,
	`orderIndex` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accommodations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tripId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`currency` varchar(10) NOT NULL,
	`paidByUserId` int,
	`paidByName` varchar(255),
	`date` varchar(20) NOT NULL,
	`category` varchar(50) DEFAULT 'other',
	`notes` text,
	`splitAmong` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `expenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `flights` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tripId` int NOT NULL,
	`airline` varchar(255),
	`flightNumber` varchar(20),
	`date` varchar(20) NOT NULL,
	`fromCode` varchar(10),
	`fromCity` varchar(255),
	`toCode` varchar(10),
	`toCity` varchar(255),
	`departTime` varchar(10),
	`arriveTime` varchar(10),
	`duration` varchar(20),
	`isLayover` boolean DEFAULT false,
	`layoverDuration` varchar(20),
	`orderIndex` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `flights_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `itinerary_days` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tripId` int NOT NULL,
	`date` varchar(20) NOT NULL,
	`dayNumber` int NOT NULL,
	`title` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `itinerary_days_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `itinerary_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dayId` int NOT NULL,
	`tripId` int NOT NULL,
	`time` varchar(10),
	`title` varchar(255) NOT NULL,
	`location` varchar(500),
	`notes` text,
	`category` varchar(50) DEFAULT 'activity',
	`orderIndex` int DEFAULT 0,
	`lat` decimal(10,7),
	`lng` decimal(10,7),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `itinerary_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `map_pins` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tripId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`lat` decimal(10,7) NOT NULL,
	`lng` decimal(10,7) NOT NULL,
	`category` varchar(50) DEFAULT 'attraction',
	`notes` text,
	`address` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `map_pins_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tripId` int,
	`type` varchar(50) NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text,
	`read` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trip_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tripId` int NOT NULL,
	`userId` int,
	`inviteEmail` varchar(320),
	`inviteName` varchar(255),
	`role` enum('owner','editor','viewer') NOT NULL DEFAULT 'viewer',
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trip_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trips` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`destination` varchar(500) NOT NULL,
	`startDate` varchar(20) NOT NULL,
	`endDate` varchar(20) NOT NULL,
	`baseCurrency` varchar(10) NOT NULL DEFAULT 'HKD',
	`coverImage` text,
	`description` text,
	`createdBy` int NOT NULL,
	`isDemoTrip` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trips_id` PRIMARY KEY(`id`)
);
