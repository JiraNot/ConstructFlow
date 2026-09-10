# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class RevisionEntry
        attr_reader :code, :description, :date, :status, :author

        def initialize(code:, description: '', date: '', status: 'working', author: '')
          @code = required(code, 'revision code')
          @description = description.to_s
          @date = date.to_s
          @status = status.to_s
          @author = author.to_s
          freeze
        end

        def to_h
          {
            'code' => code,
            'description' => description,
            'date' => date,
            'status' => status,
            'author' => author
          }.freeze
        end

        private

        def required(value, label)
          text = value.to_s
          raise ArgumentError, "#{label} required" if text.empty?
          text
        end
      end

      class TitleBlockSpec
        attr_reader :template_key, :bounds_mm, :fields

        def initialize(template_key:, bounds_mm:, fields: {})
          @template_key = required(template_key, 'title block template_key')
          @bounds_mm = normalize_bounds(bounds_mm).freeze
          @fields = stringify_keys(fields || {}).freeze
          freeze
        end

        def to_h
          {
            'template_key' => template_key,
            'bounds_mm' => bounds_mm,
            'fields' => fields
          }.freeze
        end

        private

        def normalize_bounds(value)
          values = Array(value).map { |item| Float(item) }
          raise ArgumentError, 'title block bounds_mm must be [x, y, width, height]' unless values.length == 4
          raise ArgumentError, 'title block x/y must be non-negative' if values[0].negative? || values[1].negative?
          raise ArgumentError, 'title block width/height must be positive' unless values[2].positive? && values[3].positive?
          values
        end

        def stringify_keys(value)
          value.each_with_object({}) { |(key, item), result| result[key.to_s] = item.to_s }
        end

        def required(value, label)
          text = value.to_s
          raise ArgumentError, "#{label} required" if text.empty?
          text
        end
      end
    end
  end
end
