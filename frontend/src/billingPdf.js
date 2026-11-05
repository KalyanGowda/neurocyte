import letterheadUrl from "./letterhead.jpg?url"

const PAGE_WIDTH = 595.276
const PAGE_HEIGHT = 841.89
const BANK_DETAILS = [
  "Neurocyte Pvt Ltd",
  "HDFC Bank",
  "Current Account No: 50200073641535",
  "HRBR Layout Branch",
  "IFSC code: HDFC0004367",
  "PAN: AAICN6754D",
]

function pdfPlain(value) {
  return String(value ?? "")
    .replaceAll("₹", "INR ")
    .replaceAll("–", "-")
    .replaceAll("—", "-")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
}

function pdfEscape(value) {
  return pdfPlain(value).replace(/[\\()]/g, "\\$&")
}

function wrapText(value, maxChars = 47) {
  const words = pdfPlain(value).split(/\s+/).filter(Boolean)
  const lines = []
  let line = ""
  for (let word of words) {
    while (word.length > maxChars) {
      if (line) {
        lines.push(line)
        line = ""
      }
      lines.push(word.slice(0, maxChars))
      word = word.slice(maxChars)
    }
    if (line && `${line} ${word}`.length > maxChars) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : [""]
}

function numberToIndianWords(value) {
  const units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
  const underThousand = (number) => {
    const words = []
    if (number >= 100) words.push(`${units[Math.floor(number / 100)]} Hundred`)
    number %= 100
    if (number >= 20) words.push(tens[Math.floor(number / 10)], units[number % 10])
    else if (number > 0) words.push(units[number])
    return words.filter(Boolean).join(" ")
  }
  let number = Math.floor(value)
  if (number === 0) return "Zero"
  const groups = [[10000000, "Crore"], [100000, "Lakh"], [1000, "Thousand"]]
  const words = []
  for (const [size, label] of groups) {
    if (number >= size) {
      words.push(`${underThousand(Math.floor(number / size))} ${label}`)
      number %= size
    }
  }
  if (number) words.push(underThousand(number))
  return words.join(" ")
}

function amountInWords(amount) {
  const rounded = Math.round(Number(amount) * 100)
  const rupees = Math.floor(rounded / 100)
  const paise = rounded % 100
  return `Indian Rupees ${numberToIndianWords(rupees)}${paise ? ` and ${numberToIndianWords(paise)} Paise` : ""} Only`
}

function formatMoney(amount) {
  return Number(amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function getDailyInvoiceId(patientId, date) {
  return `NC-${patientId}-${String(date).replaceAll("-", "")}`
}

export async function downloadDailyReceiptPdf({ patient, date, bills }) {
  const invoiceId = getDailyInvoiceId(patient.id, date)
  const total = bills.reduce((sum, bill) => sum + Number(bill.amount || 0), 0)
  const formattedDate = new Date(`${date}T00:00:00`).toLocaleDateString(
    "en-IN",
    { day: "2-digit", month: "long", year: "numeric" },
  )
  const references = [...new Set(bills.map((bill) => String(bill.referredBy || "").trim()).filter(Boolean))]
  const referenceText = references[0] || "-"
  const rows = bills.map((bill) => ({
    bill,
    descriptionLines: wrapText(bill.description),
    referredLines: bill.referredBy ? wrapText(`Referred by: ${bill.referredBy}`, 44) : [],
  }))
  const jpegBytes = new Uint8Array(await (await fetch(letterheadUrl)).arrayBuffer())
  const pages = []
  let pageOps = []
  let y = 0

  const text = (x, yPos, size, value, font = "F1") =>
    `BT /${font} ${size} Tf ${x} ${yPos} Td (${pdfEscape(value)}) Tj ET`
  const textRight = (right, yPos, size, value, font = "F1") => {
    const width = pdfPlain(value).length * size * 0.52
    return text(Math.max(48, right - width), yPos, size, value, font)
  }
  const line = (x1, y1, x2, y2) => `${x1} ${y1} m ${x2} ${y2} l S`
  const startPage = () => {
    pageOps = [
      "q 595.276 0 0 841.89 0 0 cm /Im1 Do Q",
      "0.32 0.34 0.38 rg",
      text(53, 603, 20, "INVOICE", "F2"),
      "0.2 0.2 0.2 rg",
      text(53, 570, 9, `Patient: ${patient.name}`),
      text(53, 555, 8, `Patient ID: ${patient.id}    Contact: ${patient.contact || "-"}`),
      "0.94 0.95 0.96 rg 340 606 205 64 re f",
      "0.20 0.22 0.25 RG 0.6 w 340 606 205 64 re S",
      line(340, 651, 545, 651),
      line(340, 629, 545, 629),
      "0.12 0.12 0.12 rg",
      text(350, 657, 6.5, "INVOICE NO", "F2"),
      textRight(535, 657, 8, invoiceId, "F2"),
      text(350, 635, 6.5, "DATE", "F2"),
      textRight(535, 635, 8, formattedDate),
      text(350, 613, 6.5, "REFERENCE", "F2"),
      textRight(535, 613, 8, referenceText),
    ]
    const left = 50
    const right = 545
    const descriptionX = 56
    const qtyRight = 356
    const unitPriceRight = 447
    const amountRight = 539
    const top = 520
    const headerBottom = 499
    pageOps.push("0.91 0.92 0.93 rg 50 499 495 21 re f")
    pageOps.push("0.12 0.12 0.12 RG 0.65 w")
    pageOps.push(`${left} ${headerBottom} ${right - left} 21 re S`)
    pageOps.push(line(320, headerBottom, 320, top), line(365, headerBottom, 365, top))
    pageOps.push(line(455, headerBottom, 455, top), line(50, headerBottom, 50, top), line(545, headerBottom, 545, top))
    pageOps.push("0.12 0.12 0.12 rg")
    pageOps.push(text(descriptionX, 506, 7.2, "DESCRIPTION", "F2"))
    pageOps.push(textRight(qtyRight, 506, 7.2, "QTY", "F2"))
    pageOps.push(textRight(unitPriceRight, 506, 7.2, "UNIT PRICE", "F2"))
    // Helvetica-Bold renders AMOUNT wider than textRight's generic width estimate.
    pageOps.push(textRight(amountRight - 9, 506, 7.2, "AMOUNT", "F2"))
    y = headerBottom
  }
  const finishPage = (includeTotals = false) => {
    const left = 50
    const right = 545
    const columns = [50, 320, 365, 455, 545]
    if (includeTotals) {
      const top = y
      const bottom = y - 26
      pageOps.push("0.94 0.95 0.96 rg")
      pageOps.push(`${left} ${bottom} ${right - left} 26 re f`)
      pageOps.push("0.12 0.12 0.12 RG 0.65 w")
      pageOps.push(`${left} ${bottom} ${right - left} 26 re S`)
      columns.slice(1, -1).forEach((x) => pageOps.push(line(x, bottom, x, top)))
      pageOps.push("0.12 0.12 0.12 rg")
      pageOps.push(text(56, bottom + 9, 7, amountInWords(total)))
      pageOps.push(text(372, bottom + 9, 8, "TOTAL", "F2"))
      pageOps.push(textRight(539, bottom + 9, 8, formatMoney(total), "F2"))
    }
    if (includeTotals) {
      pageOps.push("0.12 0.12 0.12 rg")
      pageOps.push(text(50, 205, 8, "Our Bank Details:", "F2"))
      BANK_DETAILS.forEach((detail, index) => pageOps.push(text(50, 191 - index * 11, 7.5, detail)))
      pageOps.push(text(397, 192, 8, "Authorized Signatory", "F2"))
      pageOps.push(text(397, 179, 8, "NeuroCyte Pvt Ltd"))
    }
    pageOps.push("0.43 0.52 0.56 rg")
    pageOps.push(text(330, 145, 7, "This is computer generated and does not require a signature."))
    pages.push(pageOps.join("\n"))
  }

  startPage()
  for (const [rowIndex, { bill, descriptionLines, referredLines }] of rows.entries()) {
    const rowHeight = Math.max(21, descriptionLines.length * 11 + referredLines.length * 9 + 6)
    if (y - rowHeight < 278) {
      finishPage(false)
      startPage()
    }
    const top = y
    const bottom = y - rowHeight
    pageOps.push("0.12 0.12 0.12 RG 0.45 w")
    pageOps.push(line(50, bottom, 545, bottom))
    pageOps.push(line(50, bottom, 50, top), line(320, bottom, 320, top), line(365, bottom, 365, top))
    pageOps.push(line(455, bottom, 455, top), line(545, bottom, 545, top))
    pageOps.push("0.12 0.12 0.12 rg")
    descriptionLines.forEach((lineText, index) => pageOps.push(text(56, top - 12 - index * 10, 7.2, lineText)))
    if (referredLines.length) {
      pageOps.push("0.43 0.45 0.48 rg")
      referredLines.forEach((lineText, index) => pageOps.push(text(56, top - 12 - descriptionLines.length * 10 - index * 8, 6.4, lineText)))
      pageOps.push("0.12 0.12 0.12 rg")
    }
    pageOps.push(textRight(356, top - 12, 7.2, String(bill.quantity ?? 1)))
    pageOps.push(textRight(447, top - 12, 7.2, formatMoney(bill.unitPrice ?? bill.amount)))
    pageOps.push(textRight(539, top - 12, 7.2, formatMoney(bill.amount), "F2"))
    y = bottom
    if (rowIndex < rows.length - 1) y -= 2
  }
  if (y - 26 < 255) {
    finishPage(false)
    startPage()
  }
  finishPage(true)

  const objects = [
    { type: "text", value: "<< /Type /Catalog /Pages 2 0 R >>" },
    { type: "text", value: `<< /Type /Pages /Kids [${pages.map((_, index) => `${6 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>` },
    { type: "text", value: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>" },
    { type: "text", value: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>" },
    { type: "image", value: jpegBytes },
  ]
  pages.forEach((stream, index) => {
    const pageObject = 6 + index * 2
    const contentObject = pageObject + 1
    objects.push({
      type: "text",
      value: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Im1 5 0 R >> >> /Contents ${contentObject} 0 R >>`,
    })
    objects.push({ type: "stream", value: stream })
  })

  const encoder = new TextEncoder()
  const chunks = []
  let byteLength = 0
  const append = (value) => {
    const bytes = typeof value === "string" ? encoder.encode(value) : value
    chunks.push(bytes)
    byteLength += bytes.length
  }
  append("%PDF-1.4\n")
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(byteLength)
    append(`${index + 1} 0 obj\n`)
    if (object.type === "image") {
      append(`<< /Type /XObject /Subtype /Image /Width 1241 /Height 1754 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${object.value.length} >>\nstream\n`)
      append(object.value)
      append("\nendstream\n")
    } else if (object.type === "stream") {
      const streamBytes = encoder.encode(object.value)
      append(`<< /Length ${streamBytes.length} >>\nstream\n`)
      append(streamBytes)
      append("\nendstream\n")
    } else {
      append(`${object.value}\n`)
    }
    append("endobj\n")
  })
  const xrefOffset = byteLength
  append(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`)
  for (const offset of offsets.slice(1)) append(`${String(offset).padStart(10, "0")} 00000 n \n`)
  append(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`)
  const document = new Uint8Array(byteLength)
  let cursor = 0
  for (const chunk of chunks) {
    document.set(chunk, cursor)
    cursor += chunk.length
  }

  const url = URL.createObjectURL(new Blob([document], { type: "application/pdf" }))
  const link = window.document.createElement("a")
  link.href = url
  link.download = `Neurocyte-${invoiceId}.pdf`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
