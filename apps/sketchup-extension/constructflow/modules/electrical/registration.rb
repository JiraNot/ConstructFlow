# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Electrical
      module Registration
        MANIFEST = {
          id: 'constructflow.electrical', name: 'Electrical', version: '0.1.0', schema_version: 1,
          requires: ['constructflow.core'],
          optional_capabilities: %w[architecture.host interior.requirement drawing.provider],
          provides: %w[electrical.logical_network electrical.quantity],
          objects: %w[electrical.luminaire electrical.switch electrical.outlet electrical.data electrical.tv electrical.dedicated_outlet],
          commands: %w[PlaceElectricalFixture PlaceSwitch PlaceOutlet AssignElectricalCircuit ConnectSwitchControl],
          events: %w[ElectricalDevicePlaced ElectricalCircuitChanged ElectricalControlChanged GeometryChanged DrawingDirty QuantityDirty],
          providers: ['constructflow.electrical.quantity'], validators: %w[electrical.device.validity electrical.control.validity]
        }.freeze

        module_function

        def install(runtime)
          return if runtime.modules.registered?('constructflow.electrical')
          runtime.module_loader.load(MANIFEST)
          repository = Repository.new
          geometry = Geometry.new
          quantity_provider = Quantity::ElectricalQuantityProvider.new

          runtime.capabilities.register(
            'electrical.quantity',
            owner_module: 'constructflow.electrical',
            provider: quantity_provider
          )

          register_place(runtime, repository, geometry, 'PlaceElectricalFixture', default_kind: 'luminaire')
          register_place(runtime, repository, geometry, 'PlaceSwitch', default_kind: 'switch')
          register_place(runtime, repository, geometry, 'PlaceOutlet', default_kind: 'outlet')
          register_assign_circuit(runtime, repository)
          register_switch_control(runtime, repository)
        end

        def register_place(runtime, repository, geometry, command_name, default_kind:)
          runtime.commands.register(
            command_name,
            owner_module: 'constructflow.electrical',
            validator: ->(command) { device_definition(command[:input], default_kind).errors }
          ) do |command|
            input = command[:input]
            definition = device_definition(input, default_kind)
            group = geometry.create_device_group(runtime.active_model, definition)
            object = runtime.smart_objects.create(
              entity: group,
              type: "electrical.#{definition.kind}",
              owner_module: 'constructflow.electrical',
              display_name: value(input, :display_name) || definition.device_type,
              created_phase: value(input, :created_phase) || runtime.project.working_phase,
              level_refs: definition.level_id ? [definition.level_id] : [],
              source_state: value(input, :source_state) || 'confirmed'
            )
            repository.write_device(group, definition)
            runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')
            {
              created_object_ids: [object.id],
              events: [
                { name: 'ObjectCreated', object_ids: [object.id], payload: { type: object.type } },
                { name: 'ElectricalDevicePlaced', object_ids: [object.id], payload: { kind: definition.kind } },
                { name: 'GeometryChanged', object_ids: [object.id] },
                { name: 'QuantityDirty', object_ids: [object.id] },
                { name: 'DrawingDirty', object_ids: [object.id] }
              ]
            }
          end
        end

        def register_assign_circuit(runtime, repository)
          runtime.commands.register('AssignElectricalCircuit', owner_module: 'constructflow.electrical') do |command|
            input = command[:input]
            object = runtime.smart_objects.fetch_by_id(value(input, :object_id).to_s)
            raise ArgumentError, 'electrical device not found' unless object && object.type.to_s.start_with?('electrical.')
            definition = repository.read_device(object.entity)
            raise ArgumentError, 'electrical device definition missing' unless definition

            circuit_id = value(input, :circuit_id).to_s
            raise ArgumentError, 'circuit_id required' if circuit_id.empty?
            circuit = repository.circuit(runtime.active_model, circuit_id) || CircuitDefinition.new(
              id: circuit_id, name: value(input, :circuit_name) || circuit_id,
              circuit_type: value(input, :circuit_type) || 'general', rating_a: value(input, :rating_a)
            )
            repository.write_circuit(runtime.active_model, circuit.with_devices(circuit.device_object_ids + [object.id]))
            repository.write_device(object.entity, definition.with(circuit_id: circuit_id))
            runtime.smart_objects.mark_dirty(object.entity, 'dirty_quantity', 'dirty_drawing')
            { updated_object_ids: [object.id], events: [
              { name: 'ElectricalCircuitChanged', object_ids: [object.id], payload: { circuit_id: circuit_id } },
              { name: 'QuantityDirty', object_ids: [object.id] }, { name: 'DrawingDirty', object_ids: [object.id] }
            ] }
          end
        end

        def register_switch_control(runtime, repository)
          runtime.commands.register('ConnectSwitchControl', owner_module: 'constructflow.electrical') do |command|
            input = command[:input]
            switch = runtime.smart_objects.fetch_by_id(value(input, :switch_object_id).to_s)
            raise ArgumentError, 'switch object required' unless switch && switch.type.to_s == 'electrical.switch'
            loads = Array(value(input, :load_object_ids)).map(&:to_s).uniq
            raise ArgumentError, 'at least one load required' if loads.empty?
            missing = loads.reject { |id| runtime.smart_objects.fetch_by_id(id) }
            raise ArgumentError, "missing electrical load(s): #{missing.join(', ')}" unless missing.empty?
            relation = repository.add_control_relation(runtime.active_model, switch_object_id: switch.id, load_object_ids: loads)
            ([switch.id] + loads).each do |id|
              object = runtime.smart_objects.fetch_by_id(id)
              runtime.smart_objects.mark_dirty(object.entity, 'dirty_drawing') if object
            end
            { updated_object_ids: [switch.id] + loads, events: [
              { name: 'ElectricalControlChanged', object_ids: [switch.id] + loads, payload: relation },
              { name: 'DrawingDirty', object_ids: [switch.id] + loads }
            ] }
          end
        end

        def device_definition(input, default_kind)
          DeviceDefinition.new(
            kind: value(input, :kind) || default_kind,
            device_type: value(input, :device_type) || 'generic',
            position_mm: value(input, :position_mm) || [0, 0, 0],
            mounting: value(input, :mounting) || (default_kind == 'luminaire' ? 'ceiling' : 'wall'),
            host_object_id: value(input, :host_object_id), level_id: value(input, :level_id),
            mounting_height_mm: value(input, :mounting_height_mm) || 0,
            catalog_ref: value(input, :catalog_ref), wattage: value(input, :wattage), cct_k: value(input, :cct_k),
            circuit_id: value(input, :circuit_id), control_group_id: value(input, :control_group_id),
            dedicated: value(input, :dedicated) == true, weatherproof: value(input, :weatherproof) == true,
            appliance_ref: value(input, :appliance_ref), schedule_mark: value(input, :schedule_mark)
          )
        end

        def value(input, key)
          input[key] || input[key.to_s]
        end
      end
    end
  end
end
