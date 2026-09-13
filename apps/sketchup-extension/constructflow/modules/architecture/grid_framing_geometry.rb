# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class GridFramingGeometry
        attr_reader :definition

        def initialize(definition)
          @definition = definition
        end

        def generate(entities, position = nil)
          group = entities.add_group
          group.name = "Structural Grid Framing [#{definition.column_type_id} / #{definition.beam_type_id}]"

          origin = Geom::Point3d.new(
            @definition.origin_point[0].mm,
            @definition.origin_point[1].mm,
            @definition.origin_point[2].mm
          )

          x_offsets = [0.0]
          @definition.x_spans_mm.each { |s| x_offsets << (x_offsets.last + s) }

          y_offsets = [0.0]
          @definition.y_spans_mm.each { |s| y_offsets << (y_offsets.last + s) }

          height_mm = @definition.levels_mm.first || 3000.0

          # Column dimensions (e.g. 200x200 mm)
          col_w = 200.0.mm
          col_d = 200.0.mm
          col_h = height_mm.mm

          # Beam dimensions (e.g. 200x400 mm)
          bm_w = 200.0.mm
          bm_d = 400.0.mm

          cols_grp = group.entities.add_group
          cols_grp.name = 'Structural Columns (เสาโครงสร้าง)'

          beams_grp = group.entities.add_group
          beams_grp.name = 'Structural Beams (คานโครงสร้าง)'

          # 1. Place Columns at all grid intersections
          x_offsets.each do |x_mm|
            y_offsets.each do |y_mm|
              pt = Geom::Point3d.new(origin.x + x_mm.mm, origin.y + y_mm.mm, origin.z)
              add_box(cols_grp.entities, pt, col_w, col_d, col_h)
            end
          end

          # 2. Place X-direction Beams between columns at top
          beam_z = origin.z + col_h - bm_d
          (0...(x_offsets.length - 1)).each do |xi|
            x_start = x_offsets[xi].mm
            x_len = @definition.x_spans_mm[xi].mm
            y_offsets.each do |y_mm|
              pt = Geom::Point3d.new(origin.x + x_start, origin.y + y_mm.mm, beam_z)
              add_beam_segment(beams_grp.entities, pt, x_len, bm_w, bm_d, :x)
            end
          end

          # 3. Place Y-direction Beams between columns at top
          (0...(y_offsets.length - 1)).each do |yi|
            y_start = y_offsets[yi].mm
            y_len = @definition.y_spans_mm[yi].mm
            x_offsets.each do |x_mm|
              pt = Geom::Point3d.new(origin.x + x_mm.mm, origin.y + y_start, beam_z)
              add_beam_segment(beams_grp.entities, pt, y_len, bm_w, bm_d, :y)
            end
          end

          GridFramingRepository.new.save(group, @definition)
          group
        end

        def rebuild(group, new_definition)
          @definition = new_definition
          group.entities.clear!
          group.name = "Structural Grid Framing [#{definition.column_type_id} / #{definition.beam_type_id}]"
          generate(group)
          group
        end

        private

        def add_box(entities, center_base, width, depth, height)
          grp = entities.add_group
          half_w = width / 2.0
          half_d = depth / 2.0
          pts = [
            Geom::Point3d.new(center_base.x - half_w, center_base.y - half_d, center_base.z),
            Geom::Point3d.new(center_base.x + half_w, center_base.y - half_d, center_base.z),
            Geom::Point3d.new(center_base.x + half_w, center_base.y + half_d, center_base.z),
            Geom::Point3d.new(center_base.x - half_w, center_base.y + half_d, center_base.z)
          ]
          face = grp.entities.add_face(pts)
          face.pushpull(-height) if face
          grp
        end

        def add_beam_segment(entities, start_pt, length, width, depth, axis)
          grp = entities.add_group
          half_w = width / 2.0
          if axis == :x
            pts = [
              Geom::Point3d.new(start_pt.x, start_pt.y - half_w, start_pt.z),
              Geom::Point3d.new(start_pt.x + length, start_pt.y - half_w, start_pt.z),
              Geom::Point3d.new(start_pt.x + length, start_pt.y + half_w, start_pt.z),
              Geom::Point3d.new(start_pt.x, start_pt.y + half_w, start_pt.z)
            ]
          else
            pts = [
              Geom::Point3d.new(start_pt.x - half_w, start_pt.y, start_pt.z),
              Geom::Point3d.new(start_pt.x + half_w, start_pt.y, start_pt.z),
              Geom::Point3d.new(start_pt.x + half_w, start_pt.y + length, start_pt.z),
              Geom::Point3d.new(start_pt.x - half_w, start_pt.y + length, start_pt.z)
            ]
          end
          face = grp.entities.add_face(pts)
          face.pushpull(-depth) if face
          grp
        end
      end
    end
  end
end
