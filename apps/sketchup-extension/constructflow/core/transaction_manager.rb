# frozen_string_literal: true

require_relative 'entity_guard'
require_relative 'geometry_guard'

module JiraNot
  module ConstructFlow
    module Core
      class TransactionManager
        def initialize(model:)
          @model = model
          @depth = 0
        end

        def run(name, transparent: false)
          if @depth.positive?
            @depth += 1
            begin
              return yield
            ensure
              @depth -= 1
            end
          end

          @model.start_operation(name.to_s, true, false, transparent)
          started_here = true
          @depth = 1
          result = yield
          @model.commit_operation
          result
        rescue StandardError
          @model.abort_operation if started_here
          raise
        ensure
          @depth = 0 if started_here
        end
      end
    end
  end
end
