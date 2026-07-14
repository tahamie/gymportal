-- Local PostgreSQL bootstrap for docker-compose.postgres.yml.
-- Production DevOps should create equivalent databases/users in the managed DB platform.

create user gymflow with password 'gymflow_dev_password';

create database gymflow_central owner gymflow;
create database tenant_fitzone_khi owner gymflow;
create database tenant_irontemple_lhr owner gymflow;

grant all privileges on database gymflow_central to gymflow;
grant all privileges on database tenant_fitzone_khi to gymflow;
grant all privileges on database tenant_irontemple_lhr to gymflow;
