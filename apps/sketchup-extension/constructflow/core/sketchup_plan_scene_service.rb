# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class SketchupPlanSceneService
        DICTIONARY = 'constructflow.plan_scene'
        DEFAULT_SCENE_NAME = 'ConstructFlow - Plumbing Plan'
        DEFAULT_TAG_NAME = 'CF-DRAWING-PLUMBING'

        def initialize(runtime:, renderer: SketchupPlanRenderer.new)
          @runtime = runtime
          @renderer = renderer
        end

        def refresh(scene_name: DEFAULT_SCENE_NAME, tag_name: DEFAULT_TAG_NAME,
                    scale: '1:50', phase_view: 'proposed', lod: 'construction',
                    object_ids: nil)
          model = @runtime.active_model
          raise ArgumentError, 'active SketchUp model required' unless model

          objects = selected_objects(object_ids)
          transaction = TransactionManager.new(model: model)
          transaction.run("Refresh #{scene_name}") do
            group = find_or_create_output_group(model, scene_name)
            clear_entities(group.entities)
            assign_tag(model, group, tag_name)

            rendered_ids = []
            objects.each do |object|
              next unless @runtime.representations.registered?(object.type, 'plan')

              representation = @runtime.representations.render(
                object: object,
                kind: 'plan',
                view: scene_name,
                scale: scale,
                phase_view: phase_view,
                lod: lod,
                context: { 'renderer' => 'sketchup' }
              )
              @renderer.render(representation: representation, entities: group.entities)
              rendered_ids << object.id
            end

            persist_group_metadata(group, scene_name, scale, phase_view, lod, rendered_ids)
            page = ensure_scene_page(model, scene_name)
            configure_top_parallel_view(model, page)

            {
              'scene_name' => scene_name.to_s,
              'group' => group,
              'page' => page,
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
          return unless group.respond_to?(:layer=)
          return unless model.respond_to?(:layers)

          tag = model.layers[tag_name.to_s]
          tag ||= model.layers.add(tag_name.to_s) if model.layers.respond_to?(:add)
          group.layer = tag if tag
        end

        def persist_group_metadata(group, scene_name, scale, phase_view, lod, object_ids)
          return unless group.respond_to?(:set_attribute)

          group.set_attribute(DICTIONARY, 'managed', true)
          group.set_attribute(DICTIONARY, 'scene_name', scene_name.to_s)
          group.set_attribute(DICTIONARY, 'scale', scale.to_s)
          group.set_attribute(DICTIONARY, 'phase_view', phase_view.to_s)
          group.set_attribute(DICTIONARY, 'lod', lod.to_s)
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
          return unless model.respond_to?(:active_view)
          return unless defined?(Sketchup::Camera)

          bounds = model.respond_to?(:bounds) ? model.bounds : nil
          center = if bounds && bounds.respond_to?(:center)
                     bounds.center
                   else
                     [0.0, 0.0, 0.0]
                   end
          cx, cy, cz = point_components(center)
          eye = [cx, cy, cz + 10_000.0]
          target = [cx, cy, cz]
          camera = Sketchup::Camera.new(eye, target, [0.0, 1.0, 0.0], false)
          model.active_view.camera = camera if model.active_view.respond_to?(:camera=)

          # Updating the page after setting the camera records the orthographic top view.
          page.update if page && page.respond_to?(:update)
        rescue StandardError
          # Scene creation is useful even if camera APIs differ between SketchUp versions.
          nil
        end

        def point_components(point)
          if point.respond_to?(:x) && point.respond_to?(:y) && point.respond_to?(:z)
            [point.x.to_f, point.y.to_f, point.z.to_f]
          else
            values = Array(point)
            [values[0].to_f, values[1].to_f, values[2].to_f]
          end
        end
      end
    end
  end
end
