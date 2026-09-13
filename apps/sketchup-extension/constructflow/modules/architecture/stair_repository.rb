# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class StairRepository
        DICT_NAME = 'ConstructFlow_Stair'

        def save(entity, definition)
          return false unless entity.respond_to?(:set_attribute)

          data = definition.to_h
          data.each do |key, value|
            # SketchUp attributes don't handle arrays/hashes perfectly without json, 
            # but we can serialize arrays to strings or use JSON.
            # Assuming simple serialization for demonstration:
            val = value.is_a?(Array) ? value.join(',') : value
            entity.set_attribute(DICT_NAME, key, val)
          end
          true
        end

        def load(entity)
          return nil unless entity.respond_to?(:get_attribute)
          return nil unless entity.attribute_dictionaries&.[](DICT_NAME)

          dict = entity.attribute_dictionaries[DICT_NAME]
          
          # Deserialize
          start_point = parse_array(dict['start_point'])
          direction = parse_array(dict['direction'])

          data = {
            start_point: start_point,
            direction: direction,
            width_mm: dict['width_mm']&.to_f,
            height_mm: dict['height_mm']&.to_f,
            tread_count: dict['tread_count']&.to_i,
            riser_count: dict['riser_count']&.to_i,
            tread_depth_mm: dict['tread_depth_mm']&.to_f,
            riser_height_mm: dict['riser_height_mm']&.to_f,
            type: dict['type']&.to_sym,
            level_id: dict['level_id'],
            material_id: dict['material_id']
          }

          StairDefinition.from_h(data)
        end

        private

        def parse_array(str)
          return nil unless str.is_a?(String)
          str.split(',').map(&:to_f)
        end
      end
    end
  end
end
