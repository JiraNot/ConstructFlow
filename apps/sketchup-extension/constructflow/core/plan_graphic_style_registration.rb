# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module PlanGraphicStyleRegistration
        module_function

        def install(registry)
          %w[simple construction coordination].each do |profile|
            registry.register_role("#{profile}_waste", style("#{profile}_waste", 'solid', profile == 'simple' ? 'normal' : 'medium', 'waste'))
            registry.register_role("#{profile}_soil", style("#{profile}_soil", 'solid', profile == 'simple' ? 'normal' : 'medium', 'soil'))
            registry.register_role("#{profile}_rainwater", style("#{profile}_rainwater", 'dash', profile == 'simple' ? 'normal' : 'medium', 'rainwater'))
          end
          registry.register_role('drainage_node', style('drainage_node', 'solid', 'medium', 'drainage_node'))

          registry.register_phase('existing', {
            'style_id' => 'phase_existing', 'line_weight' => 'light', 'color_key' => 'existing', 'emphasis' => 'background'
          })
          registry.register_phase('new_construction', {
            'style_id' => 'phase_new', 'line_weight' => 'strong', 'color_key' => 'new_work', 'emphasis' => 'foreground'
          })
          registry.register_phase('demolition', {
            'style_id' => 'phase_demolition', 'stroke_pattern' => 'dash', 'line_weight' => 'medium',
            'color_key' => 'demolition', 'emphasis' => 'foreground'
          })
          registry.register_status('verify', {
            'style_id' => 'status_verify', 'stroke_pattern' => 'dash_dot', 'color_key' => 'verify', 'emphasis' => 'warning'
          })
          registry
        end

        def style(id, pattern, weight, color_key)
          {
            'style_id' => id,
            'stroke_pattern' => pattern,
            'line_weight' => weight,
            'color_key' => color_key,
            'emphasis' => 'normal'
          }
        end
      end
    end
  end
end
