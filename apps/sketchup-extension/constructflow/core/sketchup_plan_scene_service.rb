# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class SketchupPlanSceneService
        DICTIONARY = 'constructflow.plan_scene'
        DEFAULT_SCENE_NAME = 'ConstructFlow - Plumbing Plan'
        DEFAULT_TAG_NAME = 'CF-DRAWING-PLUMBING'

        def initialize(runtime:, renderer: nil, presentation_service: SketchupScenePresentationService.new)
          @runtime = runtime
          style_registry = runtime.respond_to?(:plan_graphic_styles) ? runtime.plan_graphic_styles : nil
          native_adapter = SketchupNativeGraphicStyleAdapter.new
          @renderer = renderer || SketchupPlanRenderer.new(
            style_registry: style_registry,
            native_style_adapter: native_adapter
          )
          @presentation_service = presentation_service
        end

        def refresh_preset(preset_id, object_ids: nil)
          preset = @runtime.drawing_view_presets.fetch!(preset_id)
          refresh(
            scene_name: preset.scene_name,
            tag_name: preset.tag_name,
            scale: preset.scale,
            phase_view: preset.phase_view,
            lod: preset.lod,
            drawing_family: preset.drawing_family,
            preset_id: preset.id,
            context: preset.context,
            object_ids: object_ids
          )
        end

        def refresh(scene_name: DEFAULT_SCENE_NAME, tag_name: DEFAULT_TAG_NAME,
                    scale: '1:50', phase_view: 'proposed', lod: 'construction',
                    drawing_family: nil, preset_id: nil, context: {}, object_ids: nil)
          model = @runtime.active_model
          raise ArgumentError, 'active SketchUp model required' unless model

          objects = selected_objects(object_ids).select { |object| visible_in_phase?(object, phase_view) }
          transaction = TransactionManager.new(model: model)
          transaction.run("Refresh #{scene_name}") do
            group = find_or_create_output_group(model, scene_name)
            clear_entities(group.entities)
            assign_tag(model, group, tag_name)

            rendered_ids = []
            objects.each do |object|
              next unless @runtime.representations.registered?(object.type, 'plan')

              representation = @runtime.representations.render(
                object: object, kind: 'plan', view: scene_name, scale: scale,
                phase_view: phase_view, lod: lod,
                context: { 'renderer' => 'sketchup', 'drawing_family' => drawing_family }.merge(stringify_keys(context || {}))
              )
              next if drawing_family && representation.dig('metadata', 'drawing_family').to_s != drawing_family.to_s

              @renderer.render(representation: representation, entities: group.entities, model: model)
              rendered_ids << object.id
            end

            persist_group_metadata(group, scene_name, scale, phase_view, lod, drawing_family, preset_id, rendered_ids)
            page = ensure_scene_page(model, scene_name)
            presentation = @presentation_service.apply(model: model, page: page, active_drawing_tag: tag_name)
            configure_top_parallel_view(model, page)
            {
              'scene_name' => scene_name.to_s,
              'group' => group,
              'page' => page,
              'preset_id' => preset_id&.to_s,
              'presentation' => presentation,
              'rendered_object_ids' => rendered_ids.freeze,
              'rendered_count' => rendered_ids.length
            }.freeze
          end
        end

        private

        def selected_objects(object_ids)
          return @runtime.smart_objects.all if object_ids.nil?
          Array(object_ids).filter_map { |id| @runtime.smart_objects.fetch_by_id(id) }
        end

        def visible_in_phase?(object, phase_view)
          created = object.respond_to?(:created_phase) ? object.created_phase.to_s : ''
          removed = object.respond_to?(:removed_phase) ? object.removed_phase.to_s : ''
          case phase_view.to_s
          when 'existing'
            created == 'existing' && removed != 'demolition'
          when 'demolition'
            created == 'existing'
          when 'proposed'
            removed != 'demolition' && %w[existing new_construction].include?(created)
          when 'coordination', 'all', ''
            true
          else
            true
          end
        end

        def find_or_create_output_group(model, scene_name)
          model.entities.each do |entity|
            next unless entity.respond_to?(:get_attribute)
            next unless entity.get_attribute(DICTIONARY, 'managed', false)
            next unless entity.get_attribute(DICTIONARY, 'scene_name', '').to_s == scene_name.to_s
            return entity
          end
          raise ArgumentError, 'model entities do not support groups' unless model.entities.respond_to?(:add_group)
          group = model.entities.add_group
          group.name = scene_name.to_s if group.respond_to?(:name=)
          group.set_attribute(DICTIONARY, 'managed', true) if group.respond_to?(:set_attribute)
          group.set_attribute(DICTIONARY, 'scene_name', scene_name.to_s) if group.respond_to?(:set_attribute)
          group
        end

        def clear_entities(entities)
          if entities.respond_to?(:clear!)
            entities.clear!
          elsif entities.respond_to?(:erase_entities)
            entities.erase_entities(entities.to_a)
          elsif entities.respond_to?(:clear)
            entities.clear
          else
            raise ArgumentError, 'target entities collection cannot be cleared'
          end
        end

        def assign_tag(model, group, tag_name)
          return unless group.respond_to?(:layer=) && model.respond_to?(:layers)
          tag = model.layers[tag_name.to_s]
          tag ||= model.layers.add(tag_name.to_s) if model.layers.respond_to?(:add)
          group.layer = tag if tag
        end

        def persist_group_metadata(group, scene_name, scale, phase_view, lod, drawing_family, preset_id, object_ids)
          return unless group.respond_to?(:set_attribute)
          group.set_attribute(DICTIONARY, 'managed', true)
          group.set_attribute(DICTIONARY, 'scene_name', scene_name.to_s)
          group.set_attribute(DICTIONARY, 'scale', scale.to_s)
          group.set_attribute(DICTIONARY, 'phase_view', phase_view.to_s)
          group.set_attribute(DICTIONARY, 'lod', lod.to_s)
          group.set_attribute(DICTIONARY, 'drawing_family', drawing_family.to_s) if drawing_family
          group.set_attribute(DICTIONARY, 'preset_id', preset_id.to_s) if preset_id
          group.set_attribute(DICTIONARY, 'source_object_ids', object_ids.join(','))
        end

        def ensure_scene_page(model, scene_name)
          return nil unless model.respond_to?(:pages)
          pages = model.pages
          page = pages[scene_name.to_s] if pages.respond_to?(:[])
          page ||= pages.add(scene_name.to_s) if pages.respond_to?(:add)
          page
        end

        def configure_top_parallel_view(model, page)
          return unless model.respond_to?(:active_view) && defined?(Sketchup::Camera)
          bounds = model.respond_to?(:bounds) ? model.bounds : nil
          center = bounds && bounds.respond_to?(:center) ? bounds.center : [0.0, 0.0, 0.0]
          cx, cy, cz = point_components(center)
          camera = Sketchup::Camera.new([cx, cy, cz + 10_000.0], [cx, cy, cz], [0.0, 1.0, 0.0], false)
          model.active_view.camera = camera if model.active_view.respond_to?(:camera=)
          page.update if page && page.respond_to?(:update)
        rescue StandardError
          nil
        end

        def point_components(point)
          return [point.x.to_f, point.y.to_f, point.z.to_f] if point.respond_to?(:x) && point.respond_to?(:y) && point.respond_to?(:z)
          values = Array(point); [values[0].to_f, values[1].to_f, values[2].to_f]
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
