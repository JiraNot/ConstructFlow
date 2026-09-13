# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      # 1-Click Hip, Gable, and Lean-to Roof Generator with Eave Overhang and 3D Fascia Boards.
      # Serves as a native BIM replacement for 1001bit_pro and SKH_Building roof tools.
      class HipGableRoofGenerator
        DEFAULT_SLOPE_DEG = 30.0
        DEFAULT_OVERHANG_MM = 800.0
        DEFAULT_THICKNESS_MM = 35.0
        DEFAULT_FASCIA_HEIGHT_MM = 200.0
        DEFAULT_FASCIA_THICKNESS_MM = 25.0

        def self.generate_from_selection(model, options = {})
          selection = model.selection
          face = selection.find { |e| e.is_a?(Sketchup::Face) }

          boundary_mm = nil
          if face
            boundary_mm = face.outer_loop.vertices.map do |v|
              [Core::Units.su_to_mm(v.position.x), Core::Units.su_to_mm(v.position.y), Core::Units.su_to_mm(v.position.z)]
            end
          else
            # Try to find group with bounding box or prompt user
            group = selection.find { |e| e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance) }
            if group && group.bounds
              bb = group.bounds
              z = Core::Units.su_to_mm(bb.max.z)
              x0 = Core::Units.su_to_mm(bb.min.x)
              x1 = Core::Units.su_to_mm(bb.max.x)
              y0 = Core::Units.su_to_mm(bb.min.y)
              y1 = Core::Units.su_to_mm(bb.max.y)
              boundary_mm = [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]]
            end
          end

          unless boundary_mm && boundary_mm.length >= 3
            if defined?(UI) && UI.respond_to?(:messagebox)
              UI.messagebox('กรุณาเลือก Face หรือ Group อาคารที่ต้องการสร้างหลังคาก่อน')
            end
            return nil
          end

          generator = new(options)
          generator.build(model, boundary_mm)
        end

        attr_reader :form, :slope_deg, :overhang_mm, :thickness_mm,
                    :fascia_height_mm, :fascia_thickness_mm, :covering_material

        def initialize(options = {})
          @form = (options[:form] || options['form'] || 'hip').to_s.downcase
          @slope_deg = (options[:slope_deg] || options['slope_deg'] || DEFAULT_SLOPE_DEG).to_f

          raw_overhang = options[:overhang_m] || options[:overhang_mm] || options['overhang_mm']
          raw_thick = options[:thickness_m] || options[:thickness_mm] || options['thickness_mm']
          raw_fh = options[:fascia_height_m] || options[:fascia_height_mm] || options['fascia_height_mm']
          raw_ft = options[:fascia_thickness_m] || options[:fascia_thickness_mm] || options['fascia_thickness_mm']

          @overhang_mm = normalize_dim(raw_overhang, DEFAULT_OVERHANG_MM)
          @thickness_mm = normalize_dim(raw_thick, DEFAULT_THICKNESS_MM)
          @fascia_height_mm = normalize_dim(raw_fh, DEFAULT_FASCIA_HEIGHT_MM)
          @fascia_thickness_mm = normalize_dim(raw_ft, DEFAULT_FASCIA_THICKNESS_MM)
          @covering_material = options[:covering_material] || options['covering_material'] || 'MetalSheet'
        end

        def normalize_dim(val, default_val)
          return default_val if val.nil?
          f = val.to_f
          return default_val if f <= 0.0
          f < 20.0 ? (f * 1000.0) : f
        end

        def build(model, boundary_points_mm)
          return nil if boundary_points_mm.nil? || boundary_points_mm.length < 3

          # 1. Expand boundary by eave overhang
          eave_boundary_mm = expand_boundary(boundary_points_mm, @overhang_mm)

          # 2. Compute base elevation Z
          base_z_mm = boundary_points_mm.map { |p| p[2].to_f }.max || 0.0

          # 3. Create group
          model.start_operation('Generate Hip/Gable Roof', true) if model.respond_to?(:start_operation)
        begin
          roof_group = model.active_entities.add_group
          roof_group.name = "ConstructFlow Roof (#{@form.capitalize})"

          # Set tag CF_ROOF if tag manager exists
          Core::TagManager.ensure_tags(model) if defined?(Core::TagManager)
          Core::TagManager.assign_tag(roof_group, 'CF_ROOF') if defined?(Core::TagManager)

          entities = roof_group.entities

          # 4. Generate roof facets depending on form
          facets = compute_facets(eave_boundary_mm, base_z_mm)

          # Draw 3D sloped covering panels
          facets.each do |poly_pts|
            next if poly_pts.length < 3
            su_pts = poly_pts.map { |p| to_su_point(p) }
            face = entities.add_face(su_pts) rescue nil
            if face
              # ensure normal points upward
              face.reverse! if face.normal.z < 0
              if @thickness_mm > 0.1 && face.respond_to?(:pushpull)
                begin
                  face.pushpull(Core::Units.mm_to_su(@thickness_mm))
                rescue StandardError
                  # pushpull fallback
                end
              end
            end
          end

          # 5. Generate Fascia Boards (เชิงชาย) around the eave perimeter
          if @fascia_height_mm > 0.1
            build_fascia_boards(entities, eave_boundary_mm, base_z_mm)
          end

        rescue => e
          model.abort_operation if model.respond_to?(:abort_operation)
          raise e
        end
          model.commit_operation if model.respond_to?(:commit_operation)
          roof_group
        end

        # Expands a 2D boundary polygon outward by offset_distance_mm
        def expand_boundary(points_mm, offset_mm)
          return points_mm if offset_mm.abs < 0.1

          n = points_mm.length
          z = points_mm[0][2] || 0.0

          # Compute edge direction vectors and normal vectors in XY plane
          edges = []
          normals = []

          n.times do |i|
            p1 = points_mm[i]
            p2 = points_mm[(i + 1) % n]
            dx = p2[0] - p1[0]
            dy = p2[1] - p1[1]
            len = Math.sqrt(dx * dx + dy * dy)
            if len > 0.001
              ux = dx / len
              uy = dy / len
            else
              ux = 1.0
              uy = 0.0
            end
            edges << [ux, uy]
            # 90 deg clockwise normal: (uy, -ux) or counter-clockwise (-uy, ux)
            normals << [uy, -ux]
          end

          # Check polygon winding direction (Shoelace formula)
          signed_area = 0.0
          n.times do |i|
            p1 = points_mm[i]
            p2 = points_mm[(i + 1) % n]
            signed_area += (p1[0] * p2[1] - p2[0] * p1[1])
          end

          # If CCW (signed_area > 0), outward normal is (uy, -ux). If CW, reverse.
          normal_sign = signed_area > 0 ? 1.0 : -1.0

          # Offset each vertex along miter direction of adjacent edges
          expanded = []
          n.times do |i|
            prev_idx = (i - 1 + n) % n
            n1 = normals[prev_idx]
            n2 = normals[i]

            # Average normal
            mx = (n1[0] + n2[0]) * normal_sign
            my = (n1[1] + n2[1]) * normal_sign
            mlen = Math.sqrt(mx * mx + my * my)

            if mlen > 0.001
              mx /= mlen
              my /= mlen
              # Miter scale: 1 / cos(half_angle)
              dot = (n1[0] * n2[0] + n1[1] * n2[1])
              miter_scale = Math.sqrt(2.0 / [0.2, 1.0 + dot].max)
              miter_scale = [miter_scale, 2.0].min # limit corner spike

              ox = points_mm[i][0] + mx * offset_mm * miter_scale
              oy = points_mm[i][1] + my * offset_mm * miter_scale
              expanded << [ox, oy, z]
            else
              expanded << [points_mm[i][0] + n2[0] * offset_mm, points_mm[i][1] + n2[1] * offset_mm, z]
            end
          end

          expanded
        end

        # Computes 3D facets for the roof
        def compute_facets(boundary_mm, base_z)
          xs = boundary_mm.map { |p| p[0] }
          ys = boundary_mm.map { |p| p[1] }
          min_x, max_x = xs.min, xs.max
          min_y, max_y = ys.min, ys.max
          dx = (max_x - min_x).abs
          dy = (max_y - min_y).abs

          slope_rad = @slope_deg * Math::PI / 180.0
          tan_slope = Math.tan(slope_rad)

          case @form
          when 'hip'
            # For Hip roof: ridge along longest axis, e.g. X if dx >= dy
            if dx >= dy
              ridge_y = (min_y + max_y) / 2.0
              half_span = dy / 2.0
              ridge_z = base_z + half_span * tan_slope
              ridge_x1 = min_x + half_span
              ridge_x2 = max_x - half_span

              # In case building is square (ridge collapses to center point)
              if ridge_x1 >= ridge_x2
                cx = (min_x + max_x) / 2.0
                peak = [cx, ridge_y, ridge_z]
                # 4 triangular facets
                [
                  [[min_x, min_y, base_z], [max_x, min_y, base_z], peak],
                  [[max_x, min_y, base_z], [max_x, max_y, base_z], peak],
                  [[max_x, max_y, base_z], [min_x, max_y, base_z], peak],
                  [[min_x, max_y, base_z], [min_x, min_y, base_z], peak]
                ]
              else
                r1 = [ridge_x1, ridge_y, ridge_z]
                r2 = [ridge_x2, ridge_y, ridge_z]
                # 2 trapezoids + 2 triangles
                [
                  # Front slope (min_y)
                  [[min_x, min_y, base_z], [max_x, min_y, base_z], r2, r1],
                  # Back slope (max_y)
                  [[max_x, max_y, base_z], [min_x, max_y, base_z], r1, r2],
                  # Left hip triangle (min_x)
                  [[min_x, max_y, base_z], [min_x, min_y, base_z], r1],
                  # Right hip triangle (max_x)
                  [[max_x, min_y, base_z], [max_x, max_y, base_z], r2]
                ]
              end
            else
              # Ridge along Y
              ridge_x = (min_x + max_x) / 2.0
              half_span = dx / 2.0
              ridge_z = base_z + half_span * tan_slope
              ridge_y1 = min_y + half_span
              ridge_y2 = max_y - half_span

              if ridge_y1 >= ridge_y2
                cy = (min_y + max_y) / 2.0
                peak = [ridge_x, cy, ridge_z]
                [
                  [[min_x, min_y, base_z], [max_x, min_y, base_z], peak],
                  [[max_x, min_y, base_z], [max_x, max_y, base_z], peak],
                  [[max_x, max_y, base_z], [min_x, max_y, base_z], peak],
                  [[min_x, max_y, base_z], [min_x, min_y, base_z], peak]
                ]
              else
                r1 = [ridge_x, ridge_y1, ridge_z]
                r2 = [ridge_x, ridge_y2, ridge_z]
                [
                  # Left slope (min_x)
                  [[min_x, max_y, base_z], [min_x, min_y, base_z], r1, r2],
                  # Right slope (max_x)
                  [[max_x, min_y, base_z], [max_x, max_y, base_z], r2, r1],
                  # Front hip triangle (min_y)
                  [[max_x, min_y, base_z], [min_x, min_y, base_z], r1],
                  # Back hip triangle (max_y)
                  [[min_x, max_y, base_z], [max_x, max_y, base_z], r2]
                ]
              end
            end

          when 'gable'
            # Gable roof (dual sloped): Ridge along longest axis
            if dx >= dy
              ridge_y = (min_y + max_y) / 2.0
              ridge_z = base_z + (dy / 2.0) * tan_slope
              r1 = [min_x, ridge_y, ridge_z]
              r2 = [max_x, ridge_y, ridge_z]
              [
                # Front slope
                [[min_x, min_y, base_z], [max_x, min_y, base_z], r2, r1],
                # Back slope
                [[max_x, max_y, base_z], [min_x, max_y, base_z], r1, r2]
              ]
            else
              ridge_x = (min_x + max_x) / 2.0
              ridge_z = base_z + (dx / 2.0) * tan_slope
              r1 = [ridge_x, min_y, ridge_z]
              r2 = [ridge_x, max_y, ridge_z]
              [
                # Left slope
                [[min_x, max_y, base_z], [min_x, min_y, base_z], r1, r2],
                # Right slope
                [[max_x, min_y, base_z], [max_x, max_y, base_z], r2, r1]
              ]
            end

          else # lean_to / single slope
            ridge_z = base_z + dy * tan_slope
            [
              [
                [min_x, min_y, base_z],
                [max_x, min_y, base_z],
                [max_x, max_y, ridge_z],
                [min_x, max_y, ridge_z]
              ]
            ]
          end
        end

        # Builds 3D vertical Fascia boards (ไม้เชิงชาย) along the outer eave boundary
        def build_fascia_boards(entities, eave_boundary_mm, base_z)
          fascia_grp = entities.add_group
          fascia_grp.name = 'ConstructFlow Fascia Boards'
          Core::TagManager.assign_tag(fascia_grp, 'CF_FASCIA') if defined?(Core::TagManager)

          f_ents = fascia_grp.entities
          n = eave_boundary_mm.length
          h_su = Core::Units.mm_to_su(@fascia_height_mm)
          t_su = Core::Units.mm_to_su(@fascia_thickness_mm)

          n.times do |i|
            p1 = eave_boundary_mm[i]
            p2 = eave_boundary_mm[(i + 1) % n]

            # Top corners of vertical board
            pt1_top = to_su_point([p1[0], p1[1], base_z])
            pt2_top = to_su_point([p2[0], p2[1], base_z])

            # Bottom corners
            pt1_bot = Geom::Point3d.new(pt1_top.x, pt1_top.y, pt1_top.z - h_su)
            pt2_bot = Geom::Point3d.new(pt2_top.x, pt2_top.y, pt2_top.z - h_su)

            face = f_ents.add_face([pt1_top, pt2_top, pt2_bot, pt1_bot]) rescue nil
            if face && t_su > 0.001 && face.respond_to?(:pushpull)
              begin
                face.pushpull(t_su)
              rescue StandardError
                # ignore
              end
            end
          end
        end

        private

        def to_su_point(point_mm)
          Geom::Point3d.new(
            Core::Units.mm_to_su(point_mm[0]),
            Core::Units.mm_to_su(point_mm[1]),
            Core::Units.mm_to_su(point_mm[2] || 0.0)
          )
        end
      end
    end
  end
end
