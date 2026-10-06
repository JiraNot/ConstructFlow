# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      # DependencyGraph tracks relationships and invalidation dependencies
      # between Smart Objects across domains (Architecture, Structure, Roof,
      # Interior, Electrical, Drainage, Costing, Documentation).
      #
      # Ensures that modifying a host/source object (e.g. moving a wall)
      # propagates deterministic invalidation tokens to hosted and dependent
      # objects (doors, windows, sockets, cabinet runs, quantities, drawings).
      class DependencyGraph
        INVALIDATION_FLAGS = %w[
          geometry
          dirty_geometry
          quantity
          dirty_quantity
          drawing
          dirty_drawing
          schedule
          dirty_schedule
          validation
          dirty_validation
        ].freeze

        def initialize(smart_object_manager: nil, diagnostics: nil)
          @smart_object_manager = smart_object_manager
          @diagnostics = diagnostics
        end

        def attach_manager(manager)
          @smart_object_manager = manager
        end

        # Returns direct and indirect dependent object IDs for a given source object.
        # Traverses reverse relationships transitively with cycle protection.
        def transitive_dependents(object_id)
          target_id = object_id.respond_to?(:id) ? object_id.id.to_s : object_id.to_s
          return [].freeze unless @smart_object_manager

          reverse_map = build_reverse_map
          result = []
          queue = [target_id]
          visited = {}

          until queue.empty?
            current = queue.shift
            next if visited[current]

            visited[current] = true
            result << current
            direct_dependents = reverse_map[current] || []
            direct_dependents.sort.each do |dep_id|
              queue << dep_id unless visited[dep_id]
            end
          end

          result.freeze
        end

        # Invalidates a root object and all downstream dependent objects
        # with the specified invalidation flags.
        def invalidate_affected(object_id, *flags)
          return [].freeze unless @smart_object_manager

          affected_ids = transitive_dependents(object_id)
          normalized_flags = flags.flatten.map(&:to_s).uniq

          affected_ids.each do |affected_id|
            object = @smart_object_manager.fetch_by_id(affected_id)
            next unless object&.entity

            @smart_object_manager.mark_dirty(object.entity, *normalized_flags)
          end

          @diagnostics&.info(
            'dependency_invalidation_propagated',
            "Invalidated #{affected_ids.size} objects starting from #{object_id}",
            root_id: object_id.to_s,
            affected_count: affected_ids.size,
            flags: normalized_flags
          )

          affected_ids
        end

        # Builds an adjacency map of target_id -> [dependent_id, ...]
        def build_reverse_map
          reverse = Hash.new { |hash, key| hash[key] = [] }
          return reverse unless @smart_object_manager

          @smart_object_manager.all.each do |object|
            Array(object.relationships).each do |relationship|
              target = relationship['target_id'] || relationship[:target_id]
              reverse[target.to_s] << object.id if target
            end
          end
          reverse
        end
      end
    end
  end
end
