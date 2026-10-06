# frozen_string_literal: true

require_relative 'entity_guard'
require_relative 'geometry_guard'
require_relative 'host/model_transaction_adapter'

module JiraNot
  module ConstructFlow
    module Core
      class TransactionManager
        attr_reader :model, :adapter

        def initialize(model:, adapter: nil)
          @model = model
          @adapter = adapter || Host::ModelTransactionAdapter.new(model)
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

          @adapter.start_operation(name.to_s, transparent: transparent)
          started_here = true
          @depth = 1
          result = yield
          @adapter.commit_operation
          result
        rescue StandardError
          @adapter.abort_operation if started_here
          raise
        ensure
          @depth = 0 if started_here
        end
      end
    end
  end
end
