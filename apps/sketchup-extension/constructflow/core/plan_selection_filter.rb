# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class PlanSelectionFilter
        def initialize(object_types: nil, level_id: nil)
          @object_types = Array(object_types).map(&:to_s).reject(&:empty?).freeze
          @level_id = level_id.to_s
          @level_id = nil if @level_id.empty?
        end

        def match?(object)
          return false unless object
          return false if @object_types.any? && !@object_types.include?(object_value(object, :type))
          return true unless @level_id

          refs = object.respond_to?(:level_refs) ? object.level_refs : (object[:level_refs] || object['level_refs'])
          Array(refs).any? do |reference|
            reference_level_id = if reference.is_a?(Hash)
                                   reference[:level_id] || reference['level_id']
                                 else
                                   reference
                                 end
            reference_level_id.to_s == @level_id
          end
        end

        def filter(objects)
          Array(objects).select { |object| match?(object) }.freeze
        end

        private

        def object_value(object, key)
          return object.public_send(key).to_s if object.respond_to?(key)

          (object[key] || object[key.to_s]).to_s
        end
      end
    end
  end
end
