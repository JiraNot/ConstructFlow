# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Extension
      # Produces a deterministic dependency plan for an extension zone.
      # It does not create geometry; domain modules consume the intents independently.
      class CoordinationPlan
        MODULES = %w[structure surface roof drainage electrical interior].freeze

        attr_reader :extension_id, :intents

        def initialize(extension_id:, intents: {})
          @extension_id = extension_id.to_s
          @intents = normalize(intents).freeze
          freeze
        end

        def modules
          @intents.keys.sort.freeze
        end

        def intent_for(module_id)
          @intents[module_id.to_s]
        end

        def affected?(module_id)
          @intents.key?(module_id.to_s)
        end

        def to_h
          { 'extension_id' => extension_id, 'intents' => intents }
        end

        def self.from_definition(extension_id:, definition:)
          boundary = definition.boundary_mm
          {
            'structure' => {
              'boundary_mm' => boundary,
              'base_level_id' => definition.base_level_id,
              'base_offset_mm' => definition.base_offset_mm,
              'foundation_intent' => 'derive_from_extension'
            },
            'surface' => {
              'boundary_mm' => boundary,
              'base_level_id' => definition.base_level_id,
              'base_offset_mm' => definition.base_offset_mm,
              'slope_intent' => 'coordinate_with_drainage'
            },
            'roof' => {
              'boundary_mm' => boundary,
              'roof_intent' => definition.roof_intent,
              'target_height_mm' => definition.target_height_mm,
              'attachment_host_id' => definition.attachment_host_id
            },
            'drainage' => {
              'boundary_mm' => boundary,
              'roof_rainwater' => true,
              'surface_drainage' => true
            },
            'electrical' => {
              'boundary_mm' => boundary,
              'program' => definition.program
            },
            'interior' => {
              'boundary_mm' => boundary,
              'program' => definition.program
            }
          }.then { |intents| new(extension_id: extension_id, intents: intents) }
        end

        private

        def normalize(value)
          raise ArgumentError, 'coordination intents must be a Hash' unless value.is_a?(Hash)

          value.each_with_object({}) do |(module_id, intent), result|
            key = module_id.to_s
            raise ArgumentError, "unsupported coordination module: #{key}" unless MODULES.include?(key)
            raise ArgumentError, "intent for #{key} must be a Hash" unless intent.is_a?(Hash)
            result[key] = deep_copy(intent)
          end
        end

        def deep_copy(value)
          case value
          when Hash
            value.each_with_object({}) { |(key, item), result| result[key.to_s] = deep_copy(item) }
          when Array
            value.map { |item| deep_copy(item) }
          else
            value
          end
        end
      end
    end
  end
end
