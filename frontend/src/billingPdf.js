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
  const overallStatus = pendingTotal > 0 ? "PENDING" : "PAID"
  const formattedDate = new Date(`${date}T00:00:00`).toLocaleDateString(
    "en-IN",
    { day: "2-digit", month: "long", year: "numeric" },
  )
  const rows = bills.map((bill) => ({
    bill,
    lines: wrapText(bill.description),
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
      text(78, 762, 17, "NEUROCYTE HOSPITAL", "F2"),
      text(78, 740, 10, "DAILY ITEMIZED PATIENT RECEIPT"),
      "0.12 0.24 0.31 rg",
      text(54, 682, 11, `Invoice ID: ${invoiceId}`, "F2"),
      text(54, 662, 10, `Billing date: ${formattedDate}`),
      text(54, 642, 10, `Patient: ${patient.name}`),
      text(54, 622, 10, `Patient token: ${patient.id}    Contact: ${patient.contact || "-"}`),
      "0.91 0.95 0.96 rg 54 584 504 22 re f",
      "0.12 0.24 0.31 rg",
      text(62, 591, 8, "SERVICE / DESCRIPTION", "F2"),
      text(423, 591, 8, "STATUS", "F2"),
      textRight(558, 591, 8, "AMOUNT", "F2"),
    ]
    y = 568
  }
  const finishPage = (includeTotals = false) => {
    if (includeTotals) {
      y -= 8
      pageOps.push("0.72 0.81 0.84 RG 54 "+y+" m 558 "+y+" l S")
      y -= 23
      pageOps.push("0.12 0.24 0.31 rg")
      pageOps.push(text(370, y, 9, "TOTAL BILLED"), textRight(558, y, 9, `INR ${(paidTotal + pendingTotal).toLocaleString("en-IN")}`, "F2"))
      y -= 17
      pageOps.push(text(370, y, 9, "PAID"), textRight(558, y, 9, `INR ${paidTotal.toLocaleString("en-IN")}`))
      y -= 17
      pageOps.push(text(370, y, 9, "PENDING"), textRight(558, y, 9, `INR ${pendingTotal.toLocaleString("en-IN")}`))
      y -= 22
      pageOps.push(text(370, y, 11, `DAY STATUS: ${overallStatus}`, "F2"))
    }
    pageOps.push("0.20 0.59 0.52 RG 54 70 m 558 70 l S")
    pageOps.push("0.43 0.52 0.56 rg")
    pageOps.push(text(54, 52, 8, `Invoice ${invoiceId}  |  Page ${pages.length + 1}`))
    pages.push(pageOps.join("\n"))
  }

  startPage(1)
  for (const [rowIndex, { bill, lines }] of rows.entries()) {
    const rowHeight = Math.max(30, lines.length * 14 + 10)
    if (y - rowHeight < 155) {
      finishPage(false)
      startPage(pages.length + 1)
    }
    pageOps.push("0.12 0.24 0.31 rg")
    lines.forEach((line, index) => pageOps.push(text(62, y - index * 13, 8, line)))
    pageOps.push(text(423, y, 8, bill.status.toUpperCase()))
    pageOps.push(textRight(558, y, 8, `INR ${Number(bill.amount).toLocaleString("en-IN")}`))
    y -= rowHeight
    if (rowIndex < rows.length - 1) {
      const separatorY = y + (rowHeight - 5 - (lines.length - 1) * 13) / 2
      pageOps.push(`0.88 0.92 0.93 RG 54 ${separatorY} m 558 ${separatorY} l S`)
    }
    y -= 5
  }
  if (y < 190) {
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
