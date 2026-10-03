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
    p.billing_amount::text AS "billingAmount",
    GREATEST(p.billing_amount - COALESCE((SELECT SUM(pt.amount) FROM payment_transactions pt WHERE pt.patient_id = p.id), 0), 0)::text AS "pendingAmount",
    CASE WHEN p.billing_amount <= COALESCE((SELECT SUM(pt.amount) FROM payment_transactions pt WHERE pt.patient_id = p.id), 0) THEN 'Paid' ELSE 'Pending' END AS "paymentStatus",
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
            'amount', pt.amount::text,
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
    const { method, id: transactionId, note = "", amount } = req.body

    if (!transactionId || !transactionId.trim()) {
      return res.status(400).json({
        error: "Enter a transaction or receipt ID to update this visit.",
      })
    }
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ error: "Enter a payment amount greater than zero." })
    }

    const patientRes = await query(
      "SELECT billing_amount FROM patients WHERE id = $1",
      [patientId],
    )
    if (!patientRes.rows.length) return res.status(404).json({ error: "Patient record not found." })
    const paidRes = await query(
      "SELECT COALESCE(SUM(amount), 0) AS paid FROM payment_transactions WHERE patient_id = $1",
      [patientId],
    )
    const remaining = Number(patientRes.rows[0].billing_amount) - Number(paidRes.rows[0].paid)
    if (Number(amount) > remaining) {
      return res.status(400).json({ error: `Payment exceeds the remaining balance of ₹${Math.max(remaining, 0).toLocaleString("en-IN")}.` })
    }

    const today = new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date())

    // 1. Insert transaction record
    await query(
      `INSERT INTO payment_transactions (patient_id, transaction_id, method, status, amount, note, payment_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        patientId,
        transactionId.trim(),
        method || "Card",
        "Paid",
        Number(amount),
        note.trim(),
        today,
      ],
    )

    // 2. Update patient latest payment info
    await query(
      `UPDATE patients
       SET payment_method = $1, payment_status = $2, transaction_id = $3, updated_at = NOW()
       WHERE id = $4`,
      [method || "Card", "Paid", transactionId.trim(), patientId],
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
      `SELECT id AS "recordId", transaction_id AS id, payment_date AS date, method, status, amount::text AS amount, note
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
      const { method, id: transactionId, note = "", payAmount = 0 } = req.body

      if (!method || !transactionId?.trim()) {
        return res.status(400).json({
          error: "Payment method and transaction ID are required.",
        })
      }
      if (!Number.isFinite(Number(payAmount)) || Number(payAmount) < 0) {
        return res.status(400).json({ error: "Enter a valid non-negative payment amount." })
      }

      const patientRes = await query("SELECT billing_amount FROM patients WHERE id = $1", [patientId])
      if (!patientRes.rows.length) return res.status(404).json({ error: "Patient record not found." })
      const txRes = await query("SELECT amount FROM payment_transactions WHERE patient_id = $1 AND id = $2", [patientId, transactionRecordId])
      if (!txRes.rows.length) return res.status(404).json({ error: "Transaction record not found for this patient." })
      const paidRes = await query("SELECT COALESCE(SUM(amount), 0) AS paid FROM payment_transactions WHERE patient_id = $1", [patientId])
      const remaining = Number(patientRes.rows[0].billing_amount) - Number(paidRes.rows[0].paid)
      if (Number(payAmount) > remaining) {
        return res.status(400).json({ error: `Payment exceeds the remaining balance of ₹${Math.max(remaining, 0).toLocaleString("en-IN")}.` })
      }

      // Add this payment to the selected transaction and update its metadata.
      const updateTxRes = await query(
        `UPDATE payment_transactions
       SET method = $1, status = CASE WHEN amount + $2 > 0 THEN 'Paid' ELSE status END,
           transaction_id = $3, amount = amount + $2, note = $4
       WHERE patient_id = $5 AND id = $6
       RETURNING *`,
        [
          method,
          Number(payAmount),
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
          [
            latestTx.status,
            latestTx.method,
            latestTx.transaction_id,
            patientId,
          ],
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

export default router
