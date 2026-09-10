# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      module RouteNodeUiRegistration
        module_function

        def install(runtime)
          menu = runtime.menu.add_submenu('Drainage Route Editing')
          menu.add_item('Edit Selected Route Grips') do
            routes = selected_routes(runtime)
            if routes.length != 1
              UI.messagebox('Select exactly one ConstructFlow drainage route first.')
              next
            end
            runtime.active_model.select_tool(
              Tools::RouteNodeTool.new(runtime: runtime, route_object_id: routes.first.id, regrade: true)
            )
          end
          true
        end

        def selected_routes(runtime)
          runtime.active_model.selection.filter_map do |entity|
            object = runtime.smart_objects.fetch(entity)
            object if object && object.type == 'drainage.pipe_route' && object.owner_module == 'constructflow.drainage'
          end
        end
      end
    end
  end
end
