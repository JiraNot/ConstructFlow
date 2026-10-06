# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module Host
        # Host adapter encapsulating read/write/delete operations on entity
        # attribute dictionaries. Shields domain logic from direct SketchUp API calls.
        class EntityAttributeAdapter
          attr_reader :entity

          def initialize(entity)
            @entity = entity
          end

          def get_attribute(dictionary, key, default = nil)
            return default unless @entity.respond_to?(:get_attribute)

            @entity.get_attribute(dictionary.to_s, key.to_s, default)
          end

          def set_attribute(dictionary, key, value)
            return value unless @entity.respond_to?(:set_attribute)

            @entity.set_attribute(dictionary.to_s, key.to_s, value)
            value
          end

          def delete_attribute(dictionary, key = nil)
            return nil unless @entity.respond_to?(:delete_attribute)

            if key.nil?
              @entity.delete_attribute(dictionary.to_s)
            else
              @entity.delete_attribute(dictionary.to_s, key.to_s)
            end
          end
        end
      end
    end
  end
end
