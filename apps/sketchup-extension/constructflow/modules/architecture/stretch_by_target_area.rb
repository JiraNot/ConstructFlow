# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class StretchByTargetArea
        # Calculates face area in square meters
        def self.face_area_m2(face)
          return 0.0 unless face.respond_to?(:area)
          # Sketchup face.area is in square inches
          # 1 sq inch = 0.00064516 sq meter
          face.area * 0.00064516
        end

        # Computes polygon 2D area from mm points array
        def self.polygon_area_m2(pts_mm)
          return 0.0 if pts_mm.length < 3
          # Using Shoelace formula on XY plane
          sum = 0.0
          n = pts_mm.length
          (0...n).each do |i|
            j = (i + 1) % n
            sum += (pts_mm[i][0] * pts_mm[j][1]) - (pts_mm[j][0] * pts_mm[i][1])
          end
          (sum.abs / 2.0) / 1_000_000.0 # mm2 to m2
        end

        # Scales a set of points (in mm) to meet the target area in m2
        def self.scale_boundary_mm(pts_mm, target_area_m2, mode: :uniform)
          cur_area = polygon_area_m2(pts_mm)
          return pts_mm if cur_area <= 0 || target_area_m2 <= 0

          # Compute centroid
          cx = pts_mm.sum { |p| p[0] } / pts_mm.length.to_f
          cy = pts_mm.sum { |p| p[1] } / pts_mm.length.to_f
          cz = pts_mm.sum { |p| p[2] } / pts_mm.length.to_f

          ratio = target_area_m2 / cur_area

          case mode
          when :uniform
            s = Math.sqrt(ratio)
            pts_mm.map do |p|
              [
                cx + (p[0] - cx) * s,
                cy + (p[1] - cy) * s,
                cz + (p[2] - cz) * (p[2] == cz ? 1.0 : s)
              ]
            end
          when :stretch_x
            sx = ratio
            pts_mm.map do |p|
              [
                cx + (p[0] - cx) * sx,
                p[1],
                p[2]
              ]
            end
          when :stretch_y
            sy = ratio
            pts_mm.map do |p|
              [
                p[0],
                cy + (p[1] - cy) * sy,
                p[2]
              ]
            end
          else
            pts_mm
          end
        end

        # Applies stretch directly to a SketchUp Face or Component/Group
        def self.apply_to_face(face, target_area_m2, mode: :uniform)
          cur_area = face_area_m2(face)
          return false if cur_area <= 0 || target_area_m2 <= 0

          ratio = target_area_m2 / cur_area
          pts = face.outer_loop.vertices.map(&:position)
          # Center of bounds
          bb = Geom::BoundingBox.new
          pts.each { |p| bb.add(p) }
          center = bb.center

          trans = case mode
                  when :uniform
                    s = Math.sqrt(ratio)
                    Geom::Transformation.scaling(center, s, s, 1.0)
                  when :stretch_x
                    Geom::Transformation.scaling(center, ratio, 1.0, 1.0)
                  when :stretch_y
                    Geom::Transformation.scaling(center, 1.0, ratio, 1.0)
                  end

          model = face.model || Sketchup.active_model
          model.start_operation('Stretch by Target Area', true)
          face.parent.entities.transform_entities(trans, [face] + face.edges)
          model.commit_operation
          true
        end
      end
    end
  end
end
