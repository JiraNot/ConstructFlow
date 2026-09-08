# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Interior
      class JoineryPartSetDefinition
        SCHEMA_VERSION = 1
        GENERATOR_VERSION = 1

        attr_reader :cabinet_object_id, :parts, :hardware, :generator_version

        def initialize(cabinet_object_id:, parts:, hardware: [], generator_version: GENERATOR_VERSION)
          @cabinet_object_id = cabinet_object_id.to_s
          @parts = normalize_records(parts).freeze
          @hardware = normalize_records(hardware).freeze
          @generator_version = Integer(generator_version)
          freeze
        end

        def errors
          result = []
          result << 'cabinet object id required' if cabinet_object_id.empty?
          result << 'generator version must be positive' unless generator_version.positive?
          ids = parts.map { |part| part['id'] }
          result << 'joinery part ids must be unique' unless ids.uniq.length == ids.length
          parts.each do |part|
            result << "part #{part['id']} requires positive length" unless Float(part['length_mm'] || 0).positive?
            result << "part #{part['id']} requires positive width" unless Float(part['width_mm'] || 0).positive?
            result << "part #{part['id']} requires positive thickness" unless Float(part['thickness_mm'] || 0).positive?
            result << "part #{part['id']} material required" if part['material_id'].to_s.empty?
          end
          result.freeze
        rescue ArgumentError, TypeError
          ['invalid joinery part data'].freeze
        end

        def valid?
          errors.empty?
        end

        def part_count
          parts.sum { |part| Integer(part['quantity'] || 1) }
        end

        def board_parts
          parts.reject { |part| %w[glass mirror].include?(part['material_class'].to_s) }.freeze
        end

        def glass_parts
          parts.select { |part| part['material_class'].to_s == 'glass' }.freeze
        end

        def board_area_mm2
          board_parts.sum do |part|
            Float(part['length_mm']) * Float(part['width_mm']) * Integer(part['quantity'] || 1)
          end
        end

        def glass_area_mm2
          glass_parts.sum do |part|
            Float(part['length_mm']) * Float(part['width_mm']) * Integer(part['quantity'] || 1)
          end
        end

        def edge_band_length_mm
          parts.sum do |part|
            edge_lengths = part.fetch('edge_band_mm', {})
            edge_lengths.values.sum { |length| Float(length) } * Integer(part['quantity'] || 1)
          end
        end

        def hardware_count(kind = nil)
          selected = kind.nil? ? hardware : hardware.select { |item| item['kind'] == kind.to_s }
          selected.sum { |item| Integer(item['quantity'] || 0) }
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'cabinet_object_id' => cabinet_object_id,
            'parts' => parts,
            'hardware' => hardware,
            'generator_version' => generator_version
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            cabinet_object_id: data['cabinet_object_id'] || data[:cabinet_object_id],
            parts: data['parts'] || data[:parts] || [],
            hardware: data['hardware'] || data[:hardware] || [],
            generator_version: data['generator_version'] || data[:generator_version] || GENERATOR_VERSION
          )
        end

        private

        def normalize_records(values)
          Array(values).map { |record| normalize_hash(record).freeze }
        end

        def normalize_hash(value)
          value.each_with_object({}) do |(key, item), result|
            result[key.to_s] = case item
                               when Hash then normalize_hash(item).freeze
                               when Array then item.map { |entry| entry.is_a?(Hash) ? normalize_hash(entry).freeze : entry }.freeze
                               else item
                               end
          end
        end
      end
    end
  end
end
