import express from "express"
import cors from "cors"
import path from "path"
import authRoutes from "./routes/authRoutes.js"
import adminRoutes from "./routes/adminRoutes.js"
import patientRoutes from "./routes/patientRoutes.js"
import paymentRoutes from "./routes/paymentRoutes.js"
import suggestionRoutes from "./routes/suggestionRoutes.js"
import statsRoutes from "./routes/statsRoutes.js"

const app = express()

// Middleware
app.use(cors({ origin: true, credentials: true }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Serve uploaded medical reports statically
const uploadsDir = path.resolve(import.meta.dirname, "uploads")
app.use("/uploads", express.static(uploadsDir))

// Healthcheck
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Neurocyte Clinical API",
    timestamp: new Date().toISOString(),
  })
})

// Route registration
app.use("/api/auth", authRoutes)
app.use("/api/admin", adminRoutes)
app.use("/api/patients", patientRoutes)
app.use("/api/patients", paymentRoutes)
app.use("/api/patients", suggestionRoutes)
app.use("/api/stats", statsRoutes)

// 404 handler for API routes
app.use("/api", (req, res) => {
  res
    .status(404)
    .json({ error: `Endpoint ${req.method} ${req.originalUrl} not found.` })
})

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("[API Error]:", err.stack || err.message)
  if (err.name === "MulterError") {
    return res.status(400).json({ error: `File upload error: ${err.message}` })
  }
  res
    .status(500)
    .json({ error: err.message || "An unexpected server error occurred." })
})

export default app
