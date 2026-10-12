function pdfEscape(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[\\()]/g, "\\$&")
}

export function downloadBillPdf(bill) {
  const date = new Date(`${bill.date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
  const amount = `INR ${Number(bill.amount).toLocaleString("en-IN")}`
  const text = (x, y, size, value, font = "F1") =>
    `BT /${font} ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET`
  const textOps = [
    "0.08 0.25 0.34 rg 0 650 612 142 re f",
    "0.20 0.59 0.52 rg 54 650 7 142 re f",
    "1 1 1 rg",
    text(78, 746, 19, "NEUROCYTE HOSPITAL", "F2"),
    text(78, 718, 11, "PATIENT BILL / INVOICE"),
    "0.12 0.24 0.31 rg",
    text(54, 600, 13, `Invoice NC-${bill.id}`, "F2"),
    text(54, 575, 10, `Billing date: ${date}`),
    text(54, 535, 10, `Patient: ${bill.patientName}`, "F2"),
    text(54, 515, 10, `Patient ID: ${bill.patientId}`),
    text(54, 495, 10, `Contact: ${bill.contact || "-"}`),
    "0.91 0.95 0.96 rg 54 438 504 30 re f",
    "0.12 0.24 0.31 rg",
    text(66, 449, 9, "SERVICE", "F2"),
    text(440, 449, 9, "AMOUNT", "F2"),
    text(66, 405, 11, bill.description),
    text(440, 405, 11, amount),
    "0.82 0.88 0.90 RG 54 384 m 558 384 l S",
    "0.12 0.24 0.31 rg",
    text(350, 350, 10, "TOTAL DUE", "F2"),
    text(440, 350, 14, amount, "F2"),
    text(350, 320, 10, `STATUS: ${bill.status.toUpperCase()}`, "F2"),
    "0.20 0.59 0.52 RG 54 104 m 558 104 l S",
    "0.43 0.52 0.56 rg",
    text(54, 82, 9, "Thank you. Please retain this invoice for your records."),
  ].join("\n")
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 6 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${textOps.length} >>\nstream\n${textOps}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ]
  let document = "%PDF-1.4\n"
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(document.length)
    document += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = document.length
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) document += `${String(offset).padStart(10, "0")} 00000 n \n`
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  const url = URL.createObjectURL(new Blob([document], { type: "application/pdf" }))
  const link = documentCreateLink(url, `Neurocyte-Invoice-${bill.id}.pdf`)
  link.click()
  URL.revokeObjectURL(url)
}

function documentCreateLink(url, filename) {
  const link = window.document.createElement("a")
  link.href = url
  link.download = filename
  return link
}
