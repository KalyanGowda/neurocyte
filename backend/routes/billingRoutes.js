import express from "express"
import { randomUUID } from "node:crypto"
import { pool, query } from "../config/db.js"
import { authenticate } from "../middleware/auth.js"

const router = express.Router()

router.use(authenticate)

router.get("/", async (_req, res) => {
  try {
    const result = await query(
      `SELECT bi.id, bi.patient_id AS "patientId", bi.description,
              bi.amount::text AS amount, bi.billing_date::text AS date,
              bi.status, p.name AS "patientName", p.contact,
              p.disease, bi.paid_transaction_id AS "paidTransactionId"
       FROM billing_items bi
       JOIN patients p ON p.id = bi.patient_id
       ORDER BY bi.billing_date DESC, bi.created_at DESC`,
    )
    res.json({ bills: result.rows })
  } catch (err) {
    console.error("Fetch billing items error:", err)
    res.status(500).json({ error: "Failed to retrieve billing items." })
  }
})

router.post("/", async (req, res) => {
  const { patientId, description, amount, date, status = "Pending" } = req.body
  if (!patientId || typeof description !== "string" || !description.trim() || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: "Choose a patient, describe the service, and enter an amount greater than zero." })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !["Pending", "Paid"].includes(status)) {
    return res.status(400).json({ error: "Enter a valid billing date and status." })
  }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const patient = await client.query("SELECT id FROM patients WHERE id = $1", [patientId])
    if (!patient.rows.length) {
      await client.query("ROLLBACK")
      return res.status(404).json({ error: "Patient record not found." })
    }
    const created = await client.query(
      `INSERT INTO billing_items (patient_id, description, amount, billing_date, status)
       VALUES ($1, $2, $3, $4, 'Pending') RETURNING id`,
      [patientId, description.trim(), Number(amount), date],
    )
    const billId = created.rows[0].id
    let transactionId = null
    if (status === "Paid") {
      const receipt = `RCPT-${randomUUID().slice(0, 8).toUpperCase()}`
      const tx = await client.query(
        `INSERT INTO payment_transactions (patient_id, transaction_id, method, status, amount, note, payment_date, billing_item_id)
         VALUES ($1, $2, 'Cash', 'Paid', $3, $4, to_char($5::date, 'DD Mon YYYY'), $6) RETURNING id`,
        [patientId, receipt, Number(amount), description.trim(), date, billId],
      )
      transactionId = tx.rows[0].id
      await client.query("UPDATE billing_items SET status = 'Paid', paid_transaction_id = $1 WHERE id = $2", [transactionId, billId])
      await client.query(
        `UPDATE patients SET payment_method = 'Cash', payment_status = 'Paid', transaction_id = $1, updated_at = NOW() WHERE id = $2`,
        [receipt, patientId],
      )
    }
    await client.query("UPDATE patients SET billing_amount = billing_amount + $1, updated_at = NOW() WHERE id = $2", [Number(amount), patientId])
    const paidTotal = await client.query("SELECT COALESCE(SUM(amount), 0) AS total FROM payment_transactions WHERE patient_id = $1 AND status = 'Paid'", [patientId])
    const billedTotal = await client.query("SELECT billing_amount FROM patients WHERE id = $1", [patientId])
    const paymentStatus = Number(paidTotal.rows[0].total) >= Number(billedTotal.rows[0].billing_amount) ? "Paid" : "Pending"
    await client.query("UPDATE patients SET payment_status = $1 WHERE id = $2", [paymentStatus, patientId])
    await client.query("COMMIT")
    res.status(201).json({ bill: { id: billId, patientId, description: description.trim(), amount: String(amount), date, status, paidTransactionId: transactionId } })
  } catch (err) {
    await client.query("ROLLBACK")
    console.error("Create billing item error:", err)
    res.status(500).json({ error: "Failed to create billing item." })
  } finally {
    client.release()
  }
})

router.patch("/:id", async (req, res) => {
  const { description, amount, date } = req.body
  if (typeof description !== "string" || !description.trim() || !Number.isFinite(Number(amount)) || Number(amount) <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
    return res.status(400).json({ error: "Enter a service description, valid date, and amount greater than zero." })
  }
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const found = await client.query(
      `SELECT id, patient_id, amount::text AS amount, status
       FROM billing_items WHERE id = $1 FOR UPDATE`,
      [req.params.id],
    )
    if (!found.rows.length) {
      await client.query("ROLLBACK")
      return res.status(404).json({ error: "Billing item not found." })
    }
    const current = found.rows[0]
    if (current.status === "Paid") {
      await client.query("ROLLBACK")
      return res.status(409).json({ error: "Mark this bill pending before editing it." })
    }
    const paid = await client.query(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM payment_transactions WHERE billing_item_id = $1 AND status = 'Paid'",
      [current.id],
    )
    if (Number(amount) < Number(paid.rows[0].total)) {
      await client.query("ROLLBACK")
      return res.status(400).json({ error: "Bill amount cannot be lower than payments already received." })
    }
    const result = await client.query(
      `UPDATE billing_items SET description = $1, amount = $2, billing_date = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING id, patient_id AS "patientId", description, amount::text AS amount,
       billing_date::text AS date, status, paid_transaction_id AS "paidTransactionId"`,
      [description.trim(), Number(amount), date, current.id],
    )
    await client.query(
      "UPDATE patients SET billing_amount = billing_amount + $1, updated_at = NOW() WHERE id = $2",
      [Number(amount) - Number(current.amount), current.patient_id],
    )
    const totals = await client.query(
      `SELECT p.billing_amount,
              COALESCE((SELECT SUM(amount) FROM payment_transactions WHERE patient_id = p.id AND status = 'Paid'), 0) AS paid
       FROM patients p WHERE p.id = $1`,
      [current.patient_id],
    )
    const paymentStatus = Number(totals.rows[0].paid) >= Number(totals.rows[0].billing_amount) ? "Paid" : "Pending"
    await client.query("UPDATE patients SET payment_status = $1 WHERE id = $2", [paymentStatus, current.patient_id])
    await client.query("COMMIT")
    res.json({ bill: result.rows[0] })
  } catch (err) {
    await client.query("ROLLBACK")
    console.error("Edit billing item error:", err)
    res.status(500).json({ error: "Failed to edit billing item." })
  } finally {
    client.release()
  }
})

router.patch("/:id/status", async (req, res) => {
  const { status } = req.body
  if (!["Pending", "Paid"].includes(status)) {
    return res.status(400).json({ error: "Status must be Paid or Pending." })
  }
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const found = await client.query(
      `SELECT id, patient_id, description, amount::text AS amount,
              billing_date::text AS date, status, paid_transaction_id
       FROM billing_items WHERE id = $1 FOR UPDATE`,
      [req.params.id],
    )
    if (!found.rows.length) {
      await client.query("ROLLBACK")
      return res.status(404).json({ error: "Billing item not found." })
    }
    const bill = found.rows[0]
    let transactionId = bill.paid_transaction_id
    let receipt = null
    if (status === "Paid" && bill.status !== "Paid") {
      const alreadyPaid = await client.query(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM payment_transactions WHERE billing_item_id = $1 AND status = 'Paid'",
        [bill.id],
      )
      const balance = Math.max(Number(bill.amount) - Number(alreadyPaid.rows[0].total), 0)
      if (balance > 0) {
        receipt = `RCPT-${randomUUID().slice(0, 8).toUpperCase()}`
        const paid = await client.query(
          `INSERT INTO payment_transactions (patient_id, transaction_id, method, status, amount, note, payment_date, billing_item_id)
           VALUES ($1, $2, 'Cash', 'Paid', $3, $4, to_char(CURRENT_DATE, 'DD Mon YYYY'), $5) RETURNING id`,
          [bill.patient_id, receipt, balance, bill.description, bill.id],
        )
        transactionId = paid.rows[0].id
        await client.query(
          `UPDATE patients SET payment_method = 'Cash', transaction_id = $1, updated_at = NOW() WHERE id = $2`,
          [receipt, bill.patient_id],
        )
      }
    } else if (status === "Pending" && bill.status === "Paid" && transactionId) {
      await client.query("UPDATE payment_transactions SET status = 'Reversed' WHERE billing_item_id = $1 AND status = 'Paid'", [bill.id])
      transactionId = null
    }
    const updated = await client.query(
      `UPDATE billing_items SET status = $1, paid_transaction_id = $2, updated_at = NOW()
       WHERE id = $3 RETURNING id, patient_id AS "patientId", description, amount::text AS amount,
       billing_date::text AS date, status, paid_transaction_id AS "paidTransactionId"`,
      [status, transactionId, bill.id],
    )
    const paidTotal = await client.query(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM payment_transactions WHERE patient_id = $1 AND status = 'Paid'",
      [bill.patient_id],
    )
    const billTotal = await client.query(
      "SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM billing_items WHERE patient_id = $1",
      [bill.patient_id],
    )
    const paymentStatus = Number(paidTotal.rows[0].total) >= Number(billTotal.rows[0].total) ? "Paid" : "Pending"
    await client.query("UPDATE patients SET payment_status = $1, updated_at = NOW() WHERE id = $2", [paymentStatus, bill.patient_id])
    await client.query("COMMIT")
    res.json({ bill: updated.rows[0] })
  } catch (err) {
    await client.query("ROLLBACK")
    console.error("Update billing status error:", err)
    res.status(500).json({ error: "Failed to update billing status." })
  } finally {
    client.release()
  }
})

export default router
