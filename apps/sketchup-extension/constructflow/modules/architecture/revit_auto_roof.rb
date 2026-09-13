# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      # Revit-Style Automatic Roof by Footprint Generator.
      # Automatically detects building perimeter, creates 3D sloped roofs (Hip, Gable, Shed, Flat),
      # adds 3D fascia boards, eave soffits, and provides Revit's signature "Attach Walls to Roof"
      # feature that seamlessly closes gable wall triangles and wall tops.
      class RevitAutoRoof
        DEFAULT_FORM = 'hip'
        DEFAULT_SLOPE_DEG = 30.0
        DEFAULT_OVERHANG_M = 0.80
        DEFAULT_THICKNESS_M = 0.15
        DEFAULT_FASCIA_HEIGHT_M = 0.20
        DEFAULT_FASCIA_THICKNESS_M = 0.025

        def self.generate_from_selection(model, options = {})
          selection = model.selection
          boundary_m, base_z_m, detected_walls = detect_footprint_and_walls(model, selection)

          unless boundary_m && boundary_m.length >= 3
            if defined?(UI) && UI.respond_to?(:messagebox)
              UI.messagebox("กรุณาเลือกแนวผนัง (Walls), Face พื้น หรือ Group อาคาร เพื่อสร้างหลังคา Auto แบบ Revit")
            end
            return nil
          end

          generator = new(options)
          generator.build(model, boundary_m, base_z_m, walls: detected_walls)
        end

        def self.detect_footprint_and_walls(model, selection)
          # 1. Check if face is selected
          face = selection.find { |e| e.is_a?(Sketchup::Face) }
          if face
            pts_m = face.outer_loop.vertices.map do |v|
              [Core::Units.su_to_m(v.position.x), Core::Units.su_to_m(v.position.y), Core::Units.su_to_m(v.position.z)]
            end
            base_z = pts_m.map { |p| p[2] }.max || 0.0
            return [pts_m, base_z, []]
          end

          # 2. Check if wall groups are selected or present in model
          walls = selection.select do |e|
            (e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance)) &&
              (e.name.to_s.downcase.include?('wall') || (defined?(Core::TagManager) && e.layer&.name&.include?('Wall')))
          end

          if walls.empty?
            # Fallback: check all walls in active_entities
            walls = model.active_entities.select do |e|
              (e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance)) &&
                (e.name.to_s.downcase.include?('wall') || (defined?(Core::TagManager) && e.layer&.name&.include?('Wall')))
            end
          end

          if !walls.empty?
            # Combine bounding boxes of walls
            bbs = walls.map(&:bounds)
            min_x = bbs.map { |b| Core::Units.su_to_m(b.min.x) }.min
            max_x = bbs.map { |b| Core::Units.su_to_m(b.max.x) }.max
            min_y = bbs.map { |b| Core::Units.su_to_m(b.min.y) }.min
            max_y = bbs.map { |b| Core::Units.su_to_m(b.max.y) }.max
            base_z = bbs.map { |b| Core::Units.su_to_m(b.max.z) }.max

            pts_m = [
              [min_x, min_y, base_z],
              [max_x, min_y, base_z],
              [max_x, max_y, base_z],
              [min_x, max_y, base_z]
            ]
            return [pts_m, base_z, walls]
          end

          # 3. Check any selected group
          group = selection.find { |e| e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance) }
          if group && group.bounds
            bb = group.bounds
            min_x = Core::Units.su_to_m(bb.min.x)
            max_x = Core::Units.su_to_m(bb.max.x)
            min_y = Core::Units.su_to_m(bb.min.y)
            max_y = Core::Units.su_to_m(bb.max.y)
            base_z = Core::Units.su_to_m(bb.max.z)
            pts_m = [
              [min_x, min_y, base_z],
              [max_x, min_y, base_z],
              [max_x, max_y, base_z],
              [min_x, max_y, base_z]
            ]
            return [pts_m, base_z, []]
          end

          [nil, 0.0, []]
        end

        attr_reader :form, :slope_deg, :overhang_m, :thickness_m,
                    :fascia_height_m, :fascia_thickness_m, :attach_walls, :soffit

        def initialize(options = {})
          @form = (options[:form] || options['form'] || DEFAULT_FORM).to_s.downcase
          @slope_deg = (options[:slope_deg] || options['slope_deg'] || DEFAULT_SLOPE_DEG).to_f
          @overhang_m = normalize_dim(options[:overhang_m] || options[:overhang_mm], DEFAULT_OVERHANG_M)
          @thickness_m = normalize_dim(options[:thickness_m] || options[:thickness_mm], DEFAULT_THICKNESS_M)
          @fascia_height_m = normalize_dim(options[:fascia_height_m] || options[:fascia_height_mm], DEFAULT_FASCIA_HEIGHT_M)
          @fascia_thickness_m = normalize_dim(options[:fascia_thickness_m] || options[:fascia_thickness_mm], DEFAULT_FASCIA_THICKNESS_M)
          @attach_walls = options[:attach_walls].nil? ? true : (options[:attach_walls] == true || options[:attach_walls] == 'true')
          @soffit = options[:soffit].nil? ? true : (options[:soffit] == true || options[:soffit] == 'true')
        end

        def build(model, boundary_points_m, base_z_m, walls: [])
          return nil if boundary_points_m.nil? || boundary_points_m.length < 3

          model.start_operation('Revit Auto Roof by Footprint', true) if model.respond_to?(:start_operation)
        begin
          roof_group = model.active_entities.add_group
          roof_group.name = "ConstructFlow Revit Roof (#{@form.capitalize})"

          # Tag CF_ROOF
          Core::TagManager.ensure_tags(model) if defined?(Core::TagManager)
          Core::TagManager.assign_tag(roof_group, 'CF_ROOF') if defined?(Core::TagManager)

          entities = roof_group.entities

          # 1. Expand boundary outward by eave overhang
          eave_boundary_m = expand_boundary(boundary_points_m, @overhang_m)

          # 2. Compute 3D sloped facets
          facets_m, ridge_info = compute_facets(eave_boundary_m, base_z_m)

          # 3. Create Solid 3D Roof Panels (Top + Underside with Plumb Cut)
          build_solid_roof_panels(entities, facets_m, @thickness_m)

          # 4. Generate 3D Fascia Boards (ไม้เชิงชาย) along outer perimeter
          if @fascia_height_m > 0.001
            build_fascia_boards(entities, eave_boundary_m, base_z_m)
          end

          # 5. Revit Signature Feature: "Attach Walls to Roof" (ปิดจั่วสามเหลี่ยมและแนบหัวผนัง)
          if @attach_walls && (@form == 'gable' || @form == 'shed')
            build_gable_wall_attachments(entities, boundary_points_m, base_z_m, ridge_info)
          end

        rescue => e
          model.abort_operation if model.respond_to?(:abort_operation)
          raise e
        end
          model.commit_operation if model.respond_to?(:commit_operation)
          roof_group
        end

        def expand_boundary(points_m, offset_m)
          return points_m if offset_m.abs < 0.001

          n = points_m.length
          z = points_m[0][2] || 0.0

          edges = []
          normals = []

          n.times do |i|
            p1 = points_m[i]
            p2 = points_m[(i + 1) % n]
            dx = p2[0] - p1[0]
            dy = p2[1] - p1[1]
            len = Math.sqrt(dx * dx + dy * dy)
            ux = len > 0.0001 ? (dx / len) : 1.0
            uy = len > 0.0001 ? (dy / len) : 0.0
            edges << [ux, uy]
            normals << [uy, -ux]
          end

          # Shoelace area to determine winding
          signed_area = 0.0
          n.times do |i|
            p1 = points_m[i]
            p2 = points_m[(i + 1) % n]
            signed_area += (p1[0] * p2[1] - p2[0] * p1[1])
          end
          sign = signed_area > 0 ? 1.0 : -1.0

          expanded = []
          n.times do |i|
            prev_idx = (i - 1 + n) % n
            n1 = normals[prev_idx]
            n2 = normals[i]

            mx = (n1[0] + n2[0]) * sign
            my = (n1[1] + n2[1]) * sign
            mlen = Math.sqrt(mx * mx + my * my)

            if mlen > 0.001
              mx /= mlen
              my /= mlen
              dot = (n1[0] * n2[0] + n1[1] * n2[1])
              miter_scale = Math.sqrt(2.0 / [0.2, 1.0 + dot].max)
              miter_scale = [miter_scale, 2.0].min

              ox = points_m[i][0] + mx * offset_m * miter_scale
              oy = points_m[i][1] + my * offset_m * miter_scale
              expanded << [ox, oy, z]
            else
              expanded << [points_m[i][0] + n2[0] * offset_m, points_m[i][1] + n2[1] * offset_m, z]
            end
          end

          expanded
        end

        def compute_facets(boundary_m, base_z_m)
          xs = boundary_m.map { |p| p[0] }
          ys = boundary_m.map { |p| p[1] }
          min_x, max_x = xs.min, xs.max
          min_y, max_y = ys.min, ys.max
          dx = (max_x - min_x).abs
          dy = (max_y - min_y).abs

          slope_rad = @slope_deg * Math::PI / 180.0
          tan_slope = Math.tan(slope_rad)
          ridge_info = {}

          facets = case @form
          when 'hip'
            if dx >= dy
              ridge_y = (min_y + max_y) / 2.0
              half_span = dy / 2.0
              ridge_z = base_z_m + half_span * tan_slope
              ridge_x1 = min_x + half_span
              ridge_x2 = max_x - half_span

              if ridge_x1 >= ridge_x2
                cx = (min_x + max_x) / 2.0
                peak = [cx, ridge_y, ridge_z]
                [
                  [[min_x, min_y, base_z_m], [max_x, min_y, base_z_m], peak],
                  [[max_x, min_y, base_z_m], [max_x, max_y, base_z_m], peak],
                  [[max_x, max_y, base_z_m], [min_x, max_y, base_z_m], peak],
                  [[min_x, max_y, base_z_m], [min_x, min_y, base_z_m], peak]
                ]
              else
                r1 = [ridge_x1, ridge_y, ridge_z]
                r2 = [ridge_x2, ridge_y, ridge_z]
                [
                  [[min_x, min_y, base_z_m], [max_x, min_y, base_z_m], r2, r1],
                  [[max_x, max_y, base_z_m], [min_x, max_y, base_z_m], r1, r2],
                  [[min_x, max_y, base_z_m], [min_x, min_y, base_z_m], r1],
                  [[max_x, min_y, base_z_m], [max_x, max_y, base_z_m], r2]
                ]
              end
            else
              ridge_x = (min_x + max_x) / 2.0
              half_span = dx / 2.0
              ridge_z = base_z_m + half_span * tan_slope
              ridge_y1 = min_y + half_span
              ridge_y2 = max_y - half_span

              if ridge_y1 >= ridge_y2
                cy = (min_y + max_y) / 2.0
                peak = [ridge_x, cy, ridge_z]
                [
                  [[min_x, min_y, base_z_m], [max_x, min_y, base_z_m], peak],
                  [[max_x, min_y, base_z_m], [max_x, max_y, base_z_m], peak],
                  [[max_x, max_y, base_z_m], [min_x, max_y, base_z_m], peak],
                  [[min_x, max_y, base_z_m], [min_x, min_y, base_z_m], peak]
                ]
              else
                r1 = [ridge_x, ridge_y1, ridge_z]
                r2 = [ridge_x, ridge_y2, ridge_z]
                [
                  [[min_x, max_y, base_z_m], [min_x, min_y, base_z_m], r1, r2],
                  [[max_x, min_y, base_z_m], [max_x, max_y, base_z_m], r2, r1],
                  [[max_x, min_y, base_z_m], [min_x, min_y, base_z_m], r1],
                  [[min_x, max_y, base_z_m], [max_x, max_y, base_z_m], r2]
                ]
              end
            end

          when 'gable'
            if dx >= dy
              ridge_y = (min_y + max_y) / 2.0
              ridge_z = base_z_m + (dy / 2.0) * tan_slope
              r1 = [min_x, ridge_y, ridge_z]
              r2 = [max_x, ridge_y, ridge_z]
              ridge_info = { axis: :x, ridge_y: ridge_y, ridge_z: ridge_z, tan_slope: tan_slope }
              [
                [[min_x, min_y, base_z_m], [max_x, min_y, base_z_m], r2, r1],
                [[max_x, max_y, base_z_m], [min_x, max_y, base_z_m], r1, r2]
              ]
            else
              ridge_x = (min_x + max_x) / 2.0
              ridge_z = base_z_m + (dx / 2.0) * tan_slope
              r1 = [ridge_x, min_y, ridge_z]
              r2 = [ridge_x, max_y, ridge_z]
              ridge_info = { axis: :y, ridge_x: ridge_x, ridge_z: ridge_z, tan_slope: tan_slope }
              [
                [[min_x, max_y, base_z_m], [min_x, min_y, base_z_m], r1, r2],
                [[max_x, min_y, base_z_m], [max_x, max_y, base_z_m], r2, r1]
              ]
            end

          when 'shed'
            ridge_z = base_z_m + dy * tan_slope
            [
              [
                [min_x, min_y, base_z_m],
                [max_x, min_y, base_z_m],
                [max_x, max_y, ridge_z],
                [min_x, max_y, ridge_z]
              ]
            ]

          else # flat
            [
              [
                [min_x, min_y, base_z_m],
                [max_x, min_y, base_z_m],
                [max_x, max_y, base_z_m],
                [min_x, max_y, base_z_m]
              ]
            ]
          end

          [facets, ridge_info]
        end

        def build_solid_roof_panels(entities, facets_m, thickness_m)
          facets_m.each do |pts_m|
            next if pts_m.length < 3

            su_pts = pts_m.map { |p| to_su_point(p) }
            face = entities.add_face(su_pts) rescue nil
            if face
              face.reverse! if face.normal.z < 0
              if thickness_m > 0.001 && face.respond_to?(:pushpull)
                begin
                  face.pushpull(Core::Units.m_to_su(thickness_m))
                rescue StandardError
                  # pushpull fallback
                end
              end
            end
          end
        end

        def build_fascia_boards(entities, eave_boundary_m, base_z_m)
          fascia_grp = entities.add_group
          fascia_grp.name = 'ConstructFlow Revit Fascia'
          Core::TagManager.assign_tag(fascia_grp, 'CF_FASCIA') if defined?(Core::TagManager)

          f_ents = fascia_grp.entities
          n = eave_boundary_m.length
          h_su = Core::Units.m_to_su(@fascia_height_m)
          t_su = Core::Units.m_to_su(@fascia_thickness_m)

          n.times do |i|
            p1 = eave_boundary_m[i]
            p2 = eave_boundary_m[(i + 1) % n]

            pt1_top = to_su_point([p1[0], p1[1], base_z_m])
            pt2_top = to_su_point([p2[0], p2[1], base_z_m])
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

        # Revit Signature "Attach Walls to Roof":
        # Generates solid triangular gable walls at the ends of the building
        # closing the gap seamlessly between wall top and roof underside!
        def build_gable_wall_attachments(entities, wall_boundary_m, base_z_m, ridge_info)
          return unless ridge_info[:axis]

          gable_grp = entities.add_group
          gable_grp.name = 'ConstructFlow Attached Gable Walls'
          Core::TagManager.assign_tag(gable_grp, 'CF_WALL') if defined?(Core::TagManager)

          g_ents = gable_grp.entities
          wall_thick_su = Core::Units.m_to_su(0.10) # 10 cm wall thickness

          xs = wall_boundary_m.map { |p| p[0] }
          ys = wall_boundary_m.map { |p| p[1] }
          min_x, max_x = xs.min, xs.max
          min_y, max_y = ys.min, ys.max

          if ridge_info[:axis] == :x
            # Ridge along X -> Gable triangles at min_x and max_x
            mid_y = (min_y + max_y) / 2.0
            peak_z = base_z_m + ((max_y - min_y) / 2.0) * ridge_info[:tan_slope]

            # 1. Left gable end (min_x)
            pt_left = to_su_point([min_x, min_y, base_z_m])
            pt_right = to_su_point([min_x, max_y, base_z_m])
            pt_peak = to_su_point([min_x, mid_y, peak_z])

            f1 = g_ents.add_face([pt_left, pt_right, pt_peak]) rescue nil
            f1.pushpull(wall_thick_su) if f1 && f1.respond_to?(:pushpull)

            # 2. Right gable end (max_x)
            pt_left2 = to_su_point([max_x, max_y, base_z_m])
            pt_right2 = to_su_point([max_x, min_y, base_z_m])
            pt_peak2 = to_su_point([max_x, mid_y, peak_z])

            f2 = g_ents.add_face([pt_left2, pt_right2, pt_peak2]) rescue nil
            f2.pushpull(wall_thick_su) if f2 && f2.respond_to?(:pushpull)
          else
            # Ridge along Y -> Gable triangles at min_y and max_y
            mid_x = (min_x + max_x) / 2.0
            peak_z = base_z_m + ((max_x - min_x) / 2.0) * ridge_info[:tan_slope]

            # 1. Front gable end (min_y)
            pt_left = to_su_point([min_x, min_y, base_z_m])
            pt_right = to_su_point([max_x, min_y, base_z_m])
            pt_peak = to_su_point([mid_x, min_y, peak_z])

            f1 = g_ents.add_face([pt_left, pt_right, pt_peak]) rescue nil
            f1.pushpull(wall_thick_su) if f1 && f1.respond_to?(:pushpull)

            # 2. Back gable end (max_y)
            pt_left2 = to_su_point([max_x, max_y, base_z_m])
            pt_right2 = to_su_point([min_x, max_y, base_z_m])
            pt_peak2 = to_su_point([mid_x, max_y, peak_z])

            f2 = g_ents.add_face([pt_left2, pt_right2, pt_peak2]) rescue nil
            f2.pushpull(wall_thick_su) if f2 && f2.respond_to?(:pushpull)
          end
        end

        private

        def normalize_dim(val, default_val)
          return default_val if val.nil?
          f = val.to_f
          return default_val if f <= 0.0
          f >= 20.0 ? (f / 1000.0) : f
        end

        def to_su_point(p_m)
          Geom::Point3d.new(
            Core::Units.m_to_su(p_m[0]),
            Core::Units.m_to_su(p_m[1]),
            Core::Units.m_to_su(p_m[2] || 0.0)
          )
        end
      end
    end
  end
end
