# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      # Fills text placeholders already present in a LayOut template. It only
      # touches text entities whose complete plain-text value exactly matches a
      # configured ConstructFlow token, preserving unrelated template content.
      class NativeLayoutTemplatePlaceholderMapper
        def initialize(backend:)
          @backend = backend
        end

        def apply(document:, page:, title_block:, revisions: [])
          block = stringify_keys(title_block || {})
          placeholder_map = stringify_keys(block['placeholder_map'] || {})
          strategy = placeholder_map['strategy'].to_s
          return empty_result(strategy) if placeholder_map.empty? || strategy == 'generic_only'

          fields = stringify_keys(block['fields'] || {})
          tokens = stringify_keys(placeholder_map['field_tokens'] || {})
          revision_prefix = placeholder_map['revision_prefix'].to_s
          values = build_values(fields, tokens, Array(revisions), revision_prefix)
          entities = Array(@backend.template_text_entities(document, page))

          matched = []
          skipped_empty = []
          entities.each do |entity|
            current = @backend.text_plain_text(entity).to_s
            entry = values[current]
            next unless entry

            value = entry['value'].to_s
            if value.empty?
              skipped_empty << entry['key']
              next
            end
            next if @backend.entity_locked?(entity)

            @backend.set_text_plain_text(entity, value)
            matched << entry['key']
          end

          expected = values.values.map { |entry| entry['key'] }.uniq
          {
            'strategy' => strategy,
            'template_used' => !matched.empty?,
            'matched_fields' => matched.uniq.sort.freeze,
            'unmatched_fields' => (expected - matched - skipped_empty).sort.freeze,
            'skipped_empty_fields' => skipped_empty.uniq.sort.freeze,
            'matched_count' => matched.uniq.length
          }.freeze
        end

        private

        def build_values(fields, field_tokens, revisions, revision_prefix)
          values = {}
          field_tokens.each do |field, token|
            values[token.to_s] = { 'key' => field.to_s, 'value' => fields[field.to_s] }
          end

          return values if revision_prefix.empty?

          revisions.each_with_index do |revision, index|
            row = stringify_keys(revision || {})
            row_number = index + 1
            %w[code date status description author].each do |field|
              token = "{{#{revision_prefix}:#{row_number}:#{field.upcase}}}"
              values[token] = {
                'key' => "revision.#{row_number}.#{field}",
                'value' => row[field]
              }
            end
          end
          values
        end

        def empty_result(strategy)
          {
            'strategy' => strategy,
            'template_used' => false,
            'matched_fields' => [].freeze,
            'unmatched_fields' => [].freeze,
            'skipped_empty_fields' => [].freeze,
            'matched_count' => 0
          }.freeze
        end

        def stringify_keys(value)
          case value
          when Hash
            value.each_with_object({}) { |(key, item), result| result[key.to_s] = stringify_keys(item) }
          when Array
            value.map { |item| stringify_keys(item) }
          else
            value
          end
        end
      end
    end
  end
end
