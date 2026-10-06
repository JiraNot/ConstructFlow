# frozen_string_literal: true

require_relative 'attribute_store'

module JiraNot
  module ConstructFlow
    module Core
      # Per-tool parameter schema plus a compact properties dialog.
      #
      # Toolbar buttons call ShortcutManager.execute(..., prompt: true), which
      # routes drawing tools through here so the user can review/edit the tool's
      # parameters before it starts drawing. Values are pre-filled with the
      # last-used defaults, persisted on the model, instead of hardcoded sizes.
      module ToolProperties
        DICTIONARY = 'constructflow.core'
        STORAGE_PREFIX = 'tool_defaults'

        # Tools that select an interactive SketchUp drawing tool and therefore
        # get the "properties before drawing" dialog. Command-style tools
        # (level/phase/roof/...) keep their own prompt but read/write the same
        # saved defaults.
        DRAWING_CODES = %w[WA CL BM DR WN OP FL CE FD GR CN PI MH CB WR AS FRM MFR HGR AR].freeze

        # key: symbol used to build the tool, label: shown in the dialog,
        # default: last-resort value, type: :float/:integer/:optional_float/:string/:choice
        SCHEMA = {
          'WA' => [
            { key: :thickness_mm, label: 'ความหนาผนัง (m)', default: 100.0, type: :float },
            { key: :height_mm, label: 'ความสูงผนัง (m)', default: 2800.0, type: :float },
            { key: :level_id, label: 'Base Level ID (เว้นว่าง = ชั้นอัตโนมัติ)', default: '', type: :string }
          ],
          'CL' => [
            { key: :section_width_mm, label: 'ความกว้างหน้าตัด (m)', default: 200.0, type: :float },
            { key: :section_depth_mm, label: 'ความลึกหน้าตัด (m)', default: 200.0, type: :float },
            { key: :height_mm, label: 'ความสูงเสา (m)', default: 2800.0, type: :float },
            { key: :base_level_id, label: 'Base Level ID (เว้นว่างได้)', default: '', type: :string },
            { key: :top_level_id, label: 'Top Level ID (เว้นว่างได้)', default: '', type: :string }
          ],
          'BM' => [
            { key: :section_width_mm, label: 'ความกว้างหน้าตัด (m)', default: 200.0, type: :float },
            { key: :section_depth_mm, label: 'ความลึกหน้าตัด (m)', default: 300.0, type: :float },
            { key: :level_id, label: 'Base Level ID (เว้นว่าง = ชั้นอัตโนมัติ)', default: '', type: :string },
            { key: :base_offset_mm, label: 'ระยะยกจากระดับชั้น (m)', default: 0.0, type: :float }
          ],
          'DR' => [
            { key: :category, label: 'หมวดหมู่ (door/window)', default: 'door', type: :choice, choices: %w[door window] },
            { key: :operation, label: 'การเปิด (swing/sliding/fixed)', default: 'swing', type: :choice, choices: %w[swing sliding fixed] },
            { key: :frame_material, label: 'วัสดุกรอบเฟรม', default: 'aluminium', type: :string },
            { key: :panel_style, label: 'รูปแบบบาน', default: 'glazed', type: :string }
          ],
          'WN' => [
            { key: :category, label: 'หมวดหมู่ (door/window)', default: 'window', type: :choice, choices: %w[door window] },
            { key: :operation, label: 'การเปิด (swing/sliding/fixed)', default: 'sliding', type: :choice, choices: %w[swing sliding fixed] },
            { key: :frame_material, label: 'วัสดุกรอบเฟรม', default: 'aluminium', type: :string },
            { key: :panel_style, label: 'รูปแบบบาน', default: 'glazed', type: :string }
          ],
          'OP' => [
            { key: :width_mm, label: 'ความกว้างช่องเปิด (m)', default: 900.0, type: :float },
            { key: :height_mm, label: 'ความสูงช่องเปิด (m)', default: 2100.0, type: :float },
            { key: :sill_mm, label: 'ระยะยกขอบพื้น Sill (m)', default: 0.0, type: :float }
          ],
          'FL' => [
            { key: :thickness_mm, label: 'ความหนาแผ่นพื้น (m)', default: 100.0, type: :float },
            { key: :level_id, label: 'Base Level ID (เว้นว่าง = ชั้นอัตโนมัติ)', default: '', type: :string }
          ],
          'CE' => [
            { key: :height_mm, label: 'ความสูงฝ้าเพดาน (m)', default: 2600.0, type: :float },
            { key: :level_id, label: 'Base Level ID (เว้นว่าง = ชั้นอัตโนมัติ)', default: '', type: :string }
          ],
          'FD' => [
            { key: :size_width_mm, label: 'ความกว้างฐานราก (m)', default: 1000.0, type: :float },
            { key: :size_length_mm, label: 'ความยาวฐานราก (m)', default: 1000.0, type: :float },
            { key: :size_depth_mm, label: 'ความหนาฐานราก (m)', default: 400.0, type: :float },
            { key: :foundation_type, label: 'ชนิดฐานราก (spread_footing/pile_cap)', default: 'spread_footing', type: :choice, choices: %w[spread_footing pile_cap] }
          ],
          'GR' => [
            { key: :name, label: 'ชื่อเส้นกริด', default: 'A', type: :string },
            { key: :level_id, label: 'Base Level ID (เว้นว่าง = ชั้นอัตโนมัติ)', default: '', type: :string },
            { key: :offset_mm, label: 'ระยะเยื้อง (m)', default: 0.0, type: :float }
          ],
          'CN' => [
            { key: :ceiling_z_mm, label: 'ระดับฝ้าเพดาน Z (m)', default: 2600.0, type: :float },
            { key: :strategy, label: 'กลยุทธ์ (ceiling_first/floor_first)', default: 'ceiling_first', type: :choice, choices: %w[ceiling_first floor_first] }
          ],
          'PI' => [
            { key: :diameter_mm, label: 'ขนาดท่อ (m)', default: 100.0, type: :float },
            { key: :system, label: 'ระบบท่อ (waste/storm/sewage)', default: 'waste', type: :choice, choices: %w[waste storm sewage] }
          ],
          'MH' => [
            { key: :size_width_mm, label: 'ความกว้างบ่อพัก (m)', default: 600.0, type: :float },
            { key: :size_length_mm, label: 'ความยาวบ่อพัก (m)', default: 600.0, type: :float },
            { key: :cover_level_mm, label: 'ระดับฝา Cover (m, เว้นว่างได้)', default: nil, type: :optional_float },
            { key: :invert_in_mm, label: 'ระดับก้นท่อเข้า (m, เว้นว่างได้)', default: nil, type: :optional_float },
            { key: :invert_out_mm, label: 'ระดับก้นท่อออก (m, เว้นว่างได้)', default: nil, type: :optional_float }
          ],
          'CB' => [
            { key: :width_mm, label: 'ความกว้างรวม (m)', default: 1800.0, type: :float },
            { key: :height_mm, label: 'ความสูงเคาน์เตอร์ (m)', default: 850.0, type: :float },
            { key: :depth_mm, label: 'ความลึกตู้ (m)', default: 600.0, type: :float },
            { key: :module_count, label: 'จำนวนช่องโมดูล', default: 3, type: :integer }
          ],
          'WR' => [
            { key: :width_mm, label: 'ความกว้างตู้ (m)', default: 1200.0, type: :float },
            { key: :height_mm, label: 'ความสูงตู้ (m)', default: 2200.0, type: :float },
            { key: :depth_mm, label: 'ความลึกตู้ (m)', default: 600.0, type: :float },
            { key: :door_type, label: 'ชนิดหน้าบาน (hinged/sliding)', default: 'hinged', type: :choice, choices: %w[hinged sliding] }
          ],
          'AS' => [
            { key: :asset_id, label: 'รหัสครุภัณฑ์ (Asset ID)', default: 'chair.office.mesh', type: :string },
            { key: :rotation_deg, label: 'มุมหมุน (องศา)', default: 0.0, type: :float }
          ],
          'RF' => [
            { key: :covering_system, label: 'วัสดุมุงหลังคา (metal_sheet/tile/shingle)', default: 'metal_sheet', type: :string },
            { key: :slope_percent, label: 'ความลาดชัน Slope (%)', default: 10.0, type: :float },
            { key: :slope_direction_x, label: 'ทิศทาง Slope X', default: 0.0, type: :float },
            { key: :slope_direction_y, label: 'ทิศทาง Slope Y', default: 1.0, type: :float }
          ],
          'GT' => [
            { key: :edge_index, label: 'หมายเลขขอบชายคา (Edge index)', default: 0, type: :integer },
            { key: :outlet_ratio, label: 'ตำแหน่งจุดระบายน้ำ (0.0-1.0)', default: 1.0, type: :float }
          ],
          'PB' => [
            { key: :name, label: 'รหัส/ชื่อตู้ไฟฟ้า', default: 'DB-1', type: :string },
            { key: :phase_config, label: 'ระบบเฟส (1P2W/3P4W)', default: '1P2W', type: :choice, choices: %w[1P2W 3P4W] },
            { key: :voltage_v, label: 'แรงดันไฟฟ้า V', default: 230.0, type: :float },
            { key: :main_breaker_a, label: 'เมนเบรกเกอร์ (A)', default: 50.0, type: :float },
            { key: :bus_rating_a, label: 'พิกัดบัสบาร์ (A)', default: 100.0, type: :float },
            { key: :max_circuits, label: 'จำนวนวงจรสูงสุด', default: 24, type: :integer }
          ],
          'SF' => [
            { key: :surface_type, label: 'ชนิดผิวพื้น (paver/tile/timber)', default: 'paver', type: :choice, choices: %w[paver tile timber] }
          ],
          'LV' => [
            { key: :name, label: 'ชื่อระดับชั้น (Level Name)', default: 'ชั้น 1', type: :string },
            { key: :elevation_mm, label: 'ระดับความสูง (m)', default: 3000.0, type: :float },
            { key: :kind, label: 'ประเภท (floor/roof/ceiling)', default: 'floor', type: :choice, choices: %w[floor roof ceiling] }
          ],
          'PH' => [
            { key: :phase, label: 'เฟสการทำงาน (existing/demolition/new_construction)', default: 'new_construction',
              type: :choice, choices: %w[existing demolition new_construction] }
          ],
          # Roof family — every code opens the properties dialog before it runs.
          'FRM' => [
            { key: :pitch_degrees, label: 'ความชันหลังคา (องศา)', default: 30.0, type: :float },
            { key: :truss_spacing_mm, label: 'ระยะห่างจันทัน/โครงถัก (m)', default: 1000.0, type: :float },
            { key: :purlin_spacing_mm, label: 'ระยะห่างแปเหล็ก (m)', default: 300.0, type: :float },
            { key: :overhang_mm, label: 'ระยะยื่นชายคา (m)', default: 600.0, type: :float },
            { key: :roof_type, label: 'รูปแบบหลังคา (gable/shed)', default: 'gable', type: :choice, choices: %w[gable shed] }
          ],
          'MFR' => [
            { key: :pitch_degrees, label: 'ความชันหลังคาใหม่ (องศา)', default: 30.0, type: :float },
            { key: :truss_spacing_mm, label: 'ระยะห่างจันทัน/โครงถัก (m)', default: 1000.0, type: :float },
            { key: :purlin_spacing_mm, label: 'ระยะห่างแปเหล็ก (m)', default: 300.0, type: :float },
            { key: :overhang_mm, label: 'ระยะยื่นชายคา (m)', default: 600.0, type: :float },
            { key: :roof_type, label: 'รูปแบบหลังคา (gable/shed)', default: 'gable', type: :choice, choices: %w[gable shed] }
          ],
          'HGR' => [
            { key: :form, label: 'รูปแบบหลังคา (hip/gable/shed)', default: 'hip', type: :choice, choices: %w[hip gable shed] },
            { key: :slope_deg, label: 'ความลาดชัน (องศา)', default: 30.0, type: :float },
            { key: :overhang_mm, label: 'ระยะยื่นชายคา (m)', default: 800.0, type: :float },
            { key: :thickness_mm, label: 'ความหนาแผ่นหลังคา (m)', default: 35.0, type: :float },
            { key: :fascia_height_mm, label: 'ความสูงเชิงชาย (m)', default: 200.0, type: :float },
            { key: :fascia_thickness_mm, label: 'ความหนาเชิงชาย (m)', default: 25.0, type: :float }
          ],
          'AR' => [
            { key: :form, label: 'รูปแบบหลังคา (hip/gable/shed/flat)', default: 'hip', type: :choice, choices: %w[hip gable shed flat] },
            { key: :slope_deg, label: 'ความลาดชัน (องศา)', default: 30.0, type: :float },
            { key: :overhang_m, label: 'ระยะยื่นชายคา (m)', default: 0.8, type: :float },
            { key: :thickness_m, label: 'ความหนาแผ่นหลังคา (m)', default: 0.15, type: :float },
            { key: :fascia_height_m, label: 'ความสูงเชิงชาย (m)', default: 0.2, type: :float },
            { key: :attach_walls, label: 'แนบหัวผนังอัตโนมัติ (true/false)', default: 'true', type: :choice, choices: %w[true false] }
          ]
        }.freeze

        module_function

        def schema_for(code)
          SCHEMA[code.to_s.upcase] || []
        end

        def drawing?(code)
          DRAWING_CODES.include?(code.to_s.upcase)
        end

        # Schema defaults merged with the model's last-used values for this tool.
        def defaults_for(runtime, code)
          fields = schema_for(code)
          values = fields.each_with_object({}) { |field, acc| acc[field[:key]] = field[:default] }
          saved = saved_defaults(runtime, code)
          fields.each do |field|
            key = field[:key].to_s
            next unless saved.key?(key)

            values[field[:key]] = coerce_value(field, saved[key])
          end
          values
        end

        # Resolves a tool's parameters. With prompt:true (and a UI available)
        # the compact dialog opens first; cancelling returns nil so the caller
        # can abort before the tool starts drawing. Confirmed values become the
        # tool's saved defaults.
        def collect(runtime, code, prompt: false, title: nil)
          fields = schema_for(code)
          return {} if fields.empty?

          values = defaults_for(runtime, code)
          return values unless prompt && ui_available?

          defaults = fields.map { |field| format_value(values[field[:key]]) }
          entered = Core::Units.meter_inputbox(
            fields.map { |field| field[:label] },
            defaults,
            title || default_title(code),
            nil,
            millimeter_indices: fields.each_index.select do |index|
              dimensional_field?(fields[index])
            end
          )
          return nil if entered.nil? || entered == false

          coerced = {}
          fields.each_with_index do |field, index|
            coerced[field[:key]] = coerce_value(field, entered[index])
          end
          save_defaults(runtime, code, coerced)
          coerced
        end

        def dimensional_field?(field)
          %i[float optional_float].include?(field[:type]) && field[:key].to_s.end_with?('_mm')
        end

        def dimensional_indices(fields)
          Array(fields).each_index.select { |index| dimensional_field?(Array(fields)[index]) }
        end

        def save_defaults(runtime, code, values)
          model = model_for(runtime)
          return false unless model.respond_to?(:set_attribute)

          store = AttributeStore.new(model)
          store.write_json(storage_key(code), stringify_keys(values), dictionary: DICTIONARY)
          true
        rescue StandardError
          false
        end

        def saved_defaults(runtime, code)
          model = model_for(runtime)
          return {} unless model.respond_to?(:get_attribute)

          store = AttributeStore.new(model)
          store.read_json(storage_key(code), {}, dictionary: DICTIONARY) || {}
        rescue StandardError
          {}
        end

        def storage_key(code)
          "#{STORAGE_PREFIX}.#{code.to_s.upcase}"
        end

        def coerce_value(field, raw)
          case field[:type]
          when :float
            blank?(raw) ? field[:default] : Float(raw)
          when :integer
            blank?(raw) ? field[:default] : Integer(raw)
          when :optional_float
            blank?(raw) ? nil : Float(raw)
          when :choice
            field[:choices].include?(raw.to_s) ? raw.to_s : field[:default]
          else
            raw.to_s
          end
        rescue ArgumentError, TypeError
          field[:default]
        end

        def model_for(runtime)
          runtime.respond_to?(:active_model) ? runtime.active_model : nil
        end

        def ui_available?
          defined?(UI) && UI.respond_to?(:inputbox)
        end

        def blank?(value)
          value.nil? || value.to_s.strip.empty?
        end

        def format_value(value)
          value.nil? ? '' : value.to_s
        end

        def default_title(code)
          "ConstructFlow: ตั้งค่าพารามิเตอร์เครื่องมือ (#{code.to_s.upcase})"
        end

        def stringify_keys(values)
          values.each_with_object({}) { |(key, value), acc| acc[key.to_s] = value }
        end
      end
    end
  end
end
