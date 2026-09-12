# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Extension
      class ConstructionTakeoff
        QUANTITY_STALE_FLAGS = %w[dirty_quantity dirty_dependents].freeze

        def initialize(runtime:)
          @runtime = runtime
          @extension_repository = Repository.new
          @architecture_repository = Architecture::WallRepository.new
          @opening_repository = Opening::OpeningRepository.new
          @door_window_repository = DoorWindow::InstanceRepository.new
          @door_window_types = DoorWindow::TypeRegistry.new(runtime.respond_to?(:active_model) ? runtime.active_model : nil)
          @structure_repository = Structure::Repository.new
          @surface_repository = Surface::Repository.new
          @roof_repository = Roof::Repository.new
          @roof_edge_capability = Roof::EdgeHostCapability.new(repository: @roof_repository)
          @drainage_repository = Drainage::Repository.new
          @interior_repository = Interior::Repository.new
          @electrical_repository = Electrical::Repository.new
          @extension_provider = Quantity::ExtensionQuantityProvider.new
          @architecture_provider = Architecture::Quantity::WallQuantityProvider.new
          @floor_provider = Architecture::Quantity::FloorQuantityProvider.new
          @room_provider = Architecture::Quantity::RoomQuantityProvider.new
          @ceiling_provider = Architecture::Quantity::CeilingQuantityProvider.new
          @opening_provider = Opening::Quantity::OpeningQuantityProvider.new
          @door_window_provider = DoorWindow::Quantity::DoorWindowQuantityProvider.new
          @structure_provider = Structure::Quantity::StructureQuantityProvider.new
          @surface_provider = Surface::Quantity::SurfaceQuantityProvider.new
          @roof_provider = Roof::Quantity::RoofQuantityProvider.new
          @drainage_provider = Drainage::Quantity::DrainageQuantityProvider.new
          @interior_provider = Interior::Quantity::InteriorQuantityProvider.new
          @electrical_provider = Electrical::Quantity::ElectricalQuantityProvider.new
        end

        def build(extension_id)
          source = @runtime.smart_objects.fetch_by_id(extension_id.to_s)
          raise ArgumentError, 'extension zone not found' unless source && source.type == 'extension.zone'

          objects = related_objects(source)
          items = []
          coverage = []
          objects.each do |object|
            object_items, status = quantities_for(object)
            dirty_flags = quantity_dirty_flags(object)
            items.concat(object_items)
            coverage << {
              'object_id' => object.id,
              'object_type' => object.type,
              'source_module' => object.owner_module,
              'status' => status,
              'item_count' => object_items.length,
              'dirty_flags' => dirty_flags,
              'current' => (dirty_flags & QUANTITY_STALE_FLAGS).empty?
            }.freeze
          end
          groups = items.group_by { |item| [item[:phase_scope].to_s, item[:classification].to_s, item[:unit].to_s] }
          totals = groups.map do |(phase, classification, unit), values|
            {
              'phase_scope' => phase,
              'classification' => classification,
              'unit' => unit,
              'value' => values.sum { |item| Float(item[:value]) },
              'source_object_ids' => values.map { |item| item[:source_object_id].to_s }.uniq.sort.freeze
            }.freeze
          end.sort_by { |item| [item['phase_scope'], item['classification'], item['unit']] }

          {
            'format' => 'constructflow.extension_construction_takeoff.v1',
            'extension_id' => source.id,
            'object_count' => objects.length,
            'item_count' => items.length,
            'items' => items.freeze,
            'totals' => totals.freeze,
            'coverage' => coverage.freeze,
            'current' => coverage.all? { |entry| entry['current'] == true },
            'stale_object_ids' => coverage.filter_map do |entry|
              entry['object_id'] if entry['current'] == false
            end.sort.freeze
          }.freeze
        end

        private

        def related_objects(source)
          values = [source]
          @runtime.smart_objects.all.each do |object|
            next if object.id == source.id
            values << object if generated_from?(object, source.id)
          end
          values.uniq { |object| object.id }.sort_by { |object| object.id.to_s }.freeze
        end

        def generated_from?(object, extension_id)
          Array(object.relationships).any? do |relationship|
            (relationship['kind'] || relationship[:kind]).to_s == 'generated_from' &&
              (relationship['target_id'] || relationship[:target_id]).to_s == extension_id.to_s
          end
        end

        def quantities_for(object)
          case object.type
          when 'extension.zone'
            definition_items(object, @extension_repository.read(object.entity)) do |definition|
              @extension_provider.quantities(smart_object: object, definition: definition)
            end
          when 'architecture.wall'
            definition_items(object, @architecture_repository.read(object.entity)) do |definition|
              @architecture_provider.quantities(smart_object: object, definition: definition)
            end
          when 'architecture.floor'
            definition_items(object, Architecture::FloorRepository.new.read(object.entity)) do |definition|
              @floor_provider.quantities(smart_object: object, definition: definition)
            end
          when 'architecture.room'
            definition_items(object, Architecture::RoomRepository.new.read(object.entity)) do |definition|
              @room_provider.quantities(smart_object: object, definition: definition)
            end
          when 'architecture.ceiling'
            definition_items(object, Architecture::CeilingRepository.new.read(object.entity)) do |definition|
              @ceiling_provider.quantities(smart_object: object, definition: definition)
            end
          when 'opening.rectangular'
            definition_items(object, @opening_repository.read(object.entity)) do |definition|
              host = @runtime.smart_objects.fetch_by_id(definition.host_object_id)
              @opening_provider.quantities(smart_object: object, definition: definition, host_object: host)
            end
          when 'door_window.instance'
            definition_items(object, @door_window_repository.read(object.entity)) do |definition|
              type = @door_window_types.fetch(definition.type_id)
              @door_window_provider.quantities(smart_object: object, type: type, instance_parameters: definition.parameters)
            end
          when 'structure.column'
            definition_items(object, @structure_repository.read_column(object.entity)) do |definition|
              @structure_provider.column_quantities(smart_object: object, definition: definition)
            end
          when 'structure.beam'
            definition_items(object, @structure_repository.read_beam(object.entity)) do |definition|
              @structure_provider.beam_quantities(smart_object: object, definition: definition)
            end
          when 'structure.foundation'
            definition_items(object, @structure_repository.read_foundation(object.entity)) do |definition|
              @structure_provider.foundation_quantities(smart_object: object, definition: definition)
            end
          when 'structure.rebar_set'
            definition_items(object, @structure_repository.read_rebar_set(object.entity)) do |definition|
              @structure_provider.rebar_quantities(smart_object: object, definition: definition)
            end
          when 'surface.boundary'
            definition_items(object, @surface_repository.read_surface(object.entity)) do |definition|
              @surface_provider.surface_quantities(smart_object: object, definition: definition)
            end
          when 'roof.system'
            definition_items(object, @roof_repository.read_roof(object.entity)) do |definition|
              @roof_provider.roof_quantities(smart_object: object, definition: definition)
            end
          when 'roof.gutter'
            definition_items(object, @roof_repository.read_gutter(object.entity)) do |definition|
              roof_object = @runtime.smart_objects.fetch_by_id(definition.roof_object_id)
              raise ArgumentError, "gutter roof host missing: #{definition.roof_object_id}" unless roof_object
              @roof_provider.gutter_quantities(
                smart_object: object,
                definition: definition,
                roof_object: roof_object,
                edge_capability: @roof_edge_capability
              )
            end
          when 'drainage.pipe_route'
            definition_items(object, @drainage_repository.read_pipe_route(object.entity)) do |definition|
              @drainage_provider.pipe_quantities(smart_object: object, definition: definition)
            end
          when 'drainage.downpipe'
            definition_items(object, @drainage_repository.read_downpipe(object.entity)) do |definition|
              @drainage_provider.downpipe_quantities(smart_object: object, definition: definition)
            end
          when 'drainage.manhole'
            definition_items(object, @drainage_repository.read_manhole(object.entity)) do |definition|
              @drainage_provider.manhole_quantities(smart_object: object, definition: definition)
            end
          when 'interior.cabinet_run'
            definition_items(object, @interior_repository.read_cabinet_run(object.entity)) do |definition|
              @interior_provider.cabinet_quantities(smart_object: object, definition: definition)
            end
          else
            if object.type.to_s.start_with?('electrical.')
              definition_items(object, @electrical_repository.read_device(object.entity)) do |definition|
                @electrical_provider.device_quantities(smart_object: object, definition: definition)
              end
            else
              [[], 'unsupported_type']
            end
          end
        rescue StandardError
          [[], 'provider_error']
        end

        def definition_items(_object, definition)
          return [[], 'missing_definition'] unless definition
          [Array(yield(definition)), 'included']
        end

        def quantity_dirty_flags(object)
          Array(object.respond_to?(:dirty_flags) ? object.dirty_flags : []).map(&:to_s).uniq.sort.freeze
        end
      end
    end
  end
end
