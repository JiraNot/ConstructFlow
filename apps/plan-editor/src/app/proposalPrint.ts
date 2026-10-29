import { proposalOutputLines, type ProposalDraft } from '@constructflow/project-model'

const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]!))

const money = (value: number) => `฿${value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const proposalStatusLabels = {
  draft: 'แบบร่าง', sent: 'ส่งแล้ว · บันทึกติดตาม', accepted: 'ตอบรับแล้ว · บันทึกติดตาม',
  declined: 'ไม่รับข้อเสนอ · บันทึกติดตาม', void: 'ยกเลิก · บันทึกติดตาม',
} as const
const fieldFormCategoryLabels = {
  site_visit: 'เข้าตรวจหน้างาน', quality_inspection: 'ตรวจงาน', safety_observation: 'ความปลอดภัย', client_request: 'คำขอลูกค้า', custom: 'กำหนดเอง',
} as const

function renderDeviceSignature(signature: NonNullable<NonNullable<ProposalDraft['status_events']>[number]['device_signature']>): string {
  if (!signature || !Array.isArray(signature.strokes)) return ''
  const paths = signature.strokes.map(stroke => {
    if (!Array.isArray(stroke) || stroke.length < 1) return ''
    const points = stroke.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)
    if (!points.length) return ''
    const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${(point.x * 600).toFixed(2)} ${(point.y * 150).toFixed(2)}`).join(' ')
    const last = points[points.length - 1]!
    const moveOnly = points.length === 1 ? ` L ${(last.x * 600).toFixed(2)} ${(last.y * 150).toFixed(2)}` : ''
    return `<path d="${path}${moveOnly}"/>`
  }).filter(Boolean).join('')
  if (!paths) return ''
  const capturedAt = Number.isFinite(Date.parse(signature.captured_at)) ? new Date(signature.captured_at).toLocaleString('th-TH') : 'ไม่ทราบเวลา'
  return `<div class="status-signature"><div><small>ลายเซ็นที่บันทึกบนอุปกรณ์</small><b>${escapeHtml(signature.signer_name)}</b><time>${escapeHtml(capturedAt)}</time></div><svg viewBox="0 0 600 180" role="img" aria-label="ลายเซ็น ${escapeHtml(signature.signer_name)}" preserveAspectRatio="xMidYMid meet">${paths}</svg></div>`
}

/** Open a self-contained print layout so the browser can save a proposal as PDF. */
export function printProposalDocument(proposal: ProposalDraft, projectName: string): void {
  const printWindow = window.open('', '_blank')
  if (!printWindow) throw new Error('Print window was blocked')
  const rows = proposalOutputLines(proposal).map(line => `<tr>
    <td><b>${escapeHtml(line.mark)}</b><span>${escapeHtml(line.description)}</span><small>${line.visibility_rollup ? 'รายการรวม' : `${escapeHtml(line.phase)} · ${escapeHtml(line.cost_center)}${line.formula ? ` · ${escapeHtml(line.formula)}` : ''}`}</small></td>
    <td class="num">${line.quantity.toLocaleString('th-TH', { maximumFractionDigits: 3 })} ${escapeHtml(line.unit)}</td>
    <td class="num">${money(line.unit_rate_thb)}</td><td class="num">${money(line.amount_thb)}</td>
  </tr>`).join('')
  const validUntil = proposal.valid_until ? new Date(`${proposal.valid_until}T00:00:00`).toLocaleDateString('th-TH') : 'ไม่ระบุ'
  const warning = proposal.source_takeoff_warnings.length
    ? `<aside>มีข้อสังเกตจากการถอดปริมาณ ${proposal.source_takeoff_warnings.length} รายการ กรุณาตรวจสอบก่อนตกลงจ้าง</aside>`
    : ''
  const hasDeviceSignature = proposal.status_events?.some(event => event.device_signature)
  const hasRecipientSignature = proposal.status_events?.some(event => event.recipient_signature)
  const statusHistory = proposal.status_events?.length
    ? `<section class="status-history"><h2>ประวัติสถานะ</h2><ul>${proposal.status_events.map(event => `<li><div class="status-event-main"><b>${escapeHtml(proposalStatusLabels[event.to_status])}</b><span>${escapeHtml(new Date(event.occurred_at).toLocaleString('th-TH'))}${event.note ? ` · ${escapeHtml(event.note)}` : ''}</span></div>${event.device_signature ? renderDeviceSignature(event.device_signature) : ''}${event.recipient_signature ? `${renderDeviceSignature(event.recipient_signature)}<small>ผู้รับข้อเสนอตอบกลับผ่านลิงก์ใช้ครั้งเดียว · รหัสลิงก์ ${escapeHtml(event.recipient_signature.approval_link_id.slice(0, 8))}</small>` : ''}</li>`).join('')}</ul><p>สถานะติดตามใน ConstructFlow${hasDeviceSignature || hasRecipientSignature ? ' · ชื่อและลายเซ็นระบุด้วยตนเอง ไม่ได้ยืนยันตัวบุคคลหรือผ่านผู้ให้บริการ e-signature' : ' · ไม่มีลายเซ็นอิเล็กทรอนิกส์'} · เอกสารนี้ไม่ได้ส่งทางอีเมลโดยระบบ</p></section>`
    : `<p class="status-note">สถานะเป็นบันทึกติดตามใน ConstructFlow · ระบบยังไม่ส่งอีเมลและไม่ได้เก็บลายเซ็นอิเล็กทรอนิกส์</p>`
  const fieldData = proposal.field_data_snapshots?.length
    ? `<section class="field-data"><h2>ข้อมูลหน้างานประกอบข้อเสนอ</h2>${proposal.field_data_snapshots.map(snapshot => {
      const responses = snapshot.responses.map(response => {
        const value = typeof response.value === 'boolean' ? (response.value ? 'ใช่' : 'ไม่ใช่')
          : typeof response.value === 'number' ? response.value.toLocaleString('th-TH') : response.value
        return `<div><dt>${escapeHtml(response.label)}</dt><dd>${escapeHtml(value)}</dd></div>`
      }).join('')
      const context = [fieldFormCategoryLabels[snapshot.category], new Date(snapshot.submitted_at).toLocaleDateString('th-TH'), snapshot.level_name,
        ...(snapshot.location_mm ? [`${(snapshot.location_mm[0] / 1000).toLocaleString('th-TH', { maximumFractionDigits: 3 })}, ${(snapshot.location_mm[1] / 1000).toLocaleString('th-TH', { maximumFractionDigits: 3 })} m`] : [])]
        .filter(Boolean).map(escapeHtml).join(' · ')
      const gps = snapshot.gps_location
        ? `<p>ตำแหน่ง GPS จากอุปกรณ์: ${snapshot.gps_location.latitude.toFixed(6)}°, ${snapshot.gps_location.longitude.toFixed(6)}° · ความแม่นยำอุปกรณ์ ±${snapshot.gps_location.accuracy_m.toFixed(0)} ม. · บันทึก ${escapeHtml(new Date(snapshot.gps_location.captured_at).toLocaleString('th-TH'))} · ไม่ใช่หมุดสำรวจแนวเขต</p>`
        : ''
      return `<article class="field-data-card"><h3>${escapeHtml(snapshot.title)}</h3><p>${context}</p>${gps}${responses ? `<dl>${responses}</dl>` : '<p>ไม่มีคำตอบเพิ่มเติม</p>'}${snapshot.notes ? `<div class="field-data-notes"><b>หมายเหตุ:</b> ${escapeHtml(snapshot.notes)}</div>` : ''}</article>`
    }).join('')}</section>`
    : ''
  const conditionalTexts = proposal.conditional_texts?.some(rule => rule.matched && rule.rendered_text)
    ? `<section class="conditional-texts"><h2>รายละเอียดตามข้อมูลโครงการ</h2>${proposal.conditional_texts.filter(rule => rule.matched && rule.rendered_text).map(rule => `<p>${escapeHtml(rule.rendered_text)}</p>`).join('')}</section>`
    : ''
  const hasPricingBreakdown = [
    proposal.factor_f_subtotal_thb, proposal.gross_margin_amount_thb,
    proposal.subtotal_before_discount_thb, proposal.discount_amount_thb,
    proposal.taxable_amount_thb, proposal.vat_amount_thb,
  ].every(value => typeof value === 'number' && Number.isFinite(value))
  const priceSummary = hasPricingBreakdown
    ? `<div><span>ฐาน Factor F · ×${proposal.factor_f.toFixed(4)} ก่อน VAT</span><b>${money(proposal.factor_f_subtotal_thb!)}</b></div>
      ${(proposal.product_margin_amount_thb ?? 0) !== 0 ? `<div><span>Gross margin จากสินค้า Supplier</span><b>${money(proposal.product_margin_amount_thb ?? 0)}</b></div>` : ''}
      <div><span>Gross margin เพิ่มเติม (${(proposal.gross_margin_percent ?? 0).toLocaleString('th-TH')}%)</span><b>${money(proposal.gross_margin_amount_thb!)}</b></div>
      <div><span>ยอดก่อนส่วนลด</span><b>${money(proposal.subtotal_before_discount_thb!)}</b></div>
      <div><span>ส่วนลด (${(proposal.discount_percent ?? 0).toLocaleString('th-TH')}%)${proposal.discount_rule_snapshot ? ` · ${escapeHtml(proposal.discount_rule_snapshot.rule_name)}` : ''}</span><b>−${money(proposal.discount_amount_thb!)}</b></div>
      <div><span>ฐานภาษี</span><b>${money(proposal.taxable_amount_thb!)}</b></div>
      <div><span>VAT ${Math.round(proposal.vat_rate * 100)}%</span><b>${money(proposal.vat_amount_thb!)}</b></div>`
    : `<div><span>Factor F รวม VAT ${Math.round(proposal.vat_rate * 100)}%</span><b>× ${proposal.factor_f.toFixed(4)}</b></div>`
  printWindow.document.open()
  printWindow.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(proposal.title)}</title><style>
    @page{size:A4;margin:16mm}*{box-sizing:border-box}body{font:13px/1.55 Arial,"Noto Sans Thai",sans-serif;color:#172033;margin:0}header{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #0b6e84;padding-bottom:16px}h1{font-size:24px;margin:0 0 4px;color:#0b5265}h2{font-size:17px;margin:26px 0 8px}.muted{color:#64748b}.meta{text-align:right}.parties{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:22px 0}.parties p{margin:2px 0}.label{color:#64748b;font-size:11px;text-transform:uppercase}table{width:100%;border-collapse:collapse;font-size:11px}th{text-align:left;background:#eaf3f5;color:#21404a;padding:9px 7px}td{padding:8px 7px;border-bottom:1px solid #dce4e8;vertical-align:top}td span,td small{display:block}td small{color:#667085;margin-top:2px}.num{text-align:right;white-space:nowrap}.summary{width:340px;margin:18px 0 0 auto}.summary div{display:flex;justify-content:space-between;gap:20px;padding:5px 0}.summary .grand{margin-top:7px;padding-top:10px;border-top:2px solid #0b6e84;font-size:17px;font-weight:700}.field-data-card{break-inside:avoid;padding:9px 0;border-bottom:1px solid #e0e8ee}.field-data-card h3{margin:0;color:#2d4d62;font-size:13px}.field-data-card>p{margin:3px 0;color:#64748b;font-size:10px}.field-data-card dl{display:grid;grid-template-columns:1fr 1fr;gap:5px 18px;margin:8px 0}.field-data-card dl div{display:grid;grid-template-columns:minmax(100px,.8fr) minmax(0,1.2fr);gap:8px}.field-data-card dt{color:#64748b;font-size:10px}.field-data-card dd{margin:0;color:#263d55;font-size:11px;overflow-wrap:anywhere}.field-data-notes{white-space:pre-wrap;margin-top:6px;font-size:10px}.conditional-texts p{white-space:pre-wrap;break-inside:avoid;margin:6px 0;padding:9px 11px;border-left:3px solid #0b6e84;background:#f4f8fa}.notes{white-space:pre-wrap}.terms{white-space:pre-wrap;color:#475569}.status-note,.status-history p{color:#53697f;font-size:10px}.status-history ul{margin:0;padding:0;list-style:none}.status-history li{padding:7px 0;border-bottom:1px solid #e3eaf0}.status-event-main{display:flex;justify-content:space-between;gap:16px}.status-event-main span{color:#53697f}.status-signature{display:grid;grid-template-columns:150px minmax(0,1fr);align-items:center;gap:16px;margin:8px 0 4px;break-inside:avoid}.status-signature div{display:grid}.status-signature small,.status-signature time{font-size:9px;color:#53697f}.status-signature b{font-size:11px}.status-signature svg{width:100%;height:52px;border:1px solid #dce4e8;border-radius:4px}.status-signature path{fill:none;stroke:#153e54;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}aside{margin-top:20px;padding:12px;background:#fff5e7;color:#8d4e00}footer{margin-top:38px;display:grid;grid-template-columns:1fr 1fr;gap:40px;text-align:center}footer span{padding-top:38px;border-top:1px solid #718096}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body><header><div><div class="label">ข้อเสนอราคา · ${escapeHtml(proposalStatusLabels[proposal.status])}</div><h1>${escapeHtml(proposal.title)}</h1><div class="muted">โครงการ ${escapeHtml(projectName)}</div></div><div class="meta"><b>เลขที่เอกสาร</b><br>${escapeHtml(proposal.id.slice(0, 8).toUpperCase())}<br><span class="muted">ใช้ได้ถึง ${escapeHtml(validUntil)}</span></div></header>
    <section class="parties"><div><div class="label">เสนอให้</div><b>${escapeHtml(proposal.recipient_name || 'ลูกค้า')}</b>${proposal.recipient_email ? `<p>${escapeHtml(proposal.recipient_email)}</p>` : ''}${proposal.recipient_phone ? `<p>${escapeHtml(proposal.recipient_phone)}</p>` : ''}${proposal.recipient_address ? `<p>${escapeHtml(proposal.recipient_address)}</p>` : ''}</div><div><div class="label">ขอบเขตราคา</div><p>ปริมาณงานอ้างอิงจากโมเดลและ BOQ ของโครงการ</p><p>หน่วยเงิน: บาท (THB)</p></div></section>
    <h2>รายการเสนอราคา</h2><table><thead><tr><th>รายการ / เฟส</th><th class="num">ปริมาณ</th><th class="num">ราคา/หน่วย</th><th class="num">รวม</th></tr></thead><tbody>${rows || '<tr><td colspan="4">ไม่มีรายการถอดปริมาณ</td></tr>'}</tbody></table>
    <section class="summary"><div><span>งานตาม BOQ</span><b>${money(proposal.direct_cost_thb)}</b></div><div><span>เตรียมการ</span><b>${money(proposal.preliminaries_thb)}</b></div>${priceSummary}<div class="grand"><span>ยอดเสนอราคา</span><span>${money(proposal.grand_total_thb)}</span></div></section>
    ${fieldData}${conditionalTexts}${proposal.notes ? `<h2>หมายเหตุ</h2><div class="notes">${escapeHtml(proposal.notes)}</div>` : ''}${proposal.terms ? `<h2>เงื่อนไข</h2><div class="terms">${escapeHtml(proposal.terms)}</div>` : ''}${statusHistory}${warning}
    <footer><span>ผู้เสนอราคา</span><span>ผู้รับข้อเสนอ</span></footer><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350))</script></body></html>`)
  printWindow.document.close()
  printWindow.focus()
}
