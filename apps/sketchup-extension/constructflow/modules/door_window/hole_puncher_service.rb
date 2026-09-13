# frozen_string_literal: true

require_relative '../../core/units'

module JiraNot
  module ConstructFlow
    module DoorWindow
      class HolePuncherService
        def initialize(runtime)
          @runtime = runtime
        end

        def auto_punch(instance)
          return unless defined?(::Sketchup::ComponentInstance) && instance.is_a?(::Sketchup::ComponentInstance)
          
          wall_host = @runtime.capabilities.fetch('wall.host_surface', nil)
          return unless wall_host
          
          bounds = instance.bounds
          center = bounds.center
          
          best_wall = nil
          best_dist = Float::INFINITY
          @runtime.smart_objects.all.each do |obj|
            next unless wall_host.compatible_host?(obj)
            
            wall_bounds = obj.entity.bounds
            next unless wall_bounds.intersect(bounds).valid?
            
            dist = obj.entity.bounds.center.distance(center)
            if dist < best_dist
              best_wall = obj
              best_dist = dist
            end
          end
          
          return unless best_wall
          
          width_su = bounds.width
          height_su = bounds.height
          sill_su = bounds.corner(0).z - best_wall.entity.bounds.corner(0).z
          
          width_mm = Core::Units.su_to_mm(width_su)
          height_mm = Core::Units.su_to_mm(height_su)
          sill_mm = Core::Units.su_to_mm(sill_su)
          
          point_mm = Core::Units.point_to_mm(center)
          
          placement = wall_host.locate(best_wall, point_mm)
          start_offset = placement[:distance_along_mm] - (width_mm / 2.0)
          
          descriptor = {
            segment_index: placement[:segment_index],
            start_offset_mm: start_offset,
            width_mm: width_mm,
            height_mm: height_mm,
            sill_mm: sill_mm > 0 ? sill_mm : 0.0
          }
          
          opening_id = SecureRandom.uuid
          wall_host.attach_opening(best_wall, opening_id: opening_id, descriptor: descriptor)
          
          obj_id = SecureRandom.uuid
          @runtime.smart_objects.register(
            instance, 
            id: obj_id, 
            owner_module: 'constructflow.door_window', 
            type: 'door_window.instance'
          )
          
          instance.set_attribute('ConstructFlow', 'opening_id', opening_id)
          instance.set_attribute('ConstructFlow', 'type_id', 'custom.placed')
          
          @runtime.active_model.active_view.invalidate
          puts "[ConstructFlow] Auto-punched hole in wall #{best_wall.id} for placed component."
        rescue StandardError => e
          puts "[ConstructFlow] Auto-punch failed: #{e.message}"
        end
      end
      
      class ComponentDropObserver < Sketchup::ModelObserver
        def initialize(runtime)
          @runtime = runtime
          @puncher = HolePuncherService.new(runtime)
        end
        
        def onPlaceComponent(model, instance)
          @puncher.auto_punch(instance)
        end
      end
    end
  end
end
