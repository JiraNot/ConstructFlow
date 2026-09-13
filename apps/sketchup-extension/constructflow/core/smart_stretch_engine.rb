# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      # 9-Slice Parametric Smart Stretch Engine.
      # Rescales doors, windows, cabinets, and architectural components without distorting
      # perimeter frames, stiles, rails, or hardware (e.g. handles, knobs, hinges).
      class SmartStretchEngine
        DEFAULT_MARGIN_MM = 50.0

        def self.stretch_selection(model, options = {})
          selection = model.selection
          entity = selection.find { |e| e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance) }

          unless entity
            if defined?(UI) && UI.respond_to?(:messagebox)
              UI.messagebox('กรุณาเลือก Group หรือ Component (ประตู/หน้าต่าง/ตู้) ที่ต้องการยืดสเกลก่อน')
            end
            return nil
          end

          engine = new(entity, options)
          engine.execute(model)
        end

        attr_reader :entity, :target_width_mm, :target_height_mm, :target_depth_mm,
                    :margin_x_mm, :margin_z_mm, :margin_y_mm

        def initialize(entity, options = {})
          @entity = entity
          raw_w = options[:target_width_m] || options[:target_width_mm] || options['target_width_mm']
          raw_h = options[:target_height_m] || options[:target_height_mm] || options['target_height_mm']
          raw_d = options[:target_depth_m] || options[:target_depth_mm] || options['target_depth_mm']

          raw_dw = options[:delta_width_m] || options[:delta_width_mm] || options['delta_width_mm']
          raw_dh = options[:delta_height_m] || options[:delta_height_mm] || options['delta_height_mm']
          raw_dd = options[:delta_depth_m] || options[:delta_depth_mm] || options['delta_depth_mm']

          raw_margin = options[:frame_margin_m] || options[:margin_x_mm] || options[:frame_margin_mm] || options['frame_margin_mm']

          @target_width_mm = normalize_dim(raw_w)
          @target_height_mm = normalize_dim(raw_h)
          @target_depth_mm = normalize_dim(raw_d)

          @delta_width_mm = normalize_dim(raw_dw)
          @delta_height_mm = normalize_dim(raw_dh)
          @delta_depth_mm = normalize_dim(raw_dd)

          m_val = normalize_dim(raw_margin) || DEFAULT_MARGIN_MM
          @margin_x_mm = m_val
          @margin_z_mm = m_val
          @margin_y_mm = m_val
        end

        def normalize_dim(val)
          return nil if val.nil?
          f = val.to_f
          return nil if f == 0.0
          # If under 20.0, value was provided in meters (e.g. 1.2 m -> 1200 mm)
          f.abs < 20.0 ? (f * 1000.0) : f
        end

        def execute(model = nil)
          model ||= Sketchup.active_model if defined?(Sketchup) && Sketchup.respond_to?(:active_model)
          model.start_operation('Smart Non-Distort Stretch', true) if model&.respond_to?(:start_operation)

          # Get bounds in local coordinates
          bounds = local_bounds(@entity)
          return nil unless bounds

          min_x_su = bounds.min.x
          max_x_su = bounds.max.x
          min_y_su = bounds.min.y
          max_y_su = bounds.max.y
          min_z_su = bounds.min.z
          max_z_su = bounds.max.z

          cur_w_mm = Core::Units.su_to_mm(max_x_su - min_x_su)
          cur_d_mm = Core::Units.su_to_mm(max_y_su - min_y_su)
          cur_h_mm = Core::Units.su_to_mm(max_z_su - min_z_su)

          delta_w_mm = @delta_width_mm || (@target_width_mm ? (@target_width_mm - cur_w_mm) : 0.0)
          delta_h_mm = @delta_height_mm || (@target_height_mm ? (@target_height_mm - cur_h_mm) : 0.0)
          delta_d_mm = @delta_depth_mm || (@target_depth_mm ? (@target_depth_mm - cur_d_mm) : 0.0)

          if delta_w_mm.abs < 0.1 && delta_h_mm.abs < 0.1 && delta_d_mm.abs < 0.1
            model.commit_operation if model&.respond_to?(:commit_operation)
            return @entity
          end

          delta_w_su = Core::Units.mm_to_su(delta_w_mm)
          delta_h_su = Core::Units.mm_to_su(delta_h_mm)
          delta_d_su = Core::Units.mm_to_su(delta_d_mm)

          margin_x_su = Core::Units.mm_to_su(@margin_x_mm)
          margin_z_su = Core::Units.mm_to_su(@margin_z_mm)
          margin_y_su = Core::Units.mm_to_su(@margin_y_mm)

          entities = entity_entities(@entity)
          if entities
            transform_entities_9slice(
              entities,
              min_x_su, max_x_su, min_y_su, max_y_su, min_z_su, max_z_su,
              delta_w_su, delta_d_su, delta_h_su,
              margin_x_su, margin_y_su, margin_z_su
            )
          end

          model.commit_operation if model&.respond_to?(:commit_operation)
          @entity
        end

        # Computes 9-slice displacement for a 3D point
        def compute_displacement_3d(x, y, z, min_x, max_x, min_y, max_y, min_z, max_z,
                                    delta_w, delta_d, delta_h, margin_x, margin_y, margin_z)
          dx = compute_axis_displacement(x, min_x, max_x, delta_w, margin_x)
          dy = compute_axis_displacement(y, min_y, max_y, delta_d, margin_y)
          dz = compute_axis_displacement(z, min_z, max_z, delta_h, margin_z)
          [dx, dy, dz]
        end

        private

        def compute_axis_displacement(coord, min_val, max_val, delta, margin)
          return 0.0 if delta.abs < 0.0001

          span = max_val - min_val
          # If object is narrower than double margin, scale uniformly
          if span <= (margin * 2.0)
            return span > 0.0001 ? ((coord - min_val) / span) * delta : 0.0
          end

          cut_low = min_val + margin
          cut_high = max_val - margin

          if coord <= cut_low
            0.0
          elsif coord >= cut_high
            delta
          else
            ratio = (coord - cut_low) / (cut_high - cut_low)
            ratio * delta
          end
        end

        def transform_entities_9slice(entities, min_x, max_x, min_y, max_y, min_z, max_z,
                                      delta_w, delta_d, delta_h, margin_x, margin_y, margin_z)
          # 1. Collect all unique vertices directly inside these entities
          edges = []
          nested_instances = []

          entities.each do |item|
            if item.is_a?(Sketchup::Edge) || item.class.name.end_with?('Edge')
              edges << item
            elsif (item.is_a?(Sketchup::Group) || item.is_a?(Sketchup::ComponentInstance) || item.class.name.end_with?('Group') || item.class.name.end_with?('ComponentInstance'))
              nested_instances << item
            end
          end

          vertices = edges.flat_map(&:vertices).uniq
          if !vertices.empty?
            vectors = []
            valid_verts = []

            vertices.each do |v|
              pos = v.position
              dx, dy, dz = compute_displacement_3d(
                pos.x, pos.y, pos.z,
                min_x, max_x, min_y, max_y, min_z, max_z,
                delta_w, delta_d, delta_h,
                margin_x, margin_y, margin_z
              )

              if dx.abs > 0.00001 || dy.abs > 0.00001 || dz.abs > 0.00001
                valid_verts << v
                vectors << Geom::Vector3d.new(dx, dy, dz)
              end
            end

            if !valid_verts.empty? && entities.respond_to?(:transform_by_vectors)
              begin
                entities.transform_by_vectors(valid_verts, vectors)
              rescue StandardError => e
                # Fallback: update positions manually if mock or API variance
                valid_verts.each_with_index do |v, idx|
                  vec = vectors[idx]
                  if v.respond_to?(:position=)
                    v.position = Geom::Point3d.new(v.position.x + vec.x, v.position.y + vec.y, v.position.z + vec.z)
                  end
                end
              end
            end
          end

          # 2. Transform nested sub-components (knobs, hinges, handles) rigidly
          nested_instances.each do |sub_inst|
            sub_bounds = sub_inst.bounds rescue nil
            if sub_bounds
              center = sub_bounds.center
              dx, dy, dz = compute_displacement_3d(
                center.x, center.y, center.z,
                min_x, max_x, min_y, max_y, min_z, max_z,
                delta_w, delta_d, delta_h,
                margin_x, margin_y, margin_z
              )

              if dx.abs > 0.0001 || dy.abs > 0.0001 || dz.abs > 0.0001
                vec = Geom::Vector3d.new(dx, dy, dz)
                if sub_inst.respond_to?(:transform!)
                  trans = Geom::Transformation.translation(vec) rescue nil
                  sub_inst.transform!(trans) if trans
                end
              end
            end
          end
        end

        def local_bounds(ent)
          if ent.is_a?(Sketchup::ComponentInstance) || ent.class.name.end_with?('ComponentInstance')
            ent.definition.bounds rescue ent.bounds
          else
            ent.bounds
          end
        end

        def entity_entities(ent)
          if ent.is_a?(Sketchup::ComponentInstance) || ent.class.name.end_with?('ComponentInstance')
            ent.definition.entities rescue ent.entities
          else
            ent.entities
          end
        end
      end
    end
  end
end
