# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class RoofFramingRepository
        DICT_NAME = 'ConstructFlow_RoofFraming'

        def save(entity, definition)
          return false unless entity.respond_to?(:set_attribute)
          
          data = definition.to_h
          data.each do |key, value|
            val = value.is_a?(Array) ? value.to_json : value.to_s
            entity.set_attribute(DICT_NAME, key.to_s, val)
          end
          entity.set_attribute(DICT_NAME, 'is_roof_framing', true)
          true
        end
        
        def load(entity)
          return nil unless entity.respond_to?(:get_attribute)
          return nil unless entity.attribute_dictionaries&.[](DICT_NAME)
          
          dict = entity.attribute_dictionaries[DICT_NAME]
          return nil unless dict['is_roof_framing']
          
          boundary_mm = parse_boundary(dict['boundary_mm'])
          
          data = {
            boundary_mm: boundary_mm,
            pitch_degrees: (dict['pitch_degrees'] || 30.0).to_f,
            truss_spacing_mm: (dict['truss_spacing_mm'] || 1000.0).to_f,
            purlin_spacing_mm: (dict['purlin_spacing_mm'] || 300.0).to_f,
            overhang_mm: (dict['overhang_mm'] || 600.0).to_f,
            type: (dict['type'] || 'gable').to_sym
          }
          
          RoofFramingDefinition.from_h(data)
        end

        def is_roof_framing?(entity)
          return false unless entity.respond_to?(:get_attribute)
          entity.get_attribute(DICT_NAME, 'is_roof_framing', false) == true
        end
        
        private
        
        def parse_boundary(val)
          return [] if val.nil?
          if val.is_a?(String) && val.start_with?('[')
            begin
              require 'json'
              return JSON.parse(val).map { |pt| pt.map(&:to_f) }
            rescue StandardError
              # fallback to comma separated
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
