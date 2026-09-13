# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class StairGeometry
        attr_reader :definition

        def initialize(definition)
          @definition = definition
        end

        # Generates basic SketchUp geometry for a straight staircase
        def generate(entities, position = nil)
          group = entities.add_group
          
          tread_count = @definition.tread_count
          riser_count = @definition.riser_count
          tread_depth = @definition.tread_depth_mm.mm
          riser_height = @definition.riser_height_mm.mm
          width = @definition.width_mm.mm
          
          # Simple straight stair calculation
          dir = Geom::Vector3d.new(@definition.direction)
          dir.length = 1.0
          
          # Perpendicular vector for width
          up = Geom::Vector3d.new(0, 0, 1)
          perp = dir.cross(up)
          perp.length = width
          
          start_pt = position || Geom::Point3d.new(@definition.start_point)
          
          # Build each step
          riser_count.times do |i|
            step_start = start_pt.offset(dir, i * tread_depth)
            step_start.z += i * riser_height
            
            # Step bounding points
            pt1 = step_start.clone
            pt2 = pt1.offset(dir, tread_depth)
            pt3 = pt2.offset(perp)
            pt4 = pt1.offset(perp)
            
            face = group.entities.add_face(pt1, pt2, pt3, pt4)
            face.pushpull(-riser_height) if face
          end
          
          group
        end
      end
    end
  end
end
