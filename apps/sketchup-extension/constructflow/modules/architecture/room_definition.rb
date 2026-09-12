# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class RoomDefinition
        SCHEMA_VERSION = 1

        attr_reader :boundary_mm, :level_id, :name, :number, :program, :usage, :finish_metadata

        def initialize(boundary_mm:, level_id: nil, name: '', number: '', program: 'generic', usage: nil, finish_metadata: {})
          @boundary_mm = normalize_boundary(boundary_mm).freeze
          @level_id = level_id&.to_s
          @name = name.to_s
          @number = number.to_s
          @program = program.to_s
          @usage = usage&.to_s
          @finish_metadata = (finish_metadata || {}).each_with_object({}) { |(key, value), result| result[key.to_s] = value }.freeze
          freeze
        end

        def errors
          result = []
          result << 'room boundary requires at least three points' if boundary_mm.length < 3
          result << 'room boundary area must be greater than zero' if boundary_mm.length >= 3 && area_mm2 <= 1.0
          result << 'room name or number is required' if name.strip.empty? && number.strip.empty?
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def area_mm2
          return 0.0 if boundary_mm.length < 3

          boundary_mm.each_with_index.sum do |point, index|
            nxt = boundary_mm[(index + 1) % boundary_mm.length]
            (point[0] * nxt[1]) - (nxt[0] * point[1])
          end.abs / 2.0
        end

        def perimeter_mm
          return 0.0 if boundary_mm.length < 2

          boundary_mm.each_with_index.sum do |point, index|
            nxt = boundary_mm[(index + 1) % boundary_mm.length]
            Math.sqrt(((nxt[0] - point[0])**2) + ((nxt[1] - point[1])**2))
          end
        end

        def with(boundary_mm: self.boundary_mm, level_id: self.level_id, name: self.name, number: self.number,
                 program: self.program, usage: self.usage, finish_metadata: self.finish_metadata)
          self.class.new(
            boundary_mm: boundary_mm, level_id: level_id, name: name, number: number,
            program: program, usage: usage, finish_metadata: finish_metadata
          )
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION, 'boundary_mm' => boundary_mm, 'level_id' => level_id,
            'name' => name, 'number' => number, 'program' => program, 'usage' => usage,
            'finish_metadata' => finish_metadata
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            boundary_mm: data['boundary_mm'] || data[:boundary_mm] || [],
            level_id: data['level_id'] || data[:level_id], name: data['name'] || data[:name] || '',
            number: data['number'] || data[:number] || '', program: data['program'] || data[:program] || 'generic',
            usage: data['usage'] || data[:usage], finish_metadata: data['finish_metadata'] || data[:finish_metadata] || {}
          )
        end

        private

        def normalize_boundary(values)
          points = Array(values).map do |point|
            item = Array(point)
            raise ArgumentError, 'room point requires x, y, z' unless item.length >= 3

            [Float(item[0]), Float(item[1]), Float(item[2])].freeze
          end
          points.pop if points.length > 1 && points.first == points.last
          points
        end
      end
    end
  end
end
