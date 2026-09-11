# frozen_string_literal: true

require 'digest'

module JiraNot
  module ConstructFlow
    module Roof
      # Applies an explicitly reviewed catchment plan to Roof-owned gutter/outlet
      # state. Planning remains pure; this service is the deliberate mutation
      # boundary that turns reviewed outlet suggestions into semantic connectors.
      class RainwaterPlanApplier
        EVIDENCE_KEY = 'rainwater_plan_application'
        EVIDENCE_FORMAT = 'constructflow.roof_rainwater_plan_application.v1'
        DRAINAGE_CAPABILITY = 'drainage.rainwater_downpipe'
        RAINWATER_SYSTEM = 'drainage.rainwater'

        def initialize(runtime:, repository: Repository.new, geometry: Geometry.new,
                       edge_capability: nil)
          @runtime = runtime
          @repository = repository
          @geometry = geometry
          @edge_capability = edge_capability || EdgeHostCapability.new(repository: repository)
        end

        def validate(roof_object:, plan:, profile_id:, gutter_object_id: nil, rehost_gutter: false)
          errors = []
          errors << 'compatible roof object required' unless compatible_roof?(roof_object)
          errors << 'reviewed rainwater plan must be ready_for_review' unless plan && plan['status'].to_s == 'ready_for_review'
          errors << 'gutter profile_id required before applying rainwater plan' if profile_id.to_s.strip.empty?
          ratios = normalized_ratios(plan)
          errors << 'reviewed rainwater plan requires at least one outlet ratio' if ratios.empty?
          return errors unless errors.empty?

          gutter = resolve_existing_gutter(
            roof_object,
            edge_index: Integer(plan.fetch('suggested_edge_index')),
            gutter_object_id: gutter_object_id
          )
          if gutter
            definition = @repository.read_gutter(gutter.entity)
            errors << 'gutter definition missing' unless definition
            if definition && definition.edge_index != Integer(plan.fetch('suggested_edge_index')) && !rehost_gutter
              errors << 'existing gutter edge differs from reviewed plan; set rehost_gutter: true to move it deliberately'
            end
            if definition
              surplus = indexed_outlets(gutter).select { |item| item.fetch(:index) >= ratios.length }
              surplus.each do |item|
                connector = item.fetch(:connector)
                unless @runtime.connectors.connections_for_connector(connector['id']).empty?
                  errors << "cannot retire connected gutter outlet #{connector['id']}; disconnect/reconfigure its downpipe first"
                end
              end
              moved = indexed_outlets(gutter).select { |item| item.fetch(:index) < ratios.length }
              if moved.any? { |item| downpipe_connected?(item.fetch(:connector)['id']) } && !downpipe_capability_available?
                errors << 'drainage rainwater downpipe capability unavailable for connected outlet repositioning'
              end
            end
          end
          errors
        rescue KeyError, TypeError, ArgumentError => error
          [error.message]
        end

        def apply(roof_object:, plan:, profile_id:, gutter_object_id: nil, rehost_gutter: false,
                  display_name: 'Rainwater Gutter', source_state: 'confirmed')
          errors = validate(
            roof_object: roof_object,
            plan: plan,
            profile_id: profile_id,
            gutter_object_id: gutter_object_id,
            rehost_gutter: rehost_gutter
          )
          raise ArgumentError, errors.join('; ') unless errors.empty?

          edge_index = Integer(plan.fetch('suggested_edge_index'))
          ratios = normalized_ratios(plan)
          gutter = resolve_existing_gutter(
            roof_object,
            edge_index: edge_index,
            gutter_object_id: gutter_object_id
          )
          created = gutter.nil?
          gutter = create_gutter(
            roof_object,
            edge_index: edge_index,
            profile_id: profile_id,
            outlet_ratio: ratios.first,
            display_name: display_name,
            source_state: source_state
          ) if created

          current = @repository.read_gutter(gutter.entity)
          raise ArgumentError, 'gutter definition missing' unless current
          if current.edge_index != edge_index && !rehost_gutter
            raise ArgumentError, 'existing gutter edge differs from reviewed plan; set rehost_gutter: true to move it deliberately'
          end

          next_definition = current.with(
            edge_index: edge_index,
            profile_id: profile_id,
            outlet_ratio: ratios.first
          )
          @geometry.rebuild_gutter!(
            gutter.entity,
            roof_object: roof_object,
            definition: next_definition,
            edge_capability: @edge_capability
          )

          connector_results = reconcile_outlets(
            gutter,
            roof_object: roof_object,
            edge_index: edge_index,
            ratios: ratios
          )
          primary_connector_id = connector_results.fetch(:active_connector_ids).first
          next_definition = next_definition.with(outlet_connector_id: primary_connector_id)
          @repository.write_gutter(gutter.entity, next_definition)

          evidence = build_evidence(
            roof_object: roof_object,
            gutter: gutter,
            definition: next_definition,
            plan: plan,
            connector_results: connector_results
          )
          Core::AttributeStore.new(gutter.entity).write_json(
            EVIDENCE_KEY,
            evidence,
            dictionary: Repository::DICTIONARY
          )

          @runtime.smart_objects.mark_dirty(gutter.entity, 'dirty_quantity', 'dirty_drawing')
          @runtime.smart_objects.mark_dirty(roof_object.entity, 'dirty_quantity', 'dirty_drawing')

          created_ids = created ? [gutter.id] : []
          updated_ids = ([roof_object.id] + (created ? [] : [gutter.id]) + connector_results.fetch(:downpipe_object_ids)).uniq
          affected = (created_ids + updated_ids).uniq
          {
            created_object_ids: created_ids.freeze,
            updated_object_ids: updated_ids.freeze,
            gutter_object_id: gutter.id,
            outlet_connector_ids: connector_results.fetch(:active_connector_ids).freeze,
            retired_connector_ids: connector_results.fetch(:retired_connector_ids).freeze,
            downpipe_object_ids: connector_results.fetch(:downpipe_object_ids).freeze,
            evidence: evidence,
            warnings: Array(plan['warnings']).freeze,
            events: [
              {
                name: 'RoofRainwaterPlanApplied',
                object_ids: affected,
                payload: {
                  roof_object_id: roof_object.id,
                  gutter_object_id: gutter.id,
                  edge_index: edge_index,
                  outlet_connector_ids: connector_results.fetch(:active_connector_ids),
                  retired_connector_ids: connector_results.fetch(:retired_connector_ids),
                  plan_fingerprint: evidence['plan_fingerprint']
                }
              },
              { name: 'QuantityDirty', object_ids: affected },
              { name: 'DrawingDirty', object_ids: affected }
            ].freeze
          }.freeze
        end

        private

        def compatible_roof?(object)
          object && object.owner_module.to_s == 'constructflow.roof' && object.type.to_s == 'roof.system'
        end

        def normalized_ratios(plan)
          Array(plan && plan['suggested_outlet_ratios']).map { |value| Float(value) }.each do |ratio|
            raise ArgumentError, 'rainwater outlet ratio must be between 0 and 1' unless ratio.between?(0.0, 1.0)
          end.freeze
        end

        def hosted_gutters(roof_object)
          @runtime.smart_objects.all.select do |object|
            next false unless object.owner_module.to_s == 'constructflow.roof' && object.type.to_s == 'roof.gutter'
            definition = @repository.read_gutter(object.entity)
            definition && definition.roof_object_id.to_s == roof_object.id.to_s
          end
        end

        def resolve_existing_gutter(roof_object, edge_index:, gutter_object_id: nil)
          unless gutter_object_id.to_s.strip.empty?
            object = @runtime.smart_objects.fetch_by_id(gutter_object_id.to_s)
            raise ArgumentError, 'rainwater gutter not found' unless object && object.owner_module.to_s == 'constructflow.roof' && object.type.to_s == 'roof.gutter'
            definition = @repository.read_gutter(object.entity)
            raise ArgumentError, 'gutter definition missing' unless definition
            raise ArgumentError, 'gutter is not hosted by selected roof' unless definition.roof_object_id.to_s == roof_object.id.to_s
            return object
          end

          candidates = hosted_gutters(roof_object).select do |object|
            definition = @repository.read_gutter(object.entity)
            definition && definition.edge_index == edge_index
          end
          raise ArgumentError, 'multiple gutters already exist on reviewed roof edge; specify gutter_object_id' if candidates.length > 1
          candidates.first
        end

        def create_gutter(roof_object, edge_index:, profile_id:, outlet_ratio:, display_name:, source_state:)
          definition = GutterDefinition.new(
            roof_object_id: roof_object.id,
            edge_index: edge_index,
            profile_id: profile_id,
            outlet_ratio: outlet_ratio
          )
          group = @geometry.create_gutter_group(
            @runtime.active_model,
            roof_object: roof_object,
            definition: definition,
            edge_capability: @edge_capability
          )
          object = @runtime.smart_objects.create(
            entity: group,
            type: 'roof.gutter',
            owner_module: 'constructflow.roof',
            display_name: display_name,
            created_phase: roof_object.created_phase,
            source_state: source_state
          )
          @repository.write_gutter(group, definition)
          @runtime.smart_objects.add_relationship(
            group,
            kind: 'host',
            target_id: roof_object.id,
            role: 'roof_edge',
            metadata: { capability: 'roof.edge_host', edge_index: edge_index }
          )
          object
        end

        def reconcile_outlets(gutter, roof_object:, edge_index:, ratios:)
          existing = indexed_outlets(gutter)
          by_index = existing.each_with_object({}) { |item, result| result[item.fetch(:index)] = item.fetch(:connector) }
          active_ids = []
          retired_ids = []
          downpipe_ids = []

          ratios.each_with_index do |ratio, index|
            position = @edge_capability.point_on_edge_mm(roof_object, edge_index, ratio)
            connector = by_index[index]
            if connector
              properties = connector.fetch('properties', {}).merge(
                'gravity' => true,
                'roof_object_id' => roof_object.id,
                'outlet_index' => index,
                'outlet_ratio' => ratio,
                'rainwater_plan_managed' => true,
                'retired_by_plan' => false
              )
              options = { position_mm: position, properties: properties }
              options[:state] = 'available' if connector['state'].to_s == 'disabled'
              connector = @runtime.connectors.update_connector(connector['id'], **options)
            else
              connector = @runtime.connectors.register_connector(
                owner_object_id: gutter.id,
                type: 'roof.gutter_outlet',
                role: 'outlet',
                position_mm: position,
                direction: [0, 0, -1],
                properties: {
                  gravity: true,
                  roof_object_id: roof_object.id,
                  outlet_index: index,
                  outlet_ratio: ratio,
                  rainwater_plan_managed: true,
                  retired_by_plan: false
                }
              )
            end
            active_ids << connector['id']
            downpipe_ids.concat(refresh_connected_downpipes(connector['id']))
          end

          existing.each do |item|
            next if item.fetch(:index) < ratios.length
            connector = item.fetch(:connector)
            connections = @runtime.connectors.connections_for_connector(connector['id'])
            unless connections.empty?
              raise ArgumentError, "cannot retire connected gutter outlet #{connector['id']}; disconnect/reconfigure its downpipe first"
            end
            properties = connector.fetch('properties', {}).merge(
              'rainwater_plan_managed' => true,
              'retired_by_plan' => true
            )
            @runtime.connectors.update_connector(connector['id'], state: 'disabled', properties: properties)
            retired_ids << connector['id']
          end

          {
            active_connector_ids: active_ids.uniq.freeze,
            retired_connector_ids: retired_ids.uniq.freeze,
            downpipe_object_ids: downpipe_ids.map(&:to_s).uniq.freeze
          }.freeze
        end

        def indexed_outlets(gutter)
          connectors = @runtime.connectors.connectors_for(gutter.id).select do |connector|
            connector['type'].to_s == 'roof.gutter_outlet'
          end
          primary = @repository.read_gutter(gutter.entity)&.outlet_connector_id.to_s
          unindexed_counter = 0
          connectors.map do |connector|
            properties = connector.fetch('properties', {})
            raw_index = properties['outlet_index'] || properties[:outlet_index]
            index = if raw_index.nil?
                      if connector['id'].to_s == primary && !primary.empty?
                        0
                      else
                        unindexed_counter += 1
                        unindexed_counter
                      end
                    else
                      Integer(raw_index)
                    end
            { index: index, connector: connector }
          end.sort_by { |item| [item.fetch(:index), item.fetch(:connector)['id'].to_s] }.freeze
        end

        def downpipe_connected?(connector_id)
          @runtime.connectors.connections_for_connector(connector_id).any? do |connection|
            connection['system'].to_s == RAINWATER_SYSTEM &&
              connection.fetch('metadata', {})['route_kind'].to_s == 'downpipe'
          end
        end

        def downpipe_capability_available?
          @runtime.respond_to?(:capabilities) && @runtime.capabilities.available?(DRAINAGE_CAPABILITY)
        end

        def refresh_connected_downpipes(connector_id)
          return [] unless downpipe_connected?(connector_id)
          raise ArgumentError, 'drainage rainwater downpipe capability unavailable for connected outlet repositioning' unless downpipe_capability_available?

          service = @runtime.capabilities.fetch(DRAINAGE_CAPABILITY)
          result = service.refresh_for_start_connector(start_connector_id: connector_id)
          Array(result[:updated_object_ids] || result['updated_object_ids']).map(&:to_s).uniq
        end

        def build_evidence(roof_object:, gutter:, definition:, plan:, connector_results:)
          ratios = normalized_ratios(plan)
          source = plan['capacity_source'] || {}
          fingerprint_payload = [
            roof_object.id,
            gutter.id,
            definition.edge_index,
            definition.profile_id,
            plan['formula_version'],
            plan['design_rainfall_mm_per_hr'],
            plan['runoff_coefficient'],
            plan['peak_flow_lps'],
            plan['required_outlet_count'],
            ratios.join(','),
            source['kind'], source['asset_id'], source['asset_version'], source['outlet_capacity_lps']
          ].map(&:to_s).join('|')
          {
            'format' => EVIDENCE_FORMAT,
            'plan_fingerprint' => Digest::SHA256.hexdigest(fingerprint_payload),
            'roof_object_id' => roof_object.id,
            'gutter_object_id' => gutter.id,
            'edge_index' => definition.edge_index,
            'profile_id' => definition.profile_id,
            'outlet_ratios' => ratios,
            'outlet_connector_ids' => connector_results.fetch(:active_connector_ids),
            'capacity_source' => source,
            'formula_version' => plan['formula_version'],
            'design_rainfall_mm_per_hr' => plan['design_rainfall_mm_per_hr'],
            'runoff_coefficient' => plan['runoff_coefficient'],
            'peak_flow_lps' => plan['peak_flow_lps'],
            'required_outlet_count' => plan['required_outlet_count']
          }.freeze
        end
      end

      module RainwaterPlanApplicationRegistration
        COMMAND = 'ApplyRoofRainwaterCatchmentPlan'

        module_function

        def install(runtime)
          return if runtime.commands.registered?(COMMAND)

          repository = Repository.new
          planner = RainwaterCatchmentPlanner.new
          capacity_resolver = RainwaterCapacityProfileResolver.new
          applier = RainwaterPlanApplier.new(runtime: runtime, repository: repository)
          runtime.commands.register(
            COMMAND,
            owner_module: 'constructflow.roof',
            validator: lambda { |command|
              validation_errors(runtime, repository, planner, capacity_resolver, applier, command[:input])
            }
          ) do |command|
            input = command[:input]
            roof_object = RainwaterPlanningRegistration.resolve_roof(runtime, input)
            definition = repository.read_roof(roof_object.entity)
            plan = RainwaterPlanningRegistration.build_plan(planner, capacity_resolver, runtime, definition, input)
            profile_id = resolved_profile_id(input, plan)
            applier.apply(
              roof_object: roof_object,
              plan: plan,
              profile_id: profile_id,
              gutter_object_id: value(input, :gutter_object_id),
              rehost_gutter: truthy?(value(input, :rehost_gutter)),
              display_name: value(input, :display_name) || 'Rainwater Gutter',
              source_state: value(input, :source_state) || 'confirmed'
            )
          end
        end

        def validation_errors(runtime, repository, planner, capacity_resolver, applier, input)
          errors = []
          errors << 'confirm_apply: true required to mutate reviewed rainwater hardware' unless truthy?(value(input, :confirm_apply))
          roof_object = RainwaterPlanningRegistration.resolve_roof(runtime, input)
          errors << 'roof not found' unless roof_object
          return errors unless errors.empty?

          definition = repository.read_roof(roof_object.entity)
          errors << 'roof definition missing' unless definition
          return errors unless errors.empty?

          plan = RainwaterPlanningRegistration.build_plan(planner, capacity_resolver, runtime, definition, input)
          profile_id = resolved_profile_id(input, plan)
          errors.concat(
            applier.validate(
              roof_object: roof_object,
              plan: plan,
              profile_id: profile_id,
              gutter_object_id: value(input, :gutter_object_id),
              rehost_gutter: truthy?(value(input, :rehost_gutter))
            )
          )
          errors
        rescue StandardError => error
          [error.message]
        end

        def resolved_profile_id(input, plan)
          explicit = value(input, :profile_id).to_s.strip
          return explicit unless explicit.empty?

          hint = plan.fetch('capacity_source', {})['gutter_profile_id'].to_s.strip
          return hint unless hint.empty?

          ''
        end

        def truthy?(value)
          value == true || value.to_s.downcase == 'true'
        end

        def value(input, key)
          return input[key] if input.key?(key)
          input[key.to_s]
        end
      end
    end
  end
end
