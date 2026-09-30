import express from "express"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { query } from "../config/db.js"
import { authenticate } from "../middleware/auth.js"

const router = express.Router()
const JWT_SECRET =
  process.env.JWT_SECRET || "neurocyte_clinical_jwt_secret_key_2026_secure"

// Helper to sign JWT
const createToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      is_admin: user.is_admin,
    },
    JWT_SECRET,
    { expiresIn: "7d" },
  )
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, email, role, password } = req.body

    if (!name || !email || !role || !password) {
      return res
        .status(400)
        .json({ error: "Please complete all registration fields." })
    }

    const cleanEmail = email.trim().toLowerCase()

    // Check if email already exists
    const existing = await query(
      "SELECT id, status FROM staff WHERE LOWER(email) = $1",
      [cleanEmail],
    )
    if (existing.rows.length > 0) {
      if (existing.rows[0].status === "pending") {
        return res.status(400).json({
          error:
            "A registration request for this email is already awaiting administrator authorization.",
        })
      }
      return res
        .status(400)
        .json({ error: "An account with this email address already exists." })
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10)

    const result = await query(
      `INSERT INTO staff (name, email, role, password_hash, status, is_admin)
       VALUES ($1, $2, $3, $4, 'pending', false)
       RETURNING id, name, email, role, status, created_at`,
      [name.trim(), cleanEmail, role.trim(), passwordHash],
    )

    res.status(201).json({
      message:
        "Registration received. An administrator must authorize your account before you can sign in.",
      staff: result.rows[0],
    })
  } catch (err) {
    console.error("Registration error:", err)
    res
      .status(500)
      .json({ error: "Internal server error during registration." })
  }
})

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Enter your work email and password." })
    }

    const cleanEmail = email.trim().toLowerCase()
    const result = await query(
      `SELECT id, name, email, role, password_hash, status, is_admin
       FROM staff
       WHERE LOWER(email) = $1`,
      [cleanEmail],
    )

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password." })
    }

    const user = result.rows[0]

    const isMatch = await bcrypt.compare(password, user.password_hash)
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password." })
    }

    if (user.status === "pending") {
      return res.status(403).json({
        error: "Your registration is awaiting administrator authorization.",
      })
    }

    if (user.status === "rejected") {
      return res
        .status(403)
        .json({ error: "Your account access request was declined." })
    }

    const token = createToken(user)

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        is_admin: user.is_admin,
      },
    })
  } catch (err) {
    console.error("Staff login error:", err)
    res.status(500).json({ error: "Internal server error during sign in." })
  }
})

// POST /api/auth/admin-login
router.post("/admin-login", async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Enter administrator username and password." })
    }

    const cleanUser = username.trim().toLowerCase()

    // Check by email or username
    const result = await query(
      `SELECT id, name, email, role, password_hash, status, is_admin
       FROM staff
       WHERE (LOWER(email) = $1 OR LOWER(name) = $1) AND is_admin = true`,
      [cleanUser],
    )

    if (result.rows.length === 0) {
      return res
        .status(401)
        .json({ error: "Invalid administrative credentials." })
    }

    const adminUser = result.rows[0]
    const isMatch = await bcrypt.compare(password, adminUser.password_hash)
    if (!isMatch) {
      return res
        .status(401)
        .json({ error: "Invalid administrative credentials." })
    }

    const token = createToken(adminUser)

    res.json({
      token,
      user: {
        id: adminUser.id,
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role,
        status: adminUser.status,
        is_admin: true,
      },
    })
  } catch (err) {
    console.error("Admin login error:", err)
    res
      .status(500)
      .json({ error: "Internal server error during admin sign in." })
  }
})

// GET /api/auth/me
router.get("/me", authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, email, role, status, is_admin
       FROM staff
       WHERE id = $1`,
      [req.user.id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found." })
    }

    res.json({ user: result.rows[0] })
  } catch (err) {
    console.error("Auth verify error:", err)
    res.status(500).json({ error: "Session verification failed." })
  }
})

export default router
