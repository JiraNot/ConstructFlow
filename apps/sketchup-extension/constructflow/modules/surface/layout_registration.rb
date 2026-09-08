# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Surface
      module LayoutRegistration
        module_function

        def install(runtime)
          return if runtime.commands.registered?('SolvePavingLayout')

          repository = Repository.new
          geometry = Geometry.new
          solver = LayoutSolver.new

          register_solve(runtime, repository, geometry, solver, 'SolvePavingLayout')
          register_solve(runtime, repository, geometry, solver, 'RegeneratePavingLayout')
          install_ui(runtime, repository)
        end

        def register_solve(runtime, repository, geometry, solver, command_name)
          runtime.commands.register(
            command_name,
            owner_module: 'constructflow.surface',
            validator: ->(command) { solve_validation_errors(command[:input], runtime, repository) }
          ) do |command|
            input = command[:input]
            pattern_object = resolve_pattern(input, runtime)
            pattern_definition = repository.read_pattern(pattern_object.entity)
            surface_object = runtime.smart_objects.fetch_by_id(pattern_definition.surface_object_id)
            raise ArgumentError, 'host surface not found' unless surface_object

            surface_definition = repository.read_surface(surface_object.entity)
            layout = solver.solve(
              surface_definition: surface_definition,
              pattern_definition: pattern_definition,
              pattern_object_id: pattern_object.id
            )
            unless layout.solved?
              raise ArgumentError, layout.warnings.join('; ')
            end

            locked_pattern = pattern_definition.with(layout_state: 'locked')
            repository.write_pattern(pattern_object.entity, locked_pattern)
            repository.write_layout(pattern_object.entity, layout)
            geometry.rebuild_locked_layout!(pattern_object.entity, layout_definition: layout)

            runtime.smart_objects.clear_dirty(pattern_object.entity, 'dirty_layout')
            runtime.smart_objects.clear_dirty(surface_object.entity, 'dirty_layout')
            runtime.smart_objects.mark_dirty(pattern_object.entity, 'dirty_quantity', 'dirty_drawing')
            runtime.smart_objects.mark_dirty(surface_object.entity, 'dirty_quantity', 'dirty_drawing')

            affected = [pattern_object.id, surface_object.id]
            {
              updated_object_ids: affected,
              warnings: layout.warnings,
              events: [
                {
                  name: command_name == 'RegeneratePavingLayout' ? 'LayoutRegenerated' : 'LayoutSolved',
                  object_ids: affected,
                  payload: layout.summary(surface_net_area_mm2: surface_definition.net_area_mm2)
                },
                { name: 'LayoutLocked', object_ids: affected },
                { name: 'GeometryChanged', object_ids: [pattern_object.id] },
                { name: 'QuantityDirty', object_ids: affected },
                { name: 'DrawingDirty', object_ids: affected },
                {
                  name: 'ValidationStateChanged',
                  object_ids: affected,
                  payload: {
                    minimum_cut_violations: layout.minimum_cut_violations.length,
                    warnings: layout.warnings
                  }
                }
              ]
            }
          end
        end

        def solve_validation_errors(input, runtime, repository)
          pattern_object = resolve_pattern(input, runtime)
          return ['paving pattern not found'] unless pattern_object

          pattern = repository.read_pattern(pattern_object.entity)
          return ['paving pattern definition missing'] unless pattern
          return ["piece solver does not support #{pattern.pattern} yet"] unless LayoutSolver::SUPPORTED_PATTERNS.include?(pattern.pattern)

          surface = runtime.smart_objects.fetch_by_id(pattern.surface_object_id)
          return ['host surface not found'] unless surface
          surface_definition = repository.read_surface(surface.entity)
          return ['host surface definition missing'] unless surface_definition

          errors = pattern.errors + surface_definition.errors
          errors.uniq
        rescue StandardError => error
          [error.message]
        end

        def resolve_pattern(input, runtime)
          entity = input[:pattern_entity] || input['pattern_entity'] || input[:entity] || input['entity']
          object_id = input[:pattern_object_id] || input['pattern_object_id'] || input[:object_id] || input['object_id']
          object = entity ? runtime.smart_objects.fetch(entity) : runtime.smart_objects.fetch_by_id(object_id)
          return nil unless object && object.owner_module == 'constructflow.surface' && object.type == 'surface.pattern'
          object
        end

        def install_ui(runtime, repository)
          menu = runtime.menu.add_submenu('Paving Layout Solver')
          menu.add_item('Solve Selected Paving Pattern') do
            pattern = selected_pattern(runtime)
            unless pattern
              UI.messagebox('Select one ConstructFlow Paving Pattern first.')
              next
            end
            execute_and_report(runtime, repository, 'SolvePavingLayout', pattern)
          end

          menu.add_item('Regenerate Selected Paving Layout') do
            pattern = selected_pattern(runtime)
            unless pattern
              UI.messagebox('Select one ConstructFlow Paving Pattern first.')
              next
            end
            execute_and_report(runtime, repository, 'RegeneratePavingLayout', pattern)
          end
        end

        def selected_pattern(runtime)
          runtime.active_model.selection.filter_map { |entity| runtime.smart_objects.fetch(entity) }
                 .find { |object| object.owner_module == 'constructflow.surface' && object.type == 'surface.pattern' }
        end

        def execute_and_report(runtime, repository, command_name, pattern)
          result = runtime.commands.execute(
            command_name,
            { pattern_object_id: pattern.id },
            project_id: runtime.project.project_id
          )
          unless result[:status] == 'success'
            UI.messagebox(result[:errors].join("\n"))
            return
          end

          layout = repository.read_layout(pattern.entity)
          message = if layout&.solved?
                      [
                        'Paving layout solved',
                        "Pieces: #{layout.piece_count}",
                        "Full: #{layout.full_count}",
                        "Cut: #{layout.cut_count}",
                        "Minimum-cut warnings: #{layout.minimum_cut_violations.length}"
                      ].join("\n")
                    else
                      'Paving layout completed without a solved result.'
                    end
          UI.messagebox(message)
        rescue StandardError => error
          UI.messagebox("ConstructFlow Paving Solver error: #{error.message}")
        end
      end
    end
  end
end
