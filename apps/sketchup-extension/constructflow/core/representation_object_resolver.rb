# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module RepresentationObjectResolver
        DICTIONARY = 'constructflow.representation'

        module_function

        def resolve(runtime, entity)
          object = runtime.smart_objects.fetch(entity)
          return object if object
          return nil unless entity.respond_to?(:get_attribute)

          source_id = entity.get_attribute(DICTIONARY, 'source_object_id', nil)
          source_id.to_s.empty? ? nil : runtime.smart_objects.fetch_by_id(source_id)
        end
      end
    end
  end
end
