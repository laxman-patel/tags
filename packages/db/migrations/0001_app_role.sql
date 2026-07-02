-- Application role that cannot bypass RLS (used by app + isolation tests)

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tags_app') THEN
    CREATE ROLE tags_app WITH LOGIN PASSWORD 'tags_app' NOBYPASSRLS;
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO tags_app', current_database());
END
$$;
GRANT USAGE ON SCHEMA public TO tags_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tags_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tags_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tags_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO tags_app;
