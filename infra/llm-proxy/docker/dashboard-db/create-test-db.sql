-- Runs once, when the dashboard-db volume is first created. The e2e tests
-- (apps/dashboard) use this database so they never touch dev data.
CREATE DATABASE dashboard_test OWNER dashboard;
