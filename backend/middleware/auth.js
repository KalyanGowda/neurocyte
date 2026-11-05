import jwt from "jsonwebtoken"
import { query } from "../config/db.js"
import { JWT_SECRET } from "../config/security.js"

export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Access token required." })
  }

  try {
    const token = authHeader.slice("Bearer ".length).trim()
    const decoded = jwt.verify(token, JWT_SECRET)
    const staff = await query(
      `SELECT id, name, email, role, status, is_admin
       FROM staff WHERE id = $1`,
      [decoded.id],
    )

    // Read current authorization from the database so approval/revocation takes
    // effect immediately instead of waiting for a long-lived JWT to expire.
    if (!staff.rows.length || staff.rows[0].status !== "authorized") {
      return res.status(401).json({ error: "This staff account is not authorized." })
    }

    req.user = staff.rows[0]
    next()
  } catch (err) {
    if (err.name !== "JsonWebTokenError" && err.name !== "TokenExpiredError" && err.name !== "NotBeforeError") {
      console.error("Authentication lookup failed:", err.message)
      return res.status(503).json({ error: "Authentication service is temporarily unavailable." })
    }
    return res.status(403).json({ error: "Invalid or expired session token." })
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res
      .status(403)
      .json({ error: "Administrative privileges required." })
  }
  next()
}

export function requireAuthorizedStaff(req, res, next) {
  if (!req.user || req.user.status !== "authorized") {
    return res.status(403).json({ error: "Staff account not authorized." })
  }
  next()
}
