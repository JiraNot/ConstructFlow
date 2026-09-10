# frozen_string_literal: true

require_relative 'entity_guard'
require_relative 'geometry_guard'

module JiraNot
  module ConstructFlow
    module Core
      class TransactionManager
        def initialize(model:)
          @model = model
        end

        def run(name, transparent: false)
          @model.start_operation(name.to_s, true, false, transparent)
          result = yield
          @model.commit_operation
          result
        rescue StandardError
          @model.abort_operation
          raise
        end
      end
    end
  end
end
