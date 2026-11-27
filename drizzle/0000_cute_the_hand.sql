CREATE TYPE "public"."alert_reason" AS ENUM('best_drop', 'brs_within_bhx', 'new_deal', 'deal_expiring', 'seller_unhealthy', 'digest');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."deal_source" AS ENUM('topcashback', 'quidco', 'blue_light_card', 'student_beans', 'mse', 'hotukdeals');--> statement-breakpoint
CREATE TYPE "public"."deal_type" AS ENUM('code', 'cashback', 'sale');--> statement-breakpoint
CREATE TYPE "public"."price_basis" AS ENUM('total', 'per_person');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'ok', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."run_trigger" AS ENUM('schedule', 'manual', 'canary');--> statement-breakpoint
CREATE TYPE "public"."seller_run_status" AS ENUM('running', 'ok', 'captcha', 'blocked', 'error', 'parse_failed', 'unavailable', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."tri_state" AS ENUM('included', 'extra', 'unknown');--> statement-breakpoint
CREATE TABLE "airport_cost" (
	"airport_code" char(3) PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"travel_mode" text NOT NULL,
	"travel_cost_pence" integer NOT NULL,
	"parking_cost_pence" integer NOT NULL,
	"drive_home_minutes" integer NOT NULL,
	"overnight_hotel_pence" integer NOT NULL,
	"timezone" text DEFAULT 'Europe/London' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "alert_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"reason" "alert_reason" NOT NULL,
	"quote_id" integer,
	"deal_id" integer,
	"run_id" uuid,
	"dedupe_key" text NOT NULL,
	"status" "alert_status" DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "deal_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"seller_id" text NOT NULL,
	"source" "deal_source" NOT NULL,
	"type" "deal_type" NOT NULL,
	"code_or_title" text NOT NULL,
	"value_pence" integer,
	"value_bps" integer,
	"conditions" text,
	"min_spend_pence" integer,
	"cap_pence" integer,
	"expires_at" timestamp with time zone,
	"stacks_with_cashback" boolean,
	"new_customer_only" boolean,
	"voids_cashback" boolean,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_natural_key" UNIQUE NULLS NOT DISTINCT("seller_id","source","type","code_or_title","expires_at")
);
--> statement-breakpoint
CREATE TABLE "price_observation" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "price_observation_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"quote_id" integer NOT NULL,
	"run_id" uuid NOT NULL,
	"headline_price_pence" integer NOT NULL,
	"true_cost_pence" integer,
	"conservative_true_cost_pence" integer,
	"calc_version" text,
	"breakdown" jsonb,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "quote_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"search_id" integer NOT NULL,
	"seller_id" text NOT NULL,
	"airport_code" char(3) NOT NULL,
	"depart_date" date NOT NULL,
	"nights" integer NOT NULL,
	"room_setup_key" text NOT NULL,
	"party_variant" text NOT NULL,
	"room_name" text DEFAULT '' NOT NULL,
	"headline_price_pence" integer NOT NULL,
	"price_basis" "price_basis" NOT NULL,
	"bags_status" "tri_state" DEFAULT 'unknown' NOT NULL,
	"bag_cost_pence" integer,
	"transfers_status" "tri_state" DEFAULT 'unknown' NOT NULL,
	"transfer_cost_pence" integer,
	"infant_fee_status" "tri_state" DEFAULT 'unknown' NOT NULL,
	"infant_fee_pence" integer,
	"out_dep_local" timestamp,
	"out_dep_airport" char(3),
	"out_arr_local" timestamp,
	"out_arr_airport" char(3),
	"ret_dep_local" timestamp,
	"ret_dep_airport" char(3),
	"ret_arr_local" timestamp,
	"ret_arr_airport" char(3),
	"direct" boolean NOT NULL,
	"url" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_headline_price_positive" CHECK ("quote"."headline_price_pence" > 0)
);
--> statement-breakpoint
CREATE TABLE "room_setup" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "room_setup_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"search_id" integer NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"rooms" integer NOT NULL,
	"room_type" text NOT NULL,
	"occupancy" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "room_setup_search_key" UNIQUE("search_id","key")
);
--> statement-breakpoint
CREATE TABLE "run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger" "run_trigger" NOT NULL,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"resolved_sellers" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "search" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "search_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"hotel_name" text NOT NULL,
	"hotel_location" text NOT NULL,
	"board_basis" text NOT NULL,
	"nights" integer NOT NULL,
	"depart_from" date NOT NULL,
	"depart_to" date NOT NULL,
	"max_price_pence" integer,
	"alert_rules" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "search_airport" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "search_airport_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"search_id" integer NOT NULL,
	"airport_code" char(3) NOT NULL,
	"preference" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "search_airport_search_code" UNIQUE("search_id","airport_code")
);
--> statement-breakpoint
CREATE TABLE "search_party" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "search_party_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"search_id" integer NOT NULL,
	"variant" text NOT NULL,
	"adults" integer NOT NULL,
	"child_ages" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"infants" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "search_party_search_variant" UNIQUE("search_id","variant")
);
--> statement-breakpoint
CREATE TABLE "seller" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"blocked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seller_run" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "seller_run_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"run_id" uuid NOT NULL,
	"seller_id" text NOT NULL,
	"status" "seller_run_status" NOT NULL,
	"jobs_planned" integer DEFAULT 0 NOT NULL,
	"jobs_ok" integer DEFAULT 0 NOT NULL,
	"quotes_found" integer DEFAULT 0 NOT NULL,
	"dropped_non_direct" integer DEFAULT 0 NOT NULL,
	"unavailable_count" integer DEFAULT 0 NOT NULL,
	"error_detail" text,
	"artefact_path" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_quote_id_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quote"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_seller_id_seller_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."seller"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_observation" ADD CONSTRAINT "price_observation_quote_id_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quote"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_observation" ADD CONSTRAINT "price_observation_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_search_id_search_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."search"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_seller_id_seller_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."seller"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_setup" ADD CONSTRAINT "room_setup_search_id_search_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."search"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_airport" ADD CONSTRAINT "search_airport_search_id_search_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."search"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_party" ADD CONSTRAINT "search_party_search_id_search_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."search"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_run" ADD CONSTRAINT "seller_run_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_run" ADD CONSTRAINT "seller_run_seller_id_seller_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."seller"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alert_dedupe_sent" ON "alert" USING btree ("dedupe_key","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "price_observation_quote_run" ON "price_observation" USING btree ("quote_id","run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_natural_key" ON "quote" USING btree ("search_id","seller_id","airport_code","depart_date","nights","room_setup_key","party_variant","room_name");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_run_run_seller" ON "seller_run" USING btree ("run_id","seller_id");