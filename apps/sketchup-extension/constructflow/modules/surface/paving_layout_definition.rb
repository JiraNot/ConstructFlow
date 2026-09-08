# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Surface
      class PavingLayoutDefinition
        SCHEMA_VERSION = 1
        SOLVER_VERSION = 1
        STATUSES = %w[solved unsupported failed].freeze

        attr_reader :surface_object_id, :pattern_object_id, :pattern, :status,
                    :pieces, :warnings, :solver_version, :generated_at_version

        def initialize(surface_object_id:, pattern_object_id:, pattern:, status: 'solved',
                       pieces: [], warnings: [], solver_version: SOLVER_VERSION,
                       generated_at_version: 1)
          @surface_object_id = surface_object_id.to_s
          @pattern_object_id = pattern_object_id.to_s
          @pattern = pattern.to_s
          @status = status.to_s
          @pieces = normalize_pieces(pieces).freeze
          @warnings = Array(warnings).map(&:to_s).freeze
          @solver_version = Integer(solver_version)
          @generated_at_version = Integer(generated_at_version)
          freeze
        end

        def errors
          result = []
          result << 'surface object id required' if surface_object_id.empty?
          result << 'pattern object id required' if pattern_object_id.empty?
          result << 'unsupported paving layout status' unless STATUSES.include?(status)
          result << 'solver version must be positive' unless solver_version.positive?
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def solved?
          status == 'solved'
        end

        def full_pieces
          pieces.select { |piece| piece['classification'] == 'full' }.freeze
        end

        def cut_pieces
          pieces.select { |piece| piece['classification'] == 'cut' }.freeze
        end

        def piece_count
          pieces.length
        end

        def full_count
          full_pieces.length
        end

        def cut_count
          cut_pieces.length
        end

        def visible_area_mm2
          pieces.sum { |piece| Float(piece['visible_area_mm2'] || 0) }
        end

        def nominal_area_mm2
          pieces.sum { |piece| Float(piece['nominal_area_mm2'] || 0) }
        end

        def cut_waste_area_mm2
          pieces.sum do |piece|
            next 0.0 unless piece['classification'] == 'cut'
            [Float(piece['nominal_area_mm2'] || 0) - Float(piece['visible_area_mm2'] || 0), 0.0].max
          end
        end

        def minimum_cut_violations
          pieces.select { |piece| piece['minimum_cut_violation'] }.freeze
        end

        def coverage_ratio(surface_net_area_mm2)
          area = Float(surface_net_area_mm2)
          return 0.0 if area <= 0
          visible_area_mm2 / area
        end

        def summary(surface_net_area_mm2: nil)
          result = {
            status: status,
            piece_count: piece_count,
            full_count: full_count,
            cut_count: cut_count,
            visible_area_mm2: visible_area_mm2,
            nominal_area_mm2: nominal_area_mm2,
            cut_waste_area_mm2: cut_waste_area_mm2,
            minimum_cut_violations: minimum_cut_violations.length,
            solver_version: solver_version
          }
          result[:coverage_ratio] = coverage_ratio(surface_net_area_mm2) if surface_net_area_mm2
          result.freeze
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'surface_object_id' => surface_object_id,
            'pattern_object_id' => pattern_object_id,
            'pattern' => pattern,
            'status' => status,
            'pieces' => pieces,
            'warnings' => warnings,
            'solver_version' => solver_version,
            'generated_at_version' => generated_at_version
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            surface_object_id: data['surface_object_id'] || data[:surface_object_id],
            pattern_object_id: data['pattern_object_id'] || data[:pattern_object_id],
            pattern: data['pattern'] || data[:pattern] || 'grid',
            status: data['status'] || data[:status] || 'solved',
            pieces: data['pieces'] || data[:pieces] || [],
            warnings: data['warnings'] || data[:warnings] || [],
            solver_version: data['solver_version'] || data[:solver_version] || SOLVER_VERSION,
            generated_at_version: data['generated_at_version'] || data[:generated_at_version] || 1
          )
        end

        private

        def normalize_pieces(values)
          Array(values).map do |piece|
            normalized = piece.each_with_object({}) { |(key, value), hash| hash[key.to_s] = normalize_value(value) }
            normalized.freeze
          end
        end

        def normalize_value(value)
          case value
          when Hash
            value.each_with_object({}) { |(key, item), hash| hash[key.to_s] = normalize_value(item) }.freeze
          when Array
            value.map { |item| normalize_value(item) }.freeze
          else
            value
          end
        end
      end
    end
  end
end
