-- Disposable CI PostgreSQL only. psql supplies a randomly generated test password
-- through -v ci_password=...; no credentials exist outside the temporary runner.
\set ON_ERROR_STOP on
create role nexus_board_ci_login login inherit nosuperuser nocreatedb nocreaterole nobypassrls password :'ci_password';
grant nexus_task_board_reader to nexus_board_ci_login;
