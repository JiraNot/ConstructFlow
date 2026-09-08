# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Extension
      class BoundaryCapability
        CAPABILITY_ID = 'extension.boundary'

        def initialize(repository:)
          @repository = repository
        end

        def compatible?(smart_object)
          smart_object &&
            smart_object.owner_module == 'constructflow.extension' &&
            smart_object.type == 'extension.zone'
        end

        def definition(smart_object)
          raise ArgumentError, 'compatible extension zone required' unless compatible?(smart_object)

          @repository.read(smart_object.entity) || raise(KeyError, 'extension definition missing')
        end

        def boundary_mm(smart_object)
          definition(smart_object).boundary_mm
        end

        def roof_intent(smart_object)
          definition(smart_object).roof_intent
        end

        def base_level_id(smart_object)
          definition(smart_object).base_level_id
        end

        def target_height_mm(smart_object)
          definition(smart_object).target_height_mm
        end
      end
    end
  end
end
