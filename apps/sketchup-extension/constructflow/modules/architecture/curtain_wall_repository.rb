# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class CurtainWallRepository
        DICT_NAME = 'ConstructFlow_CurtainWall'

        def save(entity, definition)
          return false unless entity.respond_to?(:set_attribute)
          
          data = definition.to_h
          data.each do |key, value|
            val = value.is_a?(Array) ? value.to_json : value.to_s
            entity.set_attribute(DICT_NAME, key.to_s, val)
          end
          entity.set_attribute(DICT_NAME, 'is_curtain_wall', true)
          true
        end
        
        def load(entity)
          return nil unless entity.respond_to?(:get_attribute)
          return nil unless entity.attribute_dictionaries&.[](DICT_NAME)
          
          dict = entity.attribute_dictionaries[DICT_NAME]
          return nil unless dict['is_curtain_wall']
          
          boundary_mm = parse_boundary(dict['boundary_mm'])
          
          data = {
            boundary_mm: boundary_mm,
            mullion_width_mm: (dict['mullion_width_mm'] || 50.0).to_f,
            mullion_depth_mm: (dict['mullion_depth_mm'] || 100.0).to_f,
            transom_width_mm: (dict['transom_width_mm'] || 50.0).to_f,
            transom_depth_mm: (dict['transom_depth_mm'] || 100.0).to_f,
            grid_width_mm: (dict['grid_width_mm'] || 1000.0).to_f,
            grid_height_mm: (dict['grid_height_mm'] || 1200.0).to_f,
            infill_type: (dict['infill_type'] || 'glass').to_sym,
            louver_angle_deg: (dict['louver_angle_deg'] || 0.0).to_f,
            infill_thickness_mm: (dict['infill_thickness_mm'] || 8.0).to_f
          }
          
          CurtainWallDefinition.from_h(data)
        end

        def is_curtain_wall?(entity)
          return false unless entity.respond_to?(:get_attribute)
          entity.get_attribute(DICT_NAME, 'is_curtain_wall', false) == true
        end

        private

        def parse_boundary(val)
          return [] if val.nil?
          if val.is_a?(String) && val.start_with?('[')
            begin
              require 'json'
              return JSON.parse(val).map { |pt| pt.map(&:to_f) }
            rescue StandardError
            end
          end
          if val.is_a?(String)
            pts = val.split(',')
            return pts.each_slice(3).map { |c| c.map(&:to_f) }
          end
          Array(val)
        end
      end
    end
  end
end
