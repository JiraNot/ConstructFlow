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
          objects: %w[electrical.luminaire electrical.switch electrical.outlet electrical.data electrical.tv electrical.dedicated_outlet electrical.conduit_route],
          commands: %w[PlaceElectricalFixture PlaceSwitch PlaceOutlet AssignElectricalCircuit ConnectSwitchControl CreateConduitRoute CalculateConduitSize CreatePanelboard BalancePanelLoads CalculateVoltageDrop],
          events: %w[ElectricalDevicePlaced ElectricalCircuitChanged ElectricalControlChanged ConduitRouteCreated ConduitSized PanelboardCreated PanelboardBalanced VoltageDropCalculated GeometryChanged DrawingDirty QuantityDirty],
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
          register_conduit_routing(runtime, repository, geometry)
          register_conduit_sizing(runtime)
          register_panelboards(runtime, repository)
          register_voltage_drop(runtime)
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

        def register_conduit_routing(runtime, repository, geometry)
          runtime.commands.register('CreateConduitRoute', owner_module: 'constructflow.electrical') do |command|
            input = command[:input]
            nodes = value(input, :route_nodes_mm)

            if nodes.nil? || nodes.empty?
              start_pt = value(input, :start_point)
              end_pt = value(input, :end_point)
              strategy = value(input, :strategy) || 'ceiling_first'
              ceiling_z = value(input, :ceiling_z_mm)
              floor_z = value(input, :floor_z_mm)

              raise ArgumentError, 'start_point and end_point required when route_nodes_mm is not provided' unless start_pt && end_pt

              solver = ConduitRouteSolver.new
              plan = solver.solve(
                start_point: start_pt,
                end_point: end_pt,
                strategy: strategy,
                ceiling_z_mm: ceiling_z,
                floor_z_mm: floor_z
              )
              nodes = plan.route_nodes_mm
            end

            definition = ConduitRouteDefinition.new(
              system: value(input, :system) || 'power',
              conduit_type: value(input, :conduit_type) || 'emt',
              nominal_size_mm: value(input, :nominal_size_mm) || 20.0,
              route_nodes_mm: nodes,
              start_object_id: value(input, :start_object_id),
              end_object_id: value(input, :end_object_id),
              cable_ids: value(input, :cable_ids) || []
            )

            group = geometry.create_conduit_group(runtime.active_model, definition)
            object = runtime.smart_objects.create(
              entity: group,
              type: 'electrical.conduit_route',
              owner_module: 'constructflow.electrical',
              display_name: value(input, :display_name) || "Conduit #{definition.nominal_size_mm}mm",
              created_phase: value(input, :created_phase) || runtime.project.working_phase,
              source_state: value(input, :source_state) || 'confirmed'
            )
            definition = definition.with(id: object.id)
            repository.write_conduit(group, definition)
            runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')

            {
              created_object_ids: [object.id],
              events: [
                { name: 'ObjectCreated', object_ids: [object.id], payload: { type: 'electrical.conduit_route' } },
                { name: 'ConduitRouteCreated', object_ids: [object.id], payload: definition.to_h },
                { name: 'GeometryChanged', object_ids: [object.id] },
                { name: 'QuantityDirty', object_ids: [object.id] }
              ]
            }
          end
        end

        def register_conduit_sizing(runtime)
          runtime.commands.register('CalculateConduitSize', owner_module: 'constructflow.electrical', transaction: false) do |command|
            input = command[:input]
            raw_cables = Array(value(input, :cables))
            cables = raw_cables.flat_map do |c|
              qty = Integer(c[:quantity] || c['quantity'] || 1)
              cable_def = CableDefinition.new(
                conductor_size_sqmm: c[:conductor_size_sqmm] || c['conductor_size_sqmm'] || 2.5,
                conductor_count: c[:conductor_count] || c['conductor_count'] || 1,
                insulation_type: c[:insulation_type] || c['insulation_type'] || 'thw'
              )
              Array.new(qty) { cable_def }
            end

            engine = ConduitSizingEngine.new
            result = engine.calculate_size(
              cables: cables,
              conduit_type: value(input, :conduit_type) || 'emt'
            )

            {
              events: [{ name: 'ConduitSized', payload: result.to_h }],
              sizing_result: result.to_h
            }
          end
        end

        def register_panelboards(runtime, repository)
          runtime.commands.register('CreatePanelboard', owner_module: 'constructflow.electrical') do |command|
            input = command[:input]
            panel = PanelboardDefinition.new(
              id: value(input, :id),
              name: value(input, :name),
              phase_config: value(input, :phase_config) || '1P2W',
              voltage_v: value(input, :voltage_v),
              main_breaker_a: value(input, :main_breaker_a) || 50.0,
              bus_rating_a: value(input, :bus_rating_a) || 100.0,
              max_circuits: value(input, :max_circuits) || 24,
              circuits: value(input, :circuits) || {}
            )
            repository.write_panelboard(runtime.active_model, panel)
            {
              events: [{ name: 'PanelboardCreated', payload: panel.to_h }]
            }
          end

          runtime.commands.register('BalancePanelLoads', owner_module: 'constructflow.electrical') do |command|
            input = command[:input]
            panel_id = value(input, :panel_id).to_s
            panel = repository.panelboard(runtime.active_model, panel_id)
            raise ArgumentError, "Panelboard #{panel_id} not found" unless panel

            balanced_panel = panel.with_balanced_phases
            repository.write_panelboard(runtime.active_model, balanced_panel)
            {
              events: [{ name: 'PanelboardBalanced', payload: balanced_panel.to_h }]
            }
          end
        end

        def register_voltage_drop(runtime)
          runtime.commands.register('CalculateVoltageDrop', owner_module: 'constructflow.electrical', transaction: false) do |command|
            input = command[:input]
            calc = VoltageDropCalculator.new
            result = calc.calculate(
              length_m: value(input, :length_m),
              current_a: value(input, :current_a),
              conductor_size_sqmm: value(input, :conductor_size_sqmm) || 2.5,
              voltage_v: value(input, :voltage_v) || 230.0,
              phase_config: value(input, :phase_config) || '1P2W',
              insulation_type: value(input, :insulation_type) || 'thw'
            )
            {
              events: [{ name: 'VoltageDropCalculated', payload: result.to_h }],
              voltage_drop_result: result.to_h
            }
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
