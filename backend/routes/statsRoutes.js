import express from "express"
import { query } from "../config/db.js"

const router = express.Router()

// GET /api/stats (Public landing metrics & system telemetry)
router.get("/", async (req, res) => {
  try {
    const staffStatsRes = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'authorized') AS active_staff,
        COUNT(DISTINCT role) AS departments,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending_staff
      FROM staff
    `)

    const patientStatsRes = await query(
      `SELECT COUNT(*) AS total_patients FROM patients`,
    )

    const staffRow = staffStatsRes.rows[0]
    const patientRow = patientStatsRes.rows[0]

    const activeStaffCount = parseInt(staffRow.active_staff, 10) || 0
    const departmentsCount = Math.max(
      parseInt(staffRow.departments, 10) || 0,
      1,
    )
    const totalPatientsCount = parseInt(patientRow.total_patients, 10) || 0
    const pendingStaffCount = parseInt(staffRow.pending_staff, 10) || 0

    res.json({
      activeStaff: String(activeStaffCount),
      departments: String(departmentsCount),
      uptime: "99.9%",
      totalPatients: String(totalPatientsCount),
      pendingStaff: pendingStaffCount,
      timestamp: new Date().toISOString(),
      status: "ALL SYSTEMS NOMINAL",
    })
  } catch (err) {
    console.error("Stats fetch error:", err)
    res.status(500).json({ error: "Failed to compute telemetry statistics." })
  }
})

export default router
