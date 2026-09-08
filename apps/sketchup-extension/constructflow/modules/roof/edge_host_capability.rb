# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Roof
      class EdgeHostCapability
        CAPABILITY_ID = 'roof.edge_host'

        def initialize(repository:)
          @repository = repository
        end

        def compatible?(smart_object)
          smart_object &&
            smart_object.owner_module == 'constructflow.roof' &&
            smart_object.type == 'roof.system'
        end

        def definition(smart_object)
          raise ArgumentError, 'compatible roof object required' unless compatible?(smart_object)

          @repository.read_roof(smart_object.entity) || raise(KeyError, 'roof definition missing')
        end

        def edge_points_mm(smart_object, edge_index)
          definition(smart_object).edge_points_mm(edge_index)
        end

        def edge_length_mm(smart_object, edge_index)
          a, b = edge_points_mm(smart_object, edge_index)
          dx = b[0] - a[0]
          dy = b[1] - a[1]
          dz = b[2] - a[2]
          Math.sqrt((dx * dx) + (dy * dy) + (dz * dz))
        end

        def point_on_edge_mm(smart_object, edge_index, ratio)
          value = Float(ratio)
          raise ArgumentError, 'edge ratio must be between 0 and 1' unless value.between?(0.0, 1.0)

          a, b = edge_points_mm(smart_object, edge_index)
          [
            a[0] + ((b[0] - a[0]) * value),
            a[1] + ((b[1] - a[1]) * value),
            a[2] + ((b[2] - a[2]) * value)
          ].freeze
        end
      end
    end
  end
end
