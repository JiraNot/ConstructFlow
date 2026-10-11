# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Roof
      module Registration
        MANIFEST = {
          id: 'constructflow.roof',
          name: 'Roof & Envelope',
          version: '0.1.0',
          schema_version: 1,
          requires: ['constructflow.core'],
          optional_capabilities: %w[extension.boundary structure.member_generator drainage.network],
          provides: %w[roof.generator roof.edge_host roof.quantity],
          objects: %w[roof.system roof.gutter],
          commands: %w[GenerateRoof ModifyRoofBoundary SetRoofSlope ChangeRoofSystem AddGutter SetRoofJunction],
          events: %w[RoofGenerated RoofChanged RoofJunctionSet GutterAdded HostedGutterRegenerated GeometryChanged QuantityDirty DrawingDirty ValidationStateChanged],
          providers: ['constructflow.roof.quantity'],
          validators: %w[roof.validity roof.gutter.validity]
        }.freeze

        module_function

        def install(runtime)
          return if runtime.modules.registered?('constructflow.roof')

          runtime.module_loader.load(MANIFEST)
          repository = Repository.new
          geometry = Geometry.new
          validator = Validators::RoofValidator.new
          edge_capability = EdgeHostCapability.new(repository: repository)
          quantity_provider = Quantity::RoofQuantityProvider.new

          runtime.capabilities.register(
            'roof.generator',
            owner_module: 'constructflow.roof',
            provider: repository
          )
          runtime.capabilities.register(
            'roof.edge_host',
            owner_module: 'constructflow.roof',
            provider: edge_capability
          )
          runtime.capabilities.register(
            'roof.quantity',
            owner_module: 'constructflow.roof',
            provider: quantity_provider
          )

          runtime.commands.register(
            'GenerateRoof',
            owner_module: 'constructflow.roof',
            validator: ->(command) { roof_validation_errors(command[:input], runtime, validator) }
          ) do |command|
            input = command[:input]
            definition = roof_definition_from_input(input, runtime)
            group = geometry.create_roof_group(runtime.active_model, definition)
            object = runtime.smart_objects.create(
              entity: group,
              type: 'roof.system',
              owner_module: 'constructflow.roof',
              display_name: input[:display_name] || input['display_name'] || 'Roof',
              created_phase: input[:created_phase] || input['created_phase'] || Core::Phase::NEW_CONSTRUCTION,
              source_state: input[:source_state] || input['source_state'] || 'confirmed'
            )
            repository.write_roof(group, definition)
            if definition.generated_from_id
              runtime.smart_objects.add_relationship(
                group,
                kind: 'generated_from',
                target_id: definition.generated_from_id,
                role: 'extension_source'
              )
            end
            runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')
            supported_ids = reconcile_roof_supports(runtime, object, definition)
            issues = validator.validate_roof(definition)

            {
              created_object_ids: [object.id],
              updated_object_ids: supported_ids,
              warnings: warning_messages(issues),
              events: [
                { name: 'ObjectCreated', object_ids: [object.id], payload: { type: 'roof.system' } },
                { name: 'RoofGenerated', object_ids: [object.id], payload: { covering_system: definition.covering_system } },
                { name: 'RelationshipChanged', object_ids: [object.id, *supported_ids], payload: { kind: 'supported_by' } },
                { name: 'GeometryChanged', object_ids: [object.id] },
                { name: 'QuantityDirty', object_ids: [object.id] },
                { name: 'DrawingDirty', object_ids: [object.id] },
                { name: 'ValidationStateChanged', object_ids: [object.id], payload: { issues: issues } }
              ]
            }
          end

          runtime.commands.register(
            'ModifyRoofBoundary',
            owner_module: 'constructflow.roof',
            validator: ->(command) { modify_validation_errors(command[:input], runtime, repository, validator, :boundary) }
          ) do |command|
            update_roof(
              input: command[:input], runtime: runtime, repository: repository,
              geometry: geometry, validator: validator, change: 'boundary'
            ) { |current, input| current.with(boundary_mm: input[:boundary_mm] || input['boundary_mm']) }
          end

          runtime.commands.register(
            'SetRoofSlope',
            owner_module: 'constructflow.roof',
            validator: ->(command) { modify_validation_errors(command[:input], runtime, repository, validator, :slope) }
          ) do |command|
            update_roof(
              input: command[:input], runtime: runtime, repository: repository,
              geometry: geometry, validator: validator, change: 'slope'
            ) do |current, input|
              current.with(
                slope_percent: value_or(input, :slope_percent, current.slope_percent),
                slope_direction_xy: value_or(input, :slope_direction_xy, current.slope_direction_xy),
                low_elevation_mm: value_or(input, :low_elevation_mm, current.low_elevation_mm)
              )
            end
          end

          runtime.commands.register(
            'ChangeRoofSystem',
            owner_module: 'constructflow.roof',
            validator: ->(command) { modify_validation_errors(command[:input], runtime, repository, validator, :system) }
          ) do |command|
            update_roof(
              input: command[:input], runtime: runtime, repository: repository,
              geometry: geometry, validator: validator, change: 'system'
            ) do |current, input|
              current.with(
                covering_system: value_or(input, :covering_system, current.covering_system),
                thickness_mm: value_or(input, :thickness_mm, current.thickness_mm)
              )
            end
          end

          runtime.commands.register(
            'AddGutter',
            owner_module: 'constructflow.roof',
            validator: lambda { |command|
              gutter_validation_errors(command[:input], runtime, repository, edge_capability, validator)
            }
          ) do |command|
            input = command[:input]
            roof_object = resolve_roof(input, runtime)
            definition = gutter_definition_from_input(input, roof_object)
            group = geometry.create_gutter_group(
              runtime.active_model,
              roof_object: roof_object,
              definition: definition,
              edge_capability: edge_capability
            )
            gutter_object = runtime.smart_objects.create(
              entity: group,
              type: 'roof.gutter',
              owner_module: 'constructflow.roof',
              display_name: input[:display_name] || input['display_name'] || 'Gutter',
              created_phase: roof_object.created_phase,
              source_state: input[:source_state] || input['source_state'] || 'confirmed'
            )
            outlet_position = edge_capability.point_on_edge_mm(
              roof_object, definition.edge_index, definition.outlet_ratio
            )
            connector = runtime.connectors.register_connector(
              owner_object_id: gutter_object.id,
              type: 'roof.gutter_outlet',
              role: 'outlet',
              position_mm: outlet_position,
              direction: [0, 0, -1],
              properties: { gravity: true, roof_object_id: roof_object.id }
            )
            definition = definition.with(outlet_connector_id: connector['id'])
            repository.write_gutter(group, definition)
            runtime.smart_objects.add_relationship(
              group,
              kind: 'host',
              target_id: roof_object.id,
              role: 'roof_edge',
              metadata: { capability: 'roof.edge_host', edge_index: definition.edge_index }
            )
            runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')
            runtime.smart_objects.mark_dirty(roof_object.entity, 'dirty_quantity', 'dirty_drawing')

            {
              created_object_ids: [gutter_object.id],
              updated_object_ids: [roof_object.id],
              events: [
                { name: 'ObjectCreated', object_ids: [gutter_object.id], payload: { type: 'roof.gutter' } },
                { name: 'GutterAdded', object_ids: [gutter_object.id, roof_object.id], payload: { connector_id: connector['id'] } },
                { name: 'RelationshipChanged', object_ids: [gutter_object.id, roof_object.id], payload: { kind: 'host' } },
                { name: 'GeometryChanged', object_ids: [gutter_object.id] },
                { name: 'QuantityDirty', object_ids: [gutter_object.id, roof_object.id] },
                { name: 'DrawingDirty', object_ids: [gutter_object.id, roof_object.id] }
              ]
            }
          end

          runtime.commands.register(
            'SetRoofJunction',
            owner_module: 'constructflow.roof',
            validator: lambda { |command|
              junction_validation_errors(command[:input], runtime, repository)
            }
          ) do |command|
            input = command[:input]
            roof_object = resolve_roof(input, runtime)
            roof_definition = repository.read_roof(roof_object.entity)
            definition = junction_definition_from_input(input, roof_object, roof_definition)
            # Re-setting the junction replaces the previous host link instead of
            # accumulating one relationship per edit.
            runtime.smart_objects.remove_relationship(roof_object.entity, kind: 'host')
            repository.write_junction(roof_object.entity, definition)
            runtime.smart_objects.add_relationship(
              roof_object.entity,
              kind: 'host',
              target_id: definition.host_object_id,
              role: 'roof_junction_host',
              metadata: {
                'junction_type' => definition.junction_type,
                'edge_index' => definition.edge_index,
                'flashing_profile' => definition.flashing_profile
              }
            )
            runtime.smart_objects.mark_dirty(roof_object.entity, 'dirty_quantity', 'dirty_drawing')

            {
              updated_object_ids: [roof_object.id],
              events: [
                {
                  name: 'RoofJunctionSet',
                  object_ids: [roof_object.id, definition.host_object_id],
                  payload: {
                    edge_index: definition.edge_index,
                    junction_type: definition.junction_type,
                    flashing_profile: definition.flashing_profile,
                    upstand_mm: definition.upstand_mm,
                    cover_mm: definition.cover_mm
                  }
                },
                {
                  name: 'RoofChanged',
                  object_ids: [roof_object.id],
                  payload: { change: 'junction', host_object_id: definition.host_object_id }
                },
                {
                  name: 'RelationshipChanged',
                  object_ids: [roof_object.id, definition.host_object_id],
                  payload: { kind: 'host', role: 'roof_junction_host' }
                },
                { name: 'QuantityDirty', object_ids: [roof_object.id] },
                { name: 'DrawingDirty', object_ids: [roof_object.id] }
              ]
            }
          end

          install_ui(runtime)
        end

        def roof_definition_from_input(input, runtime)
          extension_id = input[:extension_object_id] || input['extension_object_id']
          if extension_id && !extension_id.to_s.empty?
            capability = runtime.capabilities.fetch('extension.boundary')
            extension_object = runtime.smart_objects.fetch_by_id(extension_id)
            raise ArgumentError, 'compatible extension zone required' unless capability.compatible?(extension_object)

            boundary = capability.boundary_mm(extension_object)
            low_elevation = boundary.map { |point| point[2] }.max + capability.target_height_mm(extension_object)
            roof_intent = capability.roof_intent(extension_object)
            form = %w[lean_to flat].include?(roof_intent) ? roof_intent : 'lean_to'
            return RoofDefinition.new(
              boundary_mm: boundary,
              roof_form: input[:roof_form] || input['roof_form'] || form,
              slope_percent: input[:slope_percent] || input['slope_percent'] || 5.0,
              slope_direction_xy: input[:slope_direction_xy] || input['slope_direction_xy'] || [0, 1],
              low_elevation_mm: input[:low_elevation_mm] || input['low_elevation_mm'] || low_elevation,
              covering_system: input[:covering_system] || input['covering_system'] || 'metal_sheet',
              thickness_mm: input[:thickness_mm] || input['thickness_mm'] || 20,
              generated_from_id: extension_object.id
            )
          end

          RoofDefinition.new(
            boundary_mm: input[:boundary_mm] || input['boundary_mm'] || [],
            roof_form: input[:roof_form] || input['roof_form'] || 'lean_to',
            slope_percent: input[:slope_percent] || input['slope_percent'] || 5.0,
            slope_direction_xy: input[:slope_direction_xy] || input['slope_direction_xy'] || [0, 1],
            low_elevation_mm: input[:low_elevation_mm] || input['low_elevation_mm'],
            covering_system: input[:covering_system] || input['covering_system'] || 'metal_sheet',
            thickness_mm: input[:thickness_mm] || input['thickness_mm'] || 20,
            generated_from_id: input[:generated_from_id] || input['generated_from_id']
          )
        end

        def roof_validation_errors(input, runtime, validator)
          validator.validate_roof(roof_definition_from_input(input, runtime))
                   .select { |issue| issue[:severity] == 'error' }
                   .map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def modify_validation_errors(input, runtime, repository, validator, change)
          object = resolve_roof(input, runtime)
          return ['roof not found'] unless object

          current = repository.read_roof(object.entity)
          return ['roof definition missing'] unless current

          updated = case change
                    when :boundary
                      current.with(boundary_mm: input[:boundary_mm] || input['boundary_mm'])
                    when :slope
                      current.with(
                        slope_percent: value_or(input, :slope_percent, current.slope_percent),
                        slope_direction_xy: value_or(input, :slope_direction_xy, current.slope_direction_xy),
                        low_elevation_mm: value_or(input, :low_elevation_mm, current.low_elevation_mm)
                      )
                    when :system
                      current.with(
                        covering_system: value_or(input, :covering_system, current.covering_system),
                        thickness_mm: value_or(input, :thickness_mm, current.thickness_mm)
                      )
                    end
          validator.validate_roof(updated)
                   .select { |issue| issue[:severity] == 'error' }
                   .map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def update_roof(input:, runtime:, repository:, geometry:, validator:, change:)
          object = resolve_roof(input, runtime)
          current = repository.read_roof(object.entity)
          updated = yield(current, input)
          geometry.rebuild_roof!(object.entity, updated)
          repository.write_roof(object.entity, updated)
          runtime.smart_objects.mark_dirty(object.entity, 'dirty_quantity', 'dirty_drawing', 'dirty_dependents')
          supported_ids = reconcile_roof_supports(runtime, object, updated)
          issues = validator.validate_roof(updated)
          {
            updated_object_ids: [object.id, *supported_ids],
            warnings: warning_messages(issues),
            events: [
              { name: 'RoofChanged', object_ids: [object.id], payload: { change: change } },
              { name: 'RelationshipChanged', object_ids: [object.id, *supported_ids], payload: { kind: 'supported_by' } },
              { name: 'GeometryChanged', object_ids: [object.id] },
              { name: 'QuantityDirty', object_ids: [object.id] },
              { name: 'DrawingDirty', object_ids: [object.id] },
              { name: 'ValidationStateChanged', object_ids: [object.id], payload: { issues: issues } }
            ]
          }
        end

        def gutter_definition_from_input(input, roof_object)
          GutterDefinition.new(
            roof_object_id: roof_object.id,
            edge_index: input[:edge_index] || input['edge_index'] || 0,
            profile_id: input[:profile_id] || input['profile_id'] || 'generic.gutter',
            outlet_ratio: input.key?(:outlet_ratio) ? input[:outlet_ratio] : (input['outlet_ratio'] || 1.0)
          )
        end

        def gutter_validation_errors(input, runtime, repository, edge_capability, validator)
          roof_object = resolve_roof(input, runtime)
          return ['roof not found'] unless roof_object

          roof_definition = repository.read_roof(roof_object.entity)
          definition = gutter_definition_from_input(input, roof_object)
          validator.validate_gutter(definition, roof_definition: roof_definition)
                   .select { |issue| issue[:severity] == 'error' }
                   .map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        # Derives the flashing path from the addressed roof edge when the caller
        # does not supply one, so a junction can never be stored against an edge
        # that the roof does not have.
        def junction_definition_from_input(input, roof_object, roof_definition)
          edge_index = value_or(input, :edge_index, 0)
          path = input[:path_mm] || input['path_mm']
          path = roof_definition ? roof_definition.edge_points_mm(edge_index) : [] if path.nil? || Array(path).empty?

          RoofJunctionDefinition.new(
            roof_object_id: roof_object.id,
            host_object_id: value_or(input, :host_object_id, nil),
            edge_index: edge_index,
            path_mm: path,
            junction_type: value_or(input, :junction_type, 'new_roof_to_existing_wall'),
            flashing_profile: value_or(input, :flashing_profile, 'wall_apron'),
            material: value_or(input, :material, 'metal'),
            upstand_mm: value_or(input, :upstand_mm, 150),
            cover_mm: value_or(input, :cover_mm, 150)
          )
        end

        def junction_validation_errors(input, runtime, repository)
          roof_object = resolve_roof(input, runtime)
          return ['roof not found'] unless roof_object

          roof_definition = repository.read_roof(roof_object.entity)
          return ['roof definition missing'] unless roof_definition

          definition = junction_definition_from_input(input, roof_object, roof_definition)
          errors = definition.errors.dup
          host = runtime.smart_objects.fetch_by_id(definition.host_object_id)
          if host.nil?
            errors << 'roof junction host object not found'
          else
            errors << 'roof junction host cannot be the roof itself' if host.id.to_s == roof_object.id.to_s
            if definition.junction_type == 'new_roof_to_existing_wall' && host.type.to_s != 'architecture.wall'
              errors << 'new_roof_to_existing_wall junction requires an architecture wall host'
            end
          end
          unless definition.edge_index >= 0 && definition.edge_index < roof_definition.sloped_points_mm.length
            errors << 'roof edge index out of range'
          end
          unless definition.matches_edge?(roof_definition.edge_points_mm(definition.edge_index))
            errors << 'roof junction path must follow the addressed roof edge'
          end
          errors
        rescue StandardError => error
          [error.message]
        end

        def resolve_roof(input, runtime)
          entity = input[:entity] || input['entity'] || input[:roof_entity] || input['roof_entity']
          object_id = input[:object_id] || input['object_id'] || input[:roof_object_id] || input['roof_object_id']
          object = entity ? runtime.smart_objects.fetch(entity) : runtime.smart_objects.fetch_by_id(object_id)
          return nil unless object && object.owner_module == 'constructflow.roof' && object.type == 'roof.system'

          object
        end

        def value_or(input, key, default)
          return input[key] if input.key?(key)
          string_key = key.to_s
          return input[string_key] if input.key?(string_key)

          default
        end

        def warning_messages(issues)
          Array(issues).select { |issue| issue[:severity] == 'warning' }.map { |issue| issue[:message] }
        end

        def reconcile_roof_supports(runtime, roof_object, roof_definition, tolerance_mm: 250.0)
          manager = runtime.smart_objects
          old_targets = manager.fetch(roof_object.entity).relationships.filter_map do |relationship|
            next unless relationship['kind'].to_s == 'supported_by'

            relationship['target_id'].to_s
          end
          old_targets.each do |target_id|
            target = manager.fetch_by_id(target_id)
            next unless target

            manager.remove_relationship(target.entity, kind: 'supports', target_id: roof_object.id)
          end
          manager.remove_relationship(roof_object.entity, kind: 'supported_by')

          boundary = Array(roof_definition.boundary_mm)
          candidates = manager.all.select do |object|
            %w[architecture.wall structure.beam structure.column].include?(object.type.to_s) && object.id != roof_object.id
          end
          supported = candidates.select do |object|
            candidate_points = support_points(runtime, object)
            candidate_points.any? { |point| point_near_boundary?(point, boundary, tolerance_mm) }
          end.sort_by(&:id)
          supported.each do |target|
            manager.add_relationship(
              roof_object.entity,
              kind: 'supported_by', target_id: target.id, role: 'roof_support',
              metadata: { 'tolerance_mm' => tolerance_mm }
            )
            manager.add_relationship(
              target.entity,
              kind: 'supports', target_id: roof_object.id, role: 'roof_support',
              metadata: { 'tolerance_mm' => tolerance_mm }
            )
            manager.mark_dirty(target.entity, 'dirty_dependents', 'dirty_drawing')
          end
          supported.map(&:id).freeze
        end

        def support_points(runtime, object)
          case object.type.to_s
          when 'architecture.wall'
            definition = Architecture::WallRepository.new.read(object.entity)
            definition ? definition.centerline_path_mm : []
          when 'structure.beam'
            definition = Structure::Repository.new.read_beam(object.entity)
            definition ? definition.path_mm : []
          when 'structure.column'
            definition = Structure::Repository.new.read_column(object.entity)
            definition ? [definition.location_mm] : []
          else
            []
          end
        rescue StandardError
          []
        end

        def point_near_boundary?(point, boundary, tolerance_mm)
          Array(boundary).each_cons(2).any? { |first, second| point_to_segment_distance(point, first, second) <= tolerance_mm } ||
            (boundary.length > 2 && point_to_segment_distance(point, boundary.last, boundary.first) <= tolerance_mm)
        end

        def point_to_segment_distance(point, first, second)
          dx = second[0] - first[0]
          dy = second[1] - first[1]
          length_sq = (dx * dx) + (dy * dy)
          return Math.sqrt(((point[0] - first[0])**2) + ((point[1] - first[1])**2)) if length_sq <= 0.001

          ratio = [[((point[0] - first[0]) * dx + (point[1] - first[1]) * dy) / length_sq, 0.0].max, 1.0].min
          projected = [first[0] + ratio * dx, first[1] + ratio * dy]
          Math.sqrt(((point[0] - projected[0])**2) + ((point[1] - projected[1])**2))
        end

        def install_ui(runtime)
          menu = runtime.menu.add_submenu('Roof')
          menu.add_item('Generate Roof from Selected Face') do
            face = runtime.active_model.selection.find { |entity| entity.is_a?(Sketchup::Face) }
            unless face
              UI.messagebox('Select one SketchUp face first.')
              next
            end

            values = JiraNot::ConstructFlow::Core::Units.meter_inputbox(
              ['Covering', 'Slope (%)', 'Slope direction X', 'Slope direction Y'],
              ['metal_sheet', '5', '0', '1'],
              'ConstructFlow Roof'
            )
            next unless values

            boundary_mm = face.outer_loop.vertices.map { |vertex| Core::Units.point_to_mm(vertex.position) }
            result = runtime.commands.execute(
              'GenerateRoof',
              {
                boundary_mm: boundary_mm,
                covering_system: values[0].to_s,
                slope_percent: Float(values[1]),
                slope_direction_xy: [Float(values[2]), Float(values[3])]
              },
              project_id: runtime.project.project_id
            )
            UI.messagebox(result[:errors].join("\n")) unless result[:status] == 'success'
          rescue StandardError => error
            UI.messagebox("ConstructFlow Roof error: #{error.message}")
          end

          menu.add_item('Add Gutter to Selected Roof') do
            roof_object = runtime.active_model.selection.filter_map { |entity| runtime.smart_objects.fetch(entity) }
                                 .find { |object| object.owner_module == 'constructflow.roof' && object.type == 'roof.system' }
            unless roof_object
              UI.messagebox('Select one ConstructFlow Roof first.')
              next
            end

            values = JiraNot::ConstructFlow::Core::Units.meter_inputbox(['Edge index', 'Outlet ratio 0-1'], ['0', '1.0'], 'ConstructFlow Gutter')
            next unless values

            result = runtime.commands.execute(
              'AddGutter',
              { roof_object_id: roof_object.id, edge_index: Integer(values[0]), outlet_ratio: Float(values[1]) },
              project_id: runtime.project.project_id
            )
            UI.messagebox(result[:errors].join("\n")) unless result[:status] == 'success'
          rescue StandardError => error
            UI.messagebox("ConstructFlow Gutter error: #{error.message}")
          end
        end
      end
    end
  end
end
