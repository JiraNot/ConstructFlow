# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class PlanReferenceCollector
        def initialize(runtime)
          @runtime = runtime
        end

        def paths(level_id: nil)
          return [].freeze unless @runtime.respond_to?(:smart_objects)

          @runtime.smart_objects.all.filter_map do |object|
            next if level_id && !level_id.to_s.empty? && !level_match?(object, level_id)

            definition = case object.type.to_s
                         when 'architecture.wall' then WallRepository.new.read(object.entity)
                         when 'architecture.floor' then FloorRepository.new.read(object.entity)
                         when 'architecture.room' then RoomRepository.new.read(object.entity)
                         when 'architecture.ceiling' then CeilingRepository.new.read(object.entity)
                         when 'roof.system'
                           next unless defined?(Roof::Repository)

                           Roof::Repository.new.read_roof(object.entity)
                         when 'surface.boundary'
                           next unless defined?(Surface::Repository)

                           Surface::Repository.new.read_surface(object.entity)
                         when 'drainage.pipe_route'
                           next unless defined?(Drainage::Repository)

                           Drainage::Repository.new.read_pipe_route(object.entity)
                         when 'structure.column'
                           structure_definition = defined?(Structure::Repository) && Structure::Repository.new.read_column(object.entity)
                           next({ points_mm: structure_definition.plan_reference_points_mm, kind: 'column_face', source_object_id: object.id, source_type: object.type }.freeze) if structure_definition
                         when 'structure.grid'
                           structure_definition = defined?(Structure::Repository) && Structure::Repository.new.read_grid(object.entity)
                           next({ path_mm: structure_definition.path_mm, source_object_id: object.id, source_type: object.type }.freeze) if structure_definition
                         when 'structure.beam'
                           structure_definition = defined?(Structure::Repository) && Structure::Repository.new.read_beam(object.entity)
                           next({ path_mm: structure_definition.path_mm, source_object_id: object.id, source_type: object.type }.freeze) if structure_definition
                         end
            next wall_reference(definition, object) if object.type.to_s == 'architecture.wall' && definition
            path = if definition&.respond_to?(:centerline_path_mm)
                     definition.centerline_path_mm
                   elsif definition&.respond_to?(:path_mm)
                     definition.path_mm
                   elsif definition&.respond_to?(:outer_boundary_mm)
                     definition.outer_boundary_mm
                   elsif definition&.respond_to?(:route_nodes_mm)
                     definition.route_nodes_mm
                   else
                     definition&.boundary_mm
                   end
            path && { path_mm: path, source_object_id: object.id, source_type: object.type }.freeze
          rescue StandardError => error
            diagnostics = @runtime.diagnostics if @runtime.respond_to?(:diagnostics)
            diagnostics&.warn(
              'plan_reference_collection_failed', error.message,
              object_id: object.respond_to?(:id) ? object.id : nil,
              object_type: object.respond_to?(:type) ? object.type : nil
            )
            nil
          end.freeze
        end

        private

        def level_match?(object, level_id)
          return true unless object.respond_to?(:level_refs)

          refs = Array(object.level_refs)
          if refs.empty?
            semantic_level_id = level_from_definition(object)
            return true if semantic_level_id.nil? || semantic_level_id.to_s.empty?

            return semantic_level_id.to_s == level_id.to_s
          end

          refs.any? do |reference|
            reference_level_id = if reference.is_a?(Hash)
                                   reference[:level_id] || reference['level_id']
                                 else
                                   reference
                                 end
            reference_level_id.to_s == level_id.to_s
          end
        end

        def level_from_definition(object)
          definition = case object.type.to_s
                       when 'architecture.wall' then WallRepository.new.read(object.entity)
                       when 'architecture.floor' then FloorRepository.new.read(object.entity)
                       when 'architecture.room' then RoomRepository.new.read(object.entity)
                       when 'architecture.ceiling' then CeilingRepository.new.read(object.entity)
                       end
          return unless definition
          return definition.level_id if definition.respond_to?(:level_id)
          return definition.base_level_id if definition.respond_to?(:base_level_id)

          nil
        rescue StandardError
          nil
        end

        def wall_reference(definition, object)
          centerline = definition.centerline_path_mm
          faces = centerline.each_cons(2).flat_map do |a, b|
            dx = b[0] - a[0]
            dy = b[1] - a[1]
            length = Math.sqrt((dx * dx) + (dy * dy))
            next [] if length <= 0.001

            nx = -dy / length
            ny = dx / length
            half = definition.thickness_mm / 2.0
            [
              [[a[0] + (nx * half), a[1] + (ny * half), a[2]], [b[0] + (nx * half), b[1] + (ny * half), b[2]]],
              [[a[0] - (nx * half), a[1] - (ny * half), a[2]], [b[0] - (nx * half), b[1] - (ny * half), b[2]]]
            ]
          end
          {
            path_mm: centerline,
            paths_mm: [centerline, *faces].freeze,
            kind: 'wall_reference',
            source_object_id: object.id,
            source_type: object.type
          }.freeze
        end
      end
    end
  end
end
