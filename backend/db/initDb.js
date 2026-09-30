import fs from "fs"
import path from "path"
import bcrypt from "bcryptjs"
import { pool, query } from "../config/db.js"

export async function initDatabase() {
  try {
    const schemaPath = path.resolve(import.meta.dirname, "schema.sql")
    const schemaSql = fs.readFileSync(schemaPath, "utf8")

    // Run schema migrations
    await pool.query(schemaSql)
    console.log("✓ PostgreSQL schema synchronized successfully.")

    // Seed default admin if missing
    const adminCheck = await query(
      "SELECT id FROM staff WHERE is_admin = true LIMIT 1",
    )
    if (adminCheck.rows.length === 0) {
      const adminPassHash = await bcrypt.hash("AdminPassword123!", 10)
      await query(
        `INSERT INTO staff (name, email, role, password_hash, status, is_admin)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (email) DO NOTHING`,
        [
          "System Administrator",
          "admin@neurocyte.io",
          "Staff Administration",
          adminPassHash,
          "authorized",
          true,
        ],
      )
      console.log(
        "✓ Seeded default administrator (admin@neurocyte.io / AdminPassword123!)",
      )
    }

    // Seed sample staff member if missing
    const staffCheck = await query("SELECT id FROM staff WHERE email = $1", [
      "jordan@neurocyte.io",
    ])
    if (staffCheck.rows.length === 0) {
      const staffPassHash = await bcrypt.hash("Password123!", 10)
      await query(
        `INSERT INTO staff (name, email, role, password_hash, status, is_admin)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (email) DO NOTHING`,
        [
          "Jordan Reyes",
          "jordan@neurocyte.io",
          "Patient Services Coordinator",
          staffPassHash,
          "authorized",
          false,
        ],
      )
      console.log(
        "✓ Seeded authorized staff (jordan@neurocyte.io / Password123!)",
      )
    }

    // Seed pending staff member to demonstrate admin authorization workflow
    const pendingCheck = await query("SELECT id FROM staff WHERE email = $1", [
      "marcus.chen@neurocyte.io",
    ])
    if (pendingCheck.rows.length === 0) {
      const pendingPassHash = await bcrypt.hash("Password123!", 10)
      await query(
        `INSERT INTO staff (name, email, role, password_hash, status, is_admin)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (email) DO NOTHING`,
        [
          "Marcus Chen",
          "marcus.chen@neurocyte.io",
          "Radiology Specialist",
          pendingPassHash,
          "pending",
          false,
        ],
      )
      console.log("✓ Seeded pending registration (marcus.chen@neurocyte.io)")
    }

    // Seed initial patients if table is empty
    const patientsCountRes = await query("SELECT COUNT(*) FROM patients")
    const patientsCount = parseInt(patientsCountRes.rows[0].count, 10)
    if (patientsCount === 0) {
      // Patient 1
      await query(
        `INSERT INTO patients (id, name, age, disease, address, email, contact, emergency_name, emergency_contact, payment_method, payment_status, transaction_id, report_name, report_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          "PT-2048",
          "Maya Patel",
          42,
          "Migraine",
          "12 Lake View Road, Bengaluru",
          "maya@email.com",
          "+91 98765 44321",
          "Ravi Patel",
          "+91 98765 44322",
          "Card",
          "Paid",
          "TXN-784512",
          "CBC results.pdf",
          "/uploads/cbc-results.pdf",
        ],
      )

      await query(
        `INSERT INTO payment_transactions (patient_id, transaction_id, method, status, note, payment_date)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          "PT-2048",
          "TXN-784512",
          "Card",
          "Paid",
          "Initial consultation",
          "30 Sep 2026",
        ],
      )

      await query(
        `INSERT INTO doctor_suggestions (patient_id, author_name, note, suggestion_date)
         VALUES ($1, $2, $3, $4)`,
        [
          "PT-2048",
          "Dr. Maya Lin",
          "Continue hydration plan and review symptoms in two weeks.",
          "30 Sep 2026",
        ],
      )

      // Patient 2
      await query(
        `INSERT INTO patients (id, name, age, disease, address, email, contact, emergency_name, emergency_contact, payment_method, payment_status, transaction_id, report_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          "PT-2047",
          "Arjun Mehta",
          31,
          "Hypertension",
          "45 Green Park, New Delhi",
          "arjun@email.com",
          "+91 98110 82371",
          "Nisha Mehta",
          "+91 98110 82372",
          "UPI",
          "Pending",
          "TXN-784496",
          "",
        ],
      )

      await query(
        `INSERT INTO payment_transactions (patient_id, transaction_id, method, status, note, payment_date)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          "PT-2047",
          "TXN-784496",
          "UPI",
          "Pending",
          "Initial consultation",
          "30 Sep 2026",
        ],
      )

      console.log("✓ Seeded initial patient clinical and transaction records.")
    }
  } catch (error) {
    console.error("Database initialization failed:", error)
    throw error
  }
}
