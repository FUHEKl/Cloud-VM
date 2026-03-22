import os
from dotenv import load_dotenv

load_dotenv()

# NATS
NATS_URL = os.getenv("NATS_URL", "nats://localhost:4222")

# Redis
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))

# OpenNebula
ONE_XMLRPC = os.getenv("ONE_XMLRPC", "http://localhost:2633/RPC2")
ONE_USERNAME = os.getenv("ONE_USERNAME", "oneadmin")
ONE_PASSWORD = os.getenv("ONE_PASSWORD", "")

# Database
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/pfe")
