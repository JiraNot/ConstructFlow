# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Structure
      class CoordinationCapability
        CAPABILITY_ID = 'structure.coordination'

        def initialize(repository:)
          @repository = repository
        end

        def compatible?(smart_object)
          smart_object &&
            smart_object.owner_module == 'constructflow.structure' &&
            %w[structure.column structure.foundation].include?(smart_object.type)
        end

        def bounding_box_mm(smart_object)
          raise ArgumentError, 'compatible structural object required' unless compatible?(smart_object)

          definition = definition_for(smart_object)
          definition.bounding_box_mm
        end

        def intersects_box?(smart_object, other_box)
          a = bounding_box_mm(smart_object)
          b = normalize_box(other_box)
          axes = 0..2
          axes.all? do |axis|
            a[:min][axis] <= b[:max][axis] && a[:max][axis] >= b[:min][axis]
          end
        end

        private

        def definition_for(smart_object)
          case smart_object.type
          when 'structure.column'
            @repository.read_column(smart_object.entity)
          when 'structure.foundation'
            @repository.read_foundation(smart_object.entity)
          end || raise(KeyError, 'structural definition missing')
        end

        def normalize_box(value)
          min = value[:min] || value['min']
          max = value[:max] || value['max']
          raise ArgumentError, 'bounding box requires min and max' unless min && max

          {
            min: Array(min).first(3).map { |item| Float(item) },
            max: Array(max).first(3).map { |item| Float(item) }
          }
        end
      end
    end
  end
end
