# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class ScheduleDefinition
        FIELD_TYPES = %w[text number boolean].freeze

        attr_reader :id, :name, :object_type, :columns

        def initialize(id:, name:, object_type:, columns:)
          @id = id.to_s
          @name = name.to_s
          @object_type = object_type.to_s
          @columns = Array(columns).map { |column| normalize_column(column) }.freeze
          freeze
        end

        def column(field_id)
          columns.find { |column| column['id'] == field_id.to_s }
        end

        def valid?
          !id.empty? && !name.empty? && !object_type.empty? &&
            columns.length == columns.map { |column| column['id'] }.uniq.length
        end

        private

        def normalize_column(column)
          value = column || {}
          field_type = (value[:field_type] || value['field_type'] || 'text').to_s
          raise ArgumentError, "unsupported schedule field type: #{field_type}" unless FIELD_TYPES.include?(field_type)

          {
            'id' => (value[:id] || value['id']).to_s,
            'label' => (value[:label] || value['label'] || value[:id] || value['id']).to_s,
            'field_type' => field_type,
            'editable' => value.key?(:editable) ? !!value[:editable] : !!value.fetch('editable', false),
            'scope' => (value[:scope] || value['scope'] || 'instance').to_s,
            'calculated' => value.key?(:calculated) ? !!value[:calculated] : !!value.fetch('calculated', false)
          }.freeze
        end
      end

      class ScheduleEditor
        def initialize(schema:, row_provider:, updater:)
          raise ArgumentError, 'schedule schema is invalid' unless schema&.valid?

          @schema = schema
          @row_provider = row_provider
          @updater = updater
        end

        attr_reader :schema

        def rows(objects)
          Array(objects).filter_map do |object|
            next unless object_type(object) == schema.object_type

            values = @row_provider.call(object)
            {
              'object_id' => smart_object_id(object),
              'object_type' => object_type(object),
              'values' => values.transform_keys(&:to_s).freeze
            }.freeze
          end.freeze
        end

        def edit(row:, field_id:, value:)
          object_id_value = row.fetch('object_id')
          column = schema.column(field_id)
          raise ArgumentError, "unknown schedule field: #{field_id}" unless column
          raise ArgumentError, "schedule field is read-only: #{field_id}" unless column['editable'] && !column['calculated']

          normalized = normalize_value(column, value)
          result = @updater.call(
            object_id: object_id_value,
            field_id: column['id'],
            value: normalized,
            scope: column['scope']
          )
          row.merge('values' => row.fetch('values').merge(column['id'] => normalized).freeze).freeze.tap do |updated|
            return updated if result.nil? || result == true || result[:status].to_s == 'success' || result['status'].to_s == 'success'
            raise ArgumentError, Array(result[:errors] || result['errors'] || 'schedule update rejected').join('; ')
          end
        end

        private

        def smart_object_id(object)
          (object.respond_to?(:id) ? object.id : object[:id] || object['id']).to_s
        end

        def object_type(object)
          (object.respond_to?(:type) ? object.type : object[:type] || object['type']).to_s
        end

        def normalize_value(column, value)
          case column['field_type']
          when 'number'
            Float(value)
          when 'boolean'
            return value if value == true || value == false
            %w[true yes 1].include?(value.to_s.downcase)
          else
            value.to_s
          end
        rescue TypeError, ArgumentError
          raise ArgumentError, "invalid value for schedule field: #{column['id']}"
        end
      end
    end
  end
end
