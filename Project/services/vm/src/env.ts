import * as path from 'path';
import * as dotenv from 'dotenv';

// Load service-local .env (services/vm/.env) first.
// __dirname in compiled dist/env.js = services/vm/dist → ../ = services/vm
// __dirname in dev/watch src/env.ts = services/vm/src → ../ = services/vm
dotenv.config({ path: path.join(__dirname, '..', '.env') });
