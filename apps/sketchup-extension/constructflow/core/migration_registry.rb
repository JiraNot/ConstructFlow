# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class MigrationRegistry
        Migration = Struct.new(:namespace, :from_version, :to_version, :handler, keyword_init: true)

        def initialize
          @migrations = {}
        end

        def register(namespace:, from:, to:, &handler)
          raise ArgumentError, 'migration handler required' unless handler

          source = Integer(from)
          target = Integer(to)
          raise ArgumentError, 'migration must advance exactly one schema version' unless target == source + 1

          key = [namespace.to_s, source, target]
          raise ArgumentError, "migration already registered: #{key.join(':')}" if @migrations.key?(key)

          @migrations[key] = Migration.new(
            namespace: namespace.to_s,
            from_version: source,
            to_version: target,
            handler: handler
          ).freeze
        end

        def migrate(namespace:, payload:, from_version:, to_version:)
          source = Integer(from_version)
          target = Integer(to_version)
          raise ArgumentError, 'target version cannot be older than source version' if target < source

          value = deep_copy(payload)
          current = source

          while current < target
            migration = @migrations.fetch([namespace.to_s, current, current + 1]) do
              raise KeyError, "missing migration #{namespace} v#{current}->v#{current + 1}"
            end
            value = migration.handler.call(value)
            current += 1
          end

          value
        end

        def registered?(namespace:, from:, to:)
          @migrations.key?([namespace.to_s, Integer(from), Integer(to)])
        end

        private

        def deep_copy(value)
          Marshal.load(Marshal.dump(value))
        end
      end
    end
  end
end
