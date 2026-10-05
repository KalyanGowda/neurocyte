import { useState, useEffect, useMemo } from "react"
import { patientApi, paymentApi, suggestionApi, adminApi } from "./api"

const blank = () => ({
  name: "",
  age: "",
  disease: "",
  address: "",
  email: "",
  contact: "",
  emergencyName: "",
  emergencyContact: "",
  payment: "Card",
  billingAmount: "",
  amount: "0",
  transaction: "",
  report: "",
  reportFile: null,
  doctorSuggestion: "",
  suggestions: [],
  paymentHistory: [],
})

export function getNextPatientId(patientList = []) {
  let maxNum = 2048
  for (const p of patientList) {
    if (p && p.id) {
      const match = String(p.id).match(/^PT-(\d+)$/i)
      if (match) {
        const num = parseInt(match[1], 10)
        if (num > maxNum) maxNum = num
      }
    }
  }
  return `PT-${maxNum + 1}`
}

export default function Dashboard({ mode, user, onLogout }) {
  const [page, setPage] = useState("home")
  const [patients, setPatients] = useState([])
  const [form, setForm] = useState(blank())
  const [query, setQuery] = useState("")
  const [notice, setNotice] = useState("")
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [nextPatientId, setNextPatientId] = useState("PT-2049")

  const admin = mode === "admin" || user?.is_admin

  // Calculate next auto-incremented, non-repeating Patient ID from current records
  const computedNextId = useMemo(() => {
    return getNextPatientId(patients)
  }, [patients])

  const refreshNextId = async () => {
    try {
      const res = await patientApi.getNextId()
      if (res && res.nextId) {
        setNextPatientId(res.nextId)
        return
      }
    } catch {
      // Fall back to computed next ID
    }
    setNextPatientId(computedNextId)
  }

  // Load patients from PostgreSQL backend
  const loadPatients = async (searchQuery = "") => {
    try {
      setLoading(true)
      const res = await patientApi.getPatients(searchQuery)
      setPatients(res.patients || [])
    } catch (err) {
      console.error("Failed to load patients from database:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!admin) {
      loadPatients()
    }
  }, [admin])

  useEffect(() => {
    setNextPatientId(computedNextId)
  }, [computedNextId])

  // Search through patient name and patient ID
  const results = useMemo(() => {
    if (!query.trim()) return patients
    const q = query.trim().toLowerCase()
    const qClean = q.replace(/[^a-z0-9]/gi, "")
    const qNumeric = q.replace(/[^0-9]/g, "")

    return patients.filter((p) => {
      const name = (p.name || "").toLowerCase()
      const id = (p.id || "").toLowerCase()
      const idClean = id.replace(/[^a-z0-9]/gi, "")
      const idNumeric = id.replace(/[^0-9]/g, "")

      // Search through patient name
      const nameMatches = name.includes(q)

      // Search through patient ID (exact prefix, normalized, or numeric code)
      const idMatches =
        id.includes(q) ||
        (qClean.length > 0 && idClean.includes(qClean)) ||
        (qNumeric.length > 0 && idNumeric.includes(qNumeric))

      return nameMatches || idMatches
    })
  }, [patients, query])

  const save = async (e) => {
    e.preventDefault()
    if (
      !form.name ||
      !form.age ||
      !form.disease ||
      !form.address ||
      !form.email ||
      !form.contact ||
      !form.emergencyName ||
      !form.emergencyContact
    ) {
      return setNotice(
        "Complete all required fields before creating this record.",
      )
    }

    try {
      setNotice("Saving patient record to database...")
      const res = await patientApi.createPatient({
        name: form.name,
        age: form.age,
        disease: form.disease,
        address: form.address,
        email: form.email,
        contact: form.contact,
        emergencyName: form.emergencyName,
        emergencyContact: form.emergencyContact,
        payment: form.payment,
        billingAmount: form.billingAmount,
        amount: form.amount,
        transaction: form.transaction,
        report: form.report,
      })

      let newPatient = res.patient

      // If a file was attached, upload it to the backend
      if (form.reportFile) {
        try {
          const uploadRes = await patientApi.uploadReport(
            newPatient.id,
            form.reportFile,
          )
          if (uploadRes.patient) newPatient = uploadRes.patient
        } catch (uploadErr) {
          console.warn("Report upload note:", uploadErr.message)
        }
      }

      setPatients((current) => [newPatient, ...current])
      setForm(blank())
      setNotice(
        `${newPatient.name} was added successfully with Patient ID ${newPatient.id}.`,
      )
      refreshNextId()
    } catch (err) {
      setNotice(err.message || "Failed to save patient record.")
    }
  }

  // Helper to get initials
  const getInitials = (name) => {
    if (!name) return "ST"
    return name
      .split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase()
  }

  const userInitials = admin ? "AD" : getInitials(user?.name)
  const userName = admin ? "Administrator" : user?.name || "Staff Member"
  const userRole = admin
    ? "Staff administration"
    : user?.role || "Patient services"

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="logo">
          ✦ <span>NEURO</span>
          <b>CYTE</b>
        </div>
        <div>
          <span className="secure">● Secure PostgreSQL session</span>
          <button className="signout" onClick={onLogout}>
            Sign out ↗
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside>
          <div className="profile">
            <i>{userInitials}</i>
            <div>
              <strong>{userName}</strong>
              <small>{userRole}</small>
            </div>
          </div>
          <p className="nav-label">
            {admin ? "Administration" : "Patient management"}
          </p>
          {admin ? (
            <Nav active label="Staff authorization" icon="✓" />
          ) : (
            <>
              <Nav
                label="Dashboard"
                icon="⌘"
                active={page === "home"}
                onClick={() => setPage("home")}
              />
              <Nav
                label="New patient"
                icon="+"
                active={page === "new"}
                onClick={() => {
                  setPage("new")
                  setNotice("")
                  refreshNextId()
                }}
              />
              <Nav
                label="Find patient"
                icon="⌕"
                active={page === "search"}
                onClick={() => setPage("search")}
              />
              <Nav
                label="Payments"
                icon="₹"
                active={page === "payments"}
                onClick={() => setPage("payments")}
              />
              <Nav
                label="Doctor suggestions"
                icon="✚"
                active={page === "suggestions"}
                onClick={() => setPage("suggestions")}
              />
            </>
          )}
          <small className="network">● Clinical database online</small>
        </aside>

        <main>
          {admin ? (
            <Admin />
          ) : page === "new" ? (
            <NewPatient
              form={form}
              setForm={setForm}
              notice={notice}
              save={save}
              nextId={nextPatientId || computedNextId}
            />
          ) : page === "search" ? (
            <Search
              query={query}
              setQuery={setQuery}
              patients={results}
              loading={loading}
              onSelect={(patient) => {
                setSelected(patient)
                setPage("details")
              }}
            />
          ) : page === "payments" ? (
            <Payments
              patients={patients}
              onUpdate={(updated) =>
                setPatients((current) =>
                  current.map((patient) =>
                    patient.id === updated.id ? updated : patient,
                  ),
                )
              }
            />
          ) : page === "suggestions" ? (
            <Suggestions
              patients={patients}
              onUpdate={(updated) =>
                setPatients((current) =>
                  current.map((patient) =>
                    patient.id === updated.id ? updated : patient,
                  ),
                )
              }
            />
          ) : page === "details" && selected ? (
            <PatientDetails
              patient={selected}
              onBack={() => setPage("search")}
              onUpdate={(updated) => {
                setPatients((current) =>
                  current.map((patient) =>
                    patient.id === updated.id ? updated : patient,
                  ),
                )
                setSelected(updated)
              }}
            />
          ) : (
            <Home
              patients={patients}
              go={setPage}
              user={user}
              onSelectPatient={(p) => {
                setSelected(p)
                setPage("details")
              }}
              onRegisterClick={() => {
                setPage("new")
                setNotice("")
                refreshNextId()
              }}
            />
          )}
        </main>
      </div>
    </div>
  )
}

function Home({ patients, go, user, onSelectPatient, onRegisterClick }) {
  const firstName = user?.name ? user.name.split(" ")[0] : "Jordan"
  return (
    <>
      <Heading
        eyebrow="Patient services"
        title={`Good morning, ${firstName}`}
        text="Manage patient records and intake from one secure workspace."
      />
      <div className="cards">
        <button onClick={onRegisterClick || (() => go("new"))}>
          <em>+</em>
          <div>
            <strong>Register new patient</strong>
            <span>Create a complete patient record and payment entry.</span>
          </div>
          →
        </button>
        <button onClick={() => go("search")}>
          <em>⌕</em>
          <div>
            <strong>Find patient</strong>
            <span>Search records by patient name or unique patient ID.</span>
          </div>
          →
        </button>
      </div>
      <div className="section-title">
        <div>
          <h2>Recently added patients</h2>
          <p>Latest records in your care team.</p>
        </div>
        <button onClick={() => go("search")}>View all records →</button>
      </div>
      <Patients patients={patients.slice(0, 4)} onSelect={onSelectPatient} />
    </>
  )
}

function NewPatient({ form, setForm, notice, save, nextId }) {
  const input = (key, label, optional = false, type = "text") => (
    <label>
      <span>
        {label}
        {!optional && <b> *</b>}
      </span>
      <input
        required={!optional}
        type={type}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </label>
  )

  return (
    <>
      <Heading
        eyebrow="Patient intake"
        title="Register new patient"
        text="Fields marked with * are required to create a patient record."
      />
      <form className="patient-form" onSubmit={save}>
        <Block n="01" title="Patient ID & System Identification">
          <div className="patient-id-block">
            <div className="patient-id-display-block">
              <div className="patient-id-badge-hero">
                <span className="id-icon">PT</span>
                <strong className="id-code">{nextId}</strong>
              </div>
              <div className="patient-id-meta-text">
                <span className="patient-id-status-badge">
                </span>
              </div>
            </div>
          </div>
        </Block>

        <Block n="02" title="Personal details">
          <div className="grid">
            {input("name", "Full name")}
            {input("age", "Age", false, "number")}
            {input("disease", "Disease / condition")}
            {input("contact", "Contact number")}
            {input("email", "Email address", false, "email")}
            <label className="wide">
              <span>
                Residential address <b>*</b>
              </span>
              <input
                required
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </label>
          </div>
        </Block>

        <Block n="03" title="Emergency contact">
          <div className="grid">
            {input("emergencyName", "Contact name")}
            {input("emergencyContact", "Contact number")}
          </div>
        </Block>

        <Block n="04" title="Payment transaction">
          <div className="grid">
            <label>
              <span>Billing amount <b>*</b></span>
              <input type="number" min="1" step="1" required value={form.billingAmount} onChange={(e) => setForm({ ...form, billingAmount: e.target.value })} placeholder="Enter total bill" />
            </label>
            <label>
              <span>Amount paid</span>
              <input type="number" min="0" max={form.billingAmount || undefined} step="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
            </label>
            <label>
              <span>
                Payment method <b>*</b>
              </span>
              <select
                value={form.payment}
                onChange={(e) => setForm({ ...form, payment: e.target.value })}
              >
                <option>Card</option>
                <option>Cash</option>
                <option>UPI</option>
                <option>Insurance</option>
              </select>
            </label>
            <p className="payment-status-note wide">Payment status is set automatically from the billing amount and amount paid.</p>
            {input("transaction", "Transaction / receipt ID", true)}
          </div>
        </Block>

        <Block n="05" title="Clinical reports" optional>
          <label className="upload">
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
              onChange={(e) => {
                const file = e.target.files?.[0]
                setForm({
                  ...form,
                  report: file?.name || "",
                  reportFile: file || null,
                })
              }}
            />
            <strong>{form.report || "↑  Attach reports if available"}</strong>
            <small>Optional — doctors can add or update reports later.</small>
          </label>
        </Block>

        {notice && (
          <p
            className={
              notice.includes("successfully") || notice.includes("success")
                ? "ok"
                : "warning"
            }
          >
            {notice}
          </p>
        )}

        <footer>
          <span>* Required information</span>
          <button>Create patient record →</button>
        </footer>
      </form>
    </>
  )
}

function Search({ query, setQuery, patients, loading, onSelect }) {
  return (
    <>
      <Heading
        eyebrow="Patient records"
        title="Find patient"
        text="Search through patient name and unique patient ID to view records, payment status, and reports."
      />
      <div className="search">
        <span>⌕</span>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by patient name or patient ID (e.g. Maya Patel, PT-2048)..."
        />
        {query && (
          <button
            type="button"
            className="clear-search-btn"
            onClick={() => setQuery("")}
            title="Clear search"
          >
            ×
          </button>
        )}
      </div>
      <div className="search-meta">
        <p className="results">
          {loading
            ? "Searching database..."
            : query.trim()
              ? `${patients.length} record${
                  patients.length === 1 ? "" : "s"
                } matching "${query.trim()}" by name or ID`
              : `${patients.length} patient records available`}
        </p>
        {query.trim() && (
          <span className="search-filter-tag">Searching Name & Patient ID</span>
        )}
      </div>
      <Patients patients={patients} onSelect={onSelect} />
    </>
  )
}

function Payments({ patients, onUpdate }) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(null)
  const [selectedTransaction, setSelectedTransaction] = useState(null)
  const [expandedHistoryGroup, setExpandedHistoryGroup] = useState(null)
  const [billingDraft, setBillingDraft] = useState("")
  const [billingNotice, setBillingNotice] = useState("")
  const [savingBilling, setSavingBilling] = useState(false)
  const [transaction, setTransaction] = useState({
    method: "Card",
    status: "Paid",
    id: "",
    amount: "",
    note: "",
  })
  const [notice, setNotice] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const matches = patients.filter((patient) =>
    `${patient.name} ${patient.id} ${patient.contact}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  )
  const totalPaid = (selected?.paymentHistory || []).reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0,
  )
  const hasPendingAmount = Number(selected?.pendingAmount || 0) > 0
  useEffect(() => {
    setBillingDraft(selected?.billingAmount || "")
    setBillingNotice("")
  }, [selected?.id])
  const groupedHistory = useMemo(() => {
    const groups = new Map()
    for (const item of selected?.paymentHistory || []) {
      const note = (item.note || "").trim()
      const key = note ? note.toLocaleLowerCase() : `transaction-${item.recordId || item.id}`
      if (!groups.has(key)) groups.set(key, { key, title: note || "Patient visit", transactions: [] })
      groups.get(key).transactions.push(item)
    }
    return Array.from(groups.values())
  }, [selected])

  const saveTransaction = async (event) => {
    event.preventDefault()
    if ((!selectedTransaction || transaction.amount !== "") && Number(transaction.amount) <= 0) {
      return setNotice("Enter a pay amount greater than zero.")
    }
    setSubmitting(true)
    setNotice("")
    try {
      const res = selectedTransaction
        ? await paymentApi.updateTransaction(
            selected.id,
            selectedTransaction.recordId,
            { ...transaction, payAmount: Number(transaction.amount || 0) },
          )
        : await paymentApi.addPayment(selected.id, { ...transaction, amount: Number(transaction.amount) })
      onUpdate(res.patient)
      setSelected(res.patient)
      setSelectedTransaction(null)
      setExpandedHistoryGroup(null)
      setTransaction({ method: "Card", status: "Paid", id: "", amount: "", note: "" })
      setNotice(
        selectedTransaction
          ? "Transaction updated successfully."
          : "Visit payment added successfully.",
      )
    } catch (err) {
      setNotice(err.message || "Failed to record visit payment.")
    } finally {
      setSubmitting(false)
    }
  }

  const saveBillingAmount = async (event) => {
    event.preventDefault()
    setSavingBilling(true)
    setBillingNotice("")
    try {
      const res = await patientApi.updateBillingAmount(selected.id, Number(billingDraft))
      onUpdate(res.patient)
      setSelected(res.patient)
      setBillingDraft(res.patient.billingAmount)
      setBillingNotice("Billing amount updated successfully.")
    } catch (err) {
      setBillingNotice(err.message || "Failed to update billing amount.")
    } finally {
      setSavingBilling(false)
    }
  }

  const editTransaction = (item) => {
    setSelectedTransaction(item)
    setTransaction({
      method: item.method || "Card",
      status: item.status || "Pending",
      id: item.id || "",
      amount: "",
      note: item.note || "",
    })
    setNotice("")
  }

  const cancelEdit = () => {
    setSelectedTransaction(null)
    setTransaction({ method: "Card", status: "Paid", id: "", amount: "", note: "" })
    setNotice("")
  }

  return (
    <>
      <Heading
        eyebrow="Payments"
        title="Payment transaction history"
        text="Find a patient to record a new visit payment and review their full transaction history."
      />
      <div className="payment-search">
        <span>⌕</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by patient name, ID, or phone number..."
        />
      </div>

      {!selected ? (
        <div className="payment-patient-list">
          {matches.map((patient) => (
            <button
              key={patient.id}
              onClick={() => {
                setSelected(patient)
                setSelectedTransaction(null)
                setExpandedHistoryGroup(null)
                setTransaction({
                  method: "Card",
                  status: "Paid",
                  id: "",
                  amount: "",
                  note: "",
                })
                setNotice("")
              }}
            >
              <i>
                {patient.name
                  .split(" ")
                  .filter(Boolean)
                  .map((n) => n[0])
                  .join("")}
              </i>
              <div>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <strong>{patient.name}</strong>
                  <span className="patient-id-pill" title="Unique Patient ID">
                    {patient.id}
                  </span>
                </div>
                <span>{patient.contact}</span>
                <div className="billing-summary patient-list-billing">
                  <span>Billing <strong>₹{Number(patient.billingAmount || 0).toLocaleString("en-IN")}</strong></span>
                  <span>Paid <strong>₹{(Number(patient.billingAmount || 0) - Number(patient.pendingAmount || 0)).toLocaleString("en-IN")}</strong></span>
                  <span>Pending <strong>₹{Number(patient.pendingAmount || 0).toLocaleString("en-IN")}</strong></span>
                </div>
              </div>
              <em
                className={(patient.paymentStatus || "pending").toLowerCase()}
              >
                {patient.paymentStatus || "Pending"}
              </em>
              <b>Open payment history →</b>
            </button>
          ))}
          {!matches.length && (
            <div className="empty">No patient records match that search.</div>
          )}
        </div>
      ) : (
        <div className="payment-workspace">
          <button
            className="back"
            onClick={() => {
              setSelected(null)
              setSelectedTransaction(null)
              setExpandedHistoryGroup(null)
              setTransaction({
                method: "Card",
                status: "Paid",
                id: "",
                amount: "",
                note: "",
              })
              setNotice("")
            }}
          >
            ← Search another patient
          </button>
          <div className="payment-patient-header">
            <div className="detail-avatar">
              {selected.name
                .split(" ")
                .filter(Boolean)
                .map((n) => n[0])
                .join("")}
            </div>
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  marginBottom: "4px",
                }}
              >
                <span className="hero-id-badge">
                  PATIENT ID: <b>{selected.id}</b>
                </span>
              </div>
              <div className="patient-name-status">
                <h2>{selected.name}</h2>
                <em className={(selected.paymentStatus || "pending").toLowerCase()}>
                  ● {selected.paymentStatus || "Pending"}
                </em>
              </div>
              <span>
                {selected.contact} · {selected.disease}
              </span>
              <div className="billing-summary">
                <span>Billing <strong>₹{Number(selected.billingAmount || 0).toLocaleString("en-IN")}</strong></span>
                <span>Paid <strong>₹{totalPaid.toLocaleString("en-IN")}</strong></span>
                <span>Pending <strong>₹{Number(selected.pendingAmount || 0).toLocaleString("en-IN")}</strong></span>
              </div>
            </div>
          </div>

          <form className="billing-update-form" onSubmit={saveBillingAmount}>
            <div>
              <strong>Update billing amount</strong>
              <span>Must be at least the amount already paid (₹{totalPaid.toLocaleString("en-IN")}).</span>
            </div>
            <label>
              Total billing amount
              <input
                type="number"
                min={Math.max(totalPaid, 1)}
                step="1"
                value={billingDraft}
                onChange={(e) => setBillingDraft(e.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={savingBilling || Number(billingDraft) === Number(selected.billingAmount)}>
              {savingBilling ? "Saving billing..." : "Update billing"}
            </button>
            {billingNotice && <p className={billingNotice.includes("successfully") ? "ok" : "warning"}>{billingNotice}</p>}
          </form>

          <div className="payment-columns">
            <section className="history-card">
              <div className="card-heading">
                <div>
                  <h2>Transaction history</h2>
                  <p>Every payment recorded for this patient.</p>
                </div>
                <span>{(selected.paymentHistory || []).length} transactions</span>
              </div>
              <div className="history-table">
                {groupedHistory.map((group) => {
                  const isExpanded = expandedHistoryGroup === group.key
                  const groupPaid = group.transactions.reduce((sum, item) => sum + Number(item.amount || 0), 0)
                  return (
                    <section className="history-group" key={group.key}>
                      <button
                        type="button"
                        className="history-group-summary"
                        aria-expanded={isExpanded}
                        onClick={() => setExpandedHistoryGroup(isExpanded ? null : group.key)}
                      >
                        <span>
                          <strong>{group.title}</strong>
                          <small>{group.transactions.length} transaction{group.transactions.length === 1 ? "" : "s"} · Paid ₹{groupPaid.toLocaleString("en-IN")}</small>
                        </span>
                        <small>{group.transactions[0]?.date}</small>
                        <b>{isExpanded ? "Hide transactions ↑" : "View transactions →"}</b>
                      </button>
                      {isExpanded && group.transactions.map((item, idx) => (
                        <button
                          type="button"
                          className={`history-row ${selectedTransaction?.recordId === item.recordId ? "selected" : ""}`}
                          key={`${item.recordId || item.id}-${idx}`}
                          onClick={() => editTransaction(item)}
                        >
                          <div>
                            <strong>{item.id}</strong>
                            <span>{item.note || "Patient visit"}</span>
                          </div>
                          <small>{item.date}</small>
                          <small>{item.method}</small>
                          <small className="history-amount">Paid ₹{Number(item.amount || 0).toLocaleString("en-IN")}</small>
                          <em className={Number(item.amount || 0) > 0 ? "paid" : "pending"}>
                            {Number(item.amount || 0) > 0 ? "Paid" : "Pending"}
                          </em>
                          <small className="history-edit-hint">Select to edit</small>
                        </button>
                      ))}
                    </section>
                  )
                })}
                {!(selected.paymentHistory || []).length && (
                  <div className="empty">No payments logged yet.</div>
                )}
              </div>
            </section>

            <section className="visit-payment-card">
              <div className="card-heading">
                <div>
                  <h2>
                    {selectedTransaction
                      ? "Edit visit payment"
                      : "Add visit payment"}
                  </h2>
                  <p>
                    {selectedTransaction
                      ? "Review the payment details or record an additional payment."
                      : "Record a new transaction for this patient visit."}
                  </p>
                </div>
              </div>
              <form onSubmit={saveTransaction}>
                <label>
                  Amount paid so far
                  <input
                    type="text"
                    value={`₹${totalPaid.toLocaleString("en-IN")}`}
                    readOnly
                  />
                </label>
                <label>
                  Pay amount
                  <input
                    type={hasPendingAmount ? "number" : "text"}
                    min="1"
                    max={hasPendingAmount ? Number(selected.pendingAmount) : undefined}
                    step="1"
                    value={hasPendingAmount ? transaction.amount : "No due"}
                    readOnly={!hasPendingAmount}
                    onClick={() => {
                      if (!hasPendingAmount) setNotice("No due.")
                    }}
                    onChange={(e) => setTransaction({ ...transaction, amount: e.target.value })}
                    placeholder={hasPendingAmount ? "Enter amount to pay" : "No due"}
                    required={!selectedTransaction && hasPendingAmount}
                  />
                </label>
                <label>
                  Payment method
                  <select
                    value={transaction.method}
                    onChange={(e) =>
                      setTransaction({ ...transaction, method: e.target.value })
                    }
                  >
                    <option>Card</option>
                    <option>Cash</option>
                    <option>UPI</option>
                    <option>Insurance</option>
                  </select>
                </label>
                <label>
                  Transaction / receipt ID
                  <input
                    value={transaction.id}
                    onChange={(e) =>
                      setTransaction({ ...transaction, id: e.target.value })
                    }
                    placeholder="Optional receipt ID"
                  />
                </label>
                <label className="full">
                  Visit note <span>Optional</span>
                  <textarea
                    value={transaction.note}
                    onChange={(e) =>
                      setTransaction({ ...transaction, note: e.target.value })
                    }
                    placeholder="e.g. Follow-up consultation"
                  />
                </label>
                {notice && (
                  <p
                    className={
                      notice.includes("successfully") ||
                      notice.includes("added")
                        ? "ok"
                        : "warning"
                    }
                  >
                    {notice}
                  </p>
                )}
                {selectedTransaction && (
                  <button
                    type="button"
                    className="cancel-edit"
                    onClick={cancelEdit}
                  >
                    Cancel editing
                  </button>
                )}
                <button disabled={submitting || (!hasPendingAmount && !selectedTransaction)}>
                  {submitting
                    ? "Saving transaction..."
                    : selectedTransaction
                      ? "Save changes"
                      : "Add transaction"}
                </button>
              </form>
            </section>
          </div>
        </div>
      )}
    </>
  )
}

function Suggestions({ patients, onUpdate }) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(null)
  const [text, setText] = useState("")
  const [notice, setNotice] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const matches = patients.filter((patient) =>
    `${patient.name} ${patient.id} ${patient.contact}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  )

  const submitSuggestion = async (event) => {
    event.preventDefault()
    if (!text.trim())
      return setNotice("Write a doctor suggestion before submitting it.")
    setSubmitting(true)
    setNotice("")
    try {
      const res = await suggestionApi.addSuggestion(selected.id, text.trim())
      onUpdate(res.patient)
      setSelected(res.patient)
      setText("")
      setNotice("Doctor suggestion saved to this patient record.")
    } catch (err) {
      setNotice(err.message || "Failed to save doctor suggestion.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Heading
        eyebrow="Clinical notes"
        title="Doctor suggestions"
        text="Select any patient to add a dated suggestion for today’s visit and review earlier recommendations."
      />
      <div className="payment-search">
        <span>⌕</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search any patient by name, ID, or phone number..."
        />
      </div>

      {!selected ? (
        <div className="suggestion-patient-list">
          {matches.map((patient) => (
            <button
              key={patient.id}
              onClick={() => {
                setSelected(patient)
                setText("")
                setNotice("")
              }}
            >
              <i>
                {patient.name
                  .split(" ")
                  .filter(Boolean)
                  .map((n) => n[0])
                  .join("")}
              </i>
              <div>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <strong>{patient.name}</strong>
                  <span className="patient-id-pill" title="Unique Patient ID">
                    {patient.id}
                  </span>
                </div>
                <span>
                  {patient.disease} · {patient.contact}
                </span>
              </div>
              <em>{(patient.suggestions || []).length} suggestions</em>
              <b>Add suggestion →</b>
            </button>
          ))}
          {!matches.length && (
            <div className="empty">No patient records match that search.</div>
          )}
        </div>
      ) : (
        <div className="suggestion-workspace">
          <button
            className="back"
            onClick={() => {
              setSelected(null)
              setNotice("")
            }}
          >
            ← All patients
          </button>
          <div className="payment-patient-header">
            <div className="detail-avatar">
              {selected.name
                .split(" ")
                .filter(Boolean)
                .map((n) => n[0])
                .join("")}
            </div>
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  marginBottom: "4px",
                }}
              >
                <span className="hero-id-badge">
                  PATIENT ID: <b>{selected.id}</b>
                </span>
              </div>
              <h2>{selected.name}</h2>
              <span>
                {selected.age} years · {selected.disease}
              </span>
            </div>
            <em>{(selected.suggestions || []).length} saved</em>
          </div>

          <div className="suggestion-columns">
            <section className="suggestion-history">
              <div className="card-heading">
                <div>
                  <h2>Previous suggestions</h2>
                  <p>Saved recommendations from earlier visits.</p>
                </div>
              </div>
              {(selected.suggestions || []).length ? (
                <div className="suggestion-timeline">
                  {selected.suggestions.map((item, index) => (
                    <article key={`${item.date}-${index}`}>
                      <span>{item.date}</span>
                      <p>{item.note}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="no-suggestions">
                  No suggestions saved for this patient yet.
                </div>
              )}
            </section>

            <section className="suggestion-editor">
              <div className="card-heading">
                <div>
                  <h2>Add today’s suggestion</h2>
                  <p>
                    This entry will be stored with today’s date in PostgreSQL.
                  </p>
                </div>
                <span>Required</span>
              </div>
              <form onSubmit={submitSuggestion}>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Type the doctor’s clinical advice, treatment recommendation, or follow-up instructions..."
                />
                <small>
                  Each submission creates a new dated entry; previous notes stay
                  in the history.
                </small>
                {notice && (
                  <p className={notice.includes("saved") ? "ok" : "warning"}>
                    {notice}
                  </p>
                )}
                <button disabled={submitting}>
                  {submitting ? "Saving suggestion..." : "Submit suggestion →"}
                </button>
              </form>
            </section>
          </div>
        </div>
      )}
    </>
  )
}

function Admin() {
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")

  const loadPending = async () => {
    try {
      setLoading(true)
      const res = await adminApi.getPendingStaff()
      setPending(res.pendingStaff || [])
    } catch (err) {
      setMessage(err.message || "Failed to load pending registrations.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPending()
  }, [])

  const handleAuthorize = async (id) => {
    try {
      await adminApi.authorizeStaff(id)
      setPending((current) => current.filter((person) => person.id !== id))
      setMessage("Staff member authorized successfully.")
    } catch (err) {
      setMessage(err.message || "Failed to authorize staff account.")
    }
  }

  return (
    <>
      <Heading
        eyebrow="Administrator workspace"
        title="Staff authorization"
        text="Review and authorize employees before they can access patient services."
      />
      <div className="admin-note">
        ◆ Only authorized staff may sign in. Approving an account grants access
        to the staff dashboard.
      </div>
      {message && (
        <p className="ok" style={{ marginBottom: 18 }}>
          {message}
        </p>
      )}
      <div className="section-title">
        <div>
          <h2>Registration requests</h2>
          <p>New employees awaiting your approval in PostgreSQL.</p>
        </div>
        <strong>{pending.length} pending</strong>
      </div>
      <div className="staff-list">
        {loading ? (
          <div className="empty">Loading pending registrations...</div>
        ) : pending.length ? (
          pending.map((person) => (
            <div className="staff" key={person.id}>
              <i>
                {person.name
                  .split(" ")
                  .filter(Boolean)
                  .map((n) => n[0])
                  .join("")}
              </i>
              <div>
                <strong>{person.name}</strong>
                <span>{person.email}</span>
              </div>
              <small>{person.role}</small>
              <button onClick={() => handleAuthorize(person.id)}>
                Authorize access
              </button>
            </div>
          ))
        ) : (
          <div className="empty">
            All staff registrations have been reviewed.
          </div>
        )}
      </div>
    </>
  )
}

function PatientDetails({ patient, onBack, onUpdate }) {
  const [message, setMessage] = useState("")
  const [uploading, setUploading] = useState(false)

  const updateReport = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploading(true)
    setMessage("")
    try {
      const res = await patientApi.uploadReport(patient.id, file)
      if (res.patient) {
        onUpdate(res.patient)
        setMessage("Report uploaded successfully.")
      }
    } catch (err) {
      setMessage(err.message || "Failed to upload report file.")
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <button className="back" onClick={onBack}>
        ← Back to patient search
      </button>
      <div className="detail-hero">
        <div className="detail-avatar">
          {patient.name
            .split(" ")
            .filter(Boolean)
            .map((n) => n[0])
            .join("")}
        </div>
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "5px",
            }}
          >
            <span className="hero-id-badge">
              PATIENT ID: <b>{patient.id}</b>
            </span>
          </div>
          <h1>{patient.name}</h1>
          <span>
            {patient.age} years · {patient.disease}
          </span>
        </div>
        <div
          className={`payment-badge ${(patient.paymentStatus || "pending").toLowerCase()}`}
        >
          ● Payment {patient.paymentStatus || "Pending"}
        </div>
      </div>

      <div className="detail-grid">
        <section className="detail-card">
          <h2>Personal details</h2>
          <Data label="Patient ID" value={patient.id} />
          <Data label="Email" value={patient.email} />
          <Data label="Contact number" value={patient.contact} />
          <Data label="Address" value={patient.address} />
          <Data label="Disease / condition" value={patient.disease} />
        </section>

        <section className="detail-card">
          <h2>Emergency contact</h2>
          <Data label="Name" value={patient.emergencyName} />
          <Data label="Contact number" value={patient.emergencyContact} />
          <h2 className="payment-title">Payment details</h2>
          <Data label="Method" value={patient.payment} />
          <Data label="Billing amount" value={`₹${Number(patient.billingAmount || 0).toLocaleString("en-IN")}`} />
          <Data label="Amount paid" value={`₹${(Number(patient.billingAmount || 0) - Number(patient.pendingAmount || 0)).toLocaleString("en-IN")}`} />
          <Data label="Pending amount" value={`₹${Number(patient.pendingAmount || 0).toLocaleString("en-IN")}`} />
          <Data
            label="Transaction ID"
            value={patient.transaction || "None recorded"}
          />
        </section>
      </div>

      <div className="record-actions">
        <section className="detail-card report-card">
          <div className="card-heading">
            <div>
              <h2>Clinical reports</h2>
              <p>Upload a report to this patient record in PostgreSQL.</p>
            </div>
            <span>Optional</span>
          </div>
          {patient.report ? (
            <div className="report-file">
              {patient.reportUrl ? (
                <a
                  href={patient.reportUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="report-link"
                >
                  {patient.report}
                </a>
              ) : (
                <span>{patient.report}</span>
              )}
              <small>Open attachment</small>
            </div>
          ) : (
            <div className="no-report">
              No clinical report has been attached.
            </div>
          )}
          <label className="clear-upload">
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
              onChange={updateReport}
              disabled={uploading}
            />
            <span className="upload-icon">↑</span>
            <strong>
              {uploading
                ? "Uploading to server..."
                : patient.report
                  ? "Replace clinical report"
                  : "Upload clinical report"}
            </strong>
            <small>Choose PDF, image, or document (saved to server)</small>
          </label>
          {message && (
            <p className={message.includes("success") ? "ok" : "warning"}>
              {message}
            </p>
          )}
        </section>
      </div>
    </>
  )
}

function Heading({ eyebrow, title, text }) {
  return (
    <div className="heading">
      <p>{eyebrow}</p>
      <h1>{title}</h1>
      <span>{text}</span>
    </div>
  )
}

function Block({ n, title, optional, children }) {
  return (
    <section>
      <h2>
        <i>{n}</i>
        {title}
        {optional && <small>Optional</small>}
      </h2>
      {children}
    </section>
  )
}

function Data({ label, value }) {
  return (
    <div className="data">
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </div>
  )
}

function Patients({ patients, onSelect }) {
  return (
    <div className="patients">
      {patients.map((p) => (
        <button className="patient" key={p.id} onClick={() => onSelect?.(p)}>
          <i>
            {p.name
              .split(" ")
              .filter(Boolean)
              .map((n) => n[0])
              .join("")}
          </i>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <strong>{p.name}</strong>
              <span className="patient-id-pill" title="Unique Patient ID">
                {p.id}
              </span>
            </div>
            <span>
              {p.age} years · {p.disease}
            </span>
          </div>
          <small>{p.contact}</small>
          <em className={(p.paymentStatus || "pending").toLowerCase()}>
            {p.paymentStatus}
          </em>
        </button>
      ))}
      {!patients.length && (
        <div className="empty">No patient records found in database.</div>
      )}
    </div>
  )
}

function Nav({ label, icon, active, onClick }) {
  return (
    <button onClick={onClick} className={active ? "active" : ""}>
      <i>{icon}</i>
      {label}
    </button>
  )
}
