# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class StairValidator
        attr_reader :definition

        # code_type: :residential or :commercial
        def initialize(definition, code_type: :residential)
          @definition = definition
          @code_type = code_type
        end

        def valid?
          errors.empty?
        end

        def errors
          result = []
          if @code_type == :residential
            result << 'riser height must not exceed 200mm for residential' if @definition.riser_height_mm > 200.0
            result << 'tread depth must be at least 220mm for residential' if @definition.tread_depth_mm < 220.0
          elsif @code_type == :commercial
            result << 'riser height must not exceed 190mm for commercial' if @definition.riser_height_mm > 190.0
            result << 'tread depth must be at least 240mm for commercial' if @definition.tread_depth_mm < 240.0
          end
          
          # Max 14 steps before landing required, simple check for now
          result << 'maximum of 14 steps before a landing is required' if @definition.riser_count > 14
          
          result.concat(@definition.errors) unless @definition.valid?
          
          result.freeze
        end
      end
    end
  end
end
