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

// GET /api/patients?query=...
router.get("/", authenticate, async (req, res) => {
  try {
    const searchQuery = req.query.query ? req.query.query.trim() : null

    let sql = PATIENT_SELECT_SQL
    const params = []

    if (searchQuery) {
      sql += ` WHERE p.name ILIKE $1 OR p.id ILIKE $1 OR p.contact ILIKE $1 `
      params.push(`%${searchQuery}%`)
    }

    sql += ` ORDER BY p.created_at DESC`

    const result = await query(sql, params)
    res.json({ patients: result.rows })
  } catch (err) {
    console.error("Fetch patients error:", err)
    res.status(500).json({ error: "Failed to retrieve patient records." })
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

// POST /api/patients (Register new patient)
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
      paymentStatus = "Pending",
      transaction = "",
      report = "",
    } = req.body

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

    // Generate next PT-ID
    const seqRes = await query(
      "SELECT 'PT-' || nextval('patient_id_seq') AS id",
    )
    const patientId = seqRes.rows[0].id

    // Insert patient
    await query(
      `INSERT INTO patients (
        id, name, age, disease, address, email, contact,
        emergency_name, emergency_contact, payment_method, payment_status,
        transaction_id, report_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
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
      ],
    )

    // If transaction ID provided, record payment history entry
    if (transaction && transaction.trim()) {
      const today = new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date())
      await query(
        `INSERT INTO payment_transactions (patient_id, transaction_id, method, status, note, payment_date)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          patientId,
          transaction.trim(),
          payment,
          paymentStatus,
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
