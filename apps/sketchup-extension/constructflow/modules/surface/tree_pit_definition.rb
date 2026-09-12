# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Surface
      class TreePitDefinition
        SCHEMA_VERSION = 1
        SHAPES = %w[square circle].freeze

        attr_reader :surface_object_id, :shape, :center_point_mm,
                    :width_mm, :length_mm, :radius_mm, :depth_mm,
                    :grille, :grille_material_id

        def initialize(surface_object_id:, shape: 'square', center_point_mm: [0, 0, 0],
                       width_mm: 1000.0, length_mm: 1000.0, radius_mm: 500.0,
                       depth_mm: 800.0, grille: true, grille_material_id: 'cast_iron')
          @surface_object_id = surface_object_id.to_s
          @shape = shape.to_s
          @center_point_mm = normalize_point(center_point_mm).freeze
          @width_mm = Float(width_mm)
          @length_mm = Float(length_mm)
          @radius_mm = Float(radius_mm)
          @depth_mm = Float(depth_mm)
          @grille = !!grille
          @grille_material_id = grille_material_id&.to_s
          freeze
        end

        def errors
          result = []
          result << 'surface object id required' if surface_object_id.empty?
          result << 'unsupported tree pit shape' unless SHAPES.include?(shape)
          if shape == 'square'
            result << 'tree pit width must be positive' unless width_mm.positive?
            result << 'tree pit length must be positive' unless length_mm.positive?
          elsif shape == 'circle'
            result << 'tree pit radius must be positive' unless radius_mm.positive?
          end
          result << 'tree pit depth must be positive' unless depth_mm.positive?
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def area_mm2
          if shape == 'circle'
            Math::PI * radius_mm * radius_mm
          else
            width_mm * length_mm
          end
        end

        def to_hole_loop(segments = 16)
          cx, cy, cz = center_point_mm
          if shape == 'circle'
            step = (2.0 * Math::PI) / segments
            segments.times.map do |i|
              angle = i * step
              [cx + (radius_mm * Math.cos(angle)), cy + (radius_mm * Math.sin(angle)), cz]
            end
          else
            hw = width_mm / 2.0
            hl = length_mm / 2.0
            [
              [cx - hw, cy - hl, cz],
              [cx + hw, cy - hl, cz],
              [cx + hw, cy + hl, cz],
              [cx - hw, cy + hl, cz]
            ]
          end
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'surface_object_id' => surface_object_id,
            'shape' => shape,
            'center_point_mm' => center_point_mm,
            'width_mm' => width_mm,
            'length_mm' => length_mm,
            'radius_mm' => radius_mm,
            'depth_mm' => depth_mm,
            'grille' => grille,
            'grille_material_id' => grille_material_id
          }
        end

        def self.from_h(data)
          return nil unless data.is_a?(Hash)

          new(
            surface_object_id: data['surface_object_id'] || data[:surface_object_id],
            shape: data['shape'] || data[:shape] || 'square',
            center_point_mm: data['center_point_mm'] || data[:center_point_mm] || [0, 0, 0],
            width_mm: data['width_mm'] || data[:width_mm] || 1000.0,
            length_mm: data['length_mm'] || data[:length_mm] || 1000.0,
            radius_mm: data['radius_mm'] || data[:radius_mm] || 500.0,
            depth_mm: data['depth_mm'] || data[:depth_mm] || 800.0,
            grille: data.fetch('grille', data.fetch(:grille, true)),
            grille_material_id: data['grille_material_id'] || data[:grille_material_id] || 'cast_iron'
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
