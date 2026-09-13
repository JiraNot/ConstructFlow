# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Costing
      class ThaiCostDatabase
        DEFAULT_RATES = {
          concrete_ready_mix_240ksc: {
            code: 'CONC-240',
            category: 'structure',
            description_th: 'คอนกรีตผสมเสร็จ 240 ksc (ทรงกระบอก)',
            unit: 'm3',
            material_rate_thb: 2150.0,
            labor_rate_thb: 350.0
          },
          rebar_db12: {
            code: 'STEEL-DB12',
            category: 'structure',
            description_th: 'เหล็กข้ออ้อย DB12 SD40 พร้อมลวดผูกเหล็ก',
            unit: 'kg',
            material_rate_thb: 28.5,
            labor_rate_thb: 5.0
          },
          rebar_rb9: {
            code: 'STEEL-RB9',
            category: 'structure',
            description_th: 'เหล็กเส้นกลมผิวเรียบ RB9 SR24',
            unit: 'kg',
            material_rate_thb: 27.0,
            labor_rate_thb: 4.5
          },
          formwork_wood: {
            code: 'FORM-WOOD',
            category: 'structure',
            description_th: 'ไม้แบบหล่อคอนกรีต (คิดลดการใช้งานซ้ำ)',
            unit: 'm2',
            material_rate_thb: 180.0,
            labor_rate_thb: 120.0
          },
          steel_tube_shs125: {
            code: 'STEEL-SHS125',
            category: 'steel_frame',
            description_th: 'เหล็กกล่องกัลวาไนซ์ SHS 125x125x4.5 มม.',
            unit: 'm',
            material_rate_thb: 520.0,
            labor_rate_thb: 110.0
          },
          steel_tube_rhs150: {
            code: 'STEEL-RHS150',
            category: 'steel_frame',
            description_th: 'เหล็กกล่องแบนกัลวาไนซ์ RHS 150x50x3.2 มม.',
            unit: 'm',
            material_rate_thb: 390.0,
            labor_rate_thb: 85.0
          },
          aac_block_75: {
            code: 'WALL-AAC75',
            category: 'wall',
            description_th: 'ผนังก่ออิฐมวลเบา G4 หนา 7.5 ซม.',
            unit: 'm2',
            material_rate_thb: 220.0,
            labor_rate_thb: 110.0
          },
          plastering_smooth: {
            code: 'FIN-PLAST',
            category: 'wall',
            description_th: 'ปูนฉาบเรียบสำเร็จรูป 2 ด้าน',
            unit: 'm2',
            material_rate_thb: 95.0,
            labor_rate_thb: 120.0
          },
          ceramic_tile_60x60: {
            code: 'FLOOR-TILE60',
            category: 'floor',
            description_th: 'กระเบื้องเซรามิก/พอร์ซเลน 60x60 ซม. พร้อมกาวซีเมนต์และยาแนว',
            unit: 'm2',
            material_rate_thb: 380.0,
            labor_rate_thb: 160.0
          },
          wpc_decking: {
            code: 'FLOOR-WPC',
            category: 'floor',
            description_th: 'พื้นไม้เทียม WPC ตัน 25x140 มม. พร้อมตงและคลิปล็อคซ่อนสกรู',
            unit: 'm2',
            material_rate_thb: 1250.0,
            labor_rate_thb: 350.0
          },
          metalsheet_snaplock_pu: {
            code: 'ROOF-MS-PU',
            category: 'roof',
            description_th: 'หลังคาเมทัลชีทลอน Snaplock 0.40 มม. บุฉนวน PU หนา 1 นิ้ว',
            unit: 'm2',
            material_rate_thb: 480.0,
            labor_rate_thb: 120.0
          },
          polycarbonate_canopy: {
            code: 'ROOF-POLY',
            category: 'roof',
            description_th: 'แผ่นโพลีคาร์บอเนตตัน หนา 3 มม. เคลือบสารป้องกันรังสี UV',
            unit: 'm2',
            material_rate_thb: 750.0,
            labor_rate_thb: 150.0
          },
          stainless_gutter_304: {
            code: 'ROOF-GUTTER',
            category: 'roof',
            description_th: 'รางระบายน้ำฝนสแตนเลส เกรด 304 พับเข้ารูป หนา 0.8 มม.',
            unit: 'm',
            material_rate_thb: 650.0,
            labor_rate_thb: 180.0
          },
          sliding_door_20x22: {
            code: 'OPEN-DOOR-SL2',
            category: 'opening',
            description_th: 'ประตูกระจกบานเลื่อน กรอบอลูมิเนียมดำ หนา 1.5 มม. กระจกเขียวตัดแสง 6 มม.',
            unit: 'set',
            material_rate_thb: 9500.0,
            labor_rate_thb: 1500.0
          },
          sliding_window_18x14: {
            code: 'OPEN-WIN-SL2',
            category: 'opening',
            description_th: 'หน้าต่างกระจกบานเลื่อน กรอบอลูมิเนียมดำ หนา 1.5 มม. กระจกใส 6 มม.',
            unit: 'set',
            material_rate_thb: 4500.0,
            labor_rate_thb: 800.0
          },
          acrylic_paint: {
            code: 'FIN-PAINT',
            category: 'finishing',
            description_th: 'ทาสีน้ำอะคริลิกภายนอก-ภายใน ทารองพื้นปูนใหม่ 1 เที่ยว ทับหน้า 2 เที่ยว',
            unit: 'm2',
            material_rate_thb: 65.0,
            labor_rate_thb: 60.0
          }
        }.freeze

        def initialize(custom_rates = {})
          @rates = DEFAULT_RATES.dup
          custom_rates.each do |k, v|
            @rates[k.to_sym] = @rates[k.to_sym].merge(v) if @rates.key?(k.to_sym)
          end
        end

        def rate_for(item_key)
          @rates[item_key.to_sym]
        end

        def all_rates
          @rates
        end

        def calculate_line_total(item_key, quantity, factor_f = 0.12)
          item = rate_for(item_key)
          return nil unless item

          qty = Float(quantity)
          mat_unit = item[:material_rate_thb]
          lab_unit = item[:labor_rate_thb]

          mat_total = (qty * mat_unit).round(2)
          lab_total = (qty * lab_unit).round(2)
          base_total = (mat_total + lab_total).round(2)
          factor_amount = (base_total * Float(factor_f)).round(2)
          grand_total = (base_total + factor_amount).round(2)

          {
            code: item[:code],
            description_th: item[:description_th],
            unit: item[:unit],
            quantity: qty,
            material_rate: mat_unit,
            material_total: mat_total,
            labor_rate: lab_unit,
            labor_total: lab_total,
            base_total: base_total,
            factor_f: factor_f,
            factor_amount: factor_amount,
            grand_total: grand_total
          }
        end
      end
    end
  end
end
