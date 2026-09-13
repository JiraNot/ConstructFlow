# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module Tools
        class AutoDimensionEngine
          TAG_NAME = 'CF_DIMENSIONS'

          def self.generate(runtime, target_entities = nil)
            model = runtime&.active_model || (defined?(Sketchup) ? Sketchup.active_model : nil)
            return { status: 'error', message: 'No active SketchUp model' } unless model

            selection = target_entities || model.selection.to_a
            # If nothing selected, find all smart objects
            if selection.empty?
              selection = model.active_entities.select do |e|
                (e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance)) &&
                  (e.get_attribute('ConstructFlow', 'type_id') || e.get_attribute('ConstructFlow', 'object_type'))
              end
            end

            if selection.empty?
              return { status: 'warning', message: 'กรุณาเลือกชิ้นงาน (เสา, ผนัง หรือโครงสร้าง) เพื่อดึงเส้นบอกระยะ' }
            end

            model.start_operation('Auto-Dimension Extension Elements', true)
            begin
              # Ensure Tag exists
              dim_tag = model.layers[TAG_NAME] || model.layers.add(TAG_NAME)

              # Create a container group for neat organization
              container = model.active_entities.add_group
              container.name = '[CF] Dimensions'
              container.layer = dim_tag if container.respond_to?(:layer=)
              ents = container.entities

              dims_created = 0

              # 1. Check if we have columns (Grid Spans)
              columns = selection.select do |e|
                tid = e.get_attribute('ConstructFlow', 'type_id') || e.get_attribute('ConstructFlow', 'object_type')
                tid.to_s.include?('column')
              end

              if columns.length >= 2
                dims_created += dimension_columns(ents, columns)
              else
                # 2. Dimension each selected element's bounding box
                selection.each do |elem|
                  dims_created += dimension_bounding_box(ents, elem)
                end
              end

              model.commit_operation
              {
                status: 'success',
                dimensions_count: dims_created,
                message: "สร้างเส้นบอกระยะเรียบร้อย (#{dims_created} เส้น)"
              }
            rescue StandardError => e
              model.abort_operation
              { status: 'error', message: e.message }
            end
          end

          def self.dimension_columns(entities, columns)
            count = 0
            # Get center positions
            centers = columns.map { |c| c.bounds.center }
            
            # Sort along X
            x_sorted = centers.sort_by(&:x)
            # Find unique X coordinates (within 50mm tolerance)
            unique_x_groups = cluster_points(x_sorted, :x, 50.mm)
            
            if unique_x_groups.length >= 2
              min_y = centers.map(&:y).min
              z_ref = centers.map(&:z).min
              offset_dist = 600.mm

              (0...(unique_x_groups.length - 1)).each do |i|
                p1 = Geom::Point3d.new(unique_x_groups[i].first.x, min_y, z_ref)
                p2 = Geom::Point3d.new(unique_x_groups[i + 1].first.x, min_y, z_ref)
                vec = Geom::Vector3d.new(0, -offset_dist, 0)
                if entities.respond_to?(:add_dimension_linear)
                  dim = entities.add_dimension_linear(p1, p2, vec)
                  count += 1 if dim
                end
              end

              # Overall X Dimension
              p_first = Geom::Point3d.new(unique_x_groups.first.first.x, min_y, z_ref)
              p_last  = Geom::Point3d.new(unique_x_groups.last.first.x, min_y, z_ref)
              vec_total = Geom::Vector3d.new(0, -(offset_dist + 400.mm), 0)
              if entities.respond_to?(:add_dimension_linear)
                dim = entities.add_dimension_linear(p_first, p_last, vec_total)
                count += 1 if dim
              end
            end

            # Sort along Y
            y_sorted = centers.sort_by(&:y)
            unique_y_groups = cluster_points(y_sorted, :y, 50.mm)
            
            if unique_y_groups.length >= 2
              min_x = centers.map(&:x).min
              z_ref = centers.map(&:z).min
              offset_dist = 600.mm

              (0...(unique_y_groups.length - 1)).each do |i|
                p1 = Geom::Point3d.new(min_x, unique_y_groups[i].first.y, z_ref)
                p2 = Geom::Point3d.new(min_x, unique_y_groups[i + 1].first.y, z_ref)
                vec = Geom::Vector3d.new(-offset_dist, 0, 0)
                if entities.respond_to?(:add_dimension_linear)
                  dim = entities.add_dimension_linear(p1, p2, vec)
                  count += 1 if dim
                end
              end

              # Overall Y Dimension
              p_first = Geom::Point3d.new(min_x, unique_y_groups.first.first.y, z_ref)
              p_last  = Geom::Point3d.new(min_x, unique_y_groups.last.first.y, z_ref)
              vec_total = Geom::Vector3d.new(-(offset_dist + 400.mm), 0, 0)
              if entities.respond_to?(:add_dimension_linear)
                dim = entities.add_dimension_linear(p_first, p_last, vec_total)
                count += 1 if dim
              end
            end

            count
          end

          def self.dimension_bounding_box(entities, elem)
            return 0 unless entities.respond_to?(:add_dimension_linear)
            count = 0
            bb = elem.bounds
            z = bb.min.z
            offset = 400.mm

            # Width (X)
            if bb.width > 10.mm
              p1 = Geom::Point3d.new(bb.min.x, bb.min.y, z)
              p2 = Geom::Point3d.new(bb.max.x, bb.min.y, z)
              dim = entities.add_dimension_linear(p1, p2, Geom::Vector3d.new(0, -offset, 0))
              count += 1 if dim
            end

            # Depth (Y)
            if bb.height > 10.mm
              p1 = Geom::Point3d.new(bb.min.x, bb.min.y, z)
              p2 = Geom::Point3d.new(bb.min.x, bb.max.y, z)
              dim = entities.add_dimension_linear(p1, p2, Geom::Vector3d.new(-offset, 0, 0))
              count += 1 if dim
            end

            count
          end

          def self.cluster_points(points, axis, tolerance)
            clusters = []
            points.each do |pt|
              matched = clusters.find do |grp|
                (grp.first.send(axis) - pt.send(axis)).abs <= tolerance
              end
              if matched
                matched << pt
              else
                clusters << [pt]
              end
            end
            clusters
          end
        end
      end
    end
  end
end
