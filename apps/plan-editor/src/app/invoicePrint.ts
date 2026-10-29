import type { InvoiceDraft, ProposalDraft } from '@constructflow/project-model'

const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]!))

const money = (value: number) => `฿${value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const paymentDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  ? new Date(`${value}T00:00:00`).toLocaleDateString('th-TH')
  : new Date(value).toLocaleString('th-TH')
const statusLabels = {
  draft: 'แบบร่าง', issued: 'ออกเอกสารแล้ว', partially_paid: 'รับชำระบางส่วน', paid: 'ชำระครบแล้ว', void: 'ยกเลิก',
} as const
const methodLabels = { cash: 'เงินสด', bank_transfer: 'โอนเงิน', cheque: 'เช็ค', other: 'อื่น ๆ' } as const

/** Print a frozen installment statement and the manual receipt log; this is not an e-tax invoice. */
export function printInvoiceDocument(invoice: InvoiceDraft, proposal: ProposalDraft, projectName: string): void {
  const printWindow = window.open('', '_blank')
  if (!printWindow) throw new Error('Print window was blocked')
  const paymentRows = invoice.payments.map(payment => `<tr>
    <td>${escapeHtml(paymentDate(payment.received_at))}</td>
    <td>${escapeHtml(methodLabels[payment.method])}${payment.reference ? `<small>เลขอ้างอิง ${escapeHtml(payment.reference)}</small>` : ''}</td>
    <td class="num">${money(payment.amount_thb)}</td><td>${escapeHtml(payment.note || '—')}</td>
  </tr>`).join('')
  const history = invoice.status_events.length
    ? `<section><h2>ประวัติเอกสาร</h2><ul>${invoice.status_events.map(event => `<li><b>${escapeHtml(statusLabels[event.to_status])}</b><span>${escapeHtml(new Date(event.occurred_at).toLocaleString('th-TH'))}${event.note ? ` · ${escapeHtml(event.note)}` : ''}</span></li>`).join('')}</ul></section>`
    : ''
  const paid = invoice.payments.reduce((sum, payment) => sum + payment.amount_thb, 0)
  const remaining = Math.max(0, invoice.amount_due_thb - paid)
  printWindow.document.open()
  printWindow.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(invoice.number)} · ${escapeHtml(invoice.title)}</title><style>
    @page{size:A4;margin:16mm}*{box-sizing:border-box}body{font:13px/1.55 Arial,"Noto Sans Thai",sans-serif;color:#172033;margin:0}header{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #0b6e84;padding-bottom:16px}h1{font-size:23px;margin:0 0 4px;color:#0b5265}h2{font-size:16px;margin:24px 0 8px}.muted,small{color:#64748b}.meta{text-align:right}.label{color:#64748b;font-size:11px}table{width:100%;border-collapse:collapse;font-size:11px}th{text-align:left;background:#eaf3f5;color:#21404a;padding:9px 7px}td{padding:8px 7px;border-bottom:1px solid #dce4e8;vertical-align:top}td small{display:block;margin-top:2px}.num{text-align:right;white-space:nowrap}.summary{width:370px;margin:18px 0 0 auto}.summary div{display:flex;justify-content:space-between;gap:20px;padding:5px 0}.summary .grand{margin-top:7px;padding-top:10px;border-top:2px solid #0b6e84;font-size:16px;font-weight:700}.note{padding:9px 11px;background:#fff9e9;color:#765316;font-size:10px}ul{margin:0;padding:0;list-style:none}li{display:flex;justify-content:space-between;gap:16px;padding:5px 0;border-bottom:1px solid #e3eaf0}li span{color:#53697f}footer{margin-top:36px;display:grid;grid-template-columns:1fr 1fr;gap:40px;text-align:center}footer span{padding-top:38px;border-top:1px solid #718096}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body>
    <header><div><div class="label">ใบแจ้งหนี้ / Progress billing · ${escapeHtml(statusLabels[invoice.status])}</div><h1>${escapeHtml(invoice.number)} · ${escapeHtml(invoice.title)}</h1><div class="muted">โครงการ ${escapeHtml(projectName)}</div></div><div class="meta"><b>วันที่จัดทำ</b><br>${escapeHtml(new Date(invoice.created_at).toLocaleDateString('th-TH'))}<br><b>ครบกำหนด</b><br>${escapeHtml(invoice.due_date ? new Date(`${invoice.due_date}T00:00:00`).toLocaleDateString('th-TH') : 'ไม่ระบุ')}</div></header>
    <section><h2>เรียกเก็บจาก</h2><b>${escapeHtml(invoice.recipient_name || proposal.recipient_name || 'ลูกค้า')}</b>${invoice.recipient_address ? `<p>${escapeHtml(invoice.recipient_address)}</p>` : ''}<p class="muted">อ้างอิงข้อเสนอ ${escapeHtml(proposal.title)} · ${escapeHtml(proposal.id.slice(0, 8).toUpperCase())}</p></section>
    <section class="summary"><div><span>ยอดข้อเสนอที่ตอบรับ</span><b>${money(invoice.proposal_total_thb)}</b></div><div><span>change orders ที่อนุมัติ (${invoice.source_change_order_ids.length})</span><b>${money(invoice.approved_change_order_total_thb)}</b></div><div><span>ยอดสัญญาที่ตรึง</span><b>${money(invoice.contract_total_thb)}</b></div><div><span>สัดส่วนงวดนี้</span><b>${invoice.billing_percent.toLocaleString('th-TH')}%</b></div><div><span>ฐานภาษี</span><b>${money(invoice.taxable_amount_thb)}</b></div><div><span>VAT ${Math.round(invoice.vat_rate * 100)}%</span><b>${money(invoice.vat_amount_thb)}</b></div><div class="grand"><span>ยอดเรียกเก็บงวดนี้</span><b>${money(invoice.amount_due_thb)}</b></div><div><span>รับชำระแล้ว</span><b>${money(paid)}</b></div><div><span>ยอดคงค้าง</span><b>${money(remaining)}</b></div></section>
    ${invoice.notes ? `<section><h2>หมายเหตุ</h2><p>${escapeHtml(invoice.notes)}</p></section>` : ''}
    ${invoice.payments.length ? `<section><h2>รายการรับชำระที่บันทึก</h2><table><thead><tr><th>วันที่</th><th>วิธี / อ้างอิง</th><th class="num">ยอดรับ</th><th>หมายเหตุ</th></tr></thead><tbody>${paymentRows}</tbody></table></section>` : ''}
    ${history}<p class="note">เอกสารที่พิมพ์จาก ConstructFlow เป็นเอกสารติดตามยอดเรียกเก็บและประวัติรับชำระด้วยตนเอง · ไม่ใช่ใบกำกับภาษีอิเล็กทรอนิกส์ · ระบบไม่ได้ส่งเอกสารหรือรับชำระผ่านธนาคาร</p>
    <footer><span>ผู้จัดทำ / ผู้รับเงิน</span><span>ลูกค้า / ผู้ชำระ</span></footer><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350))</script>
  </body></html>`)
  printWindow.document.close()
  printWindow.focus()
}
