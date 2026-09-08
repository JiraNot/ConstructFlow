# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Opening
      class OpeningInfillHostCapability
        CAPABILITY_ID = 'opening.infill_host'
        DEFAULT_TOLERANCE_MM = 2.0

        def initialize(repository:, object_resolver:, wall_host_capability:)
          @repository = repository
          @object_resolver = object_resolver
          @wall_host_capability = wall_host_capability
        end

        def compatible_host?(smart_object)
          smart_object &&
            smart_object.owner_module == 'constructflow.opening' &&
            smart_object.type.start_with?('opening.')
        end

        def definition(opening_object)
          ensure_host!(opening_object)
          @repository.read(opening_object.entity) || raise(KeyError, 'opening definition missing')
        end

        def dimensions(opening_object)
          value = definition(opening_object)
          {
            width_mm: value.width_mm,
            height_mm: value.height_mm,
            sill_mm: value.sill_mm,
            shape: value.shape
          }.freeze
        end

        def infill_ref(opening_object)
          ensure_host!(opening_object)
          @repository.infill_ref(opening_object.entity)
        end

        def frame_points(opening_object)
          value = definition(opening_object)
          wall = @object_resolver.call(value.host_object_id)
          raise KeyError, "opening wall host not found: #{value.host_object_id}" unless wall

          @wall_host_capability.opening_frame_points(wall, value.host_descriptor)
        end

        def fit_status(opening_object, width_mm:, height_mm:, tolerance_mm: DEFAULT_TOLERANCE_MM)
          value = definition(opening_object)
          tolerance = Float(tolerance_mm)
          width = Float(width_mm)
          height = Float(height_mm)
          return 'not_compatible' unless value.shape == 'rectangular'
          return 'not_compatible' unless width.positive? && height.positive?

          width_delta = (value.width_mm - width).abs
          height_delta = (value.height_mm - height).abs
          return 'exact_fit' if width_delta <= tolerance && height_delta <= tolerance

          'resize_required'
        end

        def validate_infill(opening_object, infill_id:, width_mm:, height_mm:, tolerance_mm: DEFAULT_TOLERANCE_MM)
          errors = []
          errors << 'infill id required' if infill_id.to_s.strip.empty?
          status = fit_status(
            opening_object,
            width_mm: width_mm,
            height_mm: height_mm,
            tolerance_mm: tolerance_mm
          )
          errors << 'infill is not compatible with opening shape/dimensions' if status == 'not_compatible'
          errors << 'infill dimensions require opening resize' if status == 'resize_required'

          current = infill_ref(opening_object)
          if current && current['infill_id'].to_s != infill_id.to_s
            errors << 'opening already has an infill'
          end
          errors.freeze
        end

        def attach_infill(opening_object, infill_id:, infill_type:, width_mm:, height_mm:,
                          tolerance_mm: DEFAULT_TOLERANCE_MM)
          errors = validate_infill(
            opening_object,
            infill_id: infill_id,
            width_mm: width_mm,
            height_mm: height_mm,
            tolerance_mm: tolerance_mm
          )
          raise ArgumentError, errors.join('; ') unless errors.empty?

          value = {
            'infill_id' => infill_id.to_s,
            'infill_type' => infill_type.to_s,
            'width_mm' => Float(width_mm),
            'height_mm' => Float(height_mm)
          }
          @repository.write_infill_ref(opening_object.entity, value)
          value.freeze
        end

        def detach_infill(opening_object, infill_id: nil)
          current = infill_ref(opening_object)
          return false unless current
          return false if infill_id && current['infill_id'].to_s != infill_id.to_s

          @repository.write_infill_ref(opening_object.entity, nil)
          true
        end

        private

        def ensure_host!(opening_object)
          raise ArgumentError, 'compatible opening host required' unless compatible_host?(opening_object)
        end
      end
    end
  end
end
