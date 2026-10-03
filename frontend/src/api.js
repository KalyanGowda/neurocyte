const TOKEN_KEY = "neurocyte_token"
const USER_KEY = "neurocyte_user"

export const authStorage = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  setToken: (token) => localStorage.setItem(TOKEN_KEY, token),
  clearToken: () => localStorage.removeItem(TOKEN_KEY),

  getUser: () => {
    try {
      const data = localStorage.getItem(USER_KEY)
      return data ? JSON.parse(data) : null
    } catch {
      return null
    }
  },
  setUser: (user) => localStorage.setItem(USER_KEY, JSON.stringify(user)),
  clearUser: () => localStorage.removeItem(USER_KEY),

  clearAll: () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  },
}

async function apiRequest(endpoint, options = {}) {
  const token = authStorage.getToken()
  const headers = { ...options.headers }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }

  // If not FormData, default to application/json
  if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json"
  }

  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers,
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const errorMsg =
      data.error ||
      data.message ||
      `Request failed with status ${response.status}`
    const err = new Error(errorMsg)
    err.status = response.status
    err.data = data
    throw err
  }

  return data
}

export const statsApi = {
  getStats: () => apiRequest("/stats"),
}

export const authApi = {
  login: async ({ email, password }) => {
    const res = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    })
    if (res.token && res.user) {
      authStorage.setToken(res.token)
      authStorage.setUser(res.user)
    }
    return res
  },

  adminLogin: async ({ username, password }) => {
    const res = await apiRequest("/auth/admin-login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    })
    if (res.token && res.user) {
      authStorage.setToken(res.token)
      authStorage.setUser(res.user)
    }
    return res
  },

  register: ({ name, email, role, password }) =>
    apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, role, password }),
    }),

  getMe: () => apiRequest("/auth/me"),

  logout: () => {
    authStorage.clearAll()
  },
}

export const adminApi = {
  getPendingStaff: () => apiRequest("/admin/pending-staff"),
  getAllStaff: () => apiRequest("/admin/staff"),
  authorizeStaff: (id) =>
    apiRequest(`/admin/authorize/${id}`, {
      method: "POST",
    }),
  rejectStaff: (id) =>
    apiRequest(`/admin/reject/${id}`, {
      method: "POST",
    }),
}

export const patientApi = {
  getNextId: () => apiRequest("/patients/next-id"),

  getPatients: (query = "") => {
    const q = query ? `?query=${encodeURIComponent(query)}` : ""
    return apiRequest(`/patients${q}`)
  },

  getPatient: (id) => apiRequest(`/patients/${id}`),

  createPatient: (patientData) =>
    apiRequest("/patients", {
      method: "POST",
      body: JSON.stringify(patientData),
    }),

  updatePaymentStatus: (id, paymentStatus) =>
    apiRequest(`/patients/${id}/payment-status`, {
      method: "PATCH",
      body: JSON.stringify({ paymentStatus }),
    }),

  uploadReport: (id, file) => {
    const formData = new FormData()
    formData.append("report", file)
    return apiRequest(`/patients/${id}/report`, {
      method: "POST",
      body: formData,
    })
  },
}

export const paymentApi = {
  addPayment: (patientId, paymentData) =>
    apiRequest(`/patients/${patientId}/payments`, {
      method: "POST",
      body: JSON.stringify(paymentData),
    }),

  updateTransaction: (patientId, transactionRecordId, transaction) =>
    apiRequest(
      `/patients/${patientId}/payments/${transactionRecordId}/status`,
      {
        method: "PATCH",
        body: JSON.stringify(transaction),
      },
    ),

  getPaymentHistory: (patientId) =>
    apiRequest(`/patients/${patientId}/payments`),
}

export const suggestionApi = {
  addSuggestion: (patientId, note) =>
    apiRequest(`/patients/${patientId}/suggestions`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),

  getSuggestions: (patientId) =>
    apiRequest(`/patients/${patientId}/suggestions`),
}
