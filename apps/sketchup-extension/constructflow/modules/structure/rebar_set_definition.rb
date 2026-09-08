# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Structure
      class RebarSetDefinition
        SCHEMA_VERSION = 1
        STEEL_DENSITY_KG_M3 = 7850.0
        ROLES = %w[main_top main_bottom side stirrup tie distribution custom].freeze

        attr_reader :host_object_id, :bar_grade, :diameter_mm, :bar_count,
                    :length_each_mm, :role, :shape_code, :cover_mm,
                    :engineering_status

        def initialize(host_object_id:, diameter_mm:, bar_count:, length_each_mm:,
                       bar_grade: 'SD40', role: 'main_bottom', shape_code: '00',
                       cover_mm: 40, engineering_status: 'preliminary')
          @host_object_id = host_object_id.to_s
          @diameter_mm = Float(diameter_mm)
          @bar_count = Integer(bar_count)
          @length_each_mm = Float(length_each_mm)
          @bar_grade = bar_grade.to_s
          @role = role.to_s
          @shape_code = shape_code.to_s
          @cover_mm = Float(cover_mm)
          @engineering_status = engineering_status.to_s
          freeze
        end

        def errors
          result = []
          result << 'rebar host object id required' if host_object_id.empty?
          result << 'rebar diameter must be greater than zero' unless diameter_mm.positive?
          result << 'rebar count must be greater than zero' unless bar_count.positive?
          result << 'rebar length must be greater than zero' unless length_each_mm.positive?
          result << 'rebar cover cannot be negative' if cover_mm.negative?
          result << 'unsupported rebar role' unless ROLES.include?(role)
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def total_length_mm
          length_each_mm * bar_count
        end

        def unit_mass_kg_per_m
          area_m2 = Math::PI * ((diameter_mm / 2000.0)**2)
          area_m2 * STEEL_DENSITY_KG_M3
        end

        def total_mass_kg
          unit_mass_kg_per_m * (total_length_mm / 1000.0)
        end

        def bbs_row
          {
            host_object_id: host_object_id,
            bar_grade: bar_grade,
            diameter_mm: diameter_mm,
            bar_count: bar_count,
            length_each_mm: length_each_mm,
            total_length_m: total_length_mm / 1000.0,
            unit_mass_kg_per_m: unit_mass_kg_per_m,
            total_mass_kg: total_mass_kg,
            role: role,
            shape_code: shape_code,
            engineering_status: engineering_status
          }.freeze
        end

        def with(host_object_id: self.host_object_id, diameter_mm: self.diameter_mm,
                 bar_count: self.bar_count, length_each_mm: self.length_each_mm,
                 bar_grade: self.bar_grade, role: self.role, shape_code: self.shape_code,
                 cover_mm: self.cover_mm, engineering_status: self.engineering_status)
          self.class.new(
            host_object_id: host_object_id,
            diameter_mm: diameter_mm,
            bar_count: bar_count,
            length_each_mm: length_each_mm,
            bar_grade: bar_grade,
            role: role,
            shape_code: shape_code,
            cover_mm: cover_mm,
            engineering_status: engineering_status
          )
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'host_object_id' => host_object_id,
            'bar_grade' => bar_grade,
            'diameter_mm' => diameter_mm,
            'bar_count' => bar_count,
            'length_each_mm' => length_each_mm,
            'role' => role,
            'shape_code' => shape_code,
            'cover_mm' => cover_mm,
            'engineering_status' => engineering_status
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            host_object_id: data['host_object_id'] || data[:host_object_id],
            diameter_mm: data['diameter_mm'] || data[:diameter_mm] || 12,
            bar_count: data['bar_count'] || data[:bar_count] || 1,
            length_each_mm: data['length_each_mm'] || data[:length_each_mm] || 1000,
            bar_grade: data['bar_grade'] || data[:bar_grade] || 'SD40',
            role: data['role'] || data[:role] || 'main_bottom',
            shape_code: data['shape_code'] || data[:shape_code] || '00',
            cover_mm: data['cover_mm'] || data[:cover_mm] || 40,
            engineering_status: data['engineering_status'] || data[:engineering_status] || 'preliminary'
          )
        end
      end
    end
  end
end
