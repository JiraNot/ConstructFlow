# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Interior
      module ExtensionCommandRegistration
        COMMAND = 'GenerateOrUpdateInteriorFromExtension'
        RELATION_KIND = 'generated_from'
        RELATION_ROLE = 'extension_source'
        SLOT = 'primary_joinery'
        AUTO_PROGRAMS = %w[kitchen laundry].freeze

        module_function

        def install(runtime)
          return if runtime.commands.registered?(COMMAND)

          repository = Repository.new
          geometry = Geometry.new
          validator = Validators::InteriorValidator.new
          runtime.commands.register(COMMAND, owner_module: 'constructflow.interior') do |command|
            generate_or_update(
              runtime: runtime,
              input: command[:input],
              repository: repository,
              geometry: geometry,
              validator: validator
            )
          end
        end

        def generate_or_update(runtime:, input:, repository:, geometry:, validator:)
          intent = fetch(input, :intent) || {}
          extension_id = extension_id_from(input, intent)
          raise ArgumentError, 'extension_id required' if extension_id.empty?
          existing = find_generated(runtime, extension_id)

          unless auto_joinery?(intent)
            if existing
              runtime.smart_objects.erase!(existing.entity)
              return {
                created_object_ids: [], updated_object_ids: [], removed_object_ids: [existing.id],
                warnings: ['previous auto-generated extension joinery was removed because the current intent no longer requests deterministic joinery'],
                events: [
                  { name: 'InteriorExtensionIntentReviewed', object_ids: [existing.id], payload: { extension_id: extension_id, generated: false, removed: true } },
                  { name: 'GeometryChanged', object_ids: [existing.id], payload: { removed: true, reason: 'source_intent_reconciled' } },
                  { name: 'QuantityDirty', object_ids: [existing.id] },
                  { name: 'DrawingDirty', object_ids: [existing.id] }
                ]
              }
            end
            return {
              created_object_ids: [], updated_object_ids: [], removed_object_ids: [],
              warnings: ['interior extension intent has no deterministic joinery request; no cabinet geometry was invented'],
              events: [{ name: 'InteriorExtensionIntentReviewed', payload: { extension_id: extension_id, generated: false } }]
            }
          end

          definition = definition_from(input)
          issues = validator.validate_cabinet(definition)
          errors = issues.select { |issue| issue[:severity] == 'error' }
          raise ArgumentError, errors.map { |issue| issue[:message] }.join('; ') unless errors.empty?
          created_ids = []
          updated_ids = []
          events = []

          if existing
            geometry.rebuild_cabinet!(existing.entity, definition)
            repository.write_cabinet_run(existing.entity, definition)
            runtime.smart_objects.mark_dirty(existing.entity, 'dirty_quantity', 'dirty_drawing', 'dirty_fabrication')
            updated_ids << existing.id
            events << { name: 'CabinetModulesChanged', object_ids: [existing.id], payload: { source: extension_id, change: 'extension_regeneration' } }
            events << { name: 'GeometryChanged', object_ids: [existing.id] }
          else
            group = geometry.create_cabinet_group(runtime.active_model, definition)
            object = runtime.smart_objects.create(
              entity: group,
              type: 'interior.cabinet_run',
              owner_module: 'constructflow.interior',
              display_name: 'Extension Preliminary Cabinet Run',
              created_phase: Core::Phase::NEW_CONSTRUCTION,
              source_state: 'assumed'
            )
            repository.write_cabinet_run(group, definition)
            runtime.smart_objects.add_relationship(
              group,
              kind: RELATION_KIND,
              target_id: extension_id,
              role: RELATION_ROLE,
              metadata: { 'slot' => SLOT, 'domain' => 'interior', 'preliminary' => true }
            )
            runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing', 'dirty_fabrication')
            created_ids << object.id
            events << { name: 'ObjectCreated', object_ids: [object.id], payload: { type: 'interior.cabinet_run', source: extension_id, slot: SLOT } }
            events << { name: 'CabinetRunCreated', object_ids: [object.id], payload: { source: extension_id, preliminary: true } }
            events << { name: 'GeometryChanged', object_ids: [object.id] }
          end

          touched = (created_ids + updated_ids).uniq
          events << { name: 'QuantityDirty', object_ids: touched } unless touched.empty?
          events << { name: 'DrawingDirty', object_ids: touched } unless touched.empty?
          events << { name: 'ValidationStateChanged', object_ids: touched, payload: { issues: issues } } unless touched.empty?
          {
            created_object_ids: created_ids,
            updated_object_ids: updated_ids,
            removed_object_ids: [],
            warnings: (warning_messages(issues) + ['auto-generated joinery is preliminary and requires designer review']).uniq,
            events: events
          }
        end

        def auto_joinery?(intent)
          config = fetch(intent, :config) || {}
          explicit = fetch(config, :auto_joinery)
          return explicit == true unless explicit.nil?

          AUTO_PROGRAMS.include?(fetch(intent, :program).to_s.downcase)
        end

        def definition_from(input)
          intent = fetch(input, :intent) || {}
          config = fetch(intent, :config) || {}
          boundary = Array(fetch(intent, :boundary_mm))
          raise ArgumentError, 'extension boundary requires at least two points for joinery' if boundary.length < 2
          a = Array(boundary[0])
          b = Array(boundary[1])
          dx = Float(b[0]) - Float(a[0])
          dy = Float(b[1]) - Float(a[1])
          edge_length = Math.sqrt((dx * dx) + (dy * dy))
          requested_width = Float(fetch(config, :width_mm) || default_width(fetch(intent, :program)))
          width = [requested_width, edge_length].min
          raise ArgumentError, 'extension edge is too short for a cabinet run' if width < CabinetRunDefinition::MIN_MODULE_WIDTH_MM

          CabinetRunDefinition.new(
            origin_mm: [Float(a[0]), Float(a[1]), Float(a[2] || 0)],
            width_mm: width,
            height_mm: fetch(config, :height_mm) || 850,
            depth_mm: fetch(config, :depth_mm) || 600,
            angle_deg: Math.atan2(dy, dx) * 180.0 / Math::PI,
            board_thickness_mm: fetch(config, :board_thickness_mm) || 18,
            back_thickness_mm: fetch(config, :back_thickness_mm) || 9,
            toe_kick_mm: fetch(config, :toe_kick_mm) || 100,
            carcass_material_id: fetch(config, :carcass_material_id) || 'board.hmr.18',
            mode: fetch(config, :mode) || 'design',
            host_object_id: fetch(intent, :attachment_host_id)
          ).then do |definition|
            count = Integer(fetch(config, :module_count) || [1, (definition.width_mm / 600.0).round].max)
            max_count = [(definition.usable_width_mm / CabinetRunDefinition::MIN_MODULE_WIDTH_MM).floor, 1].max
            definition.split_equal(count: [count, max_count].min)
          end
        end

        def default_width(program)
          program.to_s.downcase == 'laundry' ? 1200.0 : 2400.0
        end

        def find_generated(runtime, extension_id)
          runtime.smart_objects.all.find do |object|
            next false unless object.type == 'interior.cabinet_run' && object.owner_module == 'constructflow.interior'
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

        def warning_messages(issues)
          Array(issues).reject { |issue| issue[:severity] == 'error' }.map { |issue| issue[:message].to_s }.uniq
        end

        def fetch(hash, key)
          hash[key] || hash[key.to_s]
        end
      end
    end
  end
end
