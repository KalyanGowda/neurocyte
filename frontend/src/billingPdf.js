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

function wrapText(value, maxChars = 42) {
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
  return `Rupees ${numberToIndianWords(rupees)}${paise ? ` and ${numberToIndianWords(paise)} Paise` : ""} Only`
}

export function getDailyInvoiceId(patientId, date) {
  return `NC-${patientId}-${String(date).replaceAll("-", "")}`
}

export function downloadDailyReceiptPdf({ patient, date, bills }) {
  const invoiceId = getDailyInvoiceId(patient.id, date)
  const paidTotal = bills
    .filter((bill) => bill.status === "Paid")
    .reduce((sum, bill) => sum + Number(bill.amount), 0)
  const pendingTotal = bills
    .filter((bill) => bill.status !== "Paid")
    .reduce((sum, bill) => sum + Number(bill.amount), 0)
  const formattedDate = new Date(`${date}T00:00:00`).toLocaleDateString(
    "en-IN",
    { day: "2-digit", month: "long", year: "numeric" },
  )
  const rows = bills.map((bill) => ({
    bill,
    lines: wrapText(bill.description),
    referredLines: bill.referredBy ? wrapText(`Referred by: ${bill.referredBy}`) : [],
  }))
  const pages = []
  let pageOps = []
  let y = 0

  const text = (x, yPos, size, value, font = "F1") =>
    `BT /${font} ${size} Tf ${x} ${yPos} Td (${pdfEscape(value)}) Tj ET`
  const textRight = (right, yPos, size, value, font = "F1") => {
    const width = pdfPlain(value).length * size * 0.52
    return text(Math.max(54, right - width), yPos, size, value, font)
  }
  const startPage = (pageNumber) => {
    pageOps = [
      "0.08 0.25 0.34 rg 0 710 612 82 re f",
      "0.20 0.59 0.52 rg 54 710 7 82 re f",
      "1 1 1 rg",
      text(78, 762, 17, "NEUROCYTE PVT LTD", "F2"),
      "0.12 0.24 0.31 rg",
      text(54, 682, 11, `Invoice ID: ${invoiceId}`, "F2"),
      text(54, 662, 10, `Billing date: ${formattedDate}`),
      text(54, 642, 10, `Patient: ${patient.name}`),
      text(54, 622, 10, `Patient token: ${patient.id}    Contact: ${patient.contact || "-"}`),
      "0.91 0.95 0.96 rg 54 584 504 22 re f",
      "0.12 0.24 0.31 rg",
      text(62, 591, 8, "SERVICE / DESCRIPTION", "F2"),
      textRight(355, 591, 8, "QTY", "F2"),
      textRight(455, 591, 8, "UNIT PRICE", "F2"),
      textRight(549, 591, 8, "AMOUNT", "F2"),
    ]
    y = 568
  }
  const finishPage = (includeTotals = false) => {
    if (includeTotals) {
      y -= 8
      pageOps.push("0.72 0.81 0.84 RG 54 "+y+" m 558 "+y+" l S")
      y -= 23
      pageOps.push("0.12 0.24 0.31 rg")
      pageOps.push(text(370, y, 9, "TOTAL"), textRight(558, y, 9, `INR ${(paidTotal + pendingTotal).toLocaleString("en-IN")}`, "F2"))
      y -= 17
      pageOps.push(text(370, y, 9, "PAID"), textRight(558, y, 9, `INR ${paidTotal.toLocaleString("en-IN")}`))
      y -= 17
      pageOps.push(text(370, y, 9, "BALANCE"), textRight(558, y, 9, `INR ${pendingTotal.toLocaleString("en-IN")}`))
      y -= 19
      pageOps.push(text(54, y, 8, `Amount in words: ${amountInWords(paidTotal + pendingTotal)}`))
    }
    pageOps.push("0.20 0.59 0.52 RG 54 70 m 558 70 l S")
    pageOps.push("0.43 0.52 0.56 rg")
    pageOps.push(text(54, 52, 8, "This receipt is computer generated and does not require a signature."))
    pages.push(pageOps.join("\n"))
  }

  startPage(1)
  for (const [rowIndex, { bill, lines, referredLines }] of rows.entries()) {
    const rowHeight = Math.max(30, lines.length * 14 + 10 + referredLines.length * 10)
    if (y - rowHeight < 155) {
      finishPage(false)
      startPage(pages.length + 1)
    }
    pageOps.push("0.12 0.24 0.31 rg")
    lines.forEach((line, index) => pageOps.push(text(62, y - index * 13, 8, line)))
    if (referredLines.length) {
      pageOps.push("0.43 0.52 0.56 rg")
      referredLines.forEach((line, index) => pageOps.push(text(62, y - lines.length * 13 - 1 - index * 9, 7, line)))
      pageOps.push("0.12 0.24 0.31 rg")
    }
    pageOps.push(textRight(355, y, 8, String(bill.quantity ?? 1)))
    pageOps.push(textRight(455, y, 8, `INR ${Number(bill.unitPrice ?? bill.amount).toLocaleString("en-IN")}`))
    pageOps.push(textRight(558, y, 8, `INR ${Number(bill.amount).toLocaleString("en-IN")}`))
    y -= rowHeight
    if (rowIndex < rows.length - 1) {
      const separatorY = y + (rowHeight - 5 - (lines.length - 1) * 13) / 2
      pageOps.push(`0.88 0.92 0.93 RG 54 ${separatorY} m 558 ${separatorY} l S`)
    }
    y -= 5
  }
  if (y < 220) {
    finishPage(false)
    startPage(pages.length + 1)
  }
  finishPage(true)

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${5 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ]
  pages.forEach((stream, index) => {
    const pageObject = 5 + index * 2
    const contentObject = pageObject + 1
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObject} 0 R >>`)
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  })

  let document = "%PDF-1.4\n"
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(document.length)
    document += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = document.length
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) {
    document += `${String(offset).padStart(10, "0")} 00000 n \n`
  }
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  const url = URL.createObjectURL(new Blob([document], { type: "application/pdf" }))
  const link = window.document.createElement("a")
  link.href = url
  link.download = `Neurocyte-${invoiceId}.pdf`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
