import React, { useState } from "react";
import type { ProjectDocument, ProjectLegalMetadata } from "@constructflow/project-model";
import { FileText, ShieldCheck, MapPin, UserCheck, X } from "lucide-react";

interface ProjectLegalModalProps {
  project: ProjectDocument;
  isOpen: boolean;
  onClose: () => void;
  onSave: (legal: ProjectLegalMetadata) => void;
}

export const ProjectLegalModal: React.FC<ProjectLegalModalProps> = ({
  project,
  isOpen,
  onClose,
  onSave,
}) => {
  const existing = project.legal_metadata;

  const [deedNo, setDeedNo] = useState(existing?.deed_no ?? "45678");
  const [landNo, setLandNo] = useState(existing?.land_no ?? "123");
  const [surveyPage, setSurveyPage] = useState(existing?.survey_page ?? "9988");
  const [subdistrict, setSubdistrict] = useState(existing?.subdistrict ?? "ลาดยาว");
  const [district, setDistrict] = useState(existing?.district ?? "จตุจักร");
  const [province, setProvince] = useState(existing?.province ?? "กรุงเทพมหานคร");
  const [rai, setRai] = useState(existing?.rai ?? 0);
  const [ngan, setNgan] = useState(existing?.ngan ?? 1);
  const [sqWa, setSqWa] = useState(existing?.sq_wa ?? 50);

  const [setbackFront, setSetbackFront] = useState(existing?.setbacks.front_m ?? 3.0);
  const [setbackRear, setSetbackRear] = useState(existing?.setbacks.rear_m ?? 2.0);
  const [setbackLeft, setSetbackLeft] = useState(existing?.setbacks.left_m ?? 2.0);
  const [setbackRight, setSetbackRight] = useState(existing?.setbacks.right_m ?? 2.0);

  const [zoneCode, setZoneCode] = useState(existing?.zoning.zone_code ?? "ย.4-12");
  const [farLimit, setFarLimit] = useState(existing?.zoning.far_limit ?? 3.0);
  const [osrMin, setOsrMin] = useState(existing?.zoning.osr_min_percent ?? 10.0);

  const [ownerName, setOwnerName] = useState(existing?.signatories.owner_name ?? "นายสมชาย เจริญสุข");
  const [archName, setArchName] = useState(existing?.signatories.architect_name ?? "นายสถาปัตย์ มั่นคง");
  const [archLicense, setArchLicense] = useState(existing?.signatories.architect_license_no ?? "ส-สถ. 9876");
  const [engName, setEngName] = useState(existing?.signatories.structural_engineer_name ?? "นายวิศวกร ปลอดภัย");
  const [engLicense, setEngLicense] = useState(existing?.signatories.structural_engineer_license_no ?? "วส. 5432");
  const [approved, setApproved] = useState(existing?.signatories.issue_approved ?? true);

  if (!isOpen) return null;

  const totalAreaSqm = rai * 1600 + ngan * 400 + sqWa * 4;

  const handleSave = () => {
    const legal: ProjectLegalMetadata = {
      deed_no: deedNo,
      land_no: landNo,
      survey_page: surveyPage,
      subdistrict,
      district,
      province,
      rai,
      ngan,
      sq_wa: sqWa,
      total_area_sqm: totalAreaSqm,
      boundary_pegs: existing?.boundary_pegs ?? [
        { peg_no: "1", coordinate_m: [0, 0] },
        { peg_no: "2", coordinate_m: [20, 0] },
        { peg_no: "3", coordinate_m: [20, 30] },
        { peg_no: "4", coordinate_m: [0, 30] },
      ],
      setbacks: {
        front_m: setbackFront,
        rear_m: setbackRear,
        left_m: setbackLeft,
        right_m: setbackRight,
        min_opening_setback_m: 2.0,
        min_blind_setback_m: 0.5,
      },
      zoning: {
        zone_code: zoneCode,
        far_limit: farLimit,
        osr_min_percent: osrMin,
        permeable_open_space_ratio_percent: 50.0,
      },
      signatories: {
        owner_name: ownerName,
        architect_name: archName,
        architect_license_no: archLicense,
        structural_engineer_name: engName,
        structural_engineer_license_no: engLicense,
        signed_date: new Date().toISOString().split("T")[0],
        issue_approved: approved,
      },
    };
    onSave(legal);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          width: "90%",
          maxWidth: 720,
          maxHeight: "90vh",
          overflowY: "auto",
          background: "#0f172a",
          color: "#f8fafc",
          borderRadius: 8,
          border: "1px solid #334155",
          padding: 24,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <FileText size={24} color="#38bdf8" />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              ข้อมูลโฉนดที่ดิน & ผู้มีส่วนได้เสีย (แบบ อ.1 Permit Set)
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" }}
          >
            <X size={20} />
          </button>
        </div>

        {/* 1. Title Deed Section */}
        <div style={{ marginBottom: 20, padding: 14, background: "#1e293b", borderRadius: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <MapPin size={18} color="#38bdf8" />
            <strong style={{ fontSize: 14, color: "#e2e8f0" }}>ข้อมูลโฉนดที่ดิน (น.ส. 4 จ.)</strong>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: "#94a3b8", display: "block" }}>เลขที่โฉนด</label>
              <input
                type="text"
                value={deedNo}
                onChange={(e) => setDeedNo(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", background: "#0f172a", border: "1px solid #475569", color: "#fff", borderRadius: 4 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#94a3b8", display: "block" }}>เลขที่ดิน</label>
              <input
                type="text"
                value={landNo}
                onChange={(e) => setLandNo(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", background: "#0f172a", border: "1px solid #475569", color: "#fff", borderRadius: 4 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#94a3b8", display: "block" }}>หน้าสำรวจ</label>
              <input
                type="text"
                value={surveyPage}
                onChange={(e) => setSurveyPage(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", background: "#0f172a", border: "1px solid #475569", color: "#fff", borderRadius: 4 }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: "#94a3b8", display: "block" }}>ตำบล / แขวง</label>
              <input
                type="text"
                value={subdistrict}
                onChange={(e) => setSubdistrict(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", background: "#0f172a", border: "1px solid #475569", color: "#fff", borderRadius: 4 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#94a3b8", display: "block" }}>อำเภอ / เขต</label>
              <input
                type="text"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", background: "#0f172a", border: "1px solid #475569", color: "#fff", borderRadius: 4 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#94a3b8", display: "block" }}>จังหวัด</label>
              <input
                type="text"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", background: "#0f172a", border: "1px solid #475569", color: "#fff", borderRadius: 4 }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1.5fr", gap: 10, marginTop: 10, alignItems: "center" }}>
            <div>
              <label style={{ fontSize: 11, color: "#94a3b8", display: "block" }}>ไร่</label>
              <input
                type="number"
                value={rai}
                onChange={(e) => setRai(Number(e.target.value))}
                style={{ width: "100%", padding: "6px 8px", background: "#0f172a", border: "1px solid #475569", color: "#fff", borderRadius: 4 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#94a3b8", display: "block" }}>งาน</label>
              <input
                type="number"
                value={ngan}
                onChange={(e) => setNgan(Number(e.target.value))}
                style={{ width: "100%", padding: "6px 8px", background: "#0f172a", border: "1px solid #475569", color: "#fff", borderRadius: 4 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#94a3b8", display: "block" }}>ตารางวา</label>
              <input
                type="number"
                value={sqWa}
                onChange={(e) => setSqWa(Number(e.target.value))}
                style={{ width: "100%", padding: "6px 8px", background: "#0f172a", border: "1px solid #475569", color: "#fff", borderRadius: 4 }}
              />
            </div>
            <div style={{ fontSize: 12, color: "#38bdf8", paddingTop: 16 }}>
              รวม: {totalAreaSqm.toFixed(2)} ตร.ม.
            </div>
          </div>
        </div>

        {/* 2. Thai Building Code Setback & Zoning */}
        <div style={{ marginBottom: 20, padding: 14, background: "#1e293b", borderRadius: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <ShieldCheck size={18} color="#4ade80" />
            <strong style={{ fontSize: 14, color: "#e2e8f0" }}>ระยะร่นตามกฎกระทรวงฉบับที่ 55 & ผังเมือง</strong>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: "#94a3b8", display: "block" }}>ร่นด้านหน้า (ม.)</label>
              <input
                type="number"
                step="0.1"
                value={setbackFront}
                onChange={(e) => setSetbackFront(Number(e.target.value))}
                style={{ width: "100%", padding: "6px 8px", background: "#0f172a", border: "1px solid #475569", color: "#fff", borderRadius: 4 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#94a3b8", display: "block" }}>ร่นด้านหลัง (ม.)</label>
              <input
                type="number"
                step="0.1"
                value={setbackRear}
                onChange={(e) => setSetbackRear(Number(e.target.value))}
                style={{ width: "100%", padding: "6px 8px", background: "#0f172a", border: "1px solid #475569", color: "#fff", borderRadius: 4 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#94a3b8", display: "block" }}>ร่นด้านซ้าย (ม.)</label>
              <input
                type="number"
                step="0.1"
                value={setbackLeft}
                onChange={(e) => setSetbackLeft(Number(e.target.value))}
                style={{ width: "100%", padding: "6px 8px", background: "#0f172a", border: "1px solid #475569", color: "#fff", borderRadius: 4 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#94a3b8", display: "block" }}>ร่นด้านขวา (ม.)</label>
              <input
                type="number"
                step="0.1"
                value={setbackRight}
                onChange={(e) => setSetbackRight(Number(e.target.value))}
                style={{ width: "100%", padding: "6px 8px", background: "#0f172a", border: "1px solid #475569", color: "#fff", borderRadius: 4 }}
              />
            </div>
          </div>
        </div>

        {/* 3. Signatories Section */}
        <div style={{ marginBottom: 20, padding: 14, background: "#1e293b", borderRadius: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <UserCheck size={18} color="#fbbf24" />
            <strong style={{ fontSize: 14, color: "#e2e8f0" }}>ผู้เซ็นรับรองแบบ (Signatories)</strong>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: "#94a3b8", display: "block" }}>เจ้าของอาคาร (Owner Name)</label>
            <input
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              style={{ width: "100%", padding: "6px 8px", background: "#0f172a", border: "1px solid #475569", color: "#fff", borderRadius: 4 }}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: "#94a3b8", display: "block" }}>สถาปนิกผู้ออกแบบ</label>
              <input
                type="text"
                value={archName}
                onChange={(e) => setArchName(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", background: "#0f172a", border: "1px solid #475569", color: "#fff", borderRadius: 4 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#94a3b8", display: "block" }}>เลขที่ใบอนุญาต ส-สถ.</label>
              <input
                type="text"
                value={archLicense}
                onChange={(e) => setArchLicense(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", background: "#0f172a", border: "1px solid #475569", color: "#fff", borderRadius: 4 }}
              />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: "#94a3b8", display: "block" }}>วิศวกรโครงสร้าง</label>
              <input
                type="text"
                value={engName}
                onChange={(e) => setEngName(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", background: "#0f172a", border: "1px solid #475569", color: "#fff", borderRadius: 4 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#94a3b8", display: "block" }}>เลขที่ใบอนุญาต วส./ภย.</label>
              <input
                type="text"
                value={engLicense}
                onChange={(e) => setEngLicense(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", background: "#0f172a", border: "1px solid #475569", color: "#fff", borderRadius: 4 }}
              />
            </div>
          </div>

          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              id="approvePermit"
              checked={approved}
              onChange={(e) => setApproved(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: "#10b981", cursor: "pointer" }}
            />
            <label htmlFor="approvePermit" style={{ fontSize: 13, color: "#10b981", fontWeight: 600, cursor: "pointer" }}>
              อนุมัติออกชุดแบบขออนุญาตก่อสร้าง อ.1 (Mark Issue Ready)
            </label>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            onClick={onClose}
            style={{ padding: "8px 16px", background: "#334155", color: "#e2e8f0", border: "none", borderRadius: 4, cursor: "pointer" }}
          >
            ยกเลิก
          </button>
          <button
            onClick={handleSave}
            style={{ padding: "8px 20px", background: "#0284c7", color: "#ffffff", fontWeight: 600, border: "none", borderRadius: 4, cursor: "pointer" }}
          >
            บันทึกข้อมูลและอัปเดตแบบ (Apply to 20 Sheets)
          </button>
        </div>
      </div>
    </div>
  );
};
