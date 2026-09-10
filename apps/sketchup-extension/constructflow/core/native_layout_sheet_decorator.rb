# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class NativeLayoutSheetDecorator
        MM_PER_INCH = 25.4

        def initialize(backend:)
          @backend = backend
        end

        def apply(document:, page:, layer:, sheet:)
          data = stringify_keys(sheet || {})
          title_block = data['title_block'] || {}
          revisions = Array(data['revisions'])
          created = []

          unless title_block.empty?
            created.concat(render_title_block(document, page, layer, title_block))
          end
          created.concat(render_revision_table(document, page, layer, title_block, revisions)) unless revisions.empty?

          {
            'title_block_created' => !title_block.empty?,
            'revision_rows' => revisions.length,
            'entity_count' => created.length
          }.freeze
        end

        private

        def render_title_block(document, page, layer, title_block)
          bounds = Array(title_block.fetch('bounds_mm')).map { |value| Float(value) }
          fields = stringify_keys(title_block['fields'] || {})
          x, y, width, height = bounds
          created = []
          created << add_box(document, page, layer, bounds)

          rows = [
            ['PROJECT', fields['project_name']],
            ['DRAWING', fields['drawing_title']],
            ['SHEET', fields['sheet_number']],
            ['SCALE', fields['scale']],
            ['REV', fields['revision']],
            ['STATUS', fields['issue_status']]
          ]
          row_height = height / rows.length.to_f
          rows.each_with_index do |(label, value), index|
            text = value.to_s.empty? ? label : "#{label}: #{value}"
            created << add_text(document, page, layer, text, [x + 2.0, y + (index * row_height), width - 4.0, row_height])
          end
          created.compact
        end

        def render_revision_table(document, page, layer, title_block, revisions)
          return [] if title_block.empty?

          x, y, width, = Array(title_block.fetch('bounds_mm')).map { |value| Float(value) }
          row_height = 6.0
          table_height = row_height * (revisions.length + 1)
          table_y = [y - table_height - 2.0, 2.0].max
          created = [add_box(document, page, layer, [x, table_y, width, table_height])]
          created << add_text(document, page, layer, 'REV | DATE | STATUS | DESCRIPTION', [x + 2.0, table_y, width - 4.0, row_height])

          revisions.each_with_index do |revision, index|
            row = stringify_keys(revision || {})
            text = [row['code'], row['date'], row['status'], row['description']].map(&:to_s).join(' | ')
            created << add_text(
              document, page, layer, text,
              [x + 2.0, table_y + ((index + 1) * row_height), width - 4.0, row_height]
            )
          end
          created.compact
        end

        def add_box(document, page, layer, bounds_mm)
          bounds = native_bounds(bounds_mm)
          entity = @backend.create_rectangle(bounds)
          @backend.add_entity(document, entity, layer, page)
          entity
        end

        def add_text(document, page, layer, text, bounds_mm)
          bounds = native_bounds(bounds_mm)
          entity = @backend.create_text(text.to_s, bounds)
          @backend.add_entity(document, entity, layer, page)
          entity
        end

        def native_bounds(bounds_mm)
          x, y, width, height = Array(bounds_mm).map { |value| Float(value) / MM_PER_INCH }
          @backend.bounds2d(x, y, width, height)
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
