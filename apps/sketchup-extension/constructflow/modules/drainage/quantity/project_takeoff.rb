# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      module Quantity
        class ProjectTakeoff
          def initialize(runtime:, repository: Repository.new, provider: DrainageQuantityProvider.new)
            @runtime = runtime
            @repository = repository
            @provider = provider
          end

          def build
            items = drainage_objects.flat_map { |object| quantities_for(object) }
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
              'provider' => DrainageQuantityProvider::PROVIDER_ID,
              'item_count' => items.length,
              'items' => items.freeze,
              'totals' => totals.freeze
            }.freeze
          end

          private

          def drainage_objects
            @runtime.smart_objects.all.select { |object| object.owner_module == 'constructflow.drainage' }
          end

          def quantities_for(object)
            case object.type
            when 'drainage.pipe_route'
              definition = @repository.read_pipe_route(object.entity)
              definition ? @provider.pipe_quantities(smart_object: object, definition: definition) : []
            when 'drainage.manhole'
              definition = @repository.read_manhole(object.entity)
              definition ? @provider.manhole_quantities(smart_object: object, definition: definition) : []
            else []
            end
          end
        end
      end
    end
  end
end
