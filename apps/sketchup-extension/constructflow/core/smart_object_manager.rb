# frozen_string_literal: true

require 'time'

module JiraNot
  module ConstructFlow
    module Core
      class SmartObjectManager
        SOURCE_STATES = %w[measured confirmed assumed unknown verify_on_site].freeze
        DEFAULT_STATUS = 'active'
        UNSET = Object.new.freeze

        def initialize(model:, levels: nil, id_generator: IdGenerator.new, diagnostics: nil)
          @model = model
          @levels = levels
          @id_generator = id_generator
          @diagnostics = diagnostics
          @index = {}
        end

        def create(entity:, type:, owner_module:, schema_version: 1, display_name: nil,
                   created_phase: Phase::NEW_CONSTRUCTION, removed_phase: nil,
                   level_refs: [], source_state: 'confirmed', relationships: [],
                   geometry_refs: [], catalog_ref: nil, revision_meta: {})
          raise ArgumentError, 'entity required' if entity.nil?
          raise ArgumentError, 'entity is already a smart object' if smart_entity?(entity)

          validate_type!(type, owner_module)
          Phase.validate_lifecycle!(created_phase: created_phase, removed_phase: removed_phase)
          validate_source_state!(source_state)
          validate_level_refs!(level_refs)

          object_id = @id_generator.smart_object_id
          timestamp = Time.now.utc.iso8601
          store = AttributeStore.new(entity)

          store.write_core_identity(
            id: object_id,
            object_type: type,
            owner_module: owner_module,
            schema_version: schema_version
          )
          store.write_lifecycle(created_phase: created_phase, removed_phase: removed_phase)
          store.write('display_name', display_name.nil? ? type.to_s : display_name.to_s)
          store.write('status', DEFAULT_STATUS)
          store.write('source_state', source_state.to_s)
          store.write_json('level_refs', Array(level_refs))
          store.write_json('relationships', Array(relationships))
          store.write_json('geometry_refs', Array(geometry_refs))
          store.write_json('catalog_ref', catalog_ref) unless catalog_ref.nil?
          store.write_json('revision_meta', revision_meta || {})
          store.write_json('dirty_flags', [])
          store.write('created_at', timestamp)
          store.write('updated_at', timestamp)

          @index[object_id] = entity
          fetch(entity)
        end

        def fetch(entity)
          return nil unless smart_entity?(entity)

          store = AttributeStore.new(entity)
          SmartObject.new(
            entity: entity,
            id: store.read('object_id'),
            type: store.read('object_type'),
            owner_module: store.read('owner_module'),
            schema_version: store.read('schema_version', 1),
            display_name: store.read('display_name', store.read('object_type', 'Smart Object')),
            created_phase: store.read('created_phase'),
            removed_phase: store.read('removed_phase'),
            level_refs: store.read_json('level_refs', []),
            status: store.read('status', DEFAULT_STATUS),
            relationships: store.read_json('relationships', []),
            geometry_refs: store.read_json('geometry_refs', []),
            catalog_ref: store.read_json('catalog_ref', nil),
            source_state: store.read('source_state', 'confirmed'),
            revision_meta: store.read_json('revision_meta', {}),
            created_at: store.read('created_at'),
            updated_at: store.read('updated_at'),
            dirty_flags: store.read_json('dirty_flags', [])
          )
        end

        def fetch_by_id(object_id)
          entity = @index[object_id.to_s]
          entity ? fetch(entity) : nil
        end

        def smart_entity?(entity)
          !AttributeStore.new(entity).read('object_id').nil?
        end

        def scan!
          @index.clear
          each_entity(@model.entities) do |entity|
            next unless smart_entity?(entity)

            object = fetch(entity)
            if @index.key?(object.id) && !@index[object.id].equal?(entity)
              @diagnostics&.error(
                'duplicate_smart_object_id',
                "Duplicate smart object ID detected: #{object.id}",
                object_id: object.id
              )
              next
            end

            @index[object.id] = entity
          end
          @index.size
        end

        alias rebuild_index! scan!

        def all
          @index.keys.sort.filter_map { |id| fetch_by_id(id) }
        end

        def size
          @index.size
        end

        # Permanently removes a Smart Object entity from the active SketchUp model
        # and synchronizes the runtime index. The caller owns lifecycle semantics;
        # this primitive is intended for generated design objects that are no longer
        # part of the current source intent, not for demolition of existing work.
        # When invoked inside CommandBus the SketchUp erase remains undoable through
        # the command transaction.
        def erase!(entity)
          object = fetch_required(entity)
          raise ArgumentError, 'smart object entity does not support erase!' unless entity.respond_to?(:erase!)

          entity.erase!
          @index.delete(object.id)
          object
        end

        def update_lifecycle(entity, created_phase: UNSET, removed_phase: UNSET)
          object = fetch_required(entity)
          next_created = created_phase.equal?(UNSET) ? object.created_phase : created_phase
          next_removed = removed_phase.equal?(UNSET) ? object.removed_phase : removed_phase

          Phase.validate_lifecycle!(created_phase: next_created, removed_phase: next_removed)
          store = AttributeStore.new(entity)
          store.write_lifecycle(created_phase: next_created, removed_phase: next_removed)
          touch(store)
          fetch(entity)
        end

        def update_level_refs(entity, level_refs)
          fetch_required(entity)
          validate_level_refs!(level_refs)
          store = AttributeStore.new(entity)
          store.write_json('level_refs', Array(level_refs))
          touch(store)
          fetch(entity)
        end

        def update_relationships(entity, relationships)
          fetch_required(entity)
          store = AttributeStore.new(entity)
          store.write_json('relationships', Array(relationships))
          touch(store)
          fetch(entity)
        end

        def add_relationship(entity, kind:, target_id:, role: nil, metadata: {})
          object = fetch_required(entity)
          raise ArgumentError, 'relationship kind required' if kind.to_s.strip.empty?
          raise ArgumentError, 'relationship target_id required' if target_id.to_s.strip.empty?

          relationship = {
            'id' => @id_generator.relationship_id,
            'kind' => kind.to_s,
            'target_id' => target_id.to_s,
            'role' => role&.to_s,
            'metadata' => metadata || {}
          }
          updated = Array(object.relationships).map(&:dup)
          updated << relationship
          update_relationships(entity, updated)
          relationship.freeze
        end

        def remove_relationship(entity, relationship_id: nil, kind: nil, target_id: nil)
          object = fetch_required(entity)
          before = Array(object.relationships)
          after = before.reject do |relationship|
            id_match = relationship_id.nil? || relationship['id'].to_s == relationship_id.to_s || relationship[:id].to_s == relationship_id.to_s
            kind_match = kind.nil? || relationship['kind'].to_s == kind.to_s || relationship[:kind].to_s == kind.to_s
            target_match = target_id.nil? || relationship['target_id'].to_s == target_id.to_s || relationship[:target_id].to_s == target_id.to_s
            id_match && kind_match && target_match
          end
          update_relationships(entity, after) if after.length != before.length
          before.length - after.length
        end

        def mark_dirty(entity, *flags)
          fetch_required(entity)
          store = AttributeStore.new(entity)
          current = Array(store.read_json('dirty_flags', []))
          updated = (current + flags.flatten.map(&:to_s)).uniq
          store.write_json('dirty_flags', updated)
          touch(store)
          fetch(entity)
        end

        def clear_dirty(entity, *flags)
          fetch_required(entity)
          store = AttributeStore.new(entity)
          current = Array(store.read_json('dirty_flags', []))
          updated = if flags.empty?
                      []
                    else
                      current - flags.flatten.map(&:to_s)
                    end
          store.write_json('dirty_flags', updated)
          touch(store)
          fetch(entity)
        end

        def ensure_unique_identity!(entity)
          object = fetch_required(entity)
          indexed = @index[object.id]
          return object if indexed.nil? || indexed.equal?(entity)

          store = AttributeStore.new(entity)
          new_id = @id_generator.smart_object_id
          store.write('object_id', new_id)
          touch(store)
          @index[new_id] = entity
          fetch(entity)
        end

        private

        def fetch_required(entity)
          fetch(entity) || raise(KeyError, 'entity is not a ConstructFlow smart object')
        end

        def validate_type!(type, owner_module)
          object_type = type.to_s.strip
          module_id = owner_module.to_s.strip
          raise ArgumentError, 'object type required' if object_type.empty?
          raise ArgumentError, 'owner module required' if module_id.empty?
          raise ArgumentError, 'owner module must be namespaced under constructflow.' unless module_id.start_with?('constructflow.')
        end

        def validate_source_state!(source_state)
          state = source_state.to_s
          raise ArgumentError, "invalid source_state: #{state}" unless SOURCE_STATES.include?(state)
        end

        def validate_level_refs!(level_refs)
          Array(level_refs).each do |reference|
            level_id = reference['level_id'] || reference[:level_id]
            next if level_id.nil? || level_id.to_s.empty? || @levels.nil?

            raise ArgumentError, "unknown level reference: #{level_id}" unless @levels.registered?(level_id)
          end
        end

        def touch(store)
          store.write('updated_at', Time.now.utc.iso8601)
        end

        def each_entity(entities, &block)
          return unless entities

          entities.each do |entity|
            block.call(entity)
            child_entities = entity.entities if entity.respond_to?(:entities)
            each_entity(child_entities, &block) if child_entities
          end
        end
      end
    end
  end
end
