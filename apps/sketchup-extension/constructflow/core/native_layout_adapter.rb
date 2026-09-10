# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      # Consumes the renderer-neutral layout export plan and creates a native
      # LayOut document through the official Layout Ruby API when available.
      class NativeLayoutAdapter
        MM_PER_INCH = 25.4
        FORMAT = 'constructflow.layout_export_plan.v1'
        DICTIONARY = 'constructflow.layout_export'

        def initialize(backend: RubyLayoutBackend.new, sheet_decorator: nil)
          @backend = backend
          @sheet_decorator = sheet_decorator || NativeLayoutSheetDecorator.new(backend: backend)
        end

        def build(export_plan:, skp_path:, layout_path:, pdf_path: nil, template_path: nil)
          plan = stringify_keys(export_plan || {})
          validate_plan!(plan)
          validate_path!(skp_path, '.skp', 'SketchUp model')
          validate_path!(layout_path, '.layout', 'LayOut output')
          validate_path!(pdf_path, '.pdf', 'PDF output') if pdf_path

          sheet = plan.fetch('sheet')
          source = plan.fetch('source')
          page_width_mm, page_height_mm = Array(sheet.fetch('page_size_mm')).map { |value| Float(value) }

          document = @backend.create_document(template_path: template_path)
          @backend.configure_page(document, width_in: mm_to_in(page_width_mm), height_in: mm_to_in(page_height_mm))
          page = @backend.first_page(document)
          layer = @backend.first_layer(document)

          created_viewports = Array(sheet.fetch('viewports')).map do |viewport|
            create_viewport(document: document, page: page, layer: layer, skp_path: skp_path, viewport: viewport)
          end
          decoration = @sheet_decorator.apply(document: document, page: page, layer: layer, sheet: sheet)

          persist_metadata(document, plan, created_viewports.length, decoration)
          @backend.save(document, layout_path)
          @backend.export_pdf(document, pdf_path) if pdf_path

          {
            'status' => 'created',
            'layout_path' => layout_path.to_s,
            'pdf_path' => pdf_path&.to_s,
            'sheet_id' => sheet['id'].to_s,
            'sheet_number' => sheet['number'].to_s,
            'preset_id' => source['preset_id'].to_s,
            'viewport_count' => created_viewports.length,
            'sheet_decoration' => decoration,
            'native_backend' => @backend.name
          }.freeze
        end

        private

        def create_viewport(document:, page:, layer:, skp_path:, viewport:)
          viewport = stringify_keys(viewport || {})
          x_mm, y_mm, width_mm, height_mm = Array(viewport.fetch('bounds_mm')).map { |value| Float(value) }
          bounds = @backend.bounds2d(
            mm_to_in(x_mm), mm_to_in(y_mm), mm_to_in(width_mm), mm_to_in(height_mm)
          )
          model = @backend.create_sketchup_model(skp_path, bounds)
          @backend.select_scene(model, viewport.fetch('scene_name').to_s)
          @backend.set_render_mode(model, viewport.fetch('render_mode').to_s)
          @backend.set_scale(model, parse_scale(viewport.fetch('scale')))
          @backend.add_entity(document, model, layer, page)
          @backend.render(model)
          model
        end

        def persist_metadata(document, plan, viewport_count, decoration)
          return unless document.respond_to?(:set_attribute)

          sheet = plan.fetch('sheet')
          source = plan.fetch('source')
          document.set_attribute(DICTIONARY, 'format', FORMAT)
          document.set_attribute(DICTIONARY, 'sheet_id', sheet['id'].to_s)
          document.set_attribute(DICTIONARY, 'sheet_number', sheet['number'].to_s)
          document.set_attribute(DICTIONARY, 'sheet_title', sheet['title'].to_s)
          document.set_attribute(DICTIONARY, 'revision', sheet['revision'].to_s)
          document.set_attribute(DICTIONARY, 'issue_status', sheet['issue_status'].to_s)
          document.set_attribute(DICTIONARY, 'preset_id', source['preset_id'].to_s)
          document.set_attribute(DICTIONARY, 'scene_name', source['scene_name'].to_s)
          document.set_attribute(DICTIONARY, 'viewport_count', viewport_count)
          document.set_attribute(DICTIONARY, 'title_block_created', decoration['title_block_created'])
          document.set_attribute(DICTIONARY, 'revision_rows', decoration['revision_rows'])
        end

        def validate_plan!(plan)
          raise ArgumentError, "unsupported layout export plan: #{plan['format']}" unless plan['format'].to_s == FORMAT
          raise ArgumentError, 'layout export plan sheet required' unless plan['sheet'].is_a?(Hash)
          raise ArgumentError, 'layout export plan source required' unless plan['source'].is_a?(Hash)
          raise ArgumentError, 'layout export plan requires at least one viewport' if Array(plan.dig('sheet', 'viewports')).empty?
        end

        def validate_path!(path, extension, label)
          text = path.to_s
          raise ArgumentError, "#{label} path required" if text.empty?
          raise ArgumentError, "#{label} path must end with #{extension}" unless File.extname(text).downcase == extension
        end

        def parse_scale(value)
          text = value.to_s.strip
          if (match = text.match(/\A([0-9]+(?:\.[0-9]+)?)\s*:\s*([0-9]+(?:\.[0-9]+)?)\z/))
            numerator = Float(match[1])
            denominator = Float(match[2])
            raise ArgumentError, 'drawing scale denominator must be positive' unless denominator.positive?
            ratio = numerator / denominator
            raise ArgumentError, 'drawing scale must be positive' unless ratio.positive?
            return ratio
          end

          ratio = Float(text)
          raise ArgumentError, 'drawing scale must be positive' unless ratio.positive?
          ratio
        rescue ArgumentError => error
          raise error if error.message.start_with?('drawing scale')
          raise ArgumentError, "invalid drawing scale: #{value}"
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

      # Thin boundary around the official LayOut Ruby API. Keeping this class
      # small makes the export contract testable outside SketchUp/LayOut.
      class RubyLayoutBackend
        def name
          'layout_ruby_api'
        end

        def create_document(template_path: nil)
          ensure_api!
          template_path.to_s.empty? ? Layout::Document.new : Layout::Document.new(template_path.to_s)
        end

        def configure_page(document, width_in:, height_in:)
          page_info = document.page_info
          page_info.width = width_in
          page_info.height = height_in
          document.units = Layout::Document::DECIMAL_MILLIMETERS if document.respond_to?(:units=) && defined?(Layout::Document::DECIMAL_MILLIMETERS)
          page_info.output_resolution = Layout::PageInfo::RESOLUTION_HIGH if page_info.respond_to?(:output_resolution=) && defined?(Layout::PageInfo::RESOLUTION_HIGH)
          page_info
        end

        def first_page(document)
          page = document.pages.first
          raise RuntimeError, 'LayOut document has no page' unless page
          page
        end

        def first_layer(document)
          layer = document.layers.first
          raise RuntimeError, 'LayOut document has no layer' unless layer
          layer
        end

        def bounds2d(x, y, width, height)
          ensure_api!
          Geom::Bounds2d.new(x, y, width, height)
        end

        def create_sketchup_model(path, bounds)
          ensure_api!
          Layout::SketchUpModel.new(path.to_s, bounds)
        end

        def create_text(text, bounds)
          ensure_api!
          Layout::FormattedText.new(text.to_s, bounds)
        end

        def create_rectangle(bounds)
          ensure_api!
          Layout::Rectangle.new(bounds)
        end

        def select_scene(model, scene_name)
          scenes = model.scenes
          index = scenes.index(scene_name.to_s)
          raise ArgumentError, "LayOut viewport scene not found: #{scene_name}" unless index
          model.current_scene = index
          index
        end

        def set_render_mode(model, render_mode)
          constant = case render_mode.to_s
                     when 'vector' then Layout::SketchUpModel::VECTOR_RENDER
                     when 'hybrid' then Layout::SketchUpModel::HYBRID_RENDER
                     when 'raster' then Layout::SketchUpModel::RASTER_RENDER
                     else raise ArgumentError, "unsupported LayOut render mode: #{render_mode}"
                     end
          model.render_mode = constant
        end

        def set_scale(model, scale)
          model.preserve_scale_on_resize = true if model.respond_to?(:preserve_scale_on_resize=)
          model.scale = scale
        end

        def add_entity(document, entity, layer, page)
          document.add_entity(entity, layer, page)
        end

        def render(model)
          model.render if !model.respond_to?(:render_needed?) || model.render_needed?
        end

        def save(document, path)
          document.save(path.to_s)
        end

        def export_pdf(document, path)
          document.export(path.to_s)
        end

        private

        def ensure_api!
          return if defined?(Layout::Document) && defined?(Layout::SketchUpModel) && defined?(Geom::Bounds2d)
          raise RuntimeError, 'LayOut Ruby API is unavailable in this runtime'
        end
      end
    end
  end
end
