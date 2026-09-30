import dotenv from "dotenv"
import path from "path"
import app from "./app.js"
import { initDatabase } from "./db/initDb.js"
import { pool } from "./config/db.js"

dotenv.config({ path: path.resolve(import.meta.dirname, ".env") })
dotenv.config()

const PORT = parseInt(process.env.PORT || "5001", 10)

async function startServer() {
  try {
    console.log("Connecting to PostgreSQL database and validating schema...")
    await initDatabase()

    const server = app.listen(PORT, () => {
      console.log(
        `🚀 Neurocyte Clinical Backend running at http://localhost:${PORT}`,
      )
    })

    const shutdown = async (signal) => {
      console.log(`\nReceived ${signal}. Shutting down gracefully...`)
      server.close(async () => {
        try {
          await pool.end()
          console.log("PostgreSQL connection pool closed.")
          process.exit(0)
        } catch (err) {
          console.error("Error closing pool:", err)
          process.exit(1)
        }
      })
    }

    process.on("SIGINT", () => shutdown("SIGINT"))
    process.on("SIGTERM", () => shutdown("SIGTERM"))
  } catch (err) {
    console.error("Failed to start Neurocyte backend:", err)
    process.exit(1)
  }
}

startServer()
