# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      # Shared plumbing for the per-domain ExtensionCommandRegistration modules.
      # The nine domain files repeat the same fetch/relationship-matching logic;
      # these helpers keep that behavior in exactly one place.
      module ExtensionCommandSupport
        module_function

        # Hash lookup tolerant of symbol and string keys.
        def fetch(hash, key)
          hash[key] || hash[key.to_s]
        end

        # Resolve the extension id from command input or nested intent.
        def extension_id_from(input, intent = nil)
          data = intent || fetch(input, :intent) || {}
          (fetch(input, :extension_id) || fetch(data, :extension_id)).to_s
        end

        # Find the smart object generated from an extension for one domain/slot.
        def find_generated(runtime, extension_id, type:, owner_module:, slot:,
                           kind: 'generated_from', role: 'extension_source', require_role: true)
          runtime.smart_objects.all.find do |object|
            next false unless object.type == type && object.owner_module == owner_module

            generated_relation?(
              object, extension_id,
              kind: kind, role: role, slot: slot, require_role: require_role
            )
          end
        end

        # True when the object carries a generated_from relationship for the
        # given extension id (and optionally a specific slot).
        def generated_relation?(object, extension_id, kind:, role:, slot:, require_role: true)
          Array(object.relationships).any? do |relationship|
            metadata = relationship['metadata'] || relationship[:metadata] || {}
            (relationship['kind'] || relationship[:kind]).to_s == kind.to_s &&
              (relationship['target_id'] || relationship[:target_id]).to_s == extension_id.to_s &&
              (!require_role || (relationship['role'] || relationship[:role]).to_s == role.to_s) &&
              (slot.nil? || (metadata['slot'] || metadata[:slot]).to_s == slot.to_s)
          end
        end

        # All smart objects generated from an extension for one domain
        # (no slot filter). Useful for multi-slot domains with stale cleanup.
        def all_generated(runtime, extension_id, type:, owner_module:,
                          kind: 'generated_from', role: 'extension_source', require_role: true)
          runtime.smart_objects.all.select do |object|
            object.type == type && object.owner_module == owner_module &&
              generated_relation?(
                object, extension_id,
                kind: kind, role: role, slot: nil, require_role: require_role
              )
          end
        end

        # Slot recorded on the object's first matching generated_from relation.
        def generated_slot(object, kind:, role:)
          relationship = Array(object.relationships).find do |value|
            (value['kind'] || value[:kind]).to_s == kind.to_s &&
              (value['role'] || value[:role]).to_s == role.to_s
          end
          metadata = relationship && (relationship['metadata'] || relationship[:metadata]) || {}
          (metadata['slot'] || metadata[:slot]).to_s
        end

        # Absolute base elevation from a level reference plus an offset.
        def resolve_base_elevation(runtime, level_id, offset_mm)
          return Float(offset_mm) if level_id.nil? || level_id.to_s.empty?

          level = runtime.levels.fetch(level_id)
          raise ArgumentError, "level #{level_id} has unknown elevation" if level.elevation_mm.nil?
          Float(level.elevation_mm) + Float(offset_mm)
        end

        # Standard level_refs payload for objects based on one level.
        def level_refs(level_id, offset_mm)
          return [] if level_id.nil? || level_id.to_s.empty?
          [{ role: 'base', level_id: level_id.to_s, offset_mm: Float(offset_mm) }]
        end

        # Raise when any validation issue has severity 'error'.
        def raise_on_errors!(issues)
          errors = Array(issues).select { |issue| (issue[:severity] || issue['severity']).to_s == 'error' }
          raise ArgumentError, errors.map { |issue| issue[:message] || issue['message'] }.join('; ') unless errors.empty?
        end

        # Standard dirty-flag events emitted after regeneration.
        def dirty_events(object_ids)
          ids = Array(object_ids).uniq
          return [] if ids.empty?

          [
            { name: 'QuantityDirty', object_ids: ids },
            { name: 'DrawingDirty', object_ids: ids }
          ]
        end
      end
    end
  end
end
