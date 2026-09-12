# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Interior
      class WardrobeDefinition
        SCHEMA_VERSION = 1
        DOOR_TYPES = %w[hinged sliding open pocket].freeze
        DEFAULT_DEPTH_MM = 600.0
        DEFAULT_SLIDING_TRACK_SETBACK_MM = 85.0

        attr_reader :id, :origin_mm, :angle_deg, :width_mm, :height_mm,
                    :depth_mm, :door_type, :sliding_track_setback_mm,
                    :plinth_height_mm, :sections, :board_thickness_mm

        def initialize(id: nil, origin_mm: [0, 0, 0], angle_deg: 0,
                       width_mm:, height_mm:, depth_mm: DEFAULT_DEPTH_MM,
                       door_type: 'hinged', sliding_track_setback_mm: DEFAULT_SLIDING_TRACK_SETBACK_MM,
                       plinth_height_mm: 80.0, board_thickness_mm: 18.0,
                       sections: [])
          @id = id&.to_s
          @origin_mm = normalize_point(origin_mm).freeze
          @angle_deg = Float(angle_deg)
          @width_mm = Float(width_mm)
          @height_mm = Float(height_mm)
          @depth_mm = Float(depth_mm)
          @door_type = door_type.to_s
          @sliding_track_setback_mm = Float(sliding_track_setback_mm)
          @plinth_height_mm = Float(plinth_height_mm)
          @board_thickness_mm = Float(board_thickness_mm)
          @sections = normalize_sections(sections).freeze
          freeze
        end

        def errors
          result = []
          result << 'wardrobe width must be positive' unless width_mm.positive?
          result << 'wardrobe height must be positive' unless height_mm.positive?
          result << 'wardrobe depth must be at least 450mm' if depth_mm < 450.0
          result << 'unsupported door type' unless DOOR_TYPES.include?(door_type)
          result << 'plinth height cannot exceed 200mm' if plinth_height_mm > 200.0
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def internal_depth_mm
          depth_mm - (door_type == 'sliding' ? sliding_track_setback_mm : board_thickness_mm)
        end

        def usable_height_mm
          height_mm - plinth_height_mm
        end

        def door_panel_count
          return 0 if door_type == 'open'

          # For sliding doors, typically 2 panels for <= 2000mm, 3 panels for <= 3000mm, 4 for > 3000mm
          if door_type == 'sliding'
            width_mm <= 2000.0 ? 2 : (width_mm <= 3000.0 ? 3 : 4)
          else
            # Hinged doors: standard max width is 500-600mm per door leaf
            (width_mm / 500.0).ceil
          end
        end

        def swing_clearance_depth_mm
          return 0.0 unless door_type == 'hinged'

          # For hinged doors, clearance equals leaf width
          width_mm / door_panel_count
        end

        def total_hanger_rod_length_mm
          sections.sum { |s| s[:hanger_rods_count] * s[:width_mm] }
        end

        def estimated_hanger_capacity
          (total_hanger_rod_length_mm / 30.0).floor
        end

        def with(**changes)
          self.class.new(
            id: changes.fetch(:id, id),
            origin_mm: changes.fetch(:origin_mm, origin_mm),
            angle_deg: changes.fetch(:angle_deg, angle_deg),
            width_mm: changes.fetch(:width_mm, width_mm),
            height_mm: changes.fetch(:height_mm, height_mm),
            depth_mm: changes.fetch(:depth_mm, depth_mm),
            door_type: changes.fetch(:door_type, door_type),
            sliding_track_setback_mm: changes.fetch(:sliding_track_setback_mm, sliding_track_setback_mm),
            plinth_height_mm: changes.fetch(:plinth_height_mm, plinth_height_mm),
            board_thickness_mm: changes.fetch(:board_thickness_mm, board_thickness_mm),
            sections: changes.fetch(:sections, sections)
          )
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'id' => id,
            'origin_mm' => origin_mm,
            'angle_deg' => angle_deg,
            'width_mm' => width_mm,
            'height_mm' => height_mm,
            'depth_mm' => depth_mm,
            'door_type' => door_type,
            'sliding_track_setback_mm' => sliding_track_setback_mm,
            'plinth_height_mm' => plinth_height_mm,
            'board_thickness_mm' => board_thickness_mm,
            'sections' => sections,
            'internal_depth_mm' => internal_depth_mm.round(1),
            'door_panel_count' => door_panel_count,
            'swing_clearance_depth_mm' => swing_clearance_depth_mm.round(1),
            'total_hanger_rod_length_mm' => total_hanger_rod_length_mm.round(1),
            'estimated_hanger_capacity' => estimated_hanger_capacity
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            id: data['id'] || data[:id],
            origin_mm: data['origin_mm'] || data[:origin_mm] || [0, 0, 0],
            angle_deg: data['angle_deg'] || data[:angle_deg] || 0,
            width_mm: data['width_mm'] || data[:width_mm] || 1800.0,
            height_mm: data['height_mm'] || data[:height_mm] || 2400.0,
            depth_mm: data['depth_mm'] || data[:depth_mm] || DEFAULT_DEPTH_MM,
            door_type: data['door_type'] || data[:door_type] || 'hinged',
            sliding_track_setback_mm: data['sliding_track_setback_mm'] || data[:sliding_track_setback_mm] || DEFAULT_SLIDING_TRACK_SETBACK_MM,
            plinth_height_mm: data['plinth_height_mm'] || data[:plinth_height_mm] || 80.0,
            board_thickness_mm: data['board_thickness_mm'] || data[:board_thickness_mm] || 18.0,
            sections: data['sections'] || data[:sections] || []
          )
        end

        private

        def normalize_point(val)
          a = Array(val)
          [Float(a[0] || 0.0), Float(a[1] || 0.0), Float(a[2] || 0.0)]
        end

        def normalize_sections(list)
          items = Array(list)
          if items.empty?
            # Default to 2 equal bays
            w = (width_mm - (3 * board_thickness_mm)) / 2.0
            items = [
              { id: 'bay_1', width_mm: w, shelves_count: 3, hanger_rods_count: 1, drawers_count: 2 },
              { id: 'bay_2', width_mm: w, shelves_count: 1, hanger_rods_count: 2, drawers_count: 0 }
            ]
          end

          items.map do |s|
            item = (s || {}).transform_keys(&:to_sym)
            {
              id: item[:id]&.to_s || 'bay',
              width_mm: Float(item[:width_mm] || 0.0),
              shelves_count: Integer(item[:shelves_count] || 0),
              hanger_rods_count: Integer(item[:hanger_rods_count] || 0),
              drawers_count: Integer(item[:drawers_count] || 0)
            }.freeze
          end
        end
      end
    end
  end
end
