# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class RepresentationRegistry
        KINDS = %w[model_3d plan elevation section detail annotation schedule].freeze
        POLICIES = %w[persistent on_demand].freeze

        ProviderEntry = Struct.new(
          :object_type, :kind, :owner_module, :policy, :provider, :metadata,
          keyword_init: true
        )

        def initialize(diagnostics: nil)
          @diagnostics = diagnostics
          @providers = {}
        end

        def register(object_type:, kind:, owner_module:, provider:, policy: 'on_demand', metadata: {})
          object_type = object_type.to_s
          kind = kind.to_s
          owner_module = owner_module.to_s
          policy = policy.to_s

          raise ArgumentError, 'object_type required' if object_type.empty?
          raise ArgumentError, "unsupported representation kind: #{kind}" unless KINDS.include?(kind)
          raise ArgumentError, 'owner_module must be namespaced under constructflow.' unless owner_module.start_with?('constructflow.')
          raise ArgumentError, "unsupported representation policy: #{policy}" unless POLICIES.include?(policy)
          raise ArgumentError, 'provider must respond to render' unless provider.respond_to?(:render)

          key = provider_key(object_type, kind)
          raise ArgumentError, "representation provider already registered: #{object_type}/#{kind}" if @providers.key?(key)

          entry = ProviderEntry.new(
            object_type: object_type,
            kind: kind,
            owner_module: owner_module,
            policy: policy,
            provider: provider,
            metadata: stringify_keys(metadata || {}).freeze
          ).freeze
          @providers[key] = entry
          @diagnostics&.info(
            'representation_provider_registered',
            "Registered #{object_type}/#{kind} representation provider",
            owner_module: owner_module,
            policy: policy
          )
          entry
        end

        def registered?(object_type, kind)
          @providers.key?(provider_key(object_type, kind))
        end

        def fetch(object_type, kind)
          @providers[provider_key(object_type, kind)]
        end

        def available_for(object_type)
          @providers.values
                    .select { |entry| entry.object_type == object_type.to_s }
                    .sort_by(&:kind)
                    .map do |entry|
            {
              'kind' => entry.kind,
              'owner_module' => entry.owner_module,
              'policy' => entry.policy,
              'metadata' => entry.metadata
            }.freeze
          end.freeze
        end

        def render(object:, kind:, view: nil, scale: nil, phase_view: nil, lod: nil, context: {})
          raise ArgumentError, 'smart object required' if object.nil?

          object_type = object.respond_to?(:type) ? object.type : nil
          object_id = object.respond_to?(:id) ? object.id : nil
          raise ArgumentError, 'smart object type required' if object_type.to_s.empty?
          raise ArgumentError, 'smart object id required' if object_id.to_s.empty?

          entry = fetch(object_type, kind)
          raise KeyError, "no representation provider for #{object_type}/#{kind}" unless entry

          request = {
            'kind' => entry.kind,
            'view' => view&.to_s,
            'scale' => scale,
            'phase_view' => phase_view&.to_s,
            'lod' => lod,
            'context' => stringify_keys(context || {})
          }.freeze

          payload = entry.provider.render(object: object, request: request)
          normalize_result(object, entry, payload)
        rescue StandardError => error
          @diagnostics&.error(
            'representation_render_failed',
            error.message,
            object_id: object_id,
            object_type: object_type,
            kind: kind.to_s
          )
          raise
        end

        def size
          @providers.size
        end

        private

        def provider_key(object_type, kind)
          [object_type.to_s, kind.to_s].freeze
        end

        def normalize_result(object, entry, payload)
          value = stringify_keys(payload || {})
          {
            'object_id' => object.id.to_s,
            'object_type' => object.type.to_s,
            'kind' => entry.kind,
            'owner_module' => entry.owner_module,
            'policy' => entry.policy,
            'source_lifecycle' => lifecycle_payload(object).freeze,
            'geometry_refs' => Array(value['geometry_refs']).freeze,
            'primitives' => Array(value['primitives']).freeze,
            'annotations' => Array(value['annotations']).freeze,
            'metadata' => stringify_keys(value['metadata'] || {}).freeze
          }.freeze
        end

        def lifecycle_payload(object)
          {
            'created_phase' => (object.respond_to?(:created_phase) ? object.created_phase : nil)&.to_s,
            'removed_phase' => (object.respond_to?(:removed_phase) ? object.removed_phase : nil)&.to_s,
            'status' => (object.respond_to?(:status) ? object.status : nil)&.to_s,
            'source_state' => (object.respond_to?(:source_state) ? object.source_state : nil)&.to_s
          }
        end

        def stringify_keys(value)
          case value
          when Hash
            value.each_with_object({}) { |(key, item), result| result[key.to_s] = stringify_keys(item) }
          when Array
            value.map { |item| stringify_keys(item) }
          else
            value
          end
        end
      end
    end
  end
end
