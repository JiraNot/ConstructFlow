# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Layout
      class ThaiA3DrawingSheetService
        SHEET_TYPES = {
          plan_arch: {
            code: 'A-101',
            name_th: 'แบบแปลนพื้นสถาปัตยกรรม (Architectural Floor Plan)',
            scale: '1:75',
            scene_name: 'CF_01_แปลนพื้นสถาปัตย์'
          },
          plan_struct: {
            code: 'S-101',
            name_th: 'แบบแปลนคาน-เสา-ฐานราก (Structural Foundation & Framing)',
            scale: '1:75',
            scene_name: 'CF_02_แปลนโครงสร้าง_คานเสา'
          },
          plan_roof: {
            code: 'A-102',
            name_th: 'แบบแปลนหลังคาและระบบระบายน้ำ (Roof & Drainage Plan)',
            scale: '1:75',
            scene_name: 'CF_03_แปลนหลังคา_ระบายน้ำ'
          },
          elevation_front: {
            code: 'A-201',
            name_th: 'แบบรูปด้านหน้าอาคาร (Front Elevation)',
            scale: '1:50',
            scene_name: 'CF_04_รูปด้านหน้า_ต่อเติม'
          },
          section_a: {
            code: 'A-301',
            name_th: 'แบบรูปตัด A แสดงโครงสร้าง (Section A Through Structure)',
            scale: '1:50',
            scene_name: 'CF_05_รูปตัด_A_ระดับพื้น'
          },
          perspective_iso: {
            code: 'A-001',
            name_th: 'แบบภาพทัศนียภาพ 3D และรายการประกอบแบบ (3D Perspective Sheet)',
            scale: 'NTS',
            scene_name: 'CF_06_ภาพทัศนียภาพ_3D_Isometric'
          }
        }.freeze

        def self.generate_sheet_manifest(metadata = {})
          project_title = metadata[:project_name] || 'โครงการต่อเติมที่พักอาศัยสำเร็จรูป'
          owner_name    = metadata[:owner_name]   || 'เจ้าของอาคาร'
          designer_name = metadata[:designer]     || 'สถาปนิก/วิศวกร ConstructFlow'
          date_str      = metadata[:date]         || Time.now.strftime('%d/%m/%Y')
          paper_size    = 'A3 Landscape (420 x 297 mm)'

          sheets = SHEET_TYPES.map do |k, v|
            {
              sheet_id: k.to_s,
              sheet_no: v[:code],
              sheet_title: v[:name_th],
              scale: v[:scale],
              linked_scene: v[:scene_name],
              paper_size: paper_size,
              title_block: {
                project: project_title,
                owner: owner_name,
                designer: designer_name,
                date: date_str,
                scale: v[:scale],
                drawing_no: v[:code]
              },
              viewport: {
                x_mm: 30.0,
                y_mm: 40.0,
                w_mm: 270.0,
                h_mm: 220.0
              }
            }
          end

          {
            version: '1.0.0',
            standard: 'Thai A3 Construction Drawing Standard',
            total_sheets: sheets.length,
            sheets: sheets
          }
        end

        def self.export_manifest_json(file_path, metadata = {})
          manifest = generate_sheet_manifest(metadata)
          json_data = require('json') ? JSON.pretty_generate(manifest) : manifest.to_s
          File.write(file_path, json_data, encoding: 'UTF-8') if file_path
          manifest
        end
      end
    end
  end
end
