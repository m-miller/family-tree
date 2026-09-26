-- Structure only. This repository deliberately carries no family data and
-- no user accounts: the people in this tree are living relatives, and the
-- users table holds a password hash.
--
-- To set up an empty install: import this file (or schema.sql, which is the
-- same structure with comments explaining it), then seed.sql for the two
-- trees, then users.sql for the login table.
--
-- To move a real database, export it from phpMyAdmin yourself and keep that
-- file out of git.

-- phpMyAdmin SQL Dump
-- version 5.2.3
-- https://www.phpmyadmin.net/
--
-- Host: localhost:3306
-- Generation Time: Sep 20, 2026 at 09:33 PM
-- Server version: 10.11.18-MariaDB-cll-lve
-- PHP Version: 8.4.24

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `familytree`
--

-- --------------------------------------------------------

--
-- Table structure for table `children`
--

CREATE TABLE `children` (
  `id` int(10) UNSIGNED NOT NULL,
  `marriage_id` int(10) UNSIGNED NOT NULL,
  `child_id` int(10) UNSIGNED NOT NULL,
  `position` smallint(5) UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
--

-- --------------------------------------------------------

--
-- Table structure for table `marriages`
--

CREATE TABLE `marriages` (
  `id` int(10) UNSIGNED NOT NULL,
  `tree_id` int(10) UNSIGNED NOT NULL,
  `person_id` int(10) UNSIGNED NOT NULL,
  `spouse_id` int(10) UNSIGNED NOT NULL,
  `ordinal` tinyint(3) UNSIGNED NOT NULL DEFAULT 1,
  `married_date_text` varchar(60) NOT NULL DEFAULT '',
  `married_year` smallint(6) DEFAULT NULL,
  `married_month` tinyint(4) DEFAULT NULL,
  `married_day` tinyint(4) DEFAULT NULL,
  `married_place` varchar(255) NOT NULL DEFAULT '',
  `married_city` varchar(255) NOT NULL DEFAULT '',
  `married_state` varchar(255) NOT NULL DEFAULT '',
  `married_source` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
--

-- --------------------------------------------------------

--
-- Table structure for table `people`
--

CREATE TABLE `people` (
  `id` int(10) UNSIGNED NOT NULL,
  `tree_id` int(10) UNSIGNED NOT NULL,
  `name` varchar(150) NOT NULL,
  `sex` enum('man','woman','unknown') NOT NULL DEFAULT 'unknown',
  `adopted` tinyint(1) NOT NULL DEFAULT 0,
  `is_placeholder` tinyint(1) NOT NULL DEFAULT 0,
  `birth_date_text` varchar(60) NOT NULL DEFAULT '',
  `birth_year` smallint(6) DEFAULT NULL,
  `birth_month` tinyint(4) DEFAULT NULL,
  `birth_day` tinyint(4) DEFAULT NULL,
  `birthplace_name` varchar(255) NOT NULL DEFAULT '',
  `birth_address1` varchar(255) NOT NULL DEFAULT '',
  `birth_address2` varchar(255) NOT NULL DEFAULT '',
  `birth_city` varchar(255) NOT NULL DEFAULT '',
  `birth_state_province` varchar(255) NOT NULL DEFAULT '',
  `birth_zip_postal_code` varchar(30) NOT NULL DEFAULT '',
  `birth_country` varchar(255) NOT NULL DEFAULT '',
  `birth_source` text DEFAULT NULL,
  `death_date_text` varchar(60) NOT NULL DEFAULT '',
  `death_year` smallint(6) DEFAULT NULL,
  `death_month` tinyint(4) DEFAULT NULL,
  `death_day` tinyint(4) DEFAULT NULL,
  `deathplace_name` varchar(255) NOT NULL DEFAULT '',
  `death_address1` varchar(255) NOT NULL DEFAULT '',
  `death_address2` varchar(255) NOT NULL DEFAULT '',
  `death_city` varchar(255) NOT NULL DEFAULT '',
  `death_state_province` varchar(255) NOT NULL DEFAULT '',
  `death_zip_postal_code` varchar(30) NOT NULL DEFAULT '',
  `death_country` varchar(255) NOT NULL DEFAULT '',
  `death_source` text DEFAULT NULL,
  `buried` text DEFAULT NULL,
  `buried_link` varchar(1000) NOT NULL DEFAULT '',
  `buried_grave` varchar(1000) NOT NULL DEFAULT '',
  `notes` text DEFAULT NULL,
  `linked_tree` varchar(50) NOT NULL DEFAULT '',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
--

-- --------------------------------------------------------

--
-- Table structure for table `trees`
--

CREATE TABLE `trees` (
  `id` int(10) UNSIGNED NOT NULL,
  `slug` varchar(50) NOT NULL,
  `title` varchar(150) NOT NULL,
  `json_file` varchar(100) NOT NULL,
  `root_person_id` int(10) UNSIGNED DEFAULT NULL,
  `changed_at` datetime DEFAULT NULL,
  `rebuilt_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
--
-- The two trees, with no people in them yet.
--
-- Import after the structure. A tree needs a row here before the admin can
-- add anyone to it; root_person_id stays empty until you add the first
-- person and press "Start the chart from this person" on their page.

SET NAMES utf8mb4;

INSERT INTO trees (id, slug, title, json_file, changed_at, rebuilt_at) VALUES
  (1, 'miller', 'Miller Family Tree', 'data.json', NULL, NULL),
  (2, 'horne', 'Horne Family Tree', 'horne.json', NULL, NULL);
-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(10) UNSIGNED NOT NULL,
  `username` varchar(60) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `last_login_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
--

--
-- Indexes for dumped tables
--

--
-- Indexes for table `children`
--
ALTER TABLE `children`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_children_child` (`child_id`),
  ADD KEY `idx_children_marriage` (`marriage_id`);

--
-- Indexes for table `marriages`
--
ALTER TABLE `marriages`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_marriage_person_ordinal` (`person_id`,`ordinal`),
  ADD UNIQUE KEY `uq_marriage_pair` (`person_id`,`spouse_id`),
  ADD KEY `idx_marriages_tree` (`tree_id`),
  ADD KEY `idx_marriages_spouse` (`spouse_id`),
  ADD KEY `idx_marriages_year` (`married_year`);

--
-- Indexes for table `people`
--
ALTER TABLE `people`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_people_tree` (`tree_id`),
  ADD KEY `idx_people_name` (`name`),
  ADD KEY `idx_people_birth_year` (`birth_year`),
  ADD KEY `idx_people_death_year` (`death_year`);

--
-- Indexes for table `trees`
--
ALTER TABLE `trees`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_trees_slug` (`slug`),
  ADD KEY `fk_trees_root` (`root_person_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_users_username` (`username`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `children`
--
ALTER TABLE `children`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=256;

--
-- AUTO_INCREMENT for table `marriages`
--
ALTER TABLE `marriages`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=114;

--
-- AUTO_INCREMENT for table `people`
--
ALTER TABLE `people`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=371;

--
-- AUTO_INCREMENT for table `trees`
--
ALTER TABLE `trees`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `children`
--
ALTER TABLE `children`
  ADD CONSTRAINT `fk_children_child` FOREIGN KEY (`child_id`) REFERENCES `people` (`id`),
  ADD CONSTRAINT `fk_children_marriage` FOREIGN KEY (`marriage_id`) REFERENCES `marriages` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `marriages`
--
ALTER TABLE `marriages`
  ADD CONSTRAINT `fk_marriages_person` FOREIGN KEY (`person_id`) REFERENCES `people` (`id`),
  ADD CONSTRAINT `fk_marriages_spouse` FOREIGN KEY (`spouse_id`) REFERENCES `people` (`id`),
  ADD CONSTRAINT `fk_marriages_tree` FOREIGN KEY (`tree_id`) REFERENCES `trees` (`id`);

--
-- Constraints for table `people`
--
ALTER TABLE `people`
  ADD CONSTRAINT `fk_people_tree` FOREIGN KEY (`tree_id`) REFERENCES `trees` (`id`);

--
-- Constraints for table `trees`
--
ALTER TABLE `trees`
  ADD CONSTRAINT `fk_trees_root` FOREIGN KEY (`root_person_id`) REFERENCES `people` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;