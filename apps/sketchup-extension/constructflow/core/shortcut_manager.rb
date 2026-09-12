# frozen_string_literal: true

require_relative 'html_dialog'
require_relative '../modules/architecture/tools/wall_tool'
require_relative '../modules/architecture/tools/floor_tool'
require_relative '../modules/architecture/tools/ceiling_tool'
require_relative '../modules/structure/tools/column_tool'
require_relative '../modules/structure/tools/beam_tool'
require_relative '../modules/structure/tools/grid_tool'
require_relative '../modules/structure/tools/foundation_tool'
require_relative '../modules/door_window/tools/door_window_tool'
require_relative '../modules/opening/tools/opening_tool'
require_relative '../modules/electrical/tools/conduit_tool'
require_relative '../modules/drainage/tools/pipe_tool'
require_relative '../modules/drainage/tools/manhole_tool'
require_relative '../modules/interior/tools/cabinet_run_tool'
require_relative '../modules/interior/tools/wardrobe_tool'

module JiraNot
  module ConstructFlow
    module Core
      module ShortcutManager
        SHORTCUTS = {
          # Architecture
          'WA'   => { label: 'ผนัง (Wall)', action: :wall },
          'WALL' => { label: 'ผนัง (Wall)', action: :wall },
          'DR'   => { label: 'ประตู (Door)', action: :door },
          'DOOR' => { label: 'ประตู (Door)', action: :door },
          'WN'   => { label: 'หน้าต่าง (Window)', action: :window },
          'WIN'  => { label: 'หน้าต่าง (Window)', action: :window },
          'OP'   => { label: 'เจาะช่องเปิด (Opening)', action: :opening },
          'OPN'  => { label: 'เจาะช่องเปิด (Opening)', action: :opening },
          'FL'   => { label: 'พื้น (Floor)', action: :floor },
          'CE'   => { label: 'ฝ้าเพดาน (Ceiling)', action: :ceiling },
          'CLG'  => { label: 'ฝ้าเพดาน (Ceiling)', action: :ceiling },

          # Structure
          'CL'   => { label: 'เสา (Column)', action: :column },
          'CO'   => { label: 'เสา (Column)', action: :column },
          'COL'  => { label: 'เสา (Column)', action: :column },
          'BM'   => { label: 'คาน (Beam)', action: :beam },
          'BEAM' => { label: 'คาน (Beam)', action: :beam },
          'GR'   => { label: 'เส้นกริด (Grid)', action: :grid },
          'GRID' => { label: 'เส้นกริด (Grid)', action: :grid },
          'FD'   => { label: 'ฐานราก (Foundation)', action: :foundation },
          'FT'   => { label: 'ฐานราก (Foundation)', action: :foundation },
          'FND'  => { label: 'ฐานราก (Foundation)', action: :foundation },

          # MEP
          'CN'   => { label: 'ท่อร้อยสายไฟ (Conduit)', action: :conduit },
          'COND' => { label: 'ท่อร้อยสายไฟ (Conduit)', action: :conduit },
          'PI'   => { label: 'ท่อระบายน้ำ (Pipe)', action: :pipe },
          'PIPE' => { label: 'ท่อระบายน้ำ (Pipe)', action: :pipe },
          'MH'   => { label: 'บ่อพักน้ำทิ้ง (Manhole)', action: :manhole },

          # Interior
          'CB'   => { label: 'เคาน์เตอร์บิวท์อิน (Cabinet)', action: :cabinet },
          'CAB'  => { label: 'เคาน์เตอร์บิวท์อิน (Cabinet)', action: :cabinet },
          'WR'   => { label: 'ตู้เสื้อผ้า (Wardrobe)', action: :wardrobe },
          'WARD' => { label: 'ตู้เสื้อผ้า (Wardrobe)', action: :wardrobe },

          # General
          'CF'   => { label: 'แผง ConstructFlow', action: :panel },
          'IN'   => { label: 'Inspector', action: :inspector },
          'PR'   => { label: 'Inspector', action: :inspector },
          'PROP' => { label: 'Inspector', action: :inspector }
        }.freeze

        @buffer = ''
        @last_time = 0.0

        class << self
          attr_accessor :buffer, :last_time

          def reset_buffer
            @buffer = ''
            @last_time = 0.0
          end

          def handle_key(key, runtime, _view = nil)
            return false unless runtime&.respond_to?(:active_model) && runtime.active_model

            char = key_to_char(key)
            return false unless char

            now = Time.now.to_f
            if now - (@last_time || 0.0) > 1.0 # 1 second typing timeout
              @buffer = ''
            end
            @last_time = now
            @buffer = (@buffer || '') + char

            # Check exact match
            if SHORTCUTS.key?(@buffer)
              sc_code = @buffer
              @buffer = ''
              return execute(sc_code, runtime)
            end

            # Check if prefix matches any shortcut
            has_prefix = SHORTCUTS.keys.any? { |k| k.start_with?(@buffer) }
            if has_prefix
              prompt_shortcut_typing(@buffer)
              return true
            else
              # Try if this single char starts a shortcut
              if SHORTCUTS.keys.any? { |k| k.start_with?(char) }
                @buffer = char
                prompt_shortcut_typing(@buffer)
                return true
              else
                @buffer = ''
                return false
              end
            end
          end

          def prompt_shortcut_typing(buf)
            matches = SHORTCUTS.select { |k, _v| k.start_with?(buf) }
            desc = matches.map { |k, v| "#{k}: #{v[:label]}" }.first(4).join(' | ')
            Sketchup.set_status_text("⌨️ คีย์ลัด: #{buf}_ (#{desc})", (defined?(SB_PROMPT) ? SB_PROMPT : nil)) rescue nil
          end

          def key_to_char(key)
            # A-Z (65-90)
            return key.chr.upcase if key.is_a?(Integer) && key.between?(65, 90)
            # a-z (97-122)
            return key.chr.upcase if key.is_a?(Integer) && key.between?(97, 122)
            nil
          end

          def execute(code, runtime)
            entry = SHORTCUTS[code.to_s.upcase]
            return false unless entry
            return false unless runtime&.respond_to?(:active_model) && runtime.active_model

            case entry[:action]
            when :wall
              level_id = default_level_id(runtime)
              tool = Architecture::Tools::WallTool.new(
                runtime: runtime, thickness_mm: 100, height_mm: 2800, level_id: level_id
              )
              runtime.active_model.select_tool(tool)
            when :column
              level_id = default_level_id(runtime)
              tool = Structure::Tools::ColumnTool.new(
                runtime: runtime, section_mm: [200, 200], explicit_height_mm: 2800,
                base_level_id: level_id, top_level_id: ''
              )
              runtime.active_model.select_tool(tool)
            when :beam
              level_id = default_level_id(runtime)
              tool = Structure::Tools::BeamTool.new(
                runtime: runtime, section_mm: [200, 300], level_id: level_id, base_offset_mm: 0
              )
              runtime.active_model.select_tool(tool)
            when :door
              tool = DoorWindow::Tools::DoorWindowTool.new(
                runtime: runtime, category: 'door', operation: 'swing',
                frame_material: 'aluminium', panel_style: 'glazed'
              )
              runtime.active_model.select_tool(tool)
            when :window
              tool = DoorWindow::Tools::DoorWindowTool.new(
                runtime: runtime, category: 'window', operation: 'sliding',
                frame_material: 'aluminium', panel_style: 'glazed'
              )
              runtime.active_model.select_tool(tool)
            when :opening
              tool = Opening::Tools::OpeningTool.new(
                runtime: runtime, width_mm: 900, height_mm: 2100, sill_mm: 0
              )
              runtime.active_model.select_tool(tool)
            when :floor
              level_id = default_level_id(runtime)
              tool = Architecture::Tools::FloorTool.new(runtime: runtime, thickness_mm: 100.0, level_id: level_id)
              runtime.active_model.select_tool(tool)
            when :ceiling
              level_id = default_level_id(runtime)
              tool = Architecture::Tools::CeilingTool.new(runtime: runtime, height_mm: 2600.0, level_id: level_id)
              runtime.active_model.select_tool(tool)
            when :foundation
              tool = Structure::Tools::FoundationTool.new(
                runtime: runtime, size_mm: [1000, 1000, 400], foundation_type: 'isolated'
              )
              runtime.active_model.select_tool(tool)
            when :grid
              level_id = default_level_id(runtime)
              tool = Structure::Tools::GridTool.new(
                runtime: runtime, name: 'A', level_id: level_id, offset_mm: 0
              )
              runtime.active_model.select_tool(tool)
            when :conduit
              tool = Electrical::Tools::ConduitTool.new(runtime: runtime)
              runtime.active_model.select_tool(tool)
            when :pipe
              tool = Drainage::Tools::PipeTool.new(runtime: runtime, diameter_mm: 100.0, system: 'waste')
              runtime.active_model.select_tool(tool)
            when :manhole
              tool = Drainage::Tools::ManholeTool.new(runtime: runtime, size_mm: [600, 600])
              runtime.active_model.select_tool(tool)
            when :cabinet
              tool = Interior::Tools::CabinetRunTool.new(
                runtime: runtime, params: { width_mm: 600, depth_mm: 600, height_mm: 850 }
              )
              runtime.active_model.select_tool(tool)
            when :wardrobe
              tool = Interior::Tools::WardrobeTool.new(
                runtime: runtime, width_mm: 1200, depth_mm: 600, height_mm: 2200
              )
              runtime.active_model.select_tool(tool)
            when :panel
              HtmlDialogManager.open_panel(runtime)
            when :inspector
              runtime.show_inspector if runtime.respond_to?(:show_inspector)
            end

            msg = "⚡ ConstructFlow [#{code}]: เรียกใช้ #{entry[:label]}"
            Sketchup.set_status_text(msg, (defined?(SB_PROMPT) ? SB_PROMPT : nil)) rescue nil
            HtmlDialogManager.toast(msg, level: 'info') rescue nil
            true
          rescue StandardError => e
            warn "[ConstructFlow] Shortcut execution error (#{code}): #{e.message}"
            false
          end

          def default_level_id(runtime)
            if runtime.respond_to?(:levels) && runtime.levels
              if runtime.levels.respond_to?(:values) && runtime.levels.values.first
                l = runtime.levels.values.first
                l.respond_to?(:id) ? l.id : l.to_s
              elsif runtime.levels.is_a?(Array) && runtime.levels.first
                l = runtime.levels.first
                l.respond_to?(:id) ? l.id : l.to_s
              else
                ''
              end
            else
              ''
            end
          rescue StandardError
            ''
          end
        end
      end
    end
  end
end
