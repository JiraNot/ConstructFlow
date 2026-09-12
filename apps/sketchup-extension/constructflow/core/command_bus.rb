# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class CommandBus
        Registration = Struct.new(
          :name, :version, :owner_module, :validator, :transaction, :handler,
          keyword_init: true
        )

        attr_accessor :transaction_manager

        def initialize(event_bus:, id_generator: IdGenerator.new, diagnostics: nil, transaction_manager: nil)
          @event_bus = event_bus
          @id_generator = id_generator
          @diagnostics = diagnostics
          @transaction_manager = transaction_manager
          @handlers = {}
        end

        def register(command_type, version: 1, owner_module: 'constructflow.core', validator: nil,
                     transaction: true, &handler)
          raise ArgumentError, 'handler block required' unless handler

          key = [command_type.to_s, Integer(version)]
          raise ArgumentError, "command already registered: #{key.join('@')}" if @handlers.key?(key)

          @handlers[key] = Registration.new(
            name: key[0],
            version: key[1],
            owner_module: owner_module.to_s,
            validator: validator,
            transaction: !!transaction,
            handler: handler
          ).freeze
        end

        def registered?(command_type, version: 1)
          @handlers.key?([command_type.to_s, Integer(version)])
        end

        def execute(command_type, input = {}, version: 1, actor: { kind: 'human' }, project_id: nil,
                    selection: [], options: {})
          registration = @handlers.fetch([command_type.to_s, Integer(version)]) do
            return result_for(
              status: 'rejected',
              command_id: nil,
              errors: ["unknown command: #{command_type}@#{version}"]
            )
          end

          command = {
            command_id: @id_generator.command_id,
            name: registration.name,
            version: registration.version,
            actor: normalize_actor(actor),
            project_id: project_id,
            selection: Array(selection).freeze,
            input: (input || {}).dup.freeze,
            options: (options || {}).dup.freeze
          }.freeze

          validation_errors = validate(registration, command)
          unless validation_errors.empty?
            return result_for(status: 'rejected', command_id: command[:command_id], errors: validation_errors)
          end

          execute_body = lambda do
            raw_result = registration.handler.call(command)
            result = normalize_result(raw_result, command[:command_id])
            return result unless result[:status] == 'success'

            published_events = Array(result[:events]).map do |event_spec|
              publish_event(event_spec, registration, command)
            end
            result.merge(events: published_events.freeze).freeze
          end

          if registration.transaction && @transaction_manager
            @transaction_manager.run("ConstructFlow: #{registration.name}", &execute_body)
          else
            execute_body.call
          end
        rescue StandardError => error
          @diagnostics&.error(
            'command_failed',
            "#{command_type} failed: #{error.message}",
            command: command_type.to_s,
            error_class: error.class.name
          )
          result_for(
            status: 'failed',
            command_id: defined?(command) && command ? command[:command_id] : nil,
            errors: ["#{error.class}: #{error.message}"]
          )
        end

        private

        def normalize_actor(actor)
          value = actor || {}
          kind = (value[:kind] || value['kind'] || 'human').to_s
          raise ArgumentError, "invalid actor kind: #{kind}" unless %w[human ai automation].include?(kind)

          { kind: kind, id: value[:id] || value['id'] }.freeze
        end

        def validate(registration, command)
          return [] unless registration.validator

          value = registration.validator.call(command)
          case value
          when nil, true then []
          when false then ['command validation rejected']
          when String then [value]
          else Array(value).map(&:to_s)
          end
        rescue StandardError => error
          ["validation error: #{error.message}"]
        end

        def normalize_result(value, command_id)
          result = value.nil? ? {} : value
          raise TypeError, 'command handler must return a Hash or nil' unless result.is_a?(Hash)

          result_for(
            status: (result[:status] || result['status'] || 'success').to_s,
            command_id: command_id,
            created_object_ids: result[:created_object_ids] || result['created_object_ids'] || [],
            updated_object_ids: result[:updated_object_ids] || result['updated_object_ids'] || [],
            removed_object_ids: result[:removed_object_ids] || result['removed_object_ids'] || [],
            warnings: result[:warnings] || result['warnings'] || [],
            errors: result[:errors] || result['errors'] || [],
            events: result[:events] || result['events'] || []
          )
        end

        def result_for(status:, command_id:, created_object_ids: [], updated_object_ids: [],
                       removed_object_ids: [], warnings: [], errors: [], events: [])
          {
            status: status.to_s,
            command_id: command_id,
            created_object_ids: Array(created_object_ids).map(&:to_s).freeze,
            updated_object_ids: Array(updated_object_ids).map(&:to_s).freeze,
            removed_object_ids: Array(removed_object_ids).map(&:to_s).freeze,
            warnings: Array(warnings).map(&:to_s).freeze,
            errors: Array(errors).map(&:to_s).freeze,
            events: Array(events).freeze
          }.freeze
        end

        def publish_event(event_spec, registration, command)
          spec = event_spec || {}
          name = spec[:name] || spec['name']
          raise ArgumentError, 'event spec requires name' if name.nil? || name.to_s.empty?

          @event_bus.publish(
            name,
            spec[:payload] || spec['payload'] || {},
            source_module: spec[:source_module] || spec['source_module'] || registration.owner_module,
            object_ids: spec[:object_ids] || spec['object_ids'] || [],
            caused_by_command_id: command[:command_id],
            version: spec[:version] || spec['version'] || 1,
            project_id: command[:project_id]
          )
        end
      end
    end
  end
end
