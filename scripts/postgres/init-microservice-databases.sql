-- Creates per-service databases for phased isolation rollout.
-- This script runs only during first Postgres initialization (empty data dir).

CREATE DATABASE cloudvm_auth;
CREATE DATABASE cloudvm_user;
CREATE DATABASE cloudvm_vm;
CREATE DATABASE cloudvm_payment;
CREATE DATABASE cloudvm_ai;
