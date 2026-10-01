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

// POST /api/patients/:id/payments (Record a new visit payment)
router.post("/:id/payments", authenticate, async (req, res) => {
  try {
    const { id: patientId } = req.params
    const { method, status, id: transactionId, note = "" } = req.body

    if (!transactionId || !transactionId.trim()) {
      return res.status(400).json({
        error: "Enter a transaction or receipt ID to update this visit.",
      })
    }

    const today = new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date())

    // 1. Insert transaction record
    await query(
      `INSERT INTO payment_transactions (patient_id, transaction_id, method, status, note, payment_date)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        patientId,
        transactionId.trim(),
        method || "Card",
        status || "Paid",
        note.trim(),
        today,
      ],
    )

    // 2. Update patient latest payment info
    await query(
      `UPDATE patients
       SET payment_method = $1, payment_status = $2, transaction_id = $3, updated_at = NOW()
       WHERE id = $4`,
      [method || "Card", status || "Paid", transactionId.trim(), patientId],
    )

    // 3. Return full updated patient record
    const updatedRes = await query(`${PATIENT_SELECT_SQL} WHERE p.id = $1`, [
      patientId,
    ])
    if (updatedRes.rows.length === 0) {
      return res.status(404).json({ error: "Patient record not found." })
    }

    res.json({
      message: "Visit payment added to this patient’s transaction history.",
      patient: updatedRes.rows[0],
    })
  } catch (err) {
    console.error("Record payment error:", err)
    res.status(500).json({ error: "Failed to record visit payment." })
  }
})

// GET /api/patients/:id/payments (Retrieve transaction history)
router.get("/:id/payments", authenticate, async (req, res) => {
  try {
    const { id: patientId } = req.params
    const result = await query(
      `SELECT id AS "recordId", transaction_id AS id, payment_date AS date, method, status, note
       FROM payment_transactions
       WHERE patient_id = $1
       ORDER BY created_at DESC`,
      [patientId],
    )
    res.json({ paymentHistory: result.rows })
  } catch (err) {
    console.error("Fetch payment history error:", err)
    res.status(500).json({ error: "Failed to retrieve payment history." })
  }
})
// PATCH /api/patients/:id/payments/:transactionRecordId/status
router.patch(
  "/:id/payments/:transactionRecordId/status",
  authenticate,
  async (req, res) => {
  try {
    const { id: patientId, transactionRecordId } = req.params
    const { method, status, id: transactionId, note = "" } = req.body

    if (!status || !["Paid", "Pending"].includes(status)) {
      return res.status(400).json({
        error: "Valid status ('Paid' or 'Pending') is required.",
      })
    }
    if (!method || !transactionId?.trim()) {
      return res.status(400).json({
        error: "Payment method and transaction ID are required.",
      })
    }

    // 1. Update the selected transaction record.
    const updateTxRes = await query(
      `UPDATE payment_transactions
       SET method = $1, status = $2, transaction_id = $3, note = $4
       WHERE patient_id = $5 AND id = $6
       RETURNING *`,
      [
        method,
        status,
        transactionId.trim(),
        note.trim(),
        patientId,
        transactionRecordId,
      ],
    )

    if (updateTxRes.rows.length === 0) {
      return res.status(404).json({
        error: "Transaction record not found for this patient.",
      })
    }

    // 2. Synchronize the patient's summary with its latest transaction.
    const latestTxRes = await query(
      `SELECT status, method, transaction_id
       FROM payment_transactions
       WHERE patient_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [patientId],
    )

    if (latestTxRes.rows.length > 0) {
      const latestTx = latestTxRes.rows[0]
      await query(
        `UPDATE patients
         SET payment_status = $1, payment_method = $2, transaction_id = $3, updated_at = NOW()
         WHERE id = $4`,
        [latestTx.status, latestTx.method, latestTx.transaction_id, patientId],
      )
    }

    // 3. Return full updated patient record
    const updatedRes = await query(`${PATIENT_SELECT_SQL} WHERE p.id = $1`, [
      patientId,
    ])
    res.json({
      message: `Transaction ${transactionId.trim()} updated successfully.`,
      patient: updatedRes.rows[0],
    })
  } catch (err) {
    console.error("Update transaction status error:", err)
    res.status(500).json({ error: "Failed to update transaction status." })
  }
  },
)

export default router;
