import express from "express"
import { query } from "../config/db.js"
import { authenticate, requireAdmin } from "../middleware/auth.js"

const router = express.Router()

// Apply auth & admin check to all admin routes
router.use(authenticate, requireAdmin)

// GET /api/admin/pending-staff
router.get("/pending-staff", async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, email, role, status, is_admin, created_at
       FROM staff
       WHERE status = 'pending'
       ORDER BY created_at ASC`,
    )
    res.json({ pendingStaff: result.rows })
  } catch (err) {
    console.error("Fetch pending staff error:", err)
    res.status(500).json({ error: "Failed to retrieve pending staff." })
  }
})

// GET /api/admin/staff (all staff)
router.get("/staff", async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, email, role, status, is_admin, created_at
       FROM staff
       ORDER BY status ASC, created_at DESC`,
    )
    res.json({ staff: result.rows })
  } catch (err) {
    console.error("Fetch all staff error:", err)
    res.status(500).json({ error: "Failed to retrieve staff directory." })
  }
})

// POST /api/admin/authorize/:id
router.post("/authorize/:id", async (req, res) => {
  try {
    const { id } = req.params
    const result = await query(
      `UPDATE staff
       SET status = 'authorized', updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, email, role, status, is_admin`,
      [id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Staff member not found." })
    }

    res.json({
      message: "Staff member authorized successfully.",
      staff: result.rows[0],
    })
  } catch (err) {
    console.error("Authorize staff error:", err)
    res.status(500).json({ error: "Failed to authorize staff account." })
  }
})

// POST /api/admin/reject/:id
router.post("/reject/:id", async (req, res) => {
  try {
    const { id } = req.params
    const result = await query(
      `UPDATE staff
       SET status = 'rejected', updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, email, role, status`,
      [id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Staff member not found." })
    }

    res.json({
      message: "Staff registration rejected.",
      staff: result.rows[0],
    })
  } catch (err) {
    console.error("Reject staff error:", err)
    res.status(500).json({ error: "Failed to reject staff account." })
  }
})

export default router
