import { useState } from "react"
import { authApi } from "./api"

export default function LoginModal({ onClose, onStaffLogin, onAdminLogin }) {
  const [tab, setTab] = useState("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [role, setRole] = useState("")
  const [message, setMessage] = useState("")
  const [isSuccess, setIsSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const resetFields = () => {
    setEmail("")
    setPassword("")
    setName("")
    setRole("")
    setMessage("")
    setIsSuccess(false)
  }

  const handleTabChange = (nextTab) => {
    setTab(nextTab)
    resetFields()
  }

  const login = async (e) => {
    e.preventDefault()
    if (!email || !password)
      return setMessage("Enter your work email and password.")
    setLoading(true)
    setMessage("")
    try {
      const res = await authApi.login({ email, password })
      onStaffLogin(res.user)
    } catch (err) {
      setMessage(
        err.message || "Unable to sign in. Please verify your credentials.",
      )
    } finally {
      setLoading(false)
    }
  }

  const register = async (e) => {
    e.preventDefault()
    if (!name || !email || !role || !password) {
      return setMessage("Please complete all registration fields.")
    }
    setLoading(true)
    setMessage("")
    try {
      const res = await authApi.register({ name, email, role, password })
      setIsSuccess(true)
      setMessage(
        res.message ||
          "Registration received. An administrator must authorize your account before you can sign in.",
      )
      setName("")
      setEmail("")
      setRole("")
      setPassword("")
    } catch (err) {
      setIsSuccess(false)
      setMessage(err.message || "Registration request could not be processed.")
    } finally {
      setLoading(false)
    }
  }

  const adminLogin = async (e) => {
    e.preventDefault()
    if (!email || !password)
      return setMessage("Enter administrator username/email and password.")
    setLoading(true)
    setMessage("")
    try {
      const res = await authApi.adminLogin({ username: email, password })
      onAdminLogin(res.user)
    } catch (err) {
      setMessage(err.message || "Invalid administrator credentials.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="modal-bg"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="auth-modal">
        <header>
          <div>
            <b>✦ NEUROCYTE</b>
            <small>Secure clinical operations portal</small>
          </div>
          <button onClick={onClose}>×</button>
        </header>

        <nav>
          <button
            className={tab === "login" ? "selected" : ""}
            onClick={() => handleTabChange("login")}
          >
            Staff login
          </button>
          <button
            className={tab === "register" ? "selected" : ""}
            onClick={() => handleTabChange("register")}
          >
            Register
          </button>
          <button
            className={tab === "admin" ? "selected" : ""}
            onClick={() => handleTabChange("admin")}
          >
            Admin login
          </button>
        </nav>

        <div className="auth-content">
          {tab === "login" && (
            <form onSubmit={login}>
              <h2>Welcome back</h2>
              <p>Sign in with an authorized staff account.</p>
              <Input
                label="Work email"
                value={email}
                set={setEmail}
                type="email"
              />
              <Input
                label="Password"
                value={password}
                set={setPassword}
                type="password"
              />
              {message && <Message text={message} isSuccess={isSuccess} />}
              <button disabled={loading}>
                {loading ? "Authenticating..." : "Sign in →"}
              </button>
              <small className="switch">
                New employee?{" "}
                <a onClick={() => handleTabChange("register")}>
                  Register for access
                </a>
              </small>
            </form>
          )}

          {tab === "register" && (
            <form onSubmit={register}>
              <h2>Staff registration</h2>
              <p>Your request will need approval before sign-in is enabled.</p>
              <Input label="Full name" value={name} set={setName} />
              <Input
                label="Work email"
                value={email}
                set={setEmail}
                type="email"
              />
              <Input label="Job role" value={role} set={setRole} />
              <Input
                label="Create password"
                value={password}
                set={setPassword}
                type="password"
              />
              {message && <Message text={message} isSuccess={isSuccess} />}
              <button disabled={loading}>
                {loading ? "Submitting..." : "Request access →"}
              </button>
            </form>
          )}

          {tab === "admin" && (
            <form onSubmit={adminLogin}>
              <i className="admin-chip">◆ Administrative access</i>
              <h2>Administrator sign in</h2>
              <p>Authorize incoming staff registration requests.</p>
              <Input
                label="Admin username or email"
                value={email}
                set={setEmail}
              />
              <Input
                label="Password"
                value={password}
                set={setPassword}
                type="password"
              />
              {message && <Message text={message} isSuccess={isSuccess} />}
              <button className="admin-button" disabled={loading}>
                {loading ? "Verifying admin..." : "Enter admin workspace →"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

function Input({ label, value, set, type = "text" }) {
  return (
    <label className="auth-input">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => set(e.target.value)}
        required
      />
    </label>
  )
}

function Message({ text, isSuccess }) {
  return (
    <div
      className="auth-message"
      style={
        isSuccess ? { background: "#eaf8f1", color: "#278b68" } : undefined
      }
    >
      {text}
    </div>
  )
}
