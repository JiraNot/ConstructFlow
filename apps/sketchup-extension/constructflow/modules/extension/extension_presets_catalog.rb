# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Extension
      class ExtensionPresetsCatalog
        PRESETS = {
          carport_standard: {
            id: 'carport_standard',
            category: 'parking',
            title_th: 'โรงจอดรถมาตรฐาน 2 คัน (Carport)',
            title_en: 'Standard Double Carport',
            subtitle_th: 'ขนาด 5.00 x 5.50 ม. (ความสูง 2.80 - 3.20 ม.)',
            description_th: 'โครงสร้างเหล็กกล่องกัลวาไนซ์ 125x125 มม. แปเหล็ก C-100 หลังคาเมทัลชีท Snaplock พร้อมฉนวน PU หนา 1 นิ้ว รางน้ำสแตนเลส 304 ท่อระบายน้ำ PVC พร้อมพื้น ค.ส.ล. ขัดหยาบรับน้ำหนักรถยนต์',
            dimensions: {
              width_m: 5.0,
              depth_m: 5.5,
              height_front_m: 3.2,
              height_rear_m: 2.8,
              slope_deg: 4.16,
              clearance_m: 2.6
            },
            structure: {
              column_profile: 'SHS 125x125x4.5',
              beam_profile: 'RHS 150x50x3.2',
              roof_material: 'Metalsheet Snaplock 0.40mm + PU 25mm',
              gutter_material: 'Stainless 304 Box Gutter',
              foundation_type: 'Micro Pile I-18 / Slab on Beam'
            },
            cost_estimate: {
              material_cost_thb: 92000,
              labor_cost_thb: 43000,
              total_base_thb: 135000,
              factor_f: 0.12,
              total_with_factor_thb: 151200
            }
          },
          thai_kitchen: {
            id: 'thai_kitchen',
            category: 'kitchen',
            title_th: 'ครัวไทยหลังบ้านระบายอากาศ (Thai Kitchen)',
            title_en: 'Thai Ventilation Kitchen',
            subtitle_th: 'ขนาด 2.50 x 5.00 ม. (ความสูง 2.70 - 3.20 ม.)',
            description_th: 'ต่อเติมครัวไทยโปร่งระบายอากาศ ผนังก่ออิฐมวลเบาฉาบเรียบ 2 ด้าน เคาน์เตอร์ครัว ค.ส.ล. ตัว L พร้อมช่องซิงค์ 2 หลุมและช่องเตาแก๊ส พื้นปูกระเบื้องเซรามิก R10 กันลื่น หน้าต่างระบายอากาศบานเกล็ด',
            dimensions: {
              width_m: 5.0,
              depth_m: 2.5,
              height_front_m: 2.7,
              height_rear_m: 3.2,
              slope_deg: 5.71,
              counter_length_m: 3.5
            },
            structure: {
              column_profile: 'RC Column 200x200mm',
              beam_profile: 'RC Beam 200x350mm',
              wall_material: 'AAC Block 7.5cm Plastered Both Sides',
              counter_material: 'Reinforced Concrete with Granite Tile Top',
              roof_material: 'Metalsheet Dark Charcoal + PE Foam 5mm',
              foundation_type: 'Spun Micro Pile Dia 200mm'
            },
            cost_estimate: {
              material_cost_thb: 135000,
              labor_cost_thb: 62000,
              total_base_thb: 197000,
              factor_f: 0.12,
              total_with_factor_thb: 220640
            }
          },
          garden_terrace: {
            id: 'garden_terrace',
            category: 'outdoor',
            title_th: 'เทอเรสพักผ่อน & ระแนงไม้ (Garden Terrace)',
            title_en: 'Garden Terrace & Pergola',
            subtitle_th: 'ขนาด 3.00 x 4.00 ม. (เฉลียง +0.20 ม., ซุ้ม 2.80 ม.)',
            description_th: 'พื้นที่นั่งเล่นพักผ่อนชมสวน พื้นไม้เทียม WPC เกรดพรีเมียมซ่อนหัวสกรู เสาเหล็กกล่องพร้อมระแนงไม้เทียมบังแดดสีไม้สัก บันไดขึ้น-ลง 2 ขั้นรอบด้าน หลังคากันสาดโพลีคาร์บอเนตโปร่งแสง',
            dimensions: {
              width_m: 4.0,
              depth_m: 3.0,
              height_front_m: 2.8,
              height_rear_m: 2.8,
              terrace_level_m: 0.20,
              step_count: 2
            },
            structure: {
              column_profile: 'SHS 100x100x3.2 Black Matte',
              trellis_profile: 'WPC Teak Slat 50x100mm',
              decking_material: 'WPC Wood-Plastic Composite 25x140mm',
              canopy_material: 'Solid Polycarbonate Sheet 3mm UV Shield',
              foundation_type: 'Short Concrete Pier on Spread Footing'
            },
            cost_estimate: {
              material_cost_thb: 72000,
              labor_cost_thb: 34000,
              total_base_thb: 106000,
              factor_f: 0.12,
              total_with_factor_thb: 118720
            }
          },
          multipurpose_suite: {
            id: 'multipurpose_suite',
            category: 'room',
            title_th: 'ห้องอเนกประสงค์ / โฮมออฟฟิศ (Garden Suite)',
            title_en: 'Multipurpose Garden Suite',
            subtitle_th: 'ขนาด 4.00 x 6.00 ม. (ความสูง 2.90 - 3.40 ม.)',
            description_th: 'ห้องต่อเติมอเนกประสงค์ระบบ ค.ส.ล. ก่ออิฐมวลเบาฉาบเรียบ ประตูกระจกบานเลื่อนอลูมิเนียมดำ 2.0x2.2 ม. หน้าต่างชมสวนพาโนรามา ฝ้าเพดานยิปซัมฉาบเรียบพร้อมหลุมซ่อนไฟ หลังคาซ่อนเชิงชายกล่องโมเดิร์น',
            dimensions: {
              width_m: 4.0,
              depth_m: 6.0,
              height_front_m: 2.9,
              height_rear_m: 3.4,
              slope_deg: 4.76,
              door_width_m: 2.0,
              window_width_m: 1.8
            },
            structure: {
              column_profile: 'RC Column 200x200mm',
              beam_profile: 'RC Beam 200x400mm',
              wall_material: 'AAC Block 7.5cm with Skim Coat Finish',
              glazing_system: 'Euro-Profile Aluminum Black Powder Coat 1.5mm',
              roof_material: 'Metalsheet 0.40mm with Modern Box Fascia',
              foundation_type: 'Spun Micro Pile I-22 with Reinforced Footings'
            },
            cost_estimate: {
              material_cost_thb: 215000,
              labor_cost_thb: 98000,
              total_base_thb: 313000,
              factor_f: 0.12,
              total_with_factor_thb: 350560
            }
          }
        }.freeze

        def self.all
          PRESETS.values
        end

        def self.find(preset_id)
          return nil if preset_id.nil?
          PRESETS[preset_id.to_sym]
        end

        def self.ids
          PRESETS.keys.map(&:to_s)
        end
      end
    end
  end
end
