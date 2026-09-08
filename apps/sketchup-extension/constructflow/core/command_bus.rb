# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class CommandBus
        def initialize(event_bus:)
          @event_bus = event_bus
          @handlers = {}
        end

        def register(command_type, &handler)
          raise ArgumentError, 'handler block required' unless handler

          key = command_type.to_s
          raise ArgumentError, "command already registered: #{key}" if @handlers.key?(key)

          @handlers[key] = handler
        end

        def execute(command_type, payload = {})
          key = command_type.to_s
          handler = @handlers.fetch(key) do
            raise KeyError, "unknown command: #{key}"
          end

          result = handler.call(payload)
          @event_bus.publish('CommandExecuted', command_type: key, result: result)
          result
        end
      end
    end
  end
end
