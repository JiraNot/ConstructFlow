# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class EventBus
        def initialize
          @subscribers = Hash.new { |hash, key| hash[key] = [] }
        end

        def subscribe(event_type, &handler)
          raise ArgumentError, 'handler block required' unless handler

          @subscribers[event_type.to_s] << handler
          handler
        end

        def publish(event_type, payload = {})
          event = {
            type: event_type.to_s,
            payload: payload.freeze
          }.freeze

          @subscribers[event[:type]].each { |handler| handler.call(event) }
          event
        end
      end
    end
  end
end
