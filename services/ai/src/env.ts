import * as path from "path";
import * as dotenv from "dotenv";

// Load root .env before any NestJS module reads process.env.
// __dirname in compiled dist/env.js = services/ai/dist → ../../../ = project root
dotenv.config({ path: path.join(__dirname, "../../..", ".env") });
