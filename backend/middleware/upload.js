import multer from "multer"
import path from "path"
import fs from "fs"
import { randomUUID } from "node:crypto"

const uploadsDir = path.resolve(import.meta.dirname, "../uploads")
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir)
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${randomUUID()}${ext.toLowerCase()}`)
  },
})

const fileFilter = (req, file, cb) => {
  const allowedMime = [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
  ]
  const allowedExtensions = new Set([".pdf", ".png", ".jpg", ".jpeg", ".doc", ".docx", ".txt"])
  const extension = path.extname(file.originalname).toLowerCase()
  if (allowedMime.includes(file.mimetype) && allowedExtensions.has(extension)) {
    cb(null, true)
  } else {
    cb(new Error("Only PDF, JPG, PNG, DOC, DOCX, and TXT files are allowed."))
  }
}

export const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
  fileFilter,
})
