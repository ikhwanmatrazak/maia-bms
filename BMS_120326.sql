/*
SQLyog Ultimate v11.11 (64 bit)
MySQL - 11.8.2-MariaDB : Database - bms
*********************************************************************
*/

/*!40101 SET NAMES utf8 */;

/*!40101 SET SQL_MODE=''*/;

/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
CREATE DATABASE /*!32312 IF NOT EXISTS*/`bms` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci */;

USE `bms`;

/*Table structure for table `activities` */

DROP TABLE IF EXISTS `activities`;

CREATE TABLE `activities` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `client_id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `type` enum('call','email','meeting','note','quote_sent','invoice_sent','payment_received') NOT NULL,
  `description` text NOT NULL,
  `occurred_at` datetime DEFAULT current_timestamp(),
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `client_id` (`client_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `activities_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `activities_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;

/*Data for the table `activities` */

insert  into `activities`(`id`,`client_id`,`user_id`,`type`,`description`,`occurred_at`,`created_at`) values (1,1,1,'quote_sent','Quotation QT-2026-0001 sent to client','2026-03-05 13:30:19','2026-03-05 21:30:19'),(2,1,1,'quote_sent','Quotation MAQT-2026-0012 sent to client','2026-03-05 22:04:16','2026-03-06 06:04:16'),(3,1,1,'invoice_sent','Invoice MAIV-2026-0001 sent to client','2026-03-05 22:05:27','2026-03-06 06:05:27'),(4,1,1,'payment_received','Payment of MYR 10000 recorded for invoice MAIV-2026-0001','2026-03-05 22:06:38','2026-03-06 06:06:38'),(5,1,1,'quote_sent','Quotation MAQT-2026-0011 sent to client','2026-03-06 01:10:34','2026-03-06 09:10:34'),(6,1,1,'invoice_sent','Invoice MAIV-2026-0003 sent to client','2026-03-06 01:11:04','2026-03-06 09:11:04'),(7,1,1,'invoice_sent','Invoice MAIV-2026-0002 sent to client','2026-03-06 01:13:13','2026-03-06 09:13:13'),(8,1,1,'payment_received','Payment of MYR 0 recorded for invoice MAIV-2026-0003','2026-03-06 01:39:03','2026-03-06 09:39:03'),(9,1,1,'quote_sent','Quotation MAQT-2026-0013 sent to client','2026-03-06 08:35:08','2026-03-06 16:35:08'),(10,1,1,'quote_sent','Quotation MAQT-2026-0014 sent to client','2026-03-06 08:53:50','2026-03-06 16:53:50'),(11,1,1,'quote_sent','Quotation MAQT-2026-0015 sent to client','2026-03-06 19:33:08','2026-03-07 03:33:08'),(12,1,1,'quote_sent','Quotation MAQT-2026-0016 sent to client','2026-03-06 19:36:27','2026-03-07 03:36:27'),(13,1,1,'invoice_sent','Invoice MAIV-2026-0004 sent to client','2026-03-06 19:39:50','2026-03-07 03:39:50'),(14,1,1,'quote_sent','Quotation MAQT-2026-0017 sent to client','2026-03-06 19:43:46','2026-03-07 03:43:46'),(15,1,1,'quote_sent','Quotation MAQT-2026-0019 sent to client','2026-03-07 00:19:21','2026-03-07 08:19:21');

/*Table structure for table `alembic_version` */

DROP TABLE IF EXISTS `alembic_version`;

CREATE TABLE `alembic_version` (
  `version_num` varchar(32) NOT NULL,
  PRIMARY KEY (`version_num`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

/*Data for the table `alembic_version` */

insert  into `alembic_version`(`version_num`) values ('007');

/*Table structure for table `clients` */

DROP TABLE IF EXISTS `clients`;

CREATE TABLE `clients` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `company_name` varchar(255) NOT NULL,
  `contact_person` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `country` varchar(100) DEFAULT NULL,
  `currency` varchar(3) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `status` enum('active','inactive') NOT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp(),
  `tenant_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `created_by` (`created_by`),
  KEY `ix_clients_company_name` (`company_name`),
  KEY `ix_clients_email` (`email`),
  KEY `ix_clients_tenant_id` (`tenant_id`),
  CONSTRAINT `clients_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_clients_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;

/*Data for the table `clients` */

insert  into `clients`(`id`,`company_name`,`contact_person`,`email`,`phone`,`address`,`city`,`country`,`currency`,`notes`,`status`,`created_by`,`created_at`,`updated_at`,`tenant_id`) values (1,'Klinik Aurora Sdn Bhd','Ikhwan','ikhwan@scis.com.my','0123456789','5-3, Galleria Cyberjaya, Jalan Teknokrat 6, Cyber 5, 63000 Cyberjaya','','Malaysia','MYR','','active',1,'2026-03-05 20:56:02','2026-03-06 16:14:45',1),(2,'Mudah HealthTech Sdn Bhd','Felicia','felicia@mudahhealtech.asia','012-2933599','Unit 16-13, Level 16, Q Sentral, Jalan Stesen Sentral 2, 50470 Kuala Lumpur, Wilayah Persekutuan Kuala Lumpur','Kuala Lumpur','Kuala Lumpur','MYR','','active',4,'2026-03-10 17:17:00','2026-03-10 17:17:00',2);

/*Table structure for table `company_settings` */

DROP TABLE IF EXISTS `company_settings`;

CREATE TABLE `company_settings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `logo_url` varchar(500) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `website` varchar(255) DEFAULT NULL,
  `default_currency` varchar(3) NOT NULL,
  `default_payment_terms` int(11) DEFAULT NULL,
  `invoice_prefix` varchar(20) DEFAULT NULL,
  `quotation_prefix` varchar(20) DEFAULT NULL,
  `receipt_prefix` varchar(20) DEFAULT NULL,
  `smtp_host` varchar(255) DEFAULT NULL,
  `smtp_port` int(11) DEFAULT NULL,
  `smtp_user` varchar(255) DEFAULT NULL,
  `smtp_pass_encrypted` text DEFAULT NULL,
  `smtp_from_email` varchar(255) DEFAULT NULL,
  `smtp_from_name` varchar(255) DEFAULT NULL,
  `signature_image_url` varchar(500) DEFAULT NULL,
  `primary_color` varchar(7) DEFAULT NULL,
  `accent_color` varchar(7) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp(),
  `payment_terms_text` text DEFAULT NULL,
  `payment_info` text DEFAULT NULL,
  `sst_no` varchar(50) DEFAULT NULL,
  `bank_name` varchar(255) DEFAULT NULL,
  `bank_account_no` varchar(100) DEFAULT NULL,
  `bank_account_name` varchar(255) DEFAULT NULL,
  `po_prefix` varchar(20) DEFAULT 'PO',
  `do_prefix` varchar(20) DEFAULT 'DO',
  `tenant_id` int(11) DEFAULT NULL,
  `company_registration_no` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_company_settings_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_cs_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;

/*Data for the table `company_settings` */

insert  into `company_settings`(`id`,`name`,`logo_url`,`address`,`phone`,`email`,`website`,`default_currency`,`default_payment_terms`,`invoice_prefix`,`quotation_prefix`,`receipt_prefix`,`smtp_host`,`smtp_port`,`smtp_user`,`smtp_pass_encrypted`,`smtp_from_email`,`smtp_from_name`,`signature_image_url`,`primary_color`,`accent_color`,`created_at`,`updated_at`,`payment_terms_text`,`payment_info`,`sst_no`,`bank_name`,`bank_account_no`,`bank_account_name`,`po_prefix`,`do_prefix`,`tenant_id`,`company_registration_no`) values (1,'MAIA SDN BHD','/uploads/logos/company_logo.png','Educity Iskandar, No. C0.10, Lower Ground, Block A EduCity Complex,\n1, Persiaran Graduan, Kota Ilmu, 79200 Iskandar Puteri, Johor Darul Ta\'zim','0345678911','enquiry@maia.com.my','maia.com.my','MYR',30,'MAIV','MAQT','MART','mail.maia.com.my',465,'finance@maia.com.my','gAAAAABpq23ZHdFKIIqM2weMqqk6btpARyaGeYXOK4qNdMmD4x4OMI_E2_kaHkbIed4yvi5yFUcI73MJQgguBknPUTtY3YiIDQ==','finance@maia.com.my','MAIA SDN BHD',NULL,'#1a1a2e','#16213e','2026-03-05 06:41:52','2026-03-07 08:14:17',NULL,NULL,NULL,'CIMB BANK BERHAD','8605335358','MAIA SDN BHD','PO','DO',1,NULL),(2,'LIGHTNING CLOUD SERVICE AND TRADING','/uploads/logos/company_logo.png','','0149309413','lightclouden.sales@gmail.com','lightningcloud.my','MYR',30,'LCIV','LCQT','LCRCP','',587,'',NULL,'','',NULL,'#1a1a2e','#16213e','2026-03-07 20:22:09','2026-03-11 10:57:24','',NULL,'','Maybank Islamic Berhad','568603085389','LIGHTNING CLOUD SERVICE AND TRADING','PO','DO',2,'003608875-X');

/*Table structure for table `credit_note_items` */

DROP TABLE IF EXISTS `credit_note_items`;

CREATE TABLE `credit_note_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `credit_note_id` int(11) NOT NULL,
  `description` text NOT NULL,
  `quantity` decimal(10,2) NOT NULL DEFAULT 1.00,
  `unit_price` decimal(15,2) NOT NULL DEFAULT 0.00,
  `tax_rate_id` int(11) DEFAULT NULL,
  `tax_amount` decimal(15,2) DEFAULT 0.00,
  `line_total` decimal(15,2) DEFAULT 0.00,
  `sort_order` int(11) DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `credit_note_id` (`credit_note_id`),
  KEY `tax_rate_id` (`tax_rate_id`),
  CONSTRAINT `credit_note_items_ibfk_1` FOREIGN KEY (`credit_note_id`) REFERENCES `credit_notes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `credit_note_items_ibfk_2` FOREIGN KEY (`tax_rate_id`) REFERENCES `tax_rates` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

/*Data for the table `credit_note_items` */

insert  into `credit_note_items`(`id`,`credit_note_id`,`description`,`quantity`,`unit_price`,`tax_rate_id`,`tax_amount`,`line_total`,`sort_order`) values (1,1,'Offsetting of Outstanding Balance Settlement of outstanding debt via provision of Clinic Management System (CMS) setups',1.00,14580.00,NULL,0.00,14580.00,0);

/*Table structure for table `credit_notes` */

DROP TABLE IF EXISTS `credit_notes`;

CREATE TABLE `credit_notes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `tenant_id` int(11) DEFAULT NULL,
  `credit_note_number` varchar(50) NOT NULL,
  `client_id` int(11) NOT NULL,
  `invoice_id` int(11) DEFAULT NULL,
  `status` enum('draft','issued','applied','cancelled') NOT NULL DEFAULT 'draft',
  `currency` varchar(3) NOT NULL DEFAULT 'MYR',
  `issue_date` datetime NOT NULL,
  `reason` text DEFAULT NULL,
  `subtotal` decimal(15,2) DEFAULT 0.00,
  `tax_total` decimal(15,2) DEFAULT 0.00,
  `total` decimal(15,2) DEFAULT 0.00,
  `amount_used` decimal(15,2) DEFAULT 0.00,
  `available_balance` decimal(15,2) DEFAULT 0.00,
  `notes` text DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `credit_note_number` (`credit_note_number`),
  KEY `tenant_id` (`tenant_id`),
  KEY `client_id` (`client_id`),
  KEY `invoice_id` (`invoice_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `credit_notes_ibfk_1` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `credit_notes_ibfk_2` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`),
  CONSTRAINT `credit_notes_ibfk_3` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON DELETE SET NULL,
  CONSTRAINT `credit_notes_ibfk_4` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

/*Data for the table `credit_notes` */

insert  into `credit_notes`(`id`,`tenant_id`,`credit_note_number`,`client_id`,`invoice_id`,`status`,`currency`,`issue_date`,`reason`,`subtotal`,`tax_total`,`total`,`amount_used`,`available_balance`,`notes`,`created_by`,`is_deleted`,`created_at`,`updated_at`) values (1,2,'CN-2026-0001',2,NULL,'issued','MYR','2026-03-10 00:00:00',NULL,14580.00,0.00,14580.00,0.00,14580.00,NULL,4,0,'2026-03-10 17:40:36','2026-03-10 17:40:43');

/*Table structure for table `delivery_order_items` */

DROP TABLE IF EXISTS `delivery_order_items`;

CREATE TABLE `delivery_order_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `delivery_order_id` int(11) NOT NULL,
  `description` text NOT NULL,
  `quantity` decimal(10,2) NOT NULL DEFAULT 1.00,
  `unit` varchar(50) DEFAULT 'pcs',
  `sort_order` int(11) DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `delivery_order_id` (`delivery_order_id`),
  CONSTRAINT `delivery_order_items_ibfk_1` FOREIGN KEY (`delivery_order_id`) REFERENCES `delivery_orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

/*Data for the table `delivery_order_items` */

/*Table structure for table `delivery_orders` */

DROP TABLE IF EXISTS `delivery_orders`;

CREATE TABLE `delivery_orders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `do_number` varchar(50) NOT NULL,
  `client_id` int(11) NOT NULL,
  `status` enum('draft','sent','delivered','cancelled') NOT NULL DEFAULT 'draft',
  `issue_date` datetime NOT NULL,
  `delivery_date` datetime DEFAULT NULL,
  `delivery_address` text DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `sent_at` datetime DEFAULT NULL,
  `delivered_at` datetime DEFAULT NULL,
  `is_deleted` tinyint(1) DEFAULT 0,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `tenant_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `do_number` (`do_number`),
  KEY `client_id` (`client_id`),
  KEY `ix_delivery_orders_tenant_id` (`tenant_id`),
  CONSTRAINT `delivery_orders_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`),
  CONSTRAINT `fk_do_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

/*Data for the table `delivery_orders` */

/*Table structure for table `document_templates` */

DROP TABLE IF EXISTS `document_templates`;

CREATE TABLE `document_templates` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `type` enum('quotation','invoice','receipt') NOT NULL,
  `template_json` text DEFAULT NULL,
  `is_default` tinyint(1) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `tenant_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_doc_tmpl_tenant` (`tenant_id`),
  CONSTRAINT `fk_doc_tmpl_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=29 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;

/*Data for the table `document_templates` */

insert  into `document_templates`(`id`,`name`,`type`,`template_json`,`is_default`,`created_at`,`tenant_id`) values (9,'Professional','quotation','{\"style\": \"professional\"}',0,'2026-03-07 20:32:56',2),(10,'Minimal','quotation','{\"style\": \"minimal\"}',0,'2026-03-07 20:32:56',2),(11,'Professional','invoice','{\"style\": \"professional\"}',1,'2026-03-07 20:32:56',2),(12,'Minimal','invoice','{\"style\": \"minimal\"}',0,'2026-03-07 20:32:56',2),(13,'Professional','receipt','{\"style\": \"professional\"}',1,'2026-03-07 20:32:56',2),(14,'Minimal','receipt','{\"style\": \"minimal\"}',0,'2026-03-07 20:32:56',2),(15,'Professional','quotation','{\"style\": \"professional\"}',0,'2026-03-07 20:38:03',1),(16,'Minimal','quotation','{\"style\": \"minimal\"}',0,'2026-03-07 20:38:03',1),(17,'Professional','invoice','{\"style\": \"professional\"}',1,'2026-03-07 20:38:03',1),(18,'Minimal','invoice','{\"style\": \"minimal\"}',0,'2026-03-07 20:38:03',1),(19,'Professional','receipt','{\"style\": \"professional\"}',1,'2026-03-07 20:38:03',1),(20,'Minimal','receipt','{\"style\": \"minimal\"}',0,'2026-03-07 20:38:03',1),(23,'Professional','invoice','{\"style\": \"professional\"}',1,'2026-03-07 20:45:56',NULL),(25,'Professional','receipt','{\"style\": \"professional\"}',1,'2026-03-07 20:45:56',NULL),(27,'Ali Life - Onboarding Fee','quotation','{\"style\": \"professional\", \"items\": [{\"description\": \"Ali Life - Onboarding Fee (One Time Fee)\", \"quantity\": 1, \"unit_price\": 10000, \"sub_items\": [\"TPA Ecosystem Integration\", \"ALI.AI - Medical Imaging & Driven Data Mapping\", \"Workflow Optimization\", \"System Training\"]}], \"notes\": \"In the event of any error or omission in this document, MAIA Sdn Bhd reserves the right to make any necessary amendment at any time without any obligation.\", \"terms_conditions\": \"\", \"currency\": \"MYR\", \"exchange_rate\": 1, \"discount_amount\": 0, \"expiry_days\": 30, \"due_days\": 0}',1,'2026-03-09 01:21:05',NULL),(28,'Ali Life - Monthly','quotation','{\"style\": \"professional\", \"items\": [{\"description\": \"Ali Life (Monthly License)\", \"quantity\": 1, \"unit_price\": 5000, \"sub_items\": [\"Unlimited AI Claims Processing\", \"Real-time Panel Monitoring\", \"ALI.AI - Medical Imaging, Smart Fraud Detection, Performance Analytics\", \" Cloud Hosting & Maintenance\"]}], \"notes\": \"In the event of any error or omission in this document, MAIA Sdn Bhd reserves the right to make any necessary amendment at any time without any obligation\", \"terms_conditions\": \"\", \"currency\": \"MYR\", \"exchange_rate\": 1, \"discount_amount\": 0, \"expiry_days\": 30, \"due_days\": 0}',0,'2026-03-09 01:26:17',NULL);

/*Table structure for table `email_templates` */

DROP TABLE IF EXISTS `email_templates`;

CREATE TABLE `email_templates` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `doc_type` varchar(50) NOT NULL,
  `subject` varchar(500) NOT NULL,
  `body` text NOT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `tenant_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `doc_type` (`doc_type`),
  KEY `ix_email_templates_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_et_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

/*Data for the table `email_templates` */

insert  into `email_templates`(`id`,`doc_type`,`subject`,`body`,`is_active`,`created_at`,`updated_at`,`tenant_id`) values (1,'quotation','Quotation {{quotation_number}} from {{company_name}}','Dear {{client_name}},\n\nPlease find attached your quotation {{quotation_number}} dated {{issue_date}}.\n\nTotal Amount: {{currency}} {{total}}\nValid Until: {{expiry_date}}\n\nIf you have any questions, please do not hesitate to contact us.\n\nThank you for your business.\n\nBest regards,\n{{company_name}}',1,'2026-03-07 17:44:54','2026-03-07 17:44:54',NULL),(2,'invoice','Invoice {{invoice_number}} from {{company_name}}','Dear {{client_name}},\n\nPlease find attached invoice {{invoice_number}} dated {{issue_date}}.\n\nTotal Amount: {{currency}} {{total}}\nAmount Due: {{currency}} {{balance_due}}\nDue Date: {{due_date}}\n\nPlease make payment by the due date. Thank you.\n\nBest regards,\n{{company_name}}',1,'2026-03-07 17:44:54','2026-03-07 17:44:54',NULL),(3,'receipt','Payment Receipt {{receipt_number}} from {{company_name}}','Dear {{client_name}},\n\nThank you for your payment. Please find attached your payment receipt {{receipt_number}}.\n\nAmount Received: {{currency}} {{amount}}\nPayment Date: {{payment_date}}\nPayment Method: {{payment_method}}\n\nBest regards,\n{{company_name}}',1,'2026-03-07 17:44:54','2026-03-07 17:44:54',NULL),(4,'reminder','Payment Reminder — Invoice {{invoice_number}}','Dear {{client_name}},\n\nThis is a friendly reminder that invoice {{invoice_number}} for {{currency}} {{balance_due}} was due on {{due_date}}.\n\nPlease arrange payment at your earliest convenience.\n\nIf you have already made payment, please disregard this notice.\n\nBest regards,\n{{company_name}}',1,'2026-03-07 17:44:54','2026-03-07 17:44:54',NULL),(5,'renewal','Renewal Notice — {{product_name}}','Dear {{client_name}},\n\nThis is a reminder that your subscription to {{product_name}} is due for renewal on {{next_renewal_date}}.\n\nRenewal Amount: {{currency}} {{amount}}\nBilling Cycle: {{billing_cycle}}\n\nPlease contact us if you have any questions or wish to make changes to your subscription.\n\nThank you for your continued support.\n\nBest regards,\n{{company_name}}',1,'2026-03-07 20:25:16','2026-03-07 20:25:16',NULL);

/*Table structure for table `expense_categories` */

DROP TABLE IF EXISTS `expense_categories`;

CREATE TABLE `expense_categories` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `color` varchar(7) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;

/*Data for the table `expense_categories` */

/*Table structure for table `expenses` */

DROP TABLE IF EXISTS `expenses`;

CREATE TABLE `expenses` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `category_id` int(11) DEFAULT NULL,
  `category` varchar(100) DEFAULT NULL,
  `description` text NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `currency` varchar(3) NOT NULL,
  `exchange_rate` decimal(10,6) DEFAULT NULL,
  `expense_date` datetime NOT NULL,
  `vendor` varchar(255) DEFAULT NULL,
  `receipt_url` varchar(500) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `tenant_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `category_id` (`category_id`),
  KEY `created_by` (`created_by`),
  KEY `ix_expenses_tenant_id` (`tenant_id`),
  CONSTRAINT `expenses_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `expense_categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `expenses_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_expenses_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;

/*Data for the table `expenses` */

/*Table structure for table `invoice_items` */

DROP TABLE IF EXISTS `invoice_items`;

CREATE TABLE `invoice_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `invoice_id` int(11) NOT NULL,
  `description` text NOT NULL,
  `quantity` decimal(10,2) NOT NULL,
  `unit_price` decimal(15,2) NOT NULL,
  `tax_rate_id` int(11) DEFAULT NULL,
  `tax_amount` decimal(15,2) DEFAULT NULL,
  `line_total` decimal(15,2) DEFAULT NULL,
  `sort_order` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `invoice_id` (`invoice_id`),
  KEY `tax_rate_id` (`tax_rate_id`),
  CONSTRAINT `invoice_items_ibfk_1` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON DELETE CASCADE,
  CONSTRAINT `invoice_items_ibfk_2` FOREIGN KEY (`tax_rate_id`) REFERENCES `tax_rates` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;

/*Data for the table `invoice_items` */

insert  into `invoice_items`(`id`,`invoice_id`,`description`,`quantity`,`unit_price`,`tax_rate_id`,`tax_amount`,`line_total`,`sort_order`) values (7,7,'CAST - CMS subscription with Telehealth feature',23.00,1800.00,3,3312.00,44712.00,0),(8,8,'CAST - CMS subscription with Telehealth feature',23.00,1800.00,3,3312.00,44712.00,0),(9,9,'CAST - CMS subscription with Telehealth feature',23.00,1800.00,3,3312.00,44712.00,0),(10,10,'CAST - CMS subscription with Telehealth feature',23.00,1800.00,3,3312.00,44712.00,0);

/*Table structure for table `invoices` */

DROP TABLE IF EXISTS `invoices`;

CREATE TABLE `invoices` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `invoice_number` varchar(50) NOT NULL,
  `quotation_id` int(11) DEFAULT NULL,
  `client_id` int(11) NOT NULL,
  `status` enum('draft','sent','partial','paid','overdue','cancelled') NOT NULL,
  `currency` varchar(3) NOT NULL,
  `exchange_rate` decimal(10,6) DEFAULT NULL,
  `issue_date` datetime NOT NULL,
  `due_date` datetime DEFAULT NULL,
  `subtotal` decimal(15,2) DEFAULT NULL,
  `discount_amount` decimal(15,2) DEFAULT NULL,
  `tax_total` decimal(15,2) DEFAULT NULL,
  `total` decimal(15,2) DEFAULT NULL,
  `amount_paid` decimal(15,2) DEFAULT NULL,
  `balance_due` decimal(15,2) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `terms_conditions` text DEFAULT NULL,
  `template_id` int(11) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `sent_at` datetime DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp(),
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `payment_terms` text DEFAULT NULL,
  `tenant_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `invoice_number` (`invoice_number`),
  KEY `quotation_id` (`quotation_id`),
  KEY `client_id` (`client_id`),
  KEY `template_id` (`template_id`),
  KEY `created_by` (`created_by`),
  KEY `ix_invoices_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_invoices_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `invoices_ibfk_1` FOREIGN KEY (`quotation_id`) REFERENCES `quotations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `invoices_ibfk_2` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`),
  CONSTRAINT `invoices_ibfk_3` FOREIGN KEY (`template_id`) REFERENCES `document_templates` (`id`) ON DELETE SET NULL,
  CONSTRAINT `invoices_ibfk_4` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;

/*Data for the table `invoices` */

insert  into `invoices`(`id`,`invoice_number`,`quotation_id`,`client_id`,`status`,`currency`,`exchange_rate`,`issue_date`,`due_date`,`subtotal`,`discount_amount`,`tax_total`,`total`,`amount_paid`,`balance_due`,`notes`,`terms_conditions`,`template_id`,`created_by`,`sent_at`,`paid_at`,`created_at`,`updated_at`,`is_deleted`,`payment_terms`,`tenant_id`) values (7,'LCINV-2026-0007',NULL,2,'draft','MYR',1.000000,'2026-03-10 00:00:00',NULL,41400.00,0.00,3312.00,44712.00,0.00,44712.00,'In the event of any error or omission in this document, Lightning Cloud reserves the right to make any necessary amendment at any time without any obligation.','',NULL,4,NULL,NULL,'2026-03-10 21:33:05','2026-03-10 21:33:05',0,'',2),(8,'LCIV-2026-0002',NULL,2,'draft','MYR',1.000000,'2026-03-11 00:00:00',NULL,41400.00,0.00,3312.00,44712.00,0.00,44712.00,'In the event of any error or omission in this document, Lightning Cloud reserves the right to make any necessary amendment at any time without any obligation.','',NULL,4,NULL,NULL,'2026-03-11 10:46:43','2026-03-11 10:46:43',0,'',2),(9,'LCIV-2026-0003',NULL,2,'draft','MYR',1.000000,'2026-03-11 00:00:00',NULL,41400.00,0.00,3312.00,44712.00,0.00,44712.00,'In the event of any error or omission in this document, Lightning Cloud reserves the right to make any necessary amendment at any time without any obligation.','',NULL,4,NULL,NULL,'2026-03-11 10:56:40','2026-03-11 10:56:40',0,'',2),(10,'LCIV-2026-0004',NULL,2,'draft','MYR',1.000000,'2026-03-11 00:00:00',NULL,41400.00,0.00,3312.00,44712.00,0.00,44712.00,'In the event of any error or omission in this document, Lightning Cloud reserves the right to make any necessary amendment at any time without any obligation.','',NULL,4,NULL,NULL,'2026-03-11 10:57:52','2026-03-11 10:57:52',0,'',2);

/*Table structure for table `payments` */

DROP TABLE IF EXISTS `payments`;

CREATE TABLE `payments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `invoice_id` int(11) NOT NULL,
  `receipt_id` int(11) DEFAULT NULL,
  `amount` decimal(15,2) NOT NULL,
  `currency` varchar(3) NOT NULL,
  `payment_date` datetime NOT NULL,
  `payment_method` enum('cash','bank_transfer','cheque','online','other') NOT NULL,
  `reference_number` varchar(100) DEFAULT NULL,
  `proof_file_url` varchar(500) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `recorded_by` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `invoice_id` (`invoice_id`),
  KEY `receipt_id` (`receipt_id`),
  KEY `recorded_by` (`recorded_by`),
  CONSTRAINT `payments_ibfk_1` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON DELETE CASCADE,
  CONSTRAINT `payments_ibfk_2` FOREIGN KEY (`receipt_id`) REFERENCES `receipts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `payments_ibfk_3` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;

/*Data for the table `payments` */

/*Table structure for table `product_pricing` */

DROP TABLE IF EXISTS `product_pricing`;

CREATE TABLE `product_pricing` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `product_id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `billing_cycle` enum('one_time','monthly','quarterly','annually') NOT NULL DEFAULT 'one_time',
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `ix_product_pricing_product_id` (`product_id`),
  CONSTRAINT `fk_pricing_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

/*Data for the table `product_pricing` */

insert  into `product_pricing`(`id`,`product_id`,`name`,`description`,`amount`,`billing_cycle`,`sort_order`,`created_at`) values (1,1,'Onboarding Fee','One time fee for configuring, onboarding',10000.00,'one_time',0,'2026-03-07 11:19:25'),(2,1,'Licensing Fee','Fee per license ',5000.00,'monthly',1,'2026-03-07 11:20:46');

/*Table structure for table `product_subscriptions` */

DROP TABLE IF EXISTS `product_subscriptions`;

CREATE TABLE `product_subscriptions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `tenant_id` int(11) DEFAULT NULL,
  `product_id` int(11) NOT NULL,
  `client_id` int(11) NOT NULL,
  `start_date` datetime NOT NULL,
  `next_renewal_date` datetime DEFAULT NULL,
  `billing_cycle` enum('one_time','monthly','quarterly','annually') NOT NULL,
  `amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `status` enum('active','paused','cancelled') NOT NULL DEFAULT 'active',
  `notes` text DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `ix_product_subscriptions_tenant_id` (`tenant_id`),
  KEY `ix_product_subscriptions_product_id` (`product_id`),
  KEY `ix_product_subscriptions_client_id` (`client_id`),
  CONSTRAINT `fk_psub_client` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`),
  CONSTRAINT `fk_psub_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_psub_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

/*Data for the table `product_subscriptions` */

insert  into `product_subscriptions`(`id`,`tenant_id`,`product_id`,`client_id`,`start_date`,`next_renewal_date`,`billing_cycle`,`amount`,`status`,`notes`,`created_at`,`updated_at`) values (1,NULL,1,1,'2026-03-01 00:00:00','2026-04-01 00:00:00','monthly',5000.00,'active',NULL,'2026-03-07 20:06:00','2026-03-07 20:06:00'),(2,NULL,1,1,'2026-03-07 00:00:00',NULL,'one_time',10000.00,'active',NULL,'2026-03-07 20:19:40','2026-03-07 20:19:40');

/*Table structure for table `products` */

DROP TABLE IF EXISTS `products`;

CREATE TABLE `products` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `tenant_id` int(11) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `unit_price` decimal(15,2) NOT NULL DEFAULT 0.00,
  `currency` varchar(3) NOT NULL DEFAULT 'MYR',
  `unit_label` varchar(50) DEFAULT NULL,
  `billing_cycle` enum('one_time','monthly','quarterly','annually') NOT NULL DEFAULT 'one_time',
  `category` varchar(100) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `email_subject` varchar(500) DEFAULT NULL,
  `email_body` text DEFAULT NULL,
  `document_template_id` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `ix_products_tenant_id` (`tenant_id`),
  KEY `fk_products_template` (`document_template_id`),
  CONSTRAINT `fk_products_template` FOREIGN KEY (`document_template_id`) REFERENCES `document_templates` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_products_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

/*Data for the table `products` */

insert  into `products`(`id`,`tenant_id`,`name`,`description`,`unit_price`,`currency`,`unit_label`,`billing_cycle`,`category`,`is_active`,`email_subject`,`email_body`,`document_template_id`,`created_at`,`updated_at`) values (1,NULL,'ALI Life','AI Powered TPA Panel Claim Tools',5000.00,'MYR','Monthly','monthly','SAAS',1,NULL,NULL,NULL,'2026-03-07 11:06:05','2026-03-07 17:41:54');

/*Table structure for table `prospects` */

DROP TABLE IF EXISTS `prospects`;

CREATE TABLE `prospects` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `tenant_id` int(11) DEFAULT NULL,
  `company_name` varchar(255) NOT NULL,
  `contact_person` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `stage` enum('lead','qualified','proposal','negotiation','won','lost') NOT NULL DEFAULT 'lead',
  `expected_value` decimal(15,2) DEFAULT NULL,
  `currency` varchar(3) NOT NULL DEFAULT 'MYR',
  `source` enum('referral','website','social_media','cold_call','exhibition','existing_client','other') DEFAULT NULL,
  `expected_close_date` date DEFAULT NULL,
  `probability` int(11) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `lost_reason` text DEFAULT NULL,
  `assigned_to` int(11) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `is_converted` tinyint(1) NOT NULL DEFAULT 0,
  `converted_client_id` int(11) DEFAULT NULL,
  `converted_at` datetime(6) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_prospects_id` (`id`),
  KEY `ix_prospects_tenant_id` (`tenant_id`),
  KEY `fk_prospects_assigned` (`assigned_to`),
  KEY `fk_prospects_created` (`created_by`),
  KEY `fk_prospects_client` (`converted_client_id`),
  CONSTRAINT `fk_prospects_assigned` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_prospects_client` FOREIGN KEY (`converted_client_id`) REFERENCES `clients` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_prospects_created` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_prospects_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

/*Data for the table `prospects` */

insert  into `prospects`(`id`,`tenant_id`,`company_name`,`contact_person`,`email`,`phone`,`address`,`stage`,`expected_value`,`currency`,`source`,`expected_close_date`,`probability`,`notes`,`lost_reason`,`assigned_to`,`created_by`,`is_converted`,`converted_client_id`,`converted_at`,`created_at`,`updated_at`) values (2,NULL,'Poliklinik Ar-Razi','','','','','lead',NULL,'MYR',NULL,NULL,NULL,'',NULL,NULL,1,0,NULL,NULL,'2026-03-09 03:14:25.717916','2026-03-09 03:14:25.717920'),(3,NULL,'Klinik As-Salam','','','','','lead',NULL,'MYR',NULL,NULL,NULL,'',NULL,NULL,1,0,NULL,NULL,'2026-03-09 03:14:43.749376','2026-03-09 03:14:43.749381'),(4,NULL,'Klinik Zalfah','','','','','lead',NULL,'MYR',NULL,NULL,NULL,'',NULL,NULL,1,0,NULL,NULL,'2026-03-09 03:14:50.601064','2026-03-09 03:14:50.601067'),(5,NULL,'Klinik Dr Ana','','','','','lead',NULL,'MYR',NULL,NULL,NULL,'',NULL,NULL,1,0,NULL,NULL,'2026-03-09 03:14:58.270488','2026-03-09 03:14:58.270492'),(6,NULL,'Klinik Dr Najwa','','','','','lead',NULL,'MYR',NULL,NULL,NULL,'',NULL,NULL,1,0,NULL,NULL,'2026-03-09 03:15:10.040130','2026-03-09 03:15:10.040136'),(7,NULL,'Klinik Penawar','','','','','negotiation',NULL,'MYR',NULL,NULL,NULL,'',NULL,NULL,1,0,NULL,NULL,'2026-03-09 03:18:40.289489','2026-03-09 06:48:32.152159'),(8,NULL,'Poliklinik Alam Syifa','','','','','lead',NULL,'MYR',NULL,NULL,NULL,'',NULL,NULL,1,0,NULL,NULL,'2026-03-09 03:18:52.384759','2026-03-09 03:18:52.384765'),(9,NULL,'Klinik Warga','','','','','lead',NULL,'MYR',NULL,NULL,NULL,'',NULL,NULL,1,0,NULL,NULL,'2026-03-09 03:19:28.216426','2026-03-09 03:19:28.216435'),(10,NULL,'Klinik Primamedik','','','','','lead',NULL,'MYR',NULL,NULL,NULL,'',NULL,NULL,1,0,NULL,NULL,'2026-03-09 03:19:56.966055','2026-03-09 03:19:56.966058');

/*Table structure for table `purchase_order_items` */

DROP TABLE IF EXISTS `purchase_order_items`;

CREATE TABLE `purchase_order_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `purchase_order_id` int(11) NOT NULL,
  `description` text NOT NULL,
  `quantity` decimal(10,2) NOT NULL DEFAULT 1.00,
  `unit_price` decimal(15,2) NOT NULL DEFAULT 0.00,
  `tax_rate_id` int(11) DEFAULT NULL,
  `tax_amount` decimal(15,2) DEFAULT 0.00,
  `line_total` decimal(15,2) DEFAULT 0.00,
  `sort_order` int(11) DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `purchase_order_id` (`purchase_order_id`),
  CONSTRAINT `purchase_order_items_ibfk_1` FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

/*Data for the table `purchase_order_items` */

/*Table structure for table `purchase_orders` */

DROP TABLE IF EXISTS `purchase_orders`;

CREATE TABLE `purchase_orders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `po_number` varchar(50) NOT NULL,
  `vendor_name` varchar(255) NOT NULL,
  `vendor_email` varchar(255) DEFAULT NULL,
  `vendor_phone` varchar(100) DEFAULT NULL,
  `vendor_address` text DEFAULT NULL,
  `status` enum('draft','sent','received','cancelled') NOT NULL DEFAULT 'draft',
  `currency` varchar(3) NOT NULL DEFAULT 'MYR',
  `exchange_rate` decimal(10,6) DEFAULT 1.000000,
  `issue_date` datetime NOT NULL,
  `expected_delivery_date` datetime DEFAULT NULL,
  `subtotal` decimal(15,2) DEFAULT 0.00,
  `discount_amount` decimal(15,2) DEFAULT 0.00,
  `tax_total` decimal(15,2) DEFAULT 0.00,
  `total` decimal(15,2) DEFAULT 0.00,
  `notes` text DEFAULT NULL,
  `terms_conditions` text DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `sent_at` datetime DEFAULT NULL,
  `received_at` datetime DEFAULT NULL,
  `is_deleted` tinyint(1) DEFAULT 0,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `tenant_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `po_number` (`po_number`),
  KEY `ix_purchase_orders_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_po_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

/*Data for the table `purchase_orders` */

/*Table structure for table `quotation_items` */

DROP TABLE IF EXISTS `quotation_items`;

CREATE TABLE `quotation_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `quotation_id` int(11) NOT NULL,
  `description` text NOT NULL,
  `quantity` decimal(10,2) NOT NULL,
  `unit_price` decimal(15,2) NOT NULL,
  `tax_rate_id` int(11) DEFAULT NULL,
  `tax_amount` decimal(15,2) DEFAULT NULL,
  `line_total` decimal(15,2) DEFAULT NULL,
  `sort_order` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `quotation_id` (`quotation_id`),
  KEY `tax_rate_id` (`tax_rate_id`),
  CONSTRAINT `quotation_items_ibfk_1` FOREIGN KEY (`quotation_id`) REFERENCES `quotations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `quotation_items_ibfk_2` FOREIGN KEY (`tax_rate_id`) REFERENCES `tax_rates` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;

/*Data for the table `quotation_items` */

/*Table structure for table `quotations` */

DROP TABLE IF EXISTS `quotations`;

CREATE TABLE `quotations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `quotation_number` varchar(50) NOT NULL,
  `client_id` int(11) NOT NULL,
  `status` enum('draft','sent','accepted','rejected','expired') NOT NULL,
  `currency` varchar(3) NOT NULL,
  `exchange_rate` decimal(10,6) DEFAULT NULL,
  `issue_date` datetime NOT NULL,
  `expiry_date` datetime DEFAULT NULL,
  `subtotal` decimal(15,2) DEFAULT NULL,
  `discount_amount` decimal(15,2) DEFAULT NULL,
  `tax_total` decimal(15,2) DEFAULT NULL,
  `total` decimal(15,2) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `terms_conditions` text DEFAULT NULL,
  `template_id` int(11) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `sent_at` datetime DEFAULT NULL,
  `accepted_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp(),
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `payment_terms` text DEFAULT NULL,
  `tenant_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `quotation_number` (`quotation_number`),
  KEY `client_id` (`client_id`),
  KEY `template_id` (`template_id`),
  KEY `created_by` (`created_by`),
  KEY `ix_quotations_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_quotations_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `quotations_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`),
  CONSTRAINT `quotations_ibfk_2` FOREIGN KEY (`template_id`) REFERENCES `document_templates` (`id`) ON DELETE SET NULL,
  CONSTRAINT `quotations_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;

/*Data for the table `quotations` */

/*Table structure for table `receipts` */

DROP TABLE IF EXISTS `receipts`;

CREATE TABLE `receipts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `receipt_number` varchar(50) NOT NULL,
  `invoice_id` int(11) NOT NULL,
  `client_id` int(11) NOT NULL,
  `currency` varchar(3) NOT NULL,
  `exchange_rate` decimal(10,6) DEFAULT NULL,
  `amount` decimal(15,2) NOT NULL,
  `payment_method` enum('cash','bank_transfer','cheque','online','other') NOT NULL,
  `payment_date` datetime NOT NULL,
  `notes` text DEFAULT NULL,
  `template_id` int(11) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `sent_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `tenant_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `receipt_number` (`receipt_number`),
  KEY `invoice_id` (`invoice_id`),
  KEY `client_id` (`client_id`),
  KEY `template_id` (`template_id`),
  KEY `created_by` (`created_by`),
  KEY `ix_receipts_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_receipts_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `receipts_ibfk_1` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`),
  CONSTRAINT `receipts_ibfk_2` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`),
  CONSTRAINT `receipts_ibfk_3` FOREIGN KEY (`template_id`) REFERENCES `document_templates` (`id`) ON DELETE SET NULL,
  CONSTRAINT `receipts_ibfk_4` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;

/*Data for the table `receipts` */

/*Table structure for table `refresh_tokens` */

DROP TABLE IF EXISTS `refresh_tokens`;

CREATE TABLE `refresh_tokens` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `token_hash` varchar(255) NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `ix_refresh_tokens_token_hash` (`token_hash`),
  CONSTRAINT `refresh_tokens_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=92 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;

/*Data for the table `refresh_tokens` */

insert  into `refresh_tokens`(`id`,`user_id`,`token_hash`,`expires_at`,`created_at`) values (1,1,'da91533d5170a00d9c360fb9c456a60d258c58a0c347ecc4f68ffcf8b02c30a9','2026-03-12 08:39:41','2026-03-05 16:39:41'),(2,1,'9d587b9a7649240d9e2a997975cad2c0a4ed67be444ec9cbeaee96b7dd4c2663','2026-03-12 08:39:43','2026-03-05 16:39:43'),(38,1,'00067caf7a77d1a859077e5823d084af0174140f9532c32e1deef79aa6cf6e16','2026-03-13 19:39:40','2026-03-07 03:39:40'),(64,1,'9fd75eb96e6c792648d5fa7f2774cf5dc9a1edd43f527490f9b2c60f9916385e','2026-03-15 22:34:59','2026-03-09 06:34:59'),(70,1,'7fce1d98201251a0458b337c491d9ec24c63483d48b8d8cad6460655e4943263','2026-03-16 00:19:23','2026-03-09 08:19:23'),(79,1,'9d46fa32f7bfa3ba98d353ad9bd55075eeab186c280f52b2a343fb7b3397c501','2026-03-17 07:26:25','2026-03-10 15:26:25'),(91,4,'6817beaff707c4f3e08aa01dc93750b0c2227a5a81f49573fc3cec83a035696c','2026-03-19 01:20:40','2026-03-12 09:20:40');

/*Table structure for table `reminders` */

DROP TABLE IF EXISTS `reminders`;

CREATE TABLE `reminders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `client_id` int(11) DEFAULT NULL,
  `user_id` int(11) NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `due_date` datetime NOT NULL,
  `is_completed` tinyint(1) DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `priority` enum('low','medium','high') NOT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `tenant_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `client_id` (`client_id`),
  KEY `user_id` (`user_id`),
  KEY `ix_reminders_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_reminders_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `reminders_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `reminders_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;

/*Data for the table `reminders` */

/*Table structure for table `tax_rates` */

DROP TABLE IF EXISTS `tax_rates`;

CREATE TABLE `tax_rates` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `rate` decimal(5,2) NOT NULL,
  `is_default` tinyint(1) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `tenant_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_tax_rates_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_tax_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;

/*Data for the table `tax_rates` */

insert  into `tax_rates`(`id`,`name`,`rate`,`is_default`,`is_active`,`created_at`,`tenant_id`) values (1,'SST 6%',6.00,1,1,'2026-03-05 06:41:52',1),(2,'Exempt',0.00,0,1,'2026-03-05 06:41:53',1),(3,'SST 8%',8.00,0,1,'2026-03-05 06:41:53',1);

/*Table structure for table `tenants` */

DROP TABLE IF EXISTS `tenants`;

CREATE TABLE `tenants` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `slug` varchar(100) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `plan` varchar(50) DEFAULT 'standard',
  `notes` text DEFAULT NULL,
  `created_at` datetime(6) DEFAULT current_timestamp(6),
  `updated_at` datetime(6) DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`),
  KEY `ix_tenants_slug` (`slug`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

/*Data for the table `tenants` */

insert  into `tenants`(`id`,`name`,`slug`,`is_active`,`plan`,`notes`,`created_at`,`updated_at`) values (1,'MAIA SDN BHD','default',1,'standard','','2026-03-07 08:08:29.459169','2026-03-07 20:45:10.000000'),(2,'LIGHTNING CLOUD SERVICE AND TRADING','admin@lightningcloud.my',1,'standard','','2026-03-07 20:22:09.055931','2026-03-10 15:28:42.000000');

/*Table structure for table `users` */

DROP TABLE IF EXISTS `users`;

CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('admin','manager','staff') NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp(),
  `tenant_id` int(11) DEFAULT NULL,
  `is_super_admin` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ix_users_email` (`email`),
  KEY `ix_users_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_users_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;

/*Data for the table `users` */

insert  into `users`(`id`,`name`,`email`,`password_hash`,`role`,`is_active`,`created_at`,`updated_at`,`tenant_id`,`is_super_admin`) values (1,'Admin User','admin@maia.com.my','$2b$12$kXThTLnf653X/Fy67P9W6.8ycT6yZiMOy7VI1HX4g1Ce5cLbTrylW','admin',1,'2026-03-05 06:41:53','2026-03-09 07:47:49',1,0),(2,'Sarah Manager','sarah@maia.com.my','$2b$12$rJWOpu4kXAfcsYJDAMEgButNfez0McMnfLo5MbARXNzafs9Zks4/C','manager',1,'2026-03-05 20:41:17','2026-03-05 20:41:17',1,0),(3,'John Staff','john@maia.com.my','$2b$12$sdw.4/yp2STe8VgbY1gQZufiTU7r8mUYOM4SEgE0zQVuNVyCGdjxO','staff',1,'2026-03-05 20:41:17','2026-03-05 20:41:17',1,0),(4,'Iwan','admin@lightningcloud.my','$2b$12$.zUfm3P1BCzcWcNL4ntize76C3nNxigLzZzcv42Alzeulejyb34vG','admin',1,'2026-03-07 20:22:09','2026-03-07 20:22:09',2,0);

/*Table structure for table `vendors` */

DROP TABLE IF EXISTS `vendors`;

CREATE TABLE `vendors` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `tenant_id` int(11) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `contact_person` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `state` varchar(100) DEFAULT NULL,
  `country` varchar(100) DEFAULT 'Malaysia',
  `postal_code` varchar(20) DEFAULT NULL,
  `payment_terms` varchar(255) DEFAULT NULL,
  `bank_name` varchar(255) DEFAULT NULL,
  `bank_account_number` varchar(100) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(6) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_vendors_id` (`id`),
  KEY `ix_vendors_tenant_id` (`tenant_id`),
  CONSTRAINT `fk_vendors_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

/*Data for the table `vendors` */

insert  into `vendors`(`id`,`tenant_id`,`name`,`contact_person`,`email`,`phone`,`address`,`city`,`state`,`country`,`postal_code`,`payment_terms`,`bank_name`,`bank_account_number`,`notes`,`is_active`,`created_at`,`updated_at`) values (1,NULL,'Wajashi','Akmal','akmal@wajashi.com.my','014992881','No 31, Jalan Dang Anum 13','Bandar Baru Bangi','Selangor','Malaysia','43650','Net 14','Maybank','1113310909123841','',1,'2026-03-08 23:53:33.346281','2026-03-08 23:53:33.346301');

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
