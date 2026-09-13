# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      module Tools
        class GridFramingTool
          def initialize(runtime: nil)
            @runtime = runtime
          end

          def activate
            Sketchup.active_model.selection.clear
            Sketchup.status_text = 'คลิกตำแหน่งวางต้นแกนกริดโครงสร้างเสา-คานอัตโนมัติ (1-Click Grid Framing) [GF]'
          end
          
          def onLButtonDown(flags, x, y, view)
            ip = view.inputpoint(x, y)
            return unless ip.valid?
            
            origin = ip.position
            create_grid_framing(origin)
            Sketchup.active_model.select_tool(nil)
          end
          
          private
          
          def create_grid_framing(origin)
            prompts = [
              'ระยะช่วงเสาแกน X (เมตร m แยกด้วย comma เช่น 4.0, 4.0):',
              'ระยะช่วงเสาแกน Y (เมตร m แยกด้วย comma เช่น 4.0, 4.0):',
              'ความสูงเสา/ชั้น (เมตร m เช่น 3.0):',
              'ขนาดหน้าตัดเสา (Column Profile):',
              'ขนาดหน้าตัดคาน (Beam Profile):'
            ]
            defaults = [
              '4.0, 4.0',
              '4.0, 4.0',
              '3.0',
              'RC-C-0.20x0.20',
              'RC-B-0.20x0.40'
            ]
            results = UI.inputbox(prompts, defaults, 'วางโครงสร้างกริดเสา-คานอัตโนมัติ [Grid Framing]')
            return unless results

            x_spans = results[0].split(',').map { |s| v = s.strip.to_f; v < 50.0 ? v * 1000.0 : v }.select(&:positive?)
            y_spans = results[1].split(',').map { |s| v = s.strip.to_f; v < 50.0 ? v * 1000.0 : v }.select(&:positive?)
            raw_h = results[2].to_f; height = raw_h < 50.0 ? raw_h * 1000.0 : raw_h
            col_type = results[3].strip
            bm_type = results[4].strip

            x_spans = [4000.0, 4000.0] if x_spans.empty?
            y_spans = [4000.0, 4000.0] if y_spans.empty?
            height = 3000.0 unless height > 0

            model = Sketchup.active_model
            model.start_operation('Generate Grid Framing', true)

            definition = GridFramingDefinition.new(
              origin_point: [origin.x.to_mm, origin.y.to_mm, origin.z.to_mm],
              x_spans_mm: x_spans,
              y_spans_mm: y_spans,
              levels_mm: [height],
              column_type_id: col_type,
              beam_type_id: bm_type
            )

            geom = GridFramingGeometry.new(definition)
            group = geom.generate(model.active_entities)

            model.commit_operation
          end
        end
      end
    end
  end
end
