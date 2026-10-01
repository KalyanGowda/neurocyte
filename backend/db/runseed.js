import { initDatabase } from "./initDb.js"
import { pool } from "../config/db.js"

try {
  await initDatabase()
} finally {
  await pool.end()
}