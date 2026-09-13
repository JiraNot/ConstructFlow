# frozen_string_literal: true

require 'csv'
require_relative 'thai_cost_database'

module JiraNot
  module ConstructFlow
    module Costing
      class BoqExcelExporter
        def self.export_to_csv(lines, metadata = {}, file_path = nil)
          factor_f = Float(metadata[:factor_f] || 0.12)
          project_name = metadata[:project_name] || "งานต่อเติมพักอาศัยมาตรฐาน"
          owner_name   = metadata[:owner_name]   || "เจ้าของโครงการ"
          date_str     = metadata[:date]         || Time.now.strftime("%d/%m/%Y")
          currency     = metadata[:currency]     || "THB (บาท)"

          # UTF-8 BOM for Microsoft Excel Thai display compatibility
          bom = "\xEF\xBB\xBF"

          csv_str = CSV.generate(force_quotes: true) do |csv|
            csv << ["ใบประมาณราคาค่าก่อสร้าง (BOQ - Bill of Quantities)"]
            csv << ["ConstructFlow Extension Suite v1.0.0 Commercial Edition"]
            csv << []
            csv << ["ชื่อโครงการ / Project:", project_name, "", "วันที่ประเมิน / Date:", date_str]
            csv << ["เจ้าของอาคาร / Owner:", owner_name, "", "สกุลเงิน / Currency:", currency]
            csv << ["อัตราค่าดำเนินการและกำไร (Factor F):", "#{(factor_f * 100).round(1)}%", "", "", ""]
            csv << []
            csv << [
              "ลำดับ (No.)",
              "รหัส (Code)",
              "รายการงาน (Description)",
              "จำนวน (Qty)",
              "หน่วย (Unit)",
              "ราคาวัสดุ/หน่วย (Mat Rate)",
              "รวมค่าวัสดุ (Mat Total)",
              "ราคาค่าแรง/หน่วย (Lab Rate)",
              "รวมค่าแรง (Lab Total)",
              "รวมเงินต้นทุน (Cost Base)",
              "Factor F",
              "รวมทั้งสิ้น (Grand Total)"
            ]

            sum_mat = 0.0
            sum_lab = 0.0
            sum_base = 0.0
            sum_grand = 0.0

            lines.each_with_index do |line, idx|
              qty = Float(line[:quantity] || 0.0)
              mat_rate = Float(line[:material_rate] || 0.0)
              mat_tot  = Float(line[:material_total] || (qty * mat_rate))
              lab_rate = Float(line[:labor_rate] || 0.0)
              lab_tot  = Float(line[:labor_total] || (qty * lab_rate))
              base_tot = Float(line[:base_total] || (mat_tot + lab_tot))
              factor_amt = (base_tot * factor_f).round(2)
              grand_tot = Float(line[:grand_total] || (base_tot + factor_amt))

              sum_mat += mat_tot
              sum_lab += lab_tot
              sum_base += base_tot
              sum_grand += grand_tot

              csv << [
                idx + 1,
                line[:code] || "-",
                line[:description_th] || line[:description] || "รายการทั่วไป",
                qty.round(2),
                line[:unit] || "หน่วย",
                mat_rate.round(2),
                mat_tot.round(2),
                lab_rate.round(2),
                lab_tot.round(2),
                base_tot.round(2),
                "#{(factor_f * 100).round(1)}%",
                grand_tot.round(2)
              ]
            end

            csv << []
            csv << ["สรุปยอดรวมสุทธิ", "", "", "", "", "รวมค่าวัสดุทั้งสิ้น:", sum_mat.round(2), "รวมค่าแรงทั้งสิ้น:", sum_lab.round(2), sum_base.round(2), "#{(factor_f * 100).round(1)}%", sum_grand.round(2)]
            csv << []
            csv << ["หมายเหตุ:", "1. ราคานี้รวมภาษีมูลค่าเพิ่ม ค่าอำนวยการ ค่าดำเนินการ และกำไรตามอัตรา Factor F แล้ว"]
            csv << ["", "2. รายการคำนวณถอดแบบอัตโนมัติจากโมเดล 3D BIM ConstructFlow"]
            csv << []
            csv << ["ลงชื่อ ..................................................... ผู้เสนอราคา", "", "", "", "", "ลงชื่อ ..................................................... ผู้ว่าจ้าง"]
            csv << ["(                                                        )", "", "", "", "", "(                                                        )"]
          end

          full_output = bom + csv_str

          if file_path
            File.write(file_path, full_output, encoding: 'UTF-8')
          end

          full_output
        end
      end
    end
  end
end
