import * as path from "path";
import * as dotenv from "dotenv";

// Load service-local .env (services/vm/.env) first, then root .env as fallback.
// dotenv does not overwrite already-set variables by default.
// __dirname in compiled dist/env.js = services/vm/dist
// __dirname in dev/watch src/env.ts = services/vm/src
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "../../..", ".env") });
