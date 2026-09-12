# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class LevelRegistry
        SOURCE_STATES = %w[measured confirmed assumed unknown verify_on_site].freeze

        Level = Struct.new(:id, :name, :kind, :elevation_mm, :source_state, keyword_init: true) do
          def elevation
            elevation_mm
          end

          def to_h
            {
              'id' => id,
              'name' => name,
              'kind' => kind,
              'elevation_mm' => elevation_mm,
              'source_state' => source_state
            }
          end
        end

        def initialize(project_store: nil)
          @project_store = project_store
          @levels = {}
          load_persisted!
        end

        def register(id:, name:, kind:, elevation: nil, elevation_mm: nil, source_state: 'confirmed')
          key = normalize_id(id)
          raise ArgumentError, "level already exists: #{key}" if @levels.key?(key)

          state = source_state.to_s
          raise ArgumentError, "invalid source_state: #{state}" unless SOURCE_STATES.include?(state)

          value = elevation_mm.nil? ? elevation : elevation_mm
          numeric_elevation = value.nil? ? nil : Float(value)

          level = Level.new(
            id: key,
            name: name.to_s,
            kind: kind.to_s,
            elevation_mm: numeric_elevation,
            source_state: state
          ).freeze

          @levels[key] = level
          persist!
          level
        end

        def update(id, name: nil, kind: nil, elevation: nil, elevation_mm: nil, source_state: nil)
          key = normalize_id(id)
          current = @levels.fetch(key)

          next_state = source_state.nil? ? current.source_state : source_state.to_s
          raise ArgumentError, "invalid source_state: #{next_state}" unless SOURCE_STATES.include?(next_state)

          requested_elevation = elevation_mm.nil? ? elevation : elevation_mm
          next_elevation = requested_elevation.nil? ? current.elevation_mm : Float(requested_elevation)

          @levels[key] = Level.new(
            id: current.id,
            name: name.nil? ? current.name : name.to_s,
            kind: kind.nil? ? current.kind : kind.to_s,
            elevation_mm: next_elevation,
            source_state: next_state
          ).freeze

          persist!
          @levels[key]
        end

        def delete(id)
          removed = @levels.delete(normalize_id(id))
          persist! if removed
          removed
        end

        def fetch(id)
          @levels.fetch(normalize_id(id))
        end

        def registered?(id)
          @levels.key?(normalize_id(id))
        end

        def each(&block)
          return enum_for(:each) unless block

          @levels.values.sort_by { |level| level.elevation_mm || Float::INFINITY }.each(&block)
        end

        def size
          @levels.size
        end

        def to_a
          each.map(&:to_h)
        end

        def ids
          each.map(&:id).freeze
        end

        private

        def normalize_id(value)
          key = value.to_s.strip
          raise ArgumentError, 'level id required' if key.empty?

          key
        end

        def load_persisted!
          return unless @project_store

          Array(@project_store.levels).each do |record|
            id = record['id'] || record[:id]
            next if id.nil? || id.to_s.empty?

            @levels[id.to_s] = Level.new(
              id: id.to_s,
              name: (record['name'] || record[:name]).to_s,
              kind: (record['kind'] || record[:kind]).to_s,
              elevation_mm: numeric_or_nil(record['elevation_mm'] || record[:elevation_mm] || record['elevation'] || record[:elevation]),
              source_state: (record['source_state'] || record[:source_state] || 'confirmed').to_s
            ).freeze
          end
        end

        def numeric_or_nil(value)
          value.nil? ? nil : Float(value)
        end

        def persist!
          @project_store.levels = to_a if @project_store
        end
      end
    end
  end
end
