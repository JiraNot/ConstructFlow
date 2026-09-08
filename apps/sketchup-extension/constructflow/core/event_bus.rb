# frozen_string_literal: true

require 'time'

module JiraNot
  module ConstructFlow
    module Core
      class EventBus
        Subscriber = Struct.new(:owner, :versions, :handler, keyword_init: true)

        attr_reader :history_limit

        def initialize(id_generator: IdGenerator.new, diagnostics: nil, history_limit: 200)
          @id_generator = id_generator
          @diagnostics = diagnostics
          @history_limit = Integer(history_limit)
          @subscribers = Hash.new { |hash, key| hash[key] = [] }
          @history = []
        end

        def subscribe(event_type, owner: nil, versions: nil, &handler)
          raise ArgumentError, 'handler block required' unless handler

          subscriber = Subscriber.new(
            owner: owner&.to_s,
            versions: versions.nil? ? nil : Array(versions).map { |version| Integer(version) }.freeze,
            handler: handler
          ).freeze
          @subscribers[event_type.to_s] << subscriber
          subscriber
        end

        def unsubscribe(event_type, subscriber)
          @subscribers[event_type.to_s].delete(subscriber)
        end

        def publish(event_type, payload = {}, source_module: 'constructflow.core', object_ids: [],
                    caused_by_command_id: nil, version: 1, project_id: nil)
          event = {
            event_id: @id_generator.event_id,
            name: event_type.to_s,
            version: Integer(version),
            source_module: source_module.to_s,
            project_id: project_id,
            object_ids: Array(object_ids).map(&:to_s).freeze,
            caused_by_command_id: caused_by_command_id,
            payload: (payload || {}).dup.freeze,
            timestamp: Time.now.utc.iso8601
          }.freeze

          errors = []
          @subscribers[event[:name]].dup.each do |subscriber|
            next if subscriber.versions && !subscriber.versions.include?(event[:version])

            begin
              subscriber.handler.call(event)
            rescue StandardError => error
              failure = {
                owner: subscriber.owner,
                error_class: error.class.name,
                message: error.message
              }.freeze
              errors << failure
              @diagnostics&.error(
                'event_subscriber_failure',
                "Subscriber failed for #{event[:name]}: #{error.message}",
                failure.merge(event_id: event[:event_id])
              )
            end
          end

          record_history(event, errors)
          event.merge(subscriber_errors: errors.freeze).freeze
        end

        def history
          @history.dup.freeze
        end

        private

        def record_history(event, errors)
          @history << { event: event, subscriber_errors: errors.freeze }.freeze
          @history.shift while @history.length > @history_limit
        end
      end
    end
  end
end
