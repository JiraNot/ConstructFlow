# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Surface
      class ControlJointDefinition
        SCHEMA_VERSION = 1
        JOINT_TYPES = %w[expansion contraction isolation construction].freeze
        EPSILON = 1.0e-6

        attr_reader :surface_object_id, :start_point_mm, :end_point_mm,
                    :width_mm, :depth_mm, :material_id, :joint_type

        def initialize(surface_object_id:, start_point_mm:, end_point_mm:,
                       width_mm: 10.0, depth_mm: 25.0, material_id: 'sealant',
                       joint_type: 'expansion')
          @surface_object_id = surface_object_id.to_s
          @start_point_mm = normalize_point(start_point_mm).freeze
          @end_point_mm = normalize_point(end_point_mm).freeze
          @width_mm = Float(width_mm)
          @depth_mm = Float(depth_mm)
          @material_id = material_id.to_s
          @joint_type = joint_type.to_s
          freeze
        end

        def errors
          result = []
          result << 'surface object id required' if surface_object_id.empty?
          result << 'joint width must be positive' unless width_mm.positive?
          result << 'joint depth must be positive' unless depth_mm.positive?
          result << 'unsupported joint type' unless JOINT_TYPES.include?(joint_type)
          result << 'joint start and end points must not be identical' if length_mm <= EPSILON
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def length_mm
          dx = end_point_mm[0] - start_point_mm[0]
          dy = end_point_mm[1] - start_point_mm[1]
          dz = end_point_mm[2] - start_point_mm[2]
          Math.sqrt((dx * dx) + (dy * dy) + (dz * dz))
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'surface_object_id' => surface_object_id,
            'start_point_mm' => start_point_mm,
            'end_point_mm' => end_point_mm,
            'width_mm' => width_mm,
            'depth_mm' => depth_mm,
            'material_id' => material_id,
            'joint_type' => joint_type
          }
        end

        def self.from_h(data)
          return nil unless data.is_a?(Hash)

          new(
            surface_object_id: data['surface_object_id'] || data[:surface_object_id],
            start_point_mm: data['start_point_mm'] || data[:start_point_mm],
            end_point_mm: data['end_point_mm'] || data[:end_point_mm],
            width_mm: data['width_mm'] || data[:width_mm] || 10.0,
            depth_mm: data['depth_mm'] || data[:depth_mm] || 25.0,
            material_id: data['material_id'] || data[:material_id] || 'sealant',
            joint_type: data['joint_type'] || data[:joint_type] || 'expansion'
          )
        end

        private

        def normalize_point(point)
          p = Array(point)
          [Float(p[0] || 0.0), Float(p[1] || 0.0), Float(p[2] || 0.0)]
        end
      end
    end
  end
end
