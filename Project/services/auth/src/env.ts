import * as path from "path";
import * as dotenv from "dotenv";

// Load root .env before any NestJS module reads process.env.
// This file MUST be the first import in main.ts.
// __dirname in compiled dist/env.js = services/auth/dist → ../../../ = project root
dotenv.config({ path: path.join(__dirname, "../../..", ".env") });
