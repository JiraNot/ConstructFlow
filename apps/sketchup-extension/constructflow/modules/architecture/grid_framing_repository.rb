# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class GridFramingRepository
        DICT_NAME = 'ConstructFlow_GridFraming'

        def save(entity, definition)
          return false unless entity.respond_to?(:set_attribute)
          
          data = definition.to_h
          data.each do |key, value|
            val = value.is_a?(Array) ? value.join(',') : value
            entity.set_attribute(DICT_NAME, key, val)
          end
          true
        end
        
        def load(entity)
          return nil unless entity.respond_to?(:get_attribute)
          return nil unless entity.attribute_dictionaries&.[](DICT_NAME)
          
          dict = entity.attribute_dictionaries[DICT_NAME]
          
          origin = parse_array(dict['origin_point'])
          
          data = {
            origin_point: origin,
            x_spans_mm: parse_array(dict['x_spans_mm']),
            y_spans_mm: parse_array(dict['y_spans_mm']),
            levels_mm: parse_array(dict['levels_mm']),
            column_type_id: dict['column_type_id'],
            beam_type_id: dict['beam_type_id']
          }
          
          GridFramingDefinition.from_h(data)
        end
        
        private
        
        def parse_array(str)
          return [] unless str.is_a?(String)
          str.split(',').map(&:to_f)
        end
      end
    end
  end
end
