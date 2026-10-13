-- Lets the machine store the voiced briefing and manage its own growth tables.
-- growth_bot still has NO access to the public schema.
alter table growth.briefings add column if not exists headline text;
alter table growth.briefings add column if not exists plan jsonb;
alter table growth.briefings add column if not exists audio bytea;
grant create on schema growth to growth_bot;
