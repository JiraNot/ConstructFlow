# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      # Owns SketchUp Scene visibility for ConstructFlow-generated drawing output.
      # It only touches ConstructFlow-managed tags and never changes unrelated user tags.
      class SketchupScenePresentationService
        DRAWING_TAG_PREFIX = 'CF-DRAWING-'
        STYLE_TAG_PREFIX = 'CF-STYLE-'
        DICTIONARY = 'constructflow.scene_presentation'

        def apply(model:, page:, active_drawing_tag:)
          return empty_result(active_drawing_tag) unless model && model.respond_to?(:layers)

          active_name = active_drawing_tag.to_s
          drawing_tags = []
          style_tags = []

          each_layer(model.layers) do |tag|
            name = tag_name(tag)
            if name.start_with?(DRAWING_TAG_PREFIX)
              set_visible(tag, name == active_name)
              drawing_tags << name
            elsif name.start_with?(STYLE_TAG_PREFIX)
              set_visible(tag, true)
              style_tags << name
            end
          end

          page.update if page && page.respond_to?(:update)
          persist_page_metadata(page, active_name, drawing_tags, style_tags)

          {
            'active_drawing_tag' => active_name,
            'managed_drawing_tags' => drawing_tags.sort.freeze,
            'managed_style_tags' => style_tags.sort.freeze
          }.freeze
        end

        private

        def each_layer(layers, &block)
          values = if layers.respond_to?(:to_a)
                     layers.to_a
                   elsif layers.respond_to?(:each)
                     layers.each.to_a
                   else
                     []
                   end
          values.each(&block)
        end

        def tag_name(tag)
          tag.respond_to?(:name) ? tag.name.to_s : tag.to_s
        end

        def set_visible(tag, value)
          tag.visible = value if tag.respond_to?(:visible=)
        end

        def persist_page_metadata(page, active_name, drawing_tags, style_tags)
          return unless page && page.respond_to?(:set_attribute)

          page.set_attribute(DICTIONARY, 'active_drawing_tag', active_name)
          page.set_attribute(DICTIONARY, 'managed_drawing_tags', drawing_tags.sort.join(','))
          page.set_attribute(DICTIONARY, 'managed_style_tags', style_tags.sort.join(','))
        end

        def empty_result(active_drawing_tag)
          {
            'active_drawing_tag' => active_drawing_tag.to_s,
            'managed_drawing_tags' => [].freeze,
            'managed_style_tags' => [].freeze
          }.freeze
        end
      end
    end
  end
end
