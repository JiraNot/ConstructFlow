# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      module ExtensionCommandRegistration
        COMMAND = 'GenerateOrUpdateDrainageFromExtension'
        RELATION_KIND = 'generated_from'
        RELATION_ROLE = 'extension_source'
        SLOT = 'primary_route'

        module_function

        def install(runtime)
          return if runtime.commands.registered?(COMMAND)

          repository = Repository.new
          geometry = Geometry.new
          validator = Validators::DrainageValidator.new
          planner = RoutePlanner.new
          runtime.commands.register(COMMAND, owner_module: 'constructflow.drainage') do |command|
            generate_or_update(
              runtime: runtime,
              input: command[:input],
              repository: repository,
              geometry: geometry,
              validator: validator,
              planner: planner
            )
          end
        end

        def generate_or_update(runtime:, input:, repository:, geometry:, validator:, planner:)
          intent = fetch(input, :intent) || {}
          extension_id = extension_id_from(input, intent)
          raise ArgumentError, 'extension_id required' if extension_id.empty?
          config = fetch(intent, :config) || {}
          start_id = fetch(config, :start_connector_id).to_s
          end_id = fetch(config, :end_connector_id).to_s

          if start_id.empty? || end_id.empty?
            return {
              created_object_ids: [], updated_object_ids: [],
              warnings: ['drainage extension intent requires explicit start/end connectors; no drainage route was invented'],
              events: [{ name: 'DrainageExtensionIntentReviewed', payload: { extension_id: extension_id, generated: false, reason: 'connectors_required' } }]
            }
          end

          start_connector = runtime.connectors.connector(start_id)
          end_connector = runtime.connectors.connector(end_id)
          plan = planner.plan(
            start_connector: start_connector,
            end_connector: end_connector,
            mode: fetch(config, :routing_mode) || 'semi_auto',
            via_nodes_mm: fetch(config, :via_nodes_mm) || [],
            start_invert_mm: fetch(config, :start_invert_mm),
            end_invert_mm: fetch(config, :end_invert_mm),
            minimum_slope_percent: fetch(config, :minimum_slope_percent) || Validators::DrainageValidator::MIN_SLOPE_PERCENT,
            orthogonal_preference: fetch(config, :orthogonal_preference) || 'x_first'
          )
          existing = find_generated(runtime, extension_id)
          if existing
            return update_existing(
              runtime: runtime, object: existing, repository: repository, geometry: geometry,
              validator: validator, plan: plan, start_id: start_id, end_id: end_id, config: config,
              extension_id: extension_id
            )
          end

          route_input = {
            system: fetch(config, :system) || 'rainwater',
            diameter_mm: fetch(config, :diameter_mm) || PipeRouteDefinition::DEFAULT_DIAMETER_MM,
            route_nodes_mm: plan.route_nodes_mm,
            start_connector_id: start_id,
            end_connector_id: end_id,
            start_invert_mm: plan.start_invert_mm,
            end_invert_mm: plan.end_invert_mm,
            material: fetch(config, :material) || 'pvc',
            route_strategy: plan.mode,
            source_state: plan.start_invert_mm.nil? || plan.end_invert_mm.nil? ? 'verify_on_site' : 'confirmed',
            display_name: 'Extension Drainage Route',
            created_phase: Core::Phase::NEW_CONSTRUCTION
          }
          object, definition, connection = Registration.create_pipe_route_object(runtime, repository, geometry, route_input)
          runtime.smart_objects.add_relationship(
            object.entity,
            kind: RELATION_KIND,
            target_id: extension_id,
            role: RELATION_ROLE,
            metadata: { 'slot' => SLOT, 'domain' => 'drainage' }
          )
          runtime.smart_objects.mark_dirty(object.entity, 'dirty_quantity', 'dirty_drawing')
          issues = validator.validate_route(definition)
          errors = issues.select { |issue| issue[:severity] == 'error' }
          raise ArgumentError, errors.map { |issue| issue[:message] }.join('; ') unless errors.empty?
          {
            created_object_ids: [object.id],
            warnings: (plan.warnings + warning_messages(issues)).uniq,
            events: [
              { name: 'ObjectCreated', object_ids: [object.id], payload: { type: 'drainage.pipe_route', source: extension_id, slot: SLOT } },
              { name: 'DrainageTopologyChanged', object_ids: [object.id], payload: { connection_id: connection['id'], source: extension_id } },
              { name: 'RouteChanged', object_ids: [object.id], payload: { route_strategy: definition.route_strategy } },
              { name: 'GeometryChanged', object_ids: [object.id] },
              { name: 'QuantityDirty', object_ids: [object.id] },
              { name: 'DrawingDirty', object_ids: [object.id] },
              { name: 'ValidationStateChanged', object_ids: [object.id], payload: { issues: issues } }
            ]
          }
        end

        def update_existing(runtime:, object:, repository:, geometry:, validator:, plan:, start_id:, end_id:, config:, extension_id:)
          current = repository.read_pipe_route(object.entity)
          raise ArgumentError, 'generated drainage route definition missing' unless current
          if current.start_connector_id != start_id || current.end_connector_id != end_id
            raise ArgumentError, 'generated drainage route endpoints changed; use an explicit reconnect workflow'
          end

          updated = current.with(
            system: fetch(config, :system) || current.system,
            diameter_mm: fetch(config, :diameter_mm) || current.diameter_mm,
            route_nodes_mm: plan.route_nodes_mm,
            start_invert_mm: plan.start_invert_mm,
            end_invert_mm: plan.end_invert_mm,
            material: fetch(config, :material) || current.material,
            route_strategy: plan.mode
          )
          issues = validator.validate_route(updated)
          errors = issues.select { |issue| issue[:severity] == 'error' }
          raise ArgumentError, errors.map { |issue| issue[:message] }.join('; ') unless errors.empty?
          geometry.rebuild_pipe!(object.entity, updated)
          repository.write_pipe_route(object.entity, updated)
          runtime.smart_objects.mark_dirty(object.entity, 'dirty_quantity', 'dirty_drawing')
          {
            created_object_ids: [],
            updated_object_ids: [object.id],
            warnings: (plan.warnings + warning_messages(issues)).uniq,
            events: [
              { name: 'RouteChanged', object_ids: [object.id], payload: { source: extension_id, route_strategy: updated.route_strategy } },
              { name: 'GeometryChanged', object_ids: [object.id] },
              { name: 'QuantityDirty', object_ids: [object.id] },
              { name: 'DrawingDirty', object_ids: [object.id] },
              { name: 'ValidationStateChanged', object_ids: [object.id], payload: { issues: issues } }
            ]
          }
        end

        def find_generated(runtime, extension_id)
          runtime.smart_objects.all.find do |object|
            next false unless object.type == 'drainage.pipe_route' && object.owner_module == 'constructflow.drainage'
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
