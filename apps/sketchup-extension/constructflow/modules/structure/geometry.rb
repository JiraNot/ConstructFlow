# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Structure
      class Geometry
        def rebuild_beam!(group, definition)
          BeamGeometry.new.rebuild!(group, definition)
        end

        def create_column_group(model, definition)
          group = model.active_entities.add_group
          group.name = 'ConstructFlow Structural Column'
          rebuild_column!(group, definition)
          group
        end

        def rebuild_column!(group, definition)
          raise ArgumentError, definition.errors.join('; ') unless definition.valid?

          entities = group.entities
          entities.clear!
          x, y, = definition.location_mm
          width, depth = definition.section_mm
          half_w = width / 2.0
          half_d = depth / 2.0
          z = definition.base_elevation_mm

          anchor = definition.respond_to?(:anchor) ? definition.anchor : :center
          offset = Core::StructuralProfileCatalog.anchor_offset(anchor, width, depth) rescue [0.0, 0.0]
          cx = x - offset[0]
          cy = y - offset[1]

          face = entities.add_face(
            point([cx - half_w, cy - half_d, z]),
            point([cx + half_w, cy - half_d, z]),
            point([cx + half_w, cy + half_d, z]),
            point([cx - half_w, cy + half_d, z])
          )
          raise 'failed to create structural column face' unless face

          face.reverse! if face.normal.z < 0
          face.pushpull(Core::Units.mm_to_su(definition.height_mm))
          group
        end

        def create_foundation_group(model, definition)
          group = model.active_entities.add_group
          group.name = "ConstructFlow #{definition.foundation_type.tr('_', ' ').capitalize}"
          rebuild_foundation!(group, definition)
          group
        end

        def rebuild_foundation!(group, definition)
          raise ArgumentError, definition.errors.join('; ') unless definition.valid?

          entities = group.entities
          entities.clear!
          x, y, = definition.center_mm
          width, length, thickness = definition.size_mm
          half_w = width / 2.0
          half_l = length / 2.0
          z = definition.bottom_elevation_mm

          face = entities.add_face(
            point([x - half_w, y - half_l, z]),
            point([x + half_w, y - half_l, z]),
            point([x + half_w, y + half_l, z]),
            point([x - half_w, y + half_l, z])
          )
          raise 'failed to create foundation face' unless face

          face.reverse! if face.normal.z < 0
          face.pushpull(Core::Units.mm_to_su(thickness))
          group
        end

        def create_rebar_marker_group(model, host_object:, definition:, host_bounds:)
          group = model.active_entities.add_group
          group.name = 'ConstructFlow Semantic Rebar Set'
          rebuild_rebar_marker!(group, host_object: host_object, definition: definition, host_bounds: host_bounds)
          group
        end

        def rebuild_rebar_marker!(group, host_object:, definition:, host_bounds:)
          entities = group.entities
          entities.clear!
          min = host_bounds[:min] || host_bounds['min']
          max = host_bounds[:max] || host_bounds['max']
          
          cover = [(definition.cover_mm || 40.0), 20.0].max
          dia = [(definition.diameter_mm || 12.0), 6.0].max
          bar_r = (dia / 2.0).mm
          
          x0 = min[0] + cover
          x1 = max[0] - cover
          y0 = min[1] + cover
          y1 = max[1] - cover
          z0 = min[2] + cover
          z1 = max[2] - cover

          host_type = host_object ? host_object.type : 'structure.column'

          case host_type
          when 'structure.column'
            # 1. Main longitudinal vertical bars
            corners = [
              [x0, y0], [x1, y0], [x1, y1], [x0, y1]
            ]
            corners.each do |cx, cy|
              p_bot = Geom::Point3d.new(cx.mm, cy.mm, z0.mm)
              p_top = Geom::Point3d.new(cx.mm, cy.mm, z1.mm)
              add_rebar_segment(entities, p_bot, p_top, bar_r)
            end

            # If more than 4 bars (e.g. 6 or 8 bars), add intermediate bars
            if definition.bar_count >= 6
              p_mid1_bot = Geom::Point3d.new(((x0 + x1)/2.0).mm, y0.mm, z0.mm)
              p_mid1_top = Geom::Point3d.new(((x0 + x1)/2.0).mm, y0.mm, z1.mm)
              p_mid2_bot = Geom::Point3d.new(((x0 + x1)/2.0).mm, y1.mm, z0.mm)
              p_mid2_top = Geom::Point3d.new(((x0 + x1)/2.0).mm, y1.mm, z1.mm)
              add_rebar_segment(entities, p_mid1_bot, p_mid1_top, bar_r)
              add_rebar_segment(entities, p_mid2_bot, p_mid2_top, bar_r)
            end

            # 2. Rectangular Ties / Stirrups (ปลอกเสา RB6/RB9)
            col_height = (z1 - z0)
            stirrup_spacing = 150.0 # mm
            stirrup_r = 3.0.mm # RB6 default tie
            num_stirrups = [(col_height / stirrup_spacing).floor, 1].max
            step_z = col_height / num_stirrups

            (0..num_stirrups).each do |i|
              cur_z = z0 + (i * step_z)
              pts = [
                Geom::Point3d.new(x0.mm, y0.mm, cur_z.mm),
                Geom::Point3d.new(x1.mm, y0.mm, cur_z.mm),
                Geom::Point3d.new(x1.mm, y1.mm, cur_z.mm),
                Geom::Point3d.new(x0.mm, y1.mm, cur_z.mm),
                Geom::Point3d.new(x0.mm, y0.mm, cur_z.mm)
              ]
              (0...4).each do |pi|
                add_rebar_segment(entities, pts[pi], pts[pi+1], stirrup_r)
              end
            end

          when 'structure.foundation'
            # Orthogonal Bottom Rebar Mat (ตะแกรงฐานราก) with 90 deg hooks
            grid_spacing = 150.0 # mm
            hook_h = 100.0.mm
            
            # X-direction bars
            y_steps = [((y1 - y0) / grid_spacing).floor, 1].max
            y_delta = (y1 - y0) / y_steps
            (0..y_steps).each do |yi|
              cy = y0 + yi * y_delta
              p_start = Geom::Point3d.new(x0.mm, cy.mm, z0.mm)
              p_end   = Geom::Point3d.new(x1.mm, cy.mm, z0.mm)
              add_rebar_segment(entities, p_start, p_end, bar_r)
              # Hooks up
              add_rebar_segment(entities, p_start, Geom::Point3d.new(x0.mm, cy.mm, z0.mm + hook_h), bar_r)
              add_rebar_segment(entities, p_end, Geom::Point3d.new(x1.mm, cy.mm, z0.mm + hook_h), bar_r)
            end

            # Y-direction bars
            x_steps = [((x1 - x0) / grid_spacing).floor, 1].max
            x_delta = (x1 - x0) / x_steps
            (0..x_steps).each do |xi|
              cx = x0 + xi * x_delta
              p_start = Geom::Point3d.new(cx.mm, y0.mm, (z0 + dia).mm)
              p_end   = Geom::Point3d.new(cx.mm, y1.mm, (z0 + dia).mm)
              add_rebar_segment(entities, p_start, p_end, bar_r)
              # Hooks up
              add_rebar_segment(entities, p_start, Geom::Point3d.new(cx.mm, y0.mm, z0.mm + hook_h), bar_r)
              add_rebar_segment(entities, p_end, Geom::Point3d.new(cx.mm, y1.mm, z0.mm + hook_h), bar_r)
            end

          else # structure.beam or default
            # Top and Bottom main bars
            corners = [
              [x0, y0, z0], [x1, y0, z0], [x0, y0, z1], [x1, y0, z1]
            ]
            # Add basic centerline marker as fallback
            entities.add_line(point([min[0], min[1], (min[2] + max[2])/2.0]), point([max[0], max[1], (min[2] + max[2])/2.0]))
          end

          group
        end

        def add_rebar_segment(entities, pt1, pt2, radius)
          vec = pt2 - pt1
          len = vec.length
          return if len < 1.mm

          bar_grp = entities.add_group
          # Create a circle face at origin and pushpull
          circle = bar_grp.entities.add_circle(Geom::Point3d.new(0, 0, 0), Geom::Vector3d.new(0, 0, 1), radius, 8)
          face = bar_grp.entities.add_face(circle)
          face.pushpull(-len) if face

          z_axis = Geom::Vector3d.new(0, 0, 1)
          if vec.parallel?(z_axis)
            trans = Geom::Transformation.translation(pt1)
          else
            rot_axis = z_axis * vec
            rot_angle = z_axis.angle_between(vec)
            trans = Geom::Transformation.translation(pt1) *
                    Geom::Transformation.rotation(Geom::Point3d.new(0, 0, 0), rot_axis, rot_angle)
          end
          bar_grp.transform!(trans)
        end


        private

        def point(values_mm)
          x, y, z = Core::Units.point_from_mm(values_mm)
          Geom::Point3d.new(x, y, z)
        end
      end
    end
  end
end
