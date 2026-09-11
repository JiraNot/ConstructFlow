# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Roof
      # Pure planning service for preliminary roof-rainwater demand and outlet layout.
      #
      # This service deliberately does not choose a code rainfall intensity, gutter
      # profile, downpipe diameter, or manufacturer capacity. Those are project/
      # jurisdiction/catalog facts and must be supplied explicitly by the caller.
      class RainwaterCatchmentPlanner
        FORMAT = 'constructflow.roof_rainwater_catchment_plan.v1'
        FORMULA_VERSION = 'rational_method_projection.v1'
        LOW_EAVE_TOLERANCE_MM = 1.0

        def plan(roof_definition:, design_rainfall_mm_per_hr:, runoff_coefficient:,
                 outlet_capacity_lps:, edge_index: nil)
          raise ArgumentError, 'roof definition required' unless roof_definition
          raise ArgumentError, roof_definition.errors.join('; ') unless roof_definition.valid?

          intensity = positive_float(design_rainfall_mm_per_hr, 'design rainfall intensity')
          coefficient = bounded_coefficient(runoff_coefficient)
          capacity = positive_float(outlet_capacity_lps, 'outlet capacity')

          area_m2 = roof_definition.plan_area_mm2 / 1_000_000.0
          # 1 mm rainfall over 1 m² = 1 litre. Convert per hour to per second.
          peak_flow_lps = (intensity * area_m2 * coefficient) / 3600.0
          required_count = [1, (peak_flow_lps / capacity).ceil].max

          low_edges = low_eave_edge_indices(roof_definition)
          selected_edge, selection_source = select_edge(
            roof_definition,
            explicit_edge_index: edge_index,
            low_edge_indices: low_edges
          )

          warnings = [
            'preliminary rainwater planning only; verify design rainfall, runoff coefficient, outlet/gutter capacity and local requirements before construction issue'
          ]
          if selected_edge.nil?
            warnings << 'low-eave outlet edge is not uniquely resolvable; select an edge explicitly before generating rainwater hardware'
          elsif selection_source == 'explicit' && !low_edges.empty? && !low_edges.include?(selected_edge)
            warnings << 'explicit outlet edge is not one of the resolved low-eave edges; review drainage direction before use'
          end

          {
            'format' => FORMAT,
            'formula_version' => FORMULA_VERSION,
            'status' => selected_edge.nil? ? 'needs_edge_selection' : 'ready_for_review',
            'roof_form' => roof_definition.roof_form,
            'catchment_area_m2' => area_m2,
            'design_rainfall_mm_per_hr' => intensity,
            'runoff_coefficient' => coefficient,
            'peak_flow_lps' => peak_flow_lps,
            'outlet_capacity_lps' => capacity,
            'required_outlet_count' => required_count,
            'low_eave_edge_indices' => low_edges.freeze,
            'suggested_edge_index' => selected_edge,
            'edge_selection_source' => selection_source,
            'suggested_outlet_ratios' => selected_edge.nil? ? [].freeze : evenly_spaced_ratios(required_count),
            'warnings' => warnings.freeze
          }.freeze
        end

        private

        def positive_float(value, label)
          number = Float(value)
          raise ArgumentError, "#{label} must be greater than zero" unless number.positive?
          number
        rescue TypeError, ArgumentError
          raise ArgumentError, "#{label} must be greater than zero"
        end

        def bounded_coefficient(value)
          coefficient = Float(value)
          unless coefficient.positive? && coefficient <= 1.0
            raise ArgumentError, 'runoff coefficient must be greater than 0 and at most 1'
          end
          coefficient
        rescue TypeError, ArgumentError
          raise ArgumentError, 'runoff coefficient must be greater than 0 and at most 1'
        end

        def low_eave_edge_indices(definition)
          points = definition.sloped_points_mm
          return [] if points.length < 2

          min_z = points.map { |point| point[2] }.min
          points.each_index.select do |index|
            start_point = points[index]
            end_point = points[(index + 1) % points.length]
            (start_point[2] - min_z).abs <= LOW_EAVE_TOLERANCE_MM &&
              (end_point[2] - min_z).abs <= LOW_EAVE_TOLERANCE_MM
          end.map(&:to_i)
        end

        def select_edge(definition, explicit_edge_index:, low_edge_indices:)
          unless explicit_edge_index.nil?
            index = Integer(explicit_edge_index)
            raise ArgumentError, 'rainwater outlet edge index out of range' unless index.between?(0, definition.boundary_mm.length - 1)
            return [index, 'explicit']
          end

          return [low_edge_indices.first, 'unique_low_eave'] if low_edge_indices.length == 1
          [nil, 'unresolved']
        rescue TypeError, ArgumentError
          raise ArgumentError, 'rainwater outlet edge index out of range'
        end

        def evenly_spaced_ratios(count)
          denominator = count + 1.0
          (1..count).map { |index| index / denominator }.freeze
        end
      end
    end
  end
end
