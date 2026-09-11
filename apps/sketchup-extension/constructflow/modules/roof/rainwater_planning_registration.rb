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
          runtime.commands.register(
            COMMAND,
            owner_module: 'constructflow.roof',
            transaction: false,
            validator: ->(command) { validation_errors(runtime, repository, planner, command[:input]) }
          ) do |command|
            roof_object = resolve_roof(runtime, command[:input])
            definition = repository.read_roof(roof_object.entity)
            plan = build_plan(planner, definition, command[:input])
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

        def validation_errors(runtime, repository, planner, input)
          roof_object = resolve_roof(runtime, input)
          return ['roof not found'] unless roof_object

          definition = repository.read_roof(roof_object.entity)
          return ['roof definition missing'] unless definition

          build_plan(planner, definition, input)
          []
        rescue StandardError => error
          [error.message]
        end

        def build_plan(planner, definition, input)
          planner.plan(
            roof_definition: definition,
            design_rainfall_mm_per_hr: value(input, :design_rainfall_mm_per_hr),
            runoff_coefficient: value(input, :runoff_coefficient),
            outlet_capacity_lps: value(input, :outlet_capacity_lps),
            edge_index: value(input, :edge_index)
          )
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
