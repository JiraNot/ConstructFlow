# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      # Renderer-neutral mapping between ConstructFlow sheet fields and text
      # tokens embedded in a company LayOut template.
      class LayoutTemplatePlaceholderMap
        DEFAULT_FIELD_TOKENS = {
          'project_name' => '{{CF:PROJECT_NAME}}',
          'project_number' => '{{CF:PROJECT_NUMBER}}',
          'drawing_title' => '{{CF:DRAWING_TITLE}}',
          'sheet_number' => '{{CF:SHEET_NUMBER}}',
          'scale' => '{{CF:SCALE}}',
          'revision' => '{{CF:REVISION}}',
          'issue_status' => '{{CF:ISSUE_STATUS}}',
          'drawn_by' => '{{CF:DRAWN_BY}}',
          'checked_by' => '{{CF:CHECKED_BY}}',
          'drawing_family' => '{{CF:DRAWING_FAMILY}}'
        }.freeze
        REVISION_FIELDS = %w[code date status description author].freeze
        STRATEGIES = %w[prefer_template generic_only template_only].freeze

        attr_reader :template_key, :field_tokens, :revision_prefix, :strategy

        def initialize(template_key:, field_tokens: DEFAULT_FIELD_TOKENS,
                       revision_prefix: 'CF:REV', strategy: 'prefer_template')
          @template_key = required(template_key, 'template_key')
          @field_tokens = normalize_tokens(field_tokens).freeze
          @revision_prefix = required(revision_prefix, 'revision_prefix')
          @strategy = strategy.to_s
          raise ArgumentError, "unsupported template strategy: #{@strategy}" unless STRATEGIES.include?(@strategy)
          freeze
        end

        def revision_token(index, field)
          row = Integer(index)
          raise ArgumentError, 'revision placeholder index must be >= 1' if row < 1
          key = field.to_s.downcase
          raise ArgumentError, "unsupported revision placeholder field: #{field}" unless REVISION_FIELDS.include?(key)
          "{{#{revision_prefix}:#{row}:#{key.upcase}}}"
        end

        def to_h
          {
            'template_key' => template_key,
            'field_tokens' => field_tokens,
            'revision_prefix' => revision_prefix,
            'strategy' => strategy
          }.freeze
        end

        private

        def normalize_tokens(value)
          (value || {}).each_with_object({}) do |(field, token), result|
            field_name = field.to_s
            token_text = token.to_s
            raise ArgumentError, "placeholder token required: #{field_name}" if token_text.empty?
            result[field_name] = token_text
          end
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
