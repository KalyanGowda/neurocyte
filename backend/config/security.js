import dotenv from "dotenv"
import path from "node:path"

dotenv.config({ path: path.resolve(import.meta.dirname, "../.env") })
dotenv.config()

if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be configured before starting in production.")
}

export const JWT_SECRET =
  process.env.JWT_SECRET || "neurocyte_local_development_secret_change_me"
