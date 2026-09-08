# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class CapabilityRegistry
        Record = Struct.new(:id, :owner_module, :provider, keyword_init: true)

        def initialize(diagnostics: nil)
          @diagnostics = diagnostics
          @records = {}
        end

        def register(capability_id, owner_module:, provider:)
          id = capability_id.to_s.strip
          owner = owner_module.to_s.strip
          raise ArgumentError, 'capability id required' if id.empty?
          raise ArgumentError, 'owner module required' if owner.empty?
          raise ArgumentError, "capability already registered: #{id}" if @records.key?(id)
          raise ArgumentError, 'provider required' if provider.nil?

          @records[id] = Record.new(id: id, owner_module: owner, provider: provider).freeze
        rescue StandardError => error
          @diagnostics&.error('capability_registration_failed', error.message, capability: capability_id)
          raise
        end

        def fetch(capability_id)
          @records.fetch(capability_id.to_s).provider
        end

        def record(capability_id)
          @records.fetch(capability_id.to_s)
        end

        def available?(capability_id)
          @records.key?(capability_id.to_s)
        end

        def unregister(capability_id)
          @records.delete(capability_id.to_s)
        end

        def unregister_owner(owner_module)
          owner = owner_module.to_s
          removed = @records.select { |_id, record| record.owner_module == owner }.keys
          removed.each { |id| @records.delete(id) }
          removed.freeze
        end

        def size
          @records.size
        end

        def ids
          @records.keys.sort.freeze
        end
      end
    end
  end
end
