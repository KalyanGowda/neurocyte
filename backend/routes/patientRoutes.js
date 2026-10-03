import express from "express"
import { query } from "../config/db.js"
import { authenticate } from "../middleware/auth.js"
import { upload } from "../middleware/upload.js"

const router = express.Router()

// SQL snippet to construct the full patient JSON structure in a single query
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

// GET /api/patients?query=... (Search through patient name and patient ID)
router.get("/", authenticate, async (req, res) => {
  try {
    const searchQuery = req.query.query ? req.query.query.trim() : null

    let sql = PATIENT_SELECT_SQL
    const params = []

    if (searchQuery) {
      const cleanQ = searchQuery.trim()
      const numericPart = cleanQ.replace(/[^0-9]/g, "")
      if (numericPart) {
        // Match name or patient ID (full format or numeric suffix)
        sql += ` WHERE (p.name ILIKE $1 OR p.id ILIKE $1 OR p.id ILIKE $2) `
        params.push(`%${cleanQ}%`, `%${numericPart}%`)
      } else {
        sql += ` WHERE (p.name ILIKE $1 OR p.id ILIKE $1) `
        params.push(`%${cleanQ}%`)
      }
    }

    sql += ` ORDER BY p.created_at DESC`

    const result = await query(sql, params)
    res.json({ patients: result.rows })
  } catch (err) {
    console.error("Fetch patients error:", err)
    res.status(500).json({ error: "Failed to retrieve patient records." })
  }
})

// GET /api/patients/next-id (Compute next auto-incremented, non-repeating Patient ID)
router.get("/next-id", authenticate, async (req, res) => {
  try {
    const maxRes = await query(`
      SELECT COALESCE(
        MAX(
          CASE 
            WHEN id ~ '^PT-[0-9]+$' 
            THEN SUBSTRING(id FROM 4)::BIGINT 
            ELSE NULL 
          END
        ),
        2048
      ) AS max_id
      FROM patients
    `)
    const maxNum = parseInt(maxRes.rows[0].max_id, 10) || 2048
    const nextId = `PT-${maxNum + 1}`
    res.json({ nextId, numericId: maxNum + 1 })
  } catch (err) {
    console.error("Fetch next patient ID error:", err)
    res.status(500).json({ error: "Failed to determine next patient ID." })
  }
})

// GET /api/patients/:id
router.get("/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params
    const sql = `${PATIENT_SELECT_SQL} WHERE p.id = $1`
    const result = await query(sql, [id])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Patient record not found." })
    }

    res.json({ patient: result.rows[0] })
  } catch (err) {
    console.error("Fetch patient by ID error:", err)
    res.status(500).json({ error: "Failed to retrieve patient details." })
  }
})

// POST /api/patients (Register new patient with auto-incremented, non-repeating Patient ID)
router.post("/", authenticate, async (req, res) => {
  try {
    const {
      name,
      age,
      disease,
      address,
      email,
      contact,
      emergencyName,
      emergencyContact,
      payment = "Card",
      billingAmount,
      amount = 0,
      transaction = "",
      report = "",
    } = req.body
    const paymentStatus = Number(amount) >= Number(billingAmount) ? "Paid" : "Pending"

    // Validate required fields
    if (
      !name ||
      !age ||
      !disease ||
      !address ||
      !email ||
      !contact ||
      !emergencyName ||
      !emergencyContact
    ) {
      return res.status(400).json({
        error: "Complete all required fields before creating this record.",
      })
    }

    if (!Number.isFinite(Number(billingAmount)) || Number(billingAmount) <= 0 || !Number.isFinite(Number(amount)) || Number(amount) < 0) {
      return res.status(400).json({ error: "Billing must be greater than zero, and payment amounts must be non-negative numbers." })
    }
    if (Number(amount) > Number(billingAmount)) {
      return res.status(400).json({ error: "Amount paid cannot exceed the billing amount." })
    }

    // Compute next unique, non-repeating PT-ID based on highest existing ID
    const maxRes = await query(`
      SELECT COALESCE(
        MAX(
          CASE 
            WHEN id ~ '^PT-[0-9]+$' 
            THEN SUBSTRING(id FROM 4)::BIGINT 
            ELSE NULL 
          END
        ),
        2048
      ) AS max_id
      FROM patients
    `)
    const maxNum = parseInt(maxRes.rows[0].max_id, 10) || 2048
    let nextNumeric = maxNum + 1
    let patientId = `PT-${nextNumeric}`

    // Ensure collision-free uniqueness against any concurrent or anomalous record
    let exists = await query("SELECT 1 FROM patients WHERE id = $1", [
      patientId,
    ])
    while (exists.rows.length > 0) {
      nextNumeric += 1
      patientId = `PT-${nextNumeric}`
      exists = await query("SELECT 1 FROM patients WHERE id = $1", [patientId])
    }

    // Keep sequence synchronized with current max
    try {
      await query("SELECT setval('patient_id_seq', $1, true)", [nextNumeric])
    } catch (seqErr) {
      console.warn("Sequence update notice:", seqErr.message)
    }

    // Insert patient
    await query(
      `INSERT INTO patients (
        id, name, age, disease, address, email, contact,
        emergency_name, emergency_contact, payment_method, payment_status,
        transaction_id, report_name, billing_amount
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        patientId,
        name.trim(),
        parseInt(age, 10),
        disease.trim(),
        address.trim(),
        email.trim(),
        contact.trim(),
        emergencyName.trim(),
        emergencyContact.trim(),
        payment,
        paymentStatus,
        transaction.trim() || null,
        report || "",
        Number(billingAmount),
      ],
    )

    // If transaction ID provided, record payment history entry
    if ((transaction && transaction.trim()) || Number(amount) > 0) {
      const today = new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date())
      await query(
        `INSERT INTO payment_transactions (patient_id, transaction_id, method, status, amount, note, payment_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          patientId,
          transaction.trim() || `INIT-${patientId}`,
          payment,
          paymentStatus,
          Number(amount),
          "Initial consultation",
          today,
        ],
      )
    }

    // Retrieve fresh aggregated record
    const createdRes = await query(`${PATIENT_SELECT_SQL} WHERE p.id = $1`, [
      patientId,
    ])
    res.status(201).json({
      message: `${name} was added successfully.`,
      patient: createdRes.rows[0],
    })
  } catch (err) {
    console.error("Create patient error:", err)
    res.status(500).json({ error: "Failed to create patient record." })
  }
})

// PATCH /api/patients/:id/payment-status
router.patch("/:id/payment-status", authenticate, async (req, res) => {
  try {
    const { id } = req.params
    const { paymentStatus } = req.body

    if (!paymentStatus || !["Paid", "Pending"].includes(paymentStatus)) {
      return res
        .status(400)
        .json({ error: "Valid payment status (Paid, Pending) is required." })
    }

    await query(
      `UPDATE patients
       SET payment_status = $1, updated_at = NOW()
       WHERE id = $2`,
      [paymentStatus, id],
    )

    const updatedRes = await query(`${PATIENT_SELECT_SQL} WHERE p.id = $1`, [
      id,
    ])
    if (updatedRes.rows.length === 0) {
      return res.status(404).json({ error: "Patient record not found." })
    }

    res.json({ patient: updatedRes.rows[0] })
  } catch (err) {
    console.error("Update payment status error:", err)
    res.status(500).json({ error: "Failed to update payment status." })
  }
})

// POST /api/patients/:id/report (Attach/Replace medical report file)
router.post(
  "/:id/report",
  authenticate,
  upload.single("report"),
  async (req, res) => {
    try {
      const { id } = req.params

      if (!req.file) {
        return res.status(400).json({ error: "No report file was uploaded." })
      }

      const reportName = req.file.originalname
      const reportUrl = `/uploads/${req.file.filename}`

      await query(
        `UPDATE patients
       SET report_name = $1, report_url = $2, updated_at = NOW()
       WHERE id = $3`,
        [reportName, reportUrl, id],
      )

      const updatedRes = await query(`${PATIENT_SELECT_SQL} WHERE p.id = $1`, [
        id,
      ])
      if (updatedRes.rows.length === 0) {
        return res.status(404).json({ error: "Patient record not found." })
      }

      res.json({
        message: "Report uploaded successfully.",
        patient: updatedRes.rows[0],
        file: { name: reportName, url: reportUrl },
      })
    } catch (err) {
      console.error("Upload report error:", err)
      res
        .status(500)
        .json({ error: err.message || "Failed to upload report file." })
    }
  },
)

export default router
