# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class RoofFramingGeometry
        attr_reader :definition

        def initialize(definition)
          @definition = definition
        end

        def generate(entities, position = nil)
          group = entities.add_group
          group.name = "Roof Steel Framing [#{@definition.type.upcase}]"
          build_framing_geometry(group.entities)
          
          RoofFramingRepository.new.save(group, @definition)
          group
        end

        # Allows re-configuring and regenerating steel framing on an existing group!
        def rebuild(group, new_definition)
          @definition = new_definition
          group.entities.clear!
          group.name = "Roof Steel Framing [#{@definition.type.upcase}]"
          build_framing_geometry(group.entities)
          
          RoofFramingRepository.new.save(group, @definition)
          group
        end

        private

        def build_framing_geometry(target_entities)
          pts = @definition.boundary_mm
          return if pts.length < 3

          # Compute bounding box of boundary in mm
          xs = pts.map { |p| p[0] }
          ys = pts.map { |p| p[1] }
          zs = pts.map { |p| p[2] }

          min_x, max_x = xs.min, xs.max
          min_y, max_y = ys.min, ys.max
          base_z = zs.min

          width = max_x - min_x
          length = max_y - min_y
          pitch_rad = @definition.pitch_degrees * Math::PI / 180.0
          overhang = @definition.overhang_mm

          # Steel section profiles (Thai Standard Light Gauge Steel)
          # Rafter / Truss: C-150x50x20x3.2 or Box 100x50
          rafter_w = 50.0.mm
          rafter_h = 100.0.mm
          # Purlin (แป): C-75x45x15x2.0 or C-100x50
          purlin_w = 45.0.mm
          purlin_h = 75.0.mm

          # Generate Rafters / Trusses along length (Y direction)
          truss_spacing = @definition.truss_spacing_mm.mm
          y_steps = ((length + 2 * overhang) / @definition.truss_spacing_mm).ceil
          y_step_dist = (length + 2 * overhang) / [y_steps, 1].max

          ridge_z = (width / 2.0) * Math.tan(pitch_rad)
          half_w = width / 2.0

          # Subgroup for Primary Trusses / Rafters
          truss_grp = target_entities.add_group
          truss_grp.name = 'Primary Rafters & Trusses (จันทัน/โครงถัก)'

          (0..y_steps).each do |i|
            cur_y = (min_y - overhang) + (i * y_step_dist)

            # Left slope rafter: from (min_x - overhang, cur_y) to (min_x + half_w, cur_y, base_z + ridge_z)
            p_start_l = Geom::Point3d.new((min_x - overhang).mm, cur_y.mm, (base_z - overhang * Math.sin(pitch_rad)).mm)
            p_ridge   = Geom::Point3d.new((min_x + half_w).mm, cur_y.mm, (base_z + ridge_z).mm)
            p_start_r = Geom::Point3d.new((max_x + overhang).mm, cur_y.mm, (base_z - overhang * Math.sin(pitch_rad)).mm)

            add_steel_member(truss_grp.entities, p_start_l, p_ridge, rafter_w, rafter_h)
            add_steel_member(truss_grp.entities, p_start_r, p_ridge, rafter_w, rafter_h)

            # Tie beam / Bottom chord (ขื่อ)
            p_tie_l = Geom::Point3d.new(min_x.mm, cur_y.mm, base_z.mm)
            p_tie_r = Geom::Point3d.new(max_x.mm, cur_y.mm, base_z.mm)
            add_steel_member(truss_grp.entities, p_tie_l, p_tie_r, rafter_w, rafter_h)

            # King post (ดั้ง)
            p_king_bot = Geom::Point3d.new((min_x + half_w).mm, cur_y.mm, base_z.mm)
            add_steel_member(truss_grp.entities, p_king_bot, p_ridge, rafter_w, rafter_w)
          end

          # Subgroup for Purlins (แปเหล็ก)
          purlin_grp = target_entities.add_group
          purlin_grp.name = 'Purlins (แปหลังคา C-Channel)'

          slope_len = Math.sqrt((half_w + overhang)**2 + (ridge_z + overhang * Math.sin(pitch_rad))**2)
          num_purlins = (slope_len / @definition.purlin_spacing_mm).ceil
          num_purlins = [num_purlins, 2].max

          y_start = (min_y - overhang).mm
          y_end   = (max_y + overhang).mm

          (0..num_purlins).each do |j|
            fraction = j.to_f / num_purlins
            # Left slope purlins
            lx = (min_x - overhang) + fraction * (half_w + overhang)
            lz = (base_z - overhang * Math.sin(pitch_rad)) + fraction * (ridge_z + overhang * Math.sin(pitch_rad))
            p_l1 = Geom::Point3d.new(lx.mm, y_start, lz.mm + rafter_h)
            p_l2 = Geom::Point3d.new(lx.mm, y_end, lz.mm + rafter_h)
            add_steel_member(purlin_grp.entities, p_l1, p_l2, purlin_w, purlin_h)

            # Right slope purlins
            rx = (max_x + overhang) - fraction * (half_w + overhang)
            rz = lz
            p_r1 = Geom::Point3d.new(rx.mm, y_start, rz.mm + rafter_h)
            p_r2 = Geom::Point3d.new(rx.mm, y_end, rz.mm + rafter_h)
            add_steel_member(purlin_grp.entities, p_r1, p_r2, purlin_w, purlin_h)
          end
        end

        def add_steel_member(entities, pt1, pt2, width, height)
          vec = pt2 - pt1
          len = vec.length
          return if len < 1.mm

          member = entities.add_group
          pts = [
            Geom::Point3d.new(-width / 2.0, -height / 2.0, 0),
            Geom::Point3d.new( width / 2.0, -height / 2.0, 0),
            Geom::Point3d.new( width / 2.0,  height / 2.0, 0),
            Geom::Point3d.new(-width / 2.0,  height / 2.0, 0)
          ]
          face = member.entities.add_face(pts)
          face.pushpull(-len) if face

          # Align along vector
          z_axis = Geom::Vector3d.new(0, 0, 1)
          if vec.parallel?(z_axis)
            trans = Geom::Transformation.translation(pt1)
          else
            rot_axis = z_axis * vec
            rot_angle = z_axis.angle_between(vec)
            trans = Geom::Transformation.translation(pt1) *
                    Geom::Transformation.rotation(Geom::Point3d.new(0, 0, 0), rot_axis, rot_angle)
          end
          member.transform!(trans)
        end
      end
    end
  end
end
