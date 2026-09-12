# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Structure
      class GridDefinition
        SCHEMA_VERSION = 1

        attr_reader :name, :path_mm, :level_id, :offset_mm

        def initialize(name:, path_mm:, level_id: nil, offset_mm: 0)
          @name = name.to_s.strip
          @path_mm = normalize_path(path_mm).freeze
          @level_id = level_id&.to_s
          @offset_mm = Float(offset_mm)
          freeze
        end

        def errors
          result = []
          result << 'grid name required' if name.empty?
          result << 'grid requires exactly two points' unless path_mm.length == 2
          result << 'grid path contains zero length' if path_mm.length == 2 && path_mm.first == path_mm.last
          result
        end

        def valid?
          errors.empty?
        end

        def with(name: self.name, path_mm: self.path_mm, level_id: self.level_id, offset_mm: self.offset_mm)
          self.class.new(name: name, path_mm: path_mm, level_id: level_id, offset_mm: offset_mm)
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'name' => name,
            'path_mm' => path_mm,
            'level_id' => level_id,
            'offset_mm' => offset_mm
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            name: data['name'] || data[:name] || 'Grid',
            path_mm: data['path_mm'] || data[:path_mm] || [],
            level_id: data['level_id'] || data[:level_id],
            offset_mm: data['offset_mm'] || data[:offset_mm] || 0
          )
        end

        private

        def normalize_path(value)
          Array(value).map do |point|
            values = Array(point)
            raise ArgumentError, 'grid point requires x, y, z' unless values.length >= 3

            [Float(values[0]), Float(values[1]), Float(values[2])].freeze
          end
        end
      end
    end
  end
end
