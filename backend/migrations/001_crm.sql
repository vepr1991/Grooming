CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE SCHEMA IF NOT EXISTS crm;
REVOKE ALL ON SCHEMA crm FROM PUBLIC;
SET search_path TO crm, public;

CREATE TABLE organizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_tg_id bigint NOT NULL UNIQUE,
 name text NOT NULL CHECK (length(name) BETWEEN 2 AND 100), address text NOT NULL DEFAULT '',
 phone text NOT NULL DEFAULT '', timezone text NOT NULL DEFAULT 'Asia/Almaty',
 currency text NOT NULL DEFAULT 'KZT' CHECK (currency IN ('KZT','RUB','USD','EUR')),
 slot_step integer NOT NULL DEFAULT 30 CHECK (slot_step BETWEEN 5 AND 120),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE subscriptions (
 org_id uuid PRIMARY KEY REFERENCES organizations, trial_ends_at timestamptz NOT NULL DEFAULT now()+interval '14 days',
 paid_until timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations,
 tg_id bigint NOT NULL, name text NOT NULL, role text NOT NULL CHECK (role IN ('owner','admin','groomer')),
 active boolean NOT NULL DEFAULT true, bookable boolean NOT NULL DEFAULT true,
 UNIQUE(org_id,tg_id), UNIQUE(org_id,id)
);
CREATE TABLE invitations (
 token_hash text PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations, name text NOT NULL,
 role text NOT NULL CHECK (role IN ('admin','groomer')), expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
 used_by bigint, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE clients (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations,
 name text NOT NULL, phone text NOT NULL, notes text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,phone), UNIQUE(org_id,id)
);
CREATE TABLE pets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations,
 client_id uuid NOT NULL, name text NOT NULL, breed text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '',
 FOREIGN KEY(org_id,client_id) REFERENCES clients(org_id,id), UNIQUE(org_id,id)
);
CREATE TABLE services (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations,
 title text NOT NULL, price_minor bigint NOT NULL CHECK(price_minor >= 0),
 duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 5 AND 480),
 active boolean NOT NULL DEFAULT true, UNIQUE(org_id,id)
);
CREATE TABLE member_services (
 org_id uuid NOT NULL, member_id uuid NOT NULL, service_id uuid NOT NULL,
 PRIMARY KEY(member_id,service_id),
 FOREIGN KEY(org_id,member_id) REFERENCES members(org_id,id),
 FOREIGN KEY(org_id,service_id) REFERENCES services(org_id,id)
);
CREATE TABLE schedules (
 org_id uuid NOT NULL, member_id uuid NOT NULL, weekday integer NOT NULL CHECK(weekday BETWEEN 0 AND 6),
 start_time time NOT NULL, end_time time NOT NULL CHECK(end_time > start_time),
 PRIMARY KEY(member_id,weekday), FOREIGN KEY(org_id,member_id) REFERENCES members(org_id,id)
);
CREATE TABLE schedule_exceptions (
 org_id uuid NOT NULL, member_id uuid NOT NULL, day date NOT NULL,
 start_time time, end_time time,
 CHECK ((start_time IS NULL AND end_time IS NULL) OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)),
 PRIMARY KEY(member_id,day), FOREIGN KEY(org_id,member_id) REFERENCES members(org_id,id)
);
CREATE TABLE appointments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations,
 member_id uuid NOT NULL, client_id uuid, pet_id uuid,
 start_time timestamptz NOT NULL, end_time timestamptz NOT NULL CHECK(end_time > start_time),
 status text NOT NULL CHECK(status IN ('pending','confirmed','completed','canceled','no_show','blocked')),
 total_minor bigint NOT NULL DEFAULT 0 CHECK(total_minor >= 0), reason text NOT NULL DEFAULT '',
 client_tg_id bigint, notification_token_hash text UNIQUE,
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(org_id,member_id) REFERENCES members(org_id,id),
 FOREIGN KEY(org_id,client_id) REFERENCES clients(org_id,id),
 FOREIGN KEY(org_id,pet_id) REFERENCES pets(org_id,id), UNIQUE(org_id,id),
 CHECK ((status='blocked') OR (client_id IS NOT NULL AND pet_id IS NOT NULL) OR status='canceled'),
 EXCLUDE USING gist (member_id WITH =, tstzrange(start_time,end_time,'[)') WITH &&)
 WHERE (status IN ('pending','confirmed','completed','no_show','blocked'))
);
CREATE INDEX appointments_org_time ON appointments(org_id,start_time);
CREATE INDEX appointments_client ON appointments(org_id,client_id);
CREATE TABLE appointment_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, appointment_id uuid NOT NULL,
 service_id uuid NOT NULL, title text NOT NULL, price_minor bigint NOT NULL, duration_minutes integer NOT NULL,
 FOREIGN KEY(org_id,appointment_id) REFERENCES appointments(org_id,id),
 FOREIGN KEY(org_id,service_id) REFERENCES services(org_id,id)
);
CREATE TABLE payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, appointment_id uuid NOT NULL,
 amount_minor bigint NOT NULL CHECK(amount_minor > 0), kind text NOT NULL CHECK(kind IN ('payment','refund')),
 method text NOT NULL CHECK(method IN ('cash','transfer','card')), note text NOT NULL DEFAULT '',
 created_by bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 request_key uuid NOT NULL, UNIQUE(org_id,request_key),
 FOREIGN KEY(org_id,appointment_id) REFERENCES appointments(org_id,id)
);
CREATE TABLE subscription_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations,
 amount_minor bigint NOT NULL CHECK(amount_minor > 0), currency text NOT NULL,
 reference text NOT NULL, request_key uuid NOT NULL UNIQUE, operator_id bigint NOT NULL,
 paid_until timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_log (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations,
 actor_id bigint NOT NULL, action text NOT NULL, entity_id text, details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE booking_requests (
 org_id uuid NOT NULL REFERENCES organizations, request_key uuid NOT NULL, fingerprint text NOT NULL,
 appointment_id uuid NOT NULL REFERENCES appointments, notification_token text NOT NULL,
 PRIMARY KEY(org_id,request_key)
);
CREATE TABLE rate_limits (
 key text PRIMARY KEY, window_start timestamptz NOT NULL DEFAULT now(), hits integer NOT NULL DEFAULT 1
);
CREATE TABLE telegram_updates (id bigint PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE bot_users (tg_id bigint PRIMARY KEY, reachable boolean NOT NULL DEFAULT true);
CREATE TABLE outbox (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, dedupe_key text NOT NULL UNIQUE,
 chat_id bigint NOT NULL, text text NOT NULL, reply_markup jsonb,
 appointment_id uuid REFERENCES appointments, appointment_version integer,
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
 delivered_at timestamptz, failed_at timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_pending ON outbox(available_at) WHERE delivered_at IS NULL AND failed_at IS NULL;
-- Browser/PostgREST roles receive no access, even if this schema is accidentally exposed.
DO $$ DECLARE t record; r text; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='crm' LOOP
   EXECUTE format('ALTER TABLE crm.%I ENABLE ROW LEVEL SECURITY',t.tablename);
   EXECUTE format('REVOKE ALL ON crm.%I FROM PUBLIC',t.tablename);
 END LOOP;
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
     EXECUTE format('REVOKE ALL ON SCHEMA crm FROM %I',r);
     EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA crm FROM %I',r);
   END IF;
 END LOOP;
END $$;
