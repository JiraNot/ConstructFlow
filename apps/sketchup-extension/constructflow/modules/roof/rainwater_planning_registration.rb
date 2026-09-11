# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Roof
      module RainwaterPlanningRegistration
        COMMAND = 'PlanRoofRainwaterCatchment'

        module_function

        def install(runtime)
          return if runtime.commands.registered?(COMMAND)

          repository = Repository.new
          planner = RainwaterCatchmentPlanner.new
          capacity_resolver = RainwaterCapacityProfileResolver.new
          runtime.commands.register(
            COMMAND,
            owner_module: 'constructflow.roof',
            transaction: false,
            validator: lambda { |command|
              validation_errors(runtime, repository, planner, capacity_resolver, command[:input])
            }
          ) do |command|
            roof_object = resolve_roof(runtime, command[:input])
            definition = repository.read_roof(roof_object.entity)
            plan = build_plan(planner, capacity_resolver, runtime, definition, command[:input])
            {
              warnings: plan['warnings'],
              events: [{
                name: 'RoofRainwaterCatchmentPlanned',
                object_ids: [roof_object.id],
                payload: plan.merge('roof_object_id' => roof_object.id)
              }]
            }
          end
        end

        def validation_errors(runtime, repository, planner, capacity_resolver, input)
          roof_object = resolve_roof(runtime, input)
          return ['roof not found'] unless roof_object

          definition = repository.read_roof(roof_object.entity)
          return ['roof definition missing'] unless definition

          build_plan(planner, capacity_resolver, runtime, definition, input)
          []
        rescue StandardError => error
          [error.message]
        end

        def build_plan(planner, capacity_resolver, runtime, definition, input)
          capacity = capacity_evidence(capacity_resolver, runtime, input)
          planner.plan(
            roof_definition: definition,
            design_rainfall_mm_per_hr: value(input, :design_rainfall_mm_per_hr),
            runoff_coefficient: value(input, :runoff_coefficient),
            outlet_capacity_lps: capacity.fetch('outlet_capacity_lps'),
            edge_index: value(input, :edge_index)
          ).merge('capacity_source' => capacity).freeze
        end

        def capacity_evidence(resolver, runtime, input)
          direct = value(input, :outlet_capacity_lps)
          asset_id = value(input, :capacity_asset_id)
          has_direct = !(direct.nil? || direct.to_s.strip.empty?)
          has_asset = !(asset_id.nil? || asset_id.to_s.strip.empty?)
          if has_direct && has_asset
            raise ArgumentError, 'provide either outlet_capacity_lps or capacity_asset_id, not both'
          end
          if has_asset
            return resolver.resolve(
              runtime: runtime,
              asset_id: asset_id,
              version: value(input, :capacity_asset_version)
            )
          end
          raise ArgumentError, 'outlet_capacity_lps or capacity_asset_id required' unless has_direct

          capacity = Float(direct)
          raise ArgumentError, 'outlet capacity must be greater than zero' unless capacity.positive?
          {
            'kind' => 'manual_input',
            'outlet_capacity_lps' => capacity,
            'verification_status' => 'user_supplied'
          }.freeze
        rescue TypeError, ArgumentError => error
          raise error if error.message.start_with?('provide either', 'outlet_capacity_lps or capacity_asset_id')
          raise ArgumentError, 'outlet capacity must be greater than zero' if has_direct && !has_asset
          raise
        end

        def resolve_roof(runtime, input)
          entity = value(input, :entity) || value(input, :roof_entity)
          object_id = value(input, :object_id) || value(input, :roof_object_id)
          object = entity ? runtime.smart_objects.fetch(entity) : runtime.smart_objects.fetch_by_id(object_id)
          return nil unless object && object.owner_module == 'constructflow.roof' && object.type == 'roof.system'
          object
        end

        def value(input, key)
          return input[key] if input.key?(key)
          input[key.to_s]
        end
      end
    end
  end
end
