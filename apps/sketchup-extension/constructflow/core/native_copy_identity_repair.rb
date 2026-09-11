# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class NativeCopyIdentityRepair
        COPY_RELATION_KIND = 'copied_from'
        COPY_RELATION_ROLE = 'native_copy_source'
        DIRTY_FLAGS = %w[dirty_dependents dirty_quantity dirty_drawing].freeze

        def initialize(runtime:)
          @runtime = runtime
        end

        def needs_repair?(entity)
          duplicate_identity?(entity) || child_entities(entity).any? { |child| needs_repair?(child) }
        end

        def repair_tree(entity)
          results = []
          repair_entity(entity, results)
          child_entities(entity).each { |child| repair_tree_into(child, results) }
          results.freeze
        end

        private

        def repair_tree_into(entity, results)
          repair_entity(entity, results)
          child_entities(entity).each { |child| repair_tree_into(child, results) }
        end

        def duplicate_identity?(entity)
          object = @runtime.smart_objects.fetch(entity)
          return false unless object

          indexed = @runtime.smart_objects.fetch_by_id(object.id)
          indexed && !indexed.entity.equal?(entity)
        rescue StandardError
          false
        end

        def repair_entity(entity, results)
          object = @runtime.smart_objects.fetch(entity)
          return unless object

          original_id = object.id.to_s
          repaired = @runtime.smart_objects.ensure_unique_identity!(entity)
          return if repaired.id.to_s == original_id

          # A raw SketchUp copy is intentionally detached from semantic graph
          # ownership. Domain-aware duplication must use an explicit command.
          @runtime.smart_objects.update_relationships(entity, [])
          @runtime.smart_objects.add_relationship(
            entity,
            kind: COPY_RELATION_KIND,
            target_id: original_id,
            role: COPY_RELATION_ROLE,
            metadata: { 'detached' => true }
          )
          @runtime.smart_objects.mark_dirty(entity, *DIRTY_FLAGS)
          result = {
            'source_object_id' => original_id,
            'new_object_id' => repaired.id.to_s,
            'object_type' => repaired.type.to_s,
            'relationships_detached' => true
          }.freeze
          results << result
          @runtime.diagnostics&.info(
            'native_copy_reidentified',
            "Native SketchUp copy re-identified #{original_id} -> #{repaired.id}",
            result
          )
        end

        def child_entities(entity)
          return [] unless entity.respond_to?(:entities)

          entity.entities.to_a
        rescue StandardError
          []
        end
      end
    end
  end
end
