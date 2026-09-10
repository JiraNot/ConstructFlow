# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      # Renderer-neutral representations are converted to lightweight SketchUp
      # line/text geometry here. Domain modules remain owners of semantic output;
      # this adapter only knows primitive shapes and SketchUp units.
      class SketchupPlanRenderer
        MM_PER_INCH = 25.4
        DICTIONARY = 'constructflow.representation'

        def initialize(annotation_step_mm: 150.0)
          @annotation_step_mm = Float(annotation_step_mm)
        end

        def render(representation:, entities:)
          result = stringify_keys(representation || {})
          raise ArgumentError, 'entities collection required' unless entities
          raise ArgumentError, 'representation object_id required' if result['object_id'].to_s.empty?
          raise ArgumentError, 'representation kind required' if result['kind'].to_s.empty?

          created = []
          Array(result['primitives']).each do |primitive|
            created.concat(render_primitive(entities, stringify_keys(primitive)))
          end
          Array(result['annotations']).each_with_index do |annotation, index|
            entity = render_annotation(entities, stringify_keys(annotation), index)
            created << entity if entity
          end

          created.each do |entity|
            next unless entity.respond_to?(:set_attribute)

            entity.set_attribute(DICTIONARY, 'source_object_id', result['object_id'].to_s)
            entity.set_attribute(DICTIONARY, 'representation_kind', result['kind'].to_s)
            entity.set_attribute(DICTIONARY, 'owner_module', result['owner_module'].to_s)
          end
          created.freeze
        end

        private

        def render_primitive(entities, primitive)
          case primitive['type'].to_s
          when 'polyline', 'closed_polyline'
            render_polyline(entities, primitive)
          when 'flow_arrow'
            render_flow_arrow(entities, primitive)
          when 'symbol'
            render_symbol(entities, primitive)
          else
            []
          end
        end

        def render_polyline(entities, primitive)
          points = Array(primitive['points_mm']).map { |point| sketchup_point(point) }
          return [] if points.length < 2

          points.each_cons(2).filter_map do |from, to|
            next if same_point?(from, to)

            entities.add_line(from, to)
          end
        end

        def render_flow_arrow(entities, primitive)
          from_mm = Array(primitive['from_mm'])
          to_mm = Array(primitive['to_mm'])
          return [] unless from_mm.length >= 3 && to_mm.length >= 3

          from = sketchup_point(from_mm)
          to = sketchup_point(to_mm)
          dx = to_mm[0].to_f - from_mm[0].to_f
          dy = to_mm[1].to_f - from_mm[1].to_f
          length = Math.sqrt((dx * dx) + (dy * dy))
          return [] if length <= 0.001

          ux = dx / length
          uy = dy / length
          arrow_length = [length * 0.20, 250.0].min
          arrow_length = 75.0 if arrow_length < 75.0
          half_width = arrow_length * 0.45
          base_x = to_mm[0].to_f - (ux * arrow_length)
          base_y = to_mm[1].to_f - (uy * arrow_length)
          px = -uy
          py = ux
          z = to_mm[2].to_f
          left = sketchup_point([base_x + (px * half_width), base_y + (py * half_width), z])
          right = sketchup_point([base_x - (px * half_width), base_y - (py * half_width), z])

          [
            entities.add_line(from, to),
            entities.add_line(to, left),
            entities.add_line(to, right)
          ].compact
        end

        def render_symbol(entities, primitive)
          text = primitive['symbol'].to_s
          return [] if text.empty? || !entities.respond_to?(:add_text)

          [entities.add_text(text, sketchup_point(primitive['position_mm']))].compact
        end

        def render_annotation(entities, annotation, index)
          return nil unless annotation['type'].to_s == 'text'
          return nil unless entities.respond_to?(:add_text)

          text = annotation['text'].to_s
          return nil if text.empty?

          anchor = Array(annotation['anchor_mm']).map(&:to_f)
          return nil if anchor.length < 3

          # Semantic providers own the anchor. The SketchUp adapter applies only a
          # deterministic display offset so several labels at one node stay legible.
          anchor[1] += @annotation_step_mm * index
          entities.add_text(text, sketchup_point(anchor))
        end

        def sketchup_point(point_mm)
          values = Array(point_mm)
          raise ArgumentError, 'point requires x, y, z' if values.length < 3

          values.first(3).map { |value| Float(value) / MM_PER_INCH }
        end

        def same_point?(a, b)
          a.zip(b).all? { |left, right| (left - right).abs <= 1.0e-9 }
        end

        def stringify_keys(value)
          return value unless value.is_a?(Hash)

          value.each_with_object({}) do |(key, item), result|
            result[key.to_s] = item.is_a?(Hash) ? stringify_keys(item) : item
          end
        end
      end
    end
  end
end
