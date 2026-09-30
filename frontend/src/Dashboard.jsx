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
  paymentStatus: "Pending",
  transaction: "",
  report: "",
  reportFile: null,
  doctorSuggestion: "",
  suggestions: [],
  paymentHistory: [],
})

export default function Dashboard({ mode, user, onLogout }) {
  const [page, setPage] = useState("home")
  const [patients, setPatients] = useState([])
  const [form, setForm] = useState(blank())
  const [query, setQuery] = useState("")
  const [notice, setNotice] = useState("")
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)

  const admin = mode === "admin" || user?.is_admin

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

  const results = useMemo(() => {
    if (!query.trim()) return patients
    const q = query.toLowerCase()
    return patients.filter((p) =>
      `${p.name} ${p.id} ${p.contact} ${p.disease}`.toLowerCase().includes(q),
    )
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
        paymentStatus: form.paymentStatus,
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
        `${newPatient.name} was added successfully (ID: ${newPatient.id}).`,
      )
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
            />
          )}
        </main>
      </div>
    </div>
  )
}

function Home({ patients, go, user, onSelectPatient }) {
  const firstName = user?.name ? user.name.split(" ")[0] : "Jordan"
  return (
    <>
      <Heading
        eyebrow="Patient services"
        title={`Good morning, ${firstName}`}
        text="Manage patient records and intake from one secure workspace."
      />
      <div className="cards">
        <button onClick={() => go("new")}>
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
            <strong>Find existing patient</strong>
            <span>Search by name, patient ID, or phone number.</span>
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

function NewPatient({ form, setForm, notice, save }) {
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
        <Block n="01" title="Personal details">
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

        <Block n="02" title="Emergency contact">
          <div className="grid">
            {input("emergencyName", "Contact name")}
            {input("emergencyContact", "Contact number")}
          </div>
        </Block>

        <Block n="03" title="Payment transaction">
          <div className="grid">
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
            <label>
              <span>
                Payment status <b>*</b>
              </span>
              <select
                value={form.paymentStatus}
                onChange={(e) =>
                  setForm({ ...form, paymentStatus: e.target.value })
                }
              >
                <option>Pending</option>
                <option>Paid</option>
              </select>
            </label>
            {input("transaction", "Transaction / receipt ID")}
          </div>
        </Block>

        <Block n="04" title="Clinical reports" optional>
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
        title="Find existing patient"
        text="Select a patient to view their record, payment status, and reports."
      />
      <div className="search">
        <span>⌕</span>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search patients by name, ID, or phone number..."
        />
      </div>
      <p className="results">
        {loading ? "Searching database..." : `${patients.length} records found`}
      </p>
      <Patients patients={patients} onSelect={onSelect} />
    </>
  )
}

function Payments({ patients, onUpdate }) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(null)
  const [transaction, setTransaction] = useState({
    method: "Card",
    status: "Paid",
    id: "",
    note: "",
  })
  const [notice, setNotice] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const matches = patients.filter((patient) =>
    `${patient.name} ${patient.id} ${patient.contact}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  )

  const addTransaction = async (event) => {
    event.preventDefault()
    if (!transaction.id.trim()) {
      return setNotice(
        "Enter a transaction or receipt ID to update this visit.",
      )
    }
    setSubmitting(true)
    setNotice("")
    try {
      const res = await paymentApi.addPayment(selected.id, transaction)
      onUpdate(res.patient)
      setSelected(res.patient)
      setTransaction({ method: "Card", status: "Paid", id: "", note: "" })
      setNotice("Visit payment added to this patient’s transaction history.")
    } catch (err) {
      setNotice(err.message || "Failed to record visit payment.")
    } finally {
      setSubmitting(false)
    }
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
                <strong>{patient.name}</strong>
                <span>
                  {patient.id} · {patient.contact}
                </span>
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
              <p>{selected.id}</p>
              <h2>{selected.name}</h2>
              <span>
                {selected.contact} · {selected.disease}
              </span>
            </div>
            <em className={(selected.paymentStatus || "pending").toLowerCase()}>
              ● Current: {selected.paymentStatus || "Pending"}
            </em>
          </div>

          <div className="payment-columns">
            <section className="history-card">
              <div className="card-heading">
                <div>
                  <h2>Transaction history</h2>
                  <p>Every payment recorded for this patient.</p>
                </div>
                <span>{(selected.paymentHistory || []).length} visits</span>
              </div>
              <div className="history-table">
                {(selected.paymentHistory || []).map((item, idx) => (
                  <div className="history-row" key={`${item.id}-${idx}`}>
                    <div>
                      <strong>{item.id}</strong>
                      <span>{item.note || "Patient visit"}</span>
                    </div>
                    <small>{item.date}</small>
                    <small>{item.method}</small>
                    <em className={(item.status || "paid").toLowerCase()}>
                      {item.status}
                    </em>
                  </div>
                ))}
                {!(selected.paymentHistory || []).length && (
                  <div className="empty">No payments logged yet.</div>
                )}
              </div>
            </section>

            <section className="visit-payment-card">
              <div className="card-heading">
                <div>
                  <h2>Add visit payment</h2>
                  <p>Update the transaction after each patient visit.</p>
                </div>
              </div>
              <form onSubmit={addTransaction}>
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
                  Payment status
                  <select
                    value={transaction.status}
                    onChange={(e) =>
                      setTransaction({ ...transaction, status: e.target.value })
                    }
                  >
                    <option>Paid</option>
                    <option>Pending</option>
                  </select>
                </label>
                <label>
                  Transaction / receipt ID
                  <input
                    value={transaction.id}
                    onChange={(e) =>
                      setTransaction({ ...transaction, id: e.target.value })
                    }
                    placeholder="e.g. TXN-784513"
                    required
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
                  <p className={notice.includes("added") ? "ok" : "warning"}>
                    {notice}
                  </p>
                )}
                <button disabled={submitting}>
                  {submitting ? "Recording payment..." : "Add transaction →"}
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
                <strong>{patient.name}</strong>
                <span>
                  {patient.id} · {patient.disease} · {patient.contact}
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
              <p>{selected.id}</p>
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

  const handleStatusChange = async (newStatus) => {
    try {
      const res = await patientApi.updatePaymentStatus(patient.id, newStatus)
      if (res.patient) {
        onUpdate(res.patient)
      }
    } catch (err) {
      setMessage(err.message || "Failed to update payment status.")
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
          <p>Patient record · {patient.id}</p>
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
          <Data
            label="Transaction ID"
            value={patient.transaction || "None recorded"}
          />
          <label className="status-control">
            Payment status
            <select
              value={patient.paymentStatus || "Pending"}
              onChange={(e) => handleStatusChange(e.target.value)}
            >
              <option>Pending</option>
              <option>Paid</option>
            </select>
          </label>
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
              ▣ <span>{patient.report}</span>
              <small>Attached</small>
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
            <strong>{p.name}</strong>
            <span>
              {p.id} · {p.age} years · {p.disease}
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
