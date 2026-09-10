# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Electrical
      module ExtensionCommandRegistration
        COMMAND = 'GenerateOrUpdateElectricalFromExtension'
        RELATION_KIND = 'generated_from'
        RELATION_ROLE = 'extension_source'
        SLOT = 'primary_light'
        AUTO_PROGRAMS = %w[kitchen laundry multipurpose room carport].freeze

        module_function

        def install(runtime)
          return if runtime.commands.registered?(COMMAND)

          repository = Repository.new
          geometry = Geometry.new
          runtime.commands.register(COMMAND, owner_module: 'constructflow.electrical') do |command|
            generate_or_update(runtime: runtime, input: command[:input], repository: repository, geometry: geometry)
          end
        end

        def generate_or_update(runtime:, input:, repository:, geometry:)
          intent = fetch(input, :intent) || {}
          extension_id = extension_id_from(input, intent)
          raise ArgumentError, 'extension_id required' if extension_id.empty?
          existing = find_generated(runtime, extension_id)

          unless auto_lighting?(intent)
            if existing
              runtime.smart_objects.erase!(existing.entity)
              return {
                created_object_ids: [], updated_object_ids: [], removed_object_ids: [existing.id],
                warnings: ['previous auto-generated extension lighting was removed because the current intent no longer requests deterministic lighting'],
                events: [
                  { name: 'ElectricalExtensionIntentReviewed', object_ids: [existing.id], payload: { extension_id: extension_id, generated: false, removed: true } },
                  { name: 'GeometryChanged', object_ids: [existing.id], payload: { removed: true, reason: 'source_intent_reconciled' } },
                  { name: 'QuantityDirty', object_ids: [existing.id] },
                  { name: 'DrawingDirty', object_ids: [existing.id] }
                ]
              }
            end
            return {
              created_object_ids: [], updated_object_ids: [], removed_object_ids: [],
              warnings: ['electrical extension intent has no deterministic fixture request; no final electrical design was invented'],
              events: [{ name: 'ElectricalExtensionIntentReviewed', payload: { extension_id: extension_id, generated: false } }]
            }
          end

          definition = definition_from(input)
          raise ArgumentError, definition.errors.join('; ') unless definition.valid?
          created_ids = []
          updated_ids = []
          events = []

          if existing
            geometry.rebuild_device!(existing.entity, definition)
            repository.write_device(existing.entity, definition)
            runtime.smart_objects.mark_dirty(existing.entity, 'dirty_quantity', 'dirty_drawing')
            updated_ids << existing.id
            events << { name: 'ElectricalDevicePlaced', object_ids: [existing.id], payload: { source: extension_id, change: 'extension_regeneration', preliminary: true } }
            events << { name: 'GeometryChanged', object_ids: [existing.id] }
          else
            group = geometry.create_device_group(runtime.active_model, definition)
            object = runtime.smart_objects.create(
              entity: group,
              type: 'electrical.luminaire',
              owner_module: 'constructflow.electrical',
              display_name: 'Extension Preliminary Luminaire',
              created_phase: Core::Phase::NEW_CONSTRUCTION,
              level_refs: definition.level_id ? [definition.level_id] : [],
              source_state: 'assumed'
            )
            repository.write_device(group, definition)
            runtime.smart_objects.add_relationship(
              group,
              kind: RELATION_KIND,
              target_id: extension_id,
              role: RELATION_ROLE,
              metadata: { 'slot' => SLOT, 'domain' => 'electrical', 'preliminary' => true }
            )
            runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')
            created_ids << object.id
            events << { name: 'ObjectCreated', object_ids: [object.id], payload: { type: 'electrical.luminaire', source: extension_id, slot: SLOT } }
            events << { name: 'ElectricalDevicePlaced', object_ids: [object.id], payload: { source: extension_id, kind: 'luminaire', preliminary: true } }
            events << { name: 'GeometryChanged', object_ids: [object.id] }
          end

          touched = (created_ids + updated_ids).uniq
          events << { name: 'QuantityDirty', object_ids: touched } unless touched.empty?
          events << { name: 'DrawingDirty', object_ids: touched } unless touched.empty?
          {
            created_object_ids: created_ids,
            updated_object_ids: updated_ids,
            removed_object_ids: [],
            warnings: ['auto-generated lighting is preliminary and requires electrical designer review'],
            events: events
          }
        end

        def auto_lighting?(intent)
          config = fetch(intent, :config) || {}
          explicit = fetch(config, :auto_lighting)
          return explicit == true unless explicit.nil?
          AUTO_PROGRAMS.include?(fetch(intent, :program).to_s.downcase)
        end

        def definition_from(input)
          intent = fetch(input, :intent) || {}
          config = fetch(intent, :config) || {}
          boundary = Array(fetch(intent, :boundary_mm))
          raise ArgumentError, 'extension boundary requires at least three points for electrical layout' if boundary.length < 3
          center = centroid(boundary)
          top_z = boundary.map { |point| Float(Array(point)[2] || 0) }.max + Float(fetch(intent, :target_height_mm) || 2800)
          program = fetch(intent, :program).to_s.downcase
          DeviceDefinition.new(
            kind: 'luminaire',
            device_type: fetch(config, :device_type) || 'extension_general_light',
            position_mm: [center[0], center[1], fetch(config, :elevation_mm) || top_z],
            mounting: fetch(config, :mounting) || 'ceiling',
            host_object_id: fetch(intent, :attachment_host_id),
            level_id: fetch(intent, :base_level_id),
            mounting_height_mm: fetch(config, :mounting_height_mm) || Float(fetch(intent, :target_height_mm) || 2800),
            catalog_ref: fetch(config, :catalog_ref),
            wattage: fetch(config, :wattage),
            cct_k: fetch(config, :cct_k),
            weatherproof: fetch(config, :weatherproof) == true || program == 'carport',
            schedule_mark: fetch(config, :schedule_mark) || 'L-EXT-01'
          )
        end

        def centroid(boundary)
          points = boundary.map { |point| Array(point) }
          count = points.length.to_f
          [points.sum { |point| Float(point[0]) } / count, points.sum { |point| Float(point[1]) } / count]
        end

        def find_generated(runtime, extension_id)
          runtime.smart_objects.all.find do |object|
            next false unless object.type == 'electrical.luminaire' && object.owner_module == 'constructflow.electrical'
            Array(object.relationships).any? do |relationship|
              metadata = relationship['metadata'] || relationship[:metadata] || {}
              (relationship['kind'] || relationship[:kind]).to_s == RELATION_KIND &&
                (relationship['target_id'] || relationship[:target_id]).to_s == extension_id.to_s &&
                (metadata['slot'] || metadata[:slot]).to_s == SLOT
            end
          end
        end

        def extension_id_from(input, intent = nil)
          data = intent || fetch(input, :intent) || {}
          (fetch(input, :extension_id) || fetch(data, :extension_id)).to_s
        end

        def fetch(hash, key)
          hash[key] || hash[key.to_s]
        end
      end
    end
  end
end
