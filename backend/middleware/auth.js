import jwt from "jsonwebtoken"

const JWT_SECRET =
  process.env.JWT_SECRET || "neurocyte_clinical_jwt_secret_key_2026_secure"

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Access token required." })
  }

  const token = authHeader.split(" ")[1]
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch (err) {
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
