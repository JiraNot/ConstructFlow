# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Library
      class PlacedAssetRepository
        DICTIONARY = 'constructflow.library'
        KEY = 'placed_asset_definition'

        def read(entity)
          payload = Core::AttributeStore.new(entity).read_json(KEY, nil, dictionary: DICTIONARY)
          payload ? PlacedAssetDefinition.from_h(payload) : nil
        end

        def write(entity, definition)
          raise ArgumentError, 'PlacedAssetDefinition required' unless definition.is_a?(PlacedAssetDefinition)
          Core::AttributeStore.new(entity).write_json(KEY, definition.to_h, dictionary: DICTIONARY)
          definition
        end
      end
    end
  end
end
