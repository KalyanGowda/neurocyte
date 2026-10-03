-- Enable extensions if permitted
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sequence for Patient IDs (e.g. PT-2049, PT-2050...)
CREATE SEQUENCE IF NOT EXISTS patient_id_seq START WITH 2049;

-- Staff Table
CREATE TABLE IF NOT EXISTS staff (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'authorized', 'rejected')),
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Staff Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_email ON staff (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_staff_status ON staff (status);

-- Patients Table
CREATE TABLE IF NOT EXISTS patients (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  age INTEGER NOT NULL,
  disease VARCHAR(200) NOT NULL,
  address TEXT NOT NULL,
  email VARCHAR(255) NOT NULL,
  contact VARCHAR(50) NOT NULL,
  emergency_name VARCHAR(150) NOT NULL,
  emergency_contact VARCHAR(50) NOT NULL,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'Card',
  payment_status VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (payment_status IN ('Pending', 'Paid')),
  billing_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (billing_amount >= 0),
  transaction_id VARCHAR(100),
  report_name VARCHAR(255),
  report_url VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Patient Search & Filtering Indexes
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_patients_contact ON patients (contact);
CREATE INDEX IF NOT EXISTS idx_patients_payment_status ON patients (payment_status);
CREATE INDEX IF NOT EXISTS idx_patients_created_at ON patients (created_at DESC);

-- Payment Transactions Table
CREATE TABLE IF NOT EXISTS payment_transactions (
  id SERIAL PRIMARY KEY,
  patient_id VARCHAR(50) NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
  transaction_id VARCHAR(100) NOT NULL,
  method VARCHAR(50) NOT NULL DEFAULT 'Card',
  status VARCHAR(20) NOT NULL DEFAULT 'Paid',
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  note TEXT,
  payment_date VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE patients ADD COLUMN IF NOT EXISTS billing_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS amount NUMERIC(12, 2) NOT NULL DEFAULT 0;

-- Payment Transactions Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_patient_id ON payment_transactions (patient_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON payment_transactions (created_at DESC);

-- Doctor Suggestions Table
CREATE TABLE IF NOT EXISTS doctor_suggestions (
  id SERIAL PRIMARY KEY,
  patient_id VARCHAR(50) NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
  author_name VARCHAR(150),
  note TEXT NOT NULL,
  suggestion_date VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Doctor Suggestions Indexes
CREATE INDEX IF NOT EXISTS idx_suggestions_patient_id ON doctor_suggestions (patient_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_created_at ON doctor_suggestions (created_at DESC);
