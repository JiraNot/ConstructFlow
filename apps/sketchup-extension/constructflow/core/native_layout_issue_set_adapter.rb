# frozen_string_literal: true

require_relative 'native_layout_sheet_decorator'

module JiraNot
  module ConstructFlow
    module Core
      class NativeLayoutIssueSetAdapter
        MM_PER_INCH = 25.4
        FORMAT = DrawingIssueSet::FORMAT
        DICTIONARY = 'constructflow.issue_set'

        def initialize(backend: RubyLayoutBackend.new, sheet_decorator: nil)
          @backend = backend
          @sheet_decorator = sheet_decorator || NativeLayoutSheetDecorator.new(backend: backend)
        end

        def build(issue_plan:, skp_path:, layout_path:, pdf_path: nil, template_path: nil)
          plan = stringify_keys(issue_plan || {})
          validate_plan!(plan)
          validate_path!(skp_path, '.skp', 'SketchUp model')
          validate_path!(layout_path, '.layout', 'LayOut output')
          validate_path!(pdf_path, '.pdf', 'PDF output') if pdf_path
          sheet_plans = Array(plan.fetch('sheet_plans'))
          validate_consistent_page_size!(sheet_plans)

          first_sheet = sheet_plans.first.fetch('sheet')
          page_width_mm, page_height_mm = Array(first_sheet.fetch('page_size_mm')).map { |value| Float(value) }
          document = @backend.create_document(template_path: template_path)
          @backend.configure_page(document, width_in: mm_to_in(page_width_mm), height_in: mm_to_in(page_height_mm))
          layer = @backend.first_layer(document)

          pages = sheet_plans.each_with_index.map do |sheet_plan, index|
            sheet = sheet_plan.fetch('sheet')
            page = if index.zero?
                     @backend.first_page(document)
                   else
                     @backend.add_page(document, page_name(sheet))
                   end
            @backend.name_page(page, page_name(sheet)) if @backend.respond_to?(:name_page)
            viewport_count = Array(sheet.fetch('viewports')).sum do |viewport|
              create_viewport(document: document, page: page, layer: layer, skp_path: skp_path, viewport: viewport)
              1
            end
            decoration = @sheet_decorator.apply(document: document, page: page, layer: layer, sheet: sheet)
            persist_page_metadata(page, sheet_plan, viewport_count, decoration)
            {
              'sheet_id' => sheet['id'].to_s,
              'sheet_number' => sheet['number'].to_s,
              'page_name' => page_name(sheet),
              'viewport_count' => viewport_count,
              'decoration' => decoration
            }.freeze
          end

          persist_document_metadata(document, plan, pages)
          @backend.save(document, layout_path)
          @backend.export_pdf(document, pdf_path) if pdf_path
          {
            'status' => 'created',
            'issue_set_id' => plan['id'].to_s,
            'sheet_count' => pages.length,
            'pages' => pages.freeze,
            'layout_path' => layout_path.to_s,
            'pdf_path' => pdf_path&.to_s,
            'native_backend' => @backend.name
          }.freeze
        end

        private

        def create_viewport(document:, page:, layer:, skp_path:, viewport:)
          data = stringify_keys(viewport || {})
          x_mm, y_mm, width_mm, height_mm = Array(data.fetch('bounds_mm')).map { |value| Float(value) }
          bounds = @backend.bounds2d(mm_to_in(x_mm), mm_to_in(y_mm), mm_to_in(width_mm), mm_to_in(height_mm))
          model = @backend.create_sketchup_model(skp_path, bounds)
          @backend.select_scene(model, data.fetch('scene_name').to_s)
          @backend.set_render_mode(model, data.fetch('render_mode').to_s)
          @backend.set_scale(model, parse_scale(data.fetch('scale')))
          @backend.add_entity(document, model, layer, page)
          @backend.render(model)
          model
        end

        def persist_document_metadata(document, plan, pages)
          return unless document.respond_to?(:set_attribute)
          document.set_attribute(DICTIONARY, 'format', FORMAT)
          document.set_attribute(DICTIONARY, 'issue_set_id', plan['id'].to_s)
          document.set_attribute(DICTIONARY, 'issue_set_name', plan['name'].to_s)
          document.set_attribute(DICTIONARY, 'revision', plan['revision'].to_s)
          document.set_attribute(DICTIONARY, 'issue_status', plan['issue_status'].to_s)
          document.set_attribute(DICTIONARY, 'sheet_count', pages.length)
        end

        def persist_page_metadata(page, sheet_plan, viewport_count, decoration)
          return unless page.respond_to?(:set_attribute)
          sheet = sheet_plan.fetch('sheet')
          source = sheet_plan.fetch('source')
          page.set_attribute(DICTIONARY, 'sheet_id', sheet['id'].to_s)
          page.set_attribute(DICTIONARY, 'sheet_number', sheet['number'].to_s)
          page.set_attribute(DICTIONARY, 'sheet_title', sheet['title'].to_s)
          page.set_attribute(DICTIONARY, 'preset_id', source['preset_id'].to_s)
          page.set_attribute(DICTIONARY, 'viewport_count', viewport_count)
          page.set_attribute(DICTIONARY, 'template_placeholders_used', decoration.dig('template_placeholders', 'template_used') == true)
        end

        def validate_plan!(plan)
          raise ArgumentError, "unsupported drawing issue set: #{plan['format']}" unless plan['format'].to_s == FORMAT
          raise ArgumentError, 'drawing issue set requires sheet_plans' if Array(plan['sheet_plans']).empty?
        end

        def validate_consistent_page_size!(plans)
          sizes = plans.map { |item| Array(item.dig('sheet', 'page_size_mm')).map { |value| Float(value) } }.uniq
          raise ArgumentError, 'native LayOut issue set requires one page size per document' unless sizes.length == 1
        end

        def page_name(sheet)
          [sheet['number'], sheet['title']].map(&:to_s).reject(&:empty?).join(' - ')
        end

        def parse_scale(value)
          text = value.to_s.strip
          if (match = text.match(/\A([0-9]+(?:\.[0-9]+)?)\s*:\s*([0-9]+(?:\.[0-9]+)?)\z/))
            denominator = Float(match[2])
            raise ArgumentError, 'drawing scale denominator must be positive' unless denominator.positive?
            return Float(match[1]) / denominator
          end
          ratio = Float(text)
          raise ArgumentError, 'drawing scale must be positive' unless ratio.positive?
          ratio
        rescue ArgumentError => error
          raise error if error.message.start_with?('drawing scale')
          raise ArgumentError, "invalid drawing scale: #{value}"
        end

        def validate_path!(path, extension, label)
          text = path.to_s
          raise ArgumentError, "#{label} path required" if text.empty?
          raise ArgumentError, "#{label} path must end with #{extension}" unless File.extname(text).downcase == extension
        end

        def mm_to_in(value)
          Float(value) / MM_PER_INCH
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
