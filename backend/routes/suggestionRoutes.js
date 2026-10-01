import express from "express"
import { query } from "../config/db.js"
import { authenticate } from "../middleware/auth.js"

const router = express.Router()

const PATIENT_SELECT_SQL = `
  SELECT 
    p.id,
    p.name,
    p.age::text,
    p.disease,
    p.address,
    p.email,
    p.contact,
    p.emergency_name AS "emergencyName",
    p.emergency_contact AS "emergencyContact",
    p.payment_method AS "payment",
    p.payment_status AS "paymentStatus",
    COALESCE(p.transaction_id, '') AS "transaction",
    COALESCE(p.report_name, '') AS "report",
    COALESCE(p.report_url, '') AS "reportUrl",
    COALESCE(
      (SELECT note FROM doctor_suggestions WHERE patient_id = p.id ORDER BY created_at DESC LIMIT 1),
      ''
    ) AS "doctorSuggestion",
    COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'recordId', pt.id,
            'id', pt.transaction_id,
            'date', pt.payment_date,
            'method', pt.method,
            'status', pt.status,
            'note', COALESCE(pt.note, '')
          ) ORDER BY pt.created_at DESC
        )
        FROM payment_transactions pt
        WHERE pt.patient_id = p.id
      ),
      '[]'::json
    ) AS "paymentHistory",
    COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'date', ds.suggestion_date,
            'note', ds.note,
            'author', COALESCE(ds.author_name, '')
          ) ORDER BY ds.created_at DESC
        )
        FROM doctor_suggestions ds
        WHERE ds.patient_id = p.id
      ),
      '[]'::json
    ) AS "suggestions"
  FROM patients p
`

// POST /api/patients/:id/suggestions (Add dated doctor suggestion)
router.post("/:id/suggestions", authenticate, async (req, res) => {
  try {
    const { id: patientId } = req.params
    const { note } = req.body

    if (!note || !note.trim()) {
      return res
        .status(400)
        .json({ error: "Write a doctor suggestion before submitting it." })
    }

    const authorName = req.user?.name || "Clinical Staff"
    const today = new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date())

    // Insert suggestion
    await query(
      `INSERT INTO doctor_suggestions (patient_id, author_name, note, suggestion_date)
       VALUES ($1, $2, $3, $4)`,
      [patientId, authorName, note.trim(), today],
    )

    // Update patient timestamp
    await query(`UPDATE patients SET updated_at = NOW() WHERE id = $1`, [
      patientId,
    ])

    // Return updated patient
    const updatedRes = await query(`${PATIENT_SELECT_SQL} WHERE p.id = $1`, [
      patientId,
    ])
    if (updatedRes.rows.length === 0) {
      return res.status(404).json({ error: "Patient record not found." })
    }

    res.json({
      message: "Doctor suggestion saved to this patient record.",
      patient: updatedRes.rows[0],
    })
  } catch (err) {
    console.error("Add suggestion error:", err)
    res.status(500).json({ error: "Failed to record doctor suggestion." })
  }
})

// GET /api/patients/:id/suggestions
router.get("/:id/suggestions", authenticate, async (req, res) => {
  try {
    const { id: patientId } = req.params
    const result = await query(
      `SELECT suggestion_date AS date, note, author_name AS author
       FROM doctor_suggestions
       WHERE patient_id = $1
       ORDER BY created_at DESC`,
      [patientId],
    )
    res.json({ suggestions: result.rows })
  } catch (err) {
    console.error("Fetch suggestions error:", err)
    res.status(500).json({ error: "Failed to retrieve suggestions." })
  }
})

export default router
