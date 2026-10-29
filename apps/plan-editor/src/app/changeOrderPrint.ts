import { changeOrderOutputLines, type ChangeOrderDraft, type ProposalDraft } from '@constructflow/project-model'

const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]!))

const money = (value: number) => `${value < 0 ? '−' : ''}฿${Math.abs(value).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const statusLabels = {
  draft: 'แบบร่าง', sent: 'ส่งแล้ว · บันทึกติดตาม', accepted: 'อนุมัติแล้ว · บันทึกติดตาม',
  declined: 'ไม่อนุมัติ · บันทึกติดตาม', void: 'ยกเลิก · บันทึกติดตาม',
} as const

/** Print a frozen scope adjustment; delivery and approval are explicitly recorded outside the app. */
export function printChangeOrderDocument(changeOrder: ChangeOrderDraft, proposal: ProposalDraft, projectName: string): void {
  const printWindow = window.open('', '_blank')
  if (!printWindow) throw new Error('Print window was blocked')
  const rows = changeOrderOutputLines(changeOrder).map(line => `<tr>
    <td><b>${escapeHtml(line.mark)}</b><span>${escapeHtml(line.description)}</span><small>${line.visibility_rollup ? 'รายการรวม · ปรับขอบเขตโครงการ' : `${escapeHtml(line.phase)} · ${escapeHtml(line.cost_center)} · ${escapeHtml(line.formula)}`}</small></td>
    <td class="num ${line.change_quantity < 0 ? 'credit' : ''}">${line.change_quantity > 0 ? '+' : '−'}${Math.abs(line.change_quantity).toLocaleString('th-TH', { maximumFractionDigits: 3 })} ${escapeHtml(line.unit)}</td>
    <td class="num">${money(line.unit_rate_thb)}</td><td class="num ${line.amount_thb < 0 ? 'credit' : ''}">${money(line.amount_thb)}</td>
  </tr>`).join('')
  const history = changeOrder.status_events?.length
    ? `<section><h2>ประวัติสถานะ</h2><ul>${changeOrder.status_events.map(event => `<li><b>${escapeHtml(statusLabels[event.to_status])}</b><span>${escapeHtml(new Date(event.occurred_at).toLocaleString('th-TH'))}${event.note ? ` · ${escapeHtml(event.note)}` : ''}</span></li>`).join('')}</ul><p class="note">สถานะเป็นบันทึกติดตามด้วยตนเอง · เอกสารนี้ไม่ได้ถูกส่งโดยระบบและไม่มีลายเซ็นอิเล็กทรอนิกส์</p></section>`
    : '<p class="note">สถานะเป็นบันทึกติดตามใน ConstructFlow · ระบบยังไม่ส่งอีเมลและไม่ได้เก็บลายเซ็นอิเล็กทรอนิกส์</p>'
  const newTotal = changeOrder.base_contract_total_thb + changeOrder.grand_total_delta_thb
  printWindow.document.open()
  printWindow.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(changeOrder.number)} · ${escapeHtml(changeOrder.title)}</title><style>
    @page{size:A4;margin:16mm}*{box-sizing:border-box}body{font:13px/1.55 Arial,"Noto Sans Thai",sans-serif;color:#172033;margin:0}header{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #0b6e84;padding-bottom:16px}h1{font-size:23px;margin:0 0 4px;color:#0b5265}h2{font-size:16px;margin:24px 0 8px}.muted,small{color:#64748b}.meta{text-align:right}.label{color:#64748b;font-size:11px}table{width:100%;border-collapse:collapse;font-size:11px}th{text-align:left;background:#eaf3f5;color:#21404a;padding:9px 7px}td{padding:8px 7px;border-bottom:1px solid #dce4e8;vertical-align:top}td span,td small{display:block}td small{margin-top:2px}.num{text-align:right;white-space:nowrap}.credit{color:#a63f3f}.summary{width:370px;margin:18px 0 0 auto}.summary div{display:flex;justify-content:space-between;gap:20px;padding:5px 0}.summary .delta{font-weight:700}.summary .grand{margin-top:7px;padding-top:10px;border-top:2px solid #0b6e84;font-size:16px;font-weight:700}.note{color:#53697f;font-size:10px}ul{margin:0;padding:0;list-style:none}li{display:flex;justify-content:space-between;gap:16px;padding:5px 0;border-bottom:1px solid #e3eaf0}li span{color:#53697f}footer{margin-top:36px;display:grid;grid-template-columns:1fr 1fr;gap:40px;text-align:center}footer span{padding-top:38px;border-top:1px solid #718096}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body>
    <header><div><div class="label">เอกสารเปลี่ยนแปลงขอบเขตงาน · ${escapeHtml(statusLabels[changeOrder.status])}</div><h1>${escapeHtml(changeOrder.number)} · ${escapeHtml(changeOrder.title)}</h1><div class="muted">โครงการ ${escapeHtml(projectName)}</div></div><div class="meta"><b>อ้างอิงข้อเสนอ</b><br>${escapeHtml(proposal.id.slice(0, 8).toUpperCase())}<br>${escapeHtml(proposal.title)}<br><span class="muted">${escapeHtml(proposal.recipient_name || 'ลูกค้า')}</span></div></header>
    <section><h2>รายการเปลี่ยนแปลง</h2><table><thead><tr><th>รายการ / เฟส</th><th class="num">ส่วนต่างปริมาณ</th><th class="num">ราคา/หน่วย</th><th class="num">รวม</th></tr></thead><tbody>${rows}</tbody></table></section>
    <section class="summary"><div><span>ยอดสัญญาก่อนอนุมัติ</span><b>${money(changeOrder.base_contract_total_thb)}</b></div><div><span>ต้นทุนตรงส่วนต่าง</span><b>${money(changeOrder.direct_cost_delta_thb)}</b></div><div><span>Factor F เดิม · ×${changeOrder.factor_f.toFixed(4)}</span><b>${money(changeOrder.factor_f_subtotal_delta_thb)}</b></div>${(changeOrder.product_margin_delta_thb ?? 0) !== 0 ? `<div><span>ส่วนต่าง margin สินค้า</span><b>${money(changeOrder.product_margin_delta_thb ?? 0)}</b></div>` : ''}<div><span>Gross margin ${changeOrder.gross_margin_percent.toLocaleString('th-TH')}%</span><b>${money(changeOrder.gross_margin_amount_delta_thb)}</b></div><div><span>ส่วนลด ${changeOrder.discount_percent.toLocaleString('th-TH')}%</span><b>${money(-changeOrder.discount_amount_delta_thb)}</b></div><div><span>VAT ${Math.round(changeOrder.vat_rate * 100)}%</span><b>${money(changeOrder.vat_amount_delta_thb)}</b></div><div class="delta"><span>มูลค่า change order</span><b>${money(changeOrder.grand_total_delta_thb)}</b></div><div class="grand"><span>ยอดสัญญาหากอนุมัติ</span><b>${money(newTotal)}</b></div></section>
    ${changeOrder.notes ? `<section><h2>หมายเหตุ</h2><p>${escapeHtml(changeOrder.notes)}</p></section>` : ''}${history}
    <footer><span>ผู้เสนอการเปลี่ยนแปลง</span><span>ผู้อนุมัติ</span></footer><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350))</script>
  </body></html>`)
  printWindow.document.close()
  printWindow.focus()
}
