# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class DrawingViewportSpec
        RENDER_MODES = %w[vector hybrid raster].freeze

        attr_reader :id, :scene_name, :preset_id, :scale, :bounds_mm, :render_mode, :lineweight_profile

        def initialize(id:, scene_name:, preset_id:, scale:, bounds_mm:, render_mode: 'vector', lineweight_profile: 'construction')
          @id = required(id, 'viewport id')
          @scene_name = required(scene_name, 'scene_name')
          @preset_id = required(preset_id, 'preset_id')
          @scale = required(scale, 'scale')
          @bounds_mm = normalize_bounds(bounds_mm).freeze
          @render_mode = render_mode.to_s
          @lineweight_profile = required(lineweight_profile, 'lineweight_profile')
          raise ArgumentError, "unsupported render mode: #{@render_mode}" unless RENDER_MODES.include?(@render_mode)
          freeze
        end

        def to_h
          {
            'id' => id,
            'scene_name' => scene_name,
            'preset_id' => preset_id,
            'scale' => scale,
            'bounds_mm' => bounds_mm,
            'render_mode' => render_mode,
            'lineweight_profile' => lineweight_profile
          }.freeze
        end

        private

        def normalize_bounds(value)
          values = Array(value).map { |item| Float(item) }
          raise ArgumentError, 'bounds_mm must be [x, y, width, height]' unless values.length == 4
          raise ArgumentError, 'viewport x/y must be non-negative' if values[0].negative? || values[1].negative?
          raise ArgumentError, 'viewport width/height must be positive' unless values[2].positive? && values[3].positive?
          values
        end

        def required(value, label)
          text = value.to_s
          raise ArgumentError, "#{label} required" if text.empty?
          text
        end
      end

      class DrawingSheetSpec
        PAPER_SIZES_MM = {
          'A4' => [210.0, 297.0],
          'A3' => [297.0, 420.0],
          'A2' => [420.0, 594.0],
          'A1' => [594.0, 841.0],
          'A0' => [841.0, 1189.0]
        }.freeze
        ORIENTATIONS = %w[portrait landscape].freeze

        attr_reader :id, :number, :title, :paper_size, :orientation, :template_key,
                    :revision, :issue_status, :viewports

        def initialize(id:, number:, title:, paper_size: 'A3', orientation: 'landscape',
                       template_key: 'constructflow.standard', revision: 'P01', issue_status: 'working', viewports: [])
          @id = required(id, 'sheet id')
          @number = required(number, 'sheet number')
          @title = required(title, 'sheet title')
          @paper_size = paper_size.to_s.upcase
          @orientation = orientation.to_s
          @template_key = required(template_key, 'template_key')
          @revision = revision.to_s
          @issue_status = issue_status.to_s
          @viewports = Array(viewports).dup.freeze
          raise ArgumentError, "unsupported paper size: #{@paper_size}" unless PAPER_SIZES_MM.key?(@paper_size)
          raise ArgumentError, "unsupported orientation: #{@orientation}" unless ORIENTATIONS.include?(@orientation)
          raise ArgumentError, 'viewports must be DrawingViewportSpec values' unless @viewports.all? { |item| item.is_a?(DrawingViewportSpec) }
          validate_viewport_fit!
          freeze
        end

        def page_size_mm
          width, height = PAPER_SIZES_MM.fetch(paper_size)
          orientation == 'landscape' ? [height, width].freeze : [width, height].freeze
        end

        def to_h
          {
            'id' => id,
            'number' => number,
            'title' => title,
            'paper_size' => paper_size,
            'orientation' => orientation,
            'page_size_mm' => page_size_mm,
            'template_key' => template_key,
            'revision' => revision,
            'issue_status' => issue_status,
            'viewports' => viewports.map(&:to_h).freeze
          }.freeze
        end

        private

        def validate_viewport_fit!
          page_width, page_height = page_size_mm
          viewports.each do |viewport|
            x, y, width, height = viewport.bounds_mm
            next if (x + width) <= page_width && (y + height) <= page_height
            raise ArgumentError, "viewport exceeds #{paper_size} #{orientation} page bounds: #{viewport.id}"
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
