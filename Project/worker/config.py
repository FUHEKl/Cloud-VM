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

# IP offset applied to the last octet of the OpenNebula-assigned IP before
# storing it as the SSH host. Some OpenNebula network configurations assign
# the gateway/bridge IP to the NIC and the actual guest IP is +1.
# Set ONE_IP_OFFSET=1 in .env if that matches your setup; leave as 0 (the
# default) if the OpenNebula IP is already the correct guest IP.
ONE_IP_OFFSET = int(os.getenv("ONE_IP_OFFSET", "0"))

# Database
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/pfe")
