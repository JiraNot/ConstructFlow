# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class DrawingViewPresetRegistry
        Preset = Struct.new(:id, :name, :drawing_family, :scale, :phase_view, :lod, :tag_name, :scene_name, :context, keyword_init: true)

        def initialize
          @presets = {}
        end

        def register(id:, name:, drawing_family:, scale:, phase_view:, lod:, tag_name:, scene_name:, context: {})
          key = id.to_s
          raise ArgumentError, 'preset id required' if key.empty?
          raise ArgumentError, "drawing view preset already registered: #{key}" if @presets.key?(key)

          preset = Preset.new(
            id: key, name: name.to_s, drawing_family: drawing_family.to_s,
            scale: scale.to_s, phase_view: phase_view.to_s, lod: lod.to_s,
            tag_name: tag_name.to_s, scene_name: scene_name.to_s,
            context: stringify_keys(context || {}).freeze
          ).freeze
          @presets[key] = preset
        end

        def fetch(id)
          @presets[id.to_s]
        end

        def fetch!(id)
          fetch(id) || raise(KeyError, "drawing view preset not found: #{id}")
        end

        def all
          @presets.values.sort_by(&:id).freeze
        end

        def size
          @presets.size
        end

        private

        def stringify_keys(value)
          return value unless value.is_a?(Hash)
          value.each_with_object({}) { |(key, item), result| result[key.to_s] = item.is_a?(Hash) ? stringify_keys(item) : item }
        end
      end
    end
  end
end
