# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class SmartObject
        attr_reader :entity, :id, :type, :owner_module, :schema_version, :display_name,
                    :created_phase, :removed_phase, :level_refs, :status, :relationships,
                    :geometry_refs, :catalog_ref, :source_state, :revision_meta,
                    :created_at, :updated_at, :dirty_flags

        def initialize(entity:, id:, type:, owner_module:, schema_version:, display_name:,
                       created_phase:, removed_phase:, level_refs:, status:, relationships:,
                       geometry_refs:, catalog_ref:, source_state:, revision_meta:,
                       created_at:, updated_at:, dirty_flags: [])
          @entity = entity
          @id = id.to_s
          @type = type.to_s
          @owner_module = owner_module.to_s
          @schema_version = Integer(schema_version)
          @display_name = display_name.to_s
          @created_phase = created_phase.to_s
          @removed_phase = removed_phase&.to_s
          @level_refs = Array(level_refs).freeze
          @status = status.to_s
          @relationships = Array(relationships).freeze
          @geometry_refs = Array(geometry_refs).freeze
          @catalog_ref = catalog_ref
          @source_state = source_state.to_s
          @revision_meta = (revision_meta || {}).freeze
          @created_at = created_at
          @updated_at = updated_at
          @dirty_flags = Array(dirty_flags).map(&:to_s).uniq.freeze
          freeze
        end

        def phase
          { created: created_phase, demolished: removed_phase }.freeze
        end

        def visible_in?(view)
          Phase.visible_in?(created_phase: created_phase, removed_phase: removed_phase, view: view)
        end

        def to_h
          {
            id: id,
            type: type,
            module: owner_module,
            schema_version: schema_version,
            display_name: display_name,
            phase: phase,
            level_refs: level_refs,
            status: status,
            relationships: relationships,
            geometry_refs: geometry_refs,
            catalog_ref: catalog_ref,
            source_state: source_state,
            revision_meta: revision_meta,
            created_at: created_at,
            updated_at: updated_at,
            dirty_flags: dirty_flags
          }
        end
      end
    end
  end
end
