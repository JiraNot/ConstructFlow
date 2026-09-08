# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class LevelRegistry
        Level = Struct.new(:id, :name, :kind, :elevation, keyword_init: true)

        def initialize
          @levels = {}
        end

        def register(id:, name:, kind:, elevation:)
          key = id.to_s
          raise ArgumentError, "level already exists: #{key}" if @levels.key?(key)

          @levels[key] = Level.new(
            id: key,
            name: name.to_s,
            kind: kind.to_s,
            elevation: Float(elevation)
          ).freeze
        end

        def update(id, name: nil, kind: nil, elevation: nil)
          key = id.to_s
          current = @levels.fetch(key)

          @levels[key] = Level.new(
            id: current.id,
            name: name.nil? ? current.name : name.to_s,
            kind: kind.nil? ? current.kind : kind.to_s,
            elevation: elevation.nil? ? current.elevation : Float(elevation)
          ).freeze
        end

        def fetch(id)
          @levels.fetch(id.to_s)
        end

        def each(&block)
          @levels.values.sort_by(&:elevation).each(&block)
        end

        def size
          @levels.size
        end
      end
    end
  end
end
