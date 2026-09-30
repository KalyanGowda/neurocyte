import { useState, useEffect } from "react"
import NeuralCanvas from "./NeuralCanvas"
import LoginModal from "./LoginModal"
import Dashboard from "./Dashboard"
import { statsApi, authApi, authStorage } from "./api"

export default function App() {
  const [animPhase, setAnimPhase] = useState("neural")
  const [showLogin, setShowLogin] = useState(false)
  const [titleVisible, setTitleVisible] = useState(false)
  const [subtitleVisible, setSubtitleVisible] = useState(false)
  const [taglineVisible, setTaglineVisible] = useState(false)
  const [btnVisible, setBtnVisible] = useState(false)
  const [view, setView] = useState("landing")
  const [currentUser, setCurrentUser] = useState(null)
  const [stats, setStats] = useState({
    activeStaff: "...",
    departments: "...",
    uptime: "99.9%",
    status: "ALL SYSTEMS NOMINAL",
  })

  useEffect(() => {
    // Neural flow runs freely for 3.4s — no NEUROCYTE visible yet
    const t1 = setTimeout(() => {
      setAnimPhase("done")
      setTitleVisible(true)
    }, 3400)
    const t2 = setTimeout(() => setTaglineVisible(true), 4800)
    const t3 = setTimeout(() => setSubtitleVisible(true), 5400)
    const t4 = setTimeout(() => setBtnVisible(true), 6000)

    // Fetch dynamic live metrics from PostgreSQL backend
    statsApi
      .getStats()
      .then((data) => setStats(data))
      .catch((err) =>
        console.warn("Using baseline telemetry until connected:", err.message),
      )

    // Restore active session if token exists
    const stored = authStorage.getUser()
    if (stored && authStorage.getToken()) {
      authApi
        .getMe()
        .then((res) => {
          setCurrentUser(res.user)
        })
        .catch(() => {
          authStorage.clearAll()
        })
    }

    return () => [t1, t2, t3, t4].forEach(clearTimeout)
  }, [])

  const handleLogout = () => {
    authApi.logout()
    setCurrentUser(null)
    setView("landing")
  }

  if (view !== "landing") {
    return <Dashboard mode={view} user={currentUser} onLogout={handleLogout} />
  }

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ background: "#07101a", overflow: "hidden" }}
    >
      <NeuralCanvas phase={animPhase === "done" ? "done" : "animating"} />

      {/* Scanlines */}
      <div className="scanline-overlay" />

      {/* Vignette */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 30%, rgba(7,16,26,0.6) 72%, rgba(7,16,26,0.94) 100%)",
          zIndex: 1,
        }}
      />

      {/* Top rule */}
      <div
        className="fixed top-0 left-0 right-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, #5b8db830, #7ecfb330, transparent)",
          zIndex: 10,
        }}
      />

      {/* Header */}
      <header
        className="relative flex items-center justify-between px-8 py-5"
        style={{ zIndex: 10 }}
      >
        <div
          className="flex items-center gap-3"
          style={{
            opacity: btnVisible ? 1 : 0,
            transition: "opacity 0.8s ease",
          }}
        >
          <NeuroCyteLogo size={26} />
          <span
            style={{
              fontFamily: "Exo 2, sans-serif",
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: "0.14em",
              color: "#5b8db8",
            }}
          >
            NEUROCYTE
          </span>
        </div>

        {btnVisible && (
          <button
            className="btn-login px-6 py-2 rounded-full text-xs"
            style={{
              fontFamily: "Exo 2, sans-serif",
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: "#a0c8dc",
              border: "1px solid #5b8db840",
              background: "rgba(91,141,184,0.07)",
              backdropFilter: "blur(8px)",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(91,141,184,0.16)"
              e.currentTarget.style.borderColor = "#5b8db8"
              e.currentTarget.style.boxShadow = "0 0 18px rgba(91,141,184,0.3)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(91,141,184,0.07)"
              e.currentTarget.style.borderColor = "#5b8db840"
              e.currentTarget.style.boxShadow = "none"
            }}
            onClick={() => setShowLogin(true)}
          >
            LOGIN
          </button>
        )}
      </header>

      {/* Centre stage */}
      <main
        className="fixed inset-0 flex flex-col items-center justify-center text-center px-6"
        style={{ zIndex: 5 }}
      >
        {/* Pulse rings — neural phase only, centred, no text */}
        {animPhase === "neural" && (
          <div
            className="absolute"
            style={{
              left: "50%",
              top: "50%",
              transform: "translate(-50%,-50%)",
            }}
          >
            {[0, 0.5, 1.0].map((delay, i) => (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  width: 100,
                  height: 100,
                  left: -50,
                  top: -50,
                  border: "1px solid rgba(91,141,184,0.45)",
                  animation: `pulseRing 2.6s ease-out ${delay}s infinite`,
                }}
              />
            ))}
          </div>
        )}

        {titleVisible && (
          <div className="flex flex-col items-center">
            {taglineVisible && (
              <p
                className="neuro-subtitle mb-4 tracking-widest"
                style={{
                  fontFamily: "Exo 2, sans-serif",
                  fontSize: "clamp(9px, 1.1vw, 12px)",
                  letterSpacing: "0.38em",
                  color: "#7ecfb3",
                  opacity: 0,
                  animation: "subtitleFade 1s ease forwards",
                  textTransform: "uppercase",
                }}
              >
                Staff Operations Portal
              </p>
            )}

            <h1
              className="neuro-title"
              style={{
                fontSize: "clamp(50px, 9.5vw, 116px)",
                lineHeight: 1,
                color: "#e8f2f8",
                textShadow:
                  "0 0 50px rgba(91,141,184,0.35), 0 0 100px rgba(91,141,184,0.12)",
              }}
            >
              NEURO
              <span
                style={{
                  color: "#7ecfb3",
                  textShadow:
                    "0 0 36px rgba(126,207,179,0.55), 0 0 72px rgba(126,207,179,0.25)",
                }}
              >
                CYTE
              </span>
            </h1>

            {subtitleVisible && (
              <p
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontWeight: 300,
                  fontSize: "clamp(12px, 1.5vw, 16px)",
                  color: "#4a7090",
                  letterSpacing: "0.03em",
                  maxWidth: 460,
                  marginTop: 24,
                  opacity: 0,
                  animation: "subtitleFade 1s ease forwards",
                }}
              >
                Centralised management platform for clinical staff, research
                teams, and operations across Neurocyte facilities.
              </p>
            )}

            {btnVisible && (
              <div
                className="flex items-center gap-10 mt-10"
                style={{
                  opacity: 0,
                  animation: "fadeInUp 0.9s ease 0.15s forwards",
                }}
              >
                {[
                  { value: stats.activeStaff, label: "Active Staff" },
                  { value: stats.departments, label: "Departments" },
                  { value: stats.uptime, label: "System Uptime" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="flex flex-col items-center gap-1"
                  >
                    <span
                      style={{
                        fontFamily: "Exo 2, sans-serif",
                        fontWeight: 700,
                        fontSize: "clamp(17px, 2.2vw, 24px)",
                        color: "#5b8db8",
                      }}
                    >
                      {stat.value}
                    </span>
                    <span
                      style={{
                        fontFamily: "Inter, sans-serif",
                        fontSize: 10,
                        color: "#2e4a60",
                        letterSpacing: "0.07em",
                        textTransform: "uppercase",
                      }}
                    >
                      {stat.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Status bar */}
      {btnVisible && (
        <div
          className="relative flex items-center justify-between px-8 py-4"
          style={{
            zIndex: 10,
            opacity: 0,
            animation: "fadeIn 0.8s ease 0.3s forwards",
          }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: "#7ecfb3", boxShadow: "0 0 7px #7ecfb3" }}
            />
            <span
              style={{
                fontFamily: "Exo 2, sans-serif",
                fontSize: 10,
                color: "#1e3848",
                letterSpacing: "0.08em",
              }}
            >
              {stats.status || "ALL SYSTEMS NOMINAL"}
            </span>
          </div>
          <span
            style={{
              fontFamily: "Exo 2, sans-serif",
              fontSize: 10,
              color: "#1e3848",
              letterSpacing: "0.06em",
            }}
          >
            NEUROCYTE STAFF PORTAL v4.2
          </span>
          <div className="flex items-center gap-5">
            {["Privacy Policy", "IT Support", "Contact"].map((link) => (
              <button
                key={link}
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: 10,
                  color: "#1e3848",
                  transition: "color 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#5b8db8")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#1e3848")}
              >
                {link}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom rule */}
      <div
        className="fixed bottom-0 left-0 right-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, #5b8db820, transparent)",
          zIndex: 10,
        }}
      />

      {showLogin && (
        <LoginModal
          onClose={() => setShowLogin(false)}
          onStaffLogin={(user) => {
            setCurrentUser(user)
            setShowLogin(false)
            setView("staff")
          }}
          onAdminLogin={(user) => {
            setCurrentUser(user)
            setShowLogin(false)
            setView("admin")
          }}
        />
      )}
    </div>
  )
}

function NeuroCyteLogo({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="4" fill="#5b8db8" opacity="0.95" />
      <circle cx="6" cy="8" r="2.4" fill="#5b8db8" opacity="0.7" />
      <circle cx="26" cy="8" r="2.4" fill="#5b8db8" opacity="0.7" />
      <circle cx="6" cy="24" r="2.4" fill="#5b8db8" opacity="0.7" />
      <circle cx="26" cy="24" r="2.4" fill="#5b8db8" opacity="0.7" />
      <circle cx="16" cy="4" r="1.8" fill="#7ecfb3" opacity="0.85" />
      <circle cx="16" cy="28" r="1.8" fill="#7ecfb3" opacity="0.85" />
      <line
        x1="16"
        y1="12"
        x2="8"
        y2="9.5"
        stroke="#5b8db8"
        strokeWidth="0.9"
        opacity="0.55"
      />
      <line
        x1="16"
        y1="12"
        x2="24"
        y2="9.5"
        stroke="#5b8db8"
        strokeWidth="0.9"
        opacity="0.55"
      />
      <line
        x1="16"
        y1="20"
        x2="8"
        y2="22.5"
        stroke="#5b8db8"
        strokeWidth="0.9"
        opacity="0.55"
      />
      <line
        x1="16"
        y1="20"
        x2="24"
        y2="22.5"
        stroke="#5b8db8"
        strokeWidth="0.9"
        opacity="0.55"
      />
      <line
        x1="16"
        y1="12"
        x2="16"
        y2="6"
        stroke="#7ecfb3"
        strokeWidth="0.9"
        opacity="0.65"
      />
      <line
        x1="16"
        y1="20"
        x2="16"
        y2="26"
        stroke="#7ecfb3"
        strokeWidth="0.9"
        opacity="0.65"
      />
    </svg>
  )
}
