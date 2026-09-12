# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class PlanLevelContext
        attr_reader :level_id

        def initialize(runtime, level_id = nil, offset_mm: 0)
          @runtime = runtime
          @level_id = level_id.to_s.strip
          @level_id = nil if @level_id.empty?
          @offset_mm = Float(offset_mm)
        end

        def project(point_mm)
          elevation = elevation_mm
          return point_mm if elevation.nil?

          point = Array(point_mm).dup
          point[2] = elevation
          point
        rescue StandardError
          point_mm
        end

        private

        def elevation_mm
          return unless @level_id
          return unless @runtime.respond_to?(:levels)

          level = @runtime.levels.fetch(@level_id)
          level.elevation_mm + @offset_mm unless level.elevation_mm.nil?
        rescue StandardError
          nil
        end
      end
    end
  end
end
