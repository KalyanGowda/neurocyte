import pg from "pg"
import dotenv from "dotenv"
import path from "path"

dotenv.config({ path: path.resolve(import.meta.dirname, "../.env") })
dotenv.config()

const { Pool } = pg

export const pool = new Pool({
  host: process.env.PGHOST || "localhost",
  port: parseInt(process.env.PGPORT || "5432", 10),
  database: process.env.PGDATABASE || "neurocyte_db",
  user: process.env.PGUSER || "kalyan",
  password: process.env.PGPASSWORD || undefined,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

pool.on("error", (err) => {
  console.error("[PostgreSQL Pool Error]:", err.message)
})

export const query = (text, params) => pool.query(text, params)
