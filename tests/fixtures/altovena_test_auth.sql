-- PostgreSQL-only CI fixture, never use against a real Supabase project.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (
 id uuid PRIMARY KEY, email text NOT NULL, email_confirmed_at timestamptz
);
INSERT INTO auth.users(id,email,email_confirmed_at)
VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc','owner@example.test',now());
