# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      class RouteCandidateEvaluator
        def initialize(runtime:)
          @runtime = runtime
        end

        def evaluate(route_nodes_mm)
          obstacles = structural_obstacles
          clashes = []
          Array(route_nodes_mm).each_cons(2).with_index do |(a, b), segment_index|
            segment_box = bounding_box(a, b)
            obstacles.each do |obstacle|
              next unless boxes_intersect?(segment_box, obstacle[:box])

              clashes << {
                'segment_index' => segment_index,
                'object_id' => obstacle[:object_id],
                'object_type' => obstacle[:object_type],
                'box_mm' => stringify_box(obstacle[:box])
              }.freeze
            end
          end
          {
            'clear' => clashes.empty?,
            'clashes' => clashes.freeze,
            'obstacle_count' => obstacles.length
          }.freeze
        end

        private

        def structural_obstacles
          capability = @runtime.capabilities.fetch('structure.coordination')
          @runtime.smart_objects.all.filter_map do |object|
            next unless capability.compatible?(object)
            {
              object_id: object.id,
              object_type: object.type,
              box: capability.bounding_box_mm(object)
            }
          end
        rescue KeyError
          []
        end

        def bounding_box(a, b)
          aa = normalize_point(a)
          bb = normalize_point(b)
          {
            min: [aa[0], bb[0]].minmax.first.then { |x| [x, [aa[1], bb[1]].min, [aa[2], bb[2]].min] },
            max: [[aa[0], bb[0]].max, [aa[1], bb[1]].max, [aa[2], bb[2]].max]
          }
        end

        def boxes_intersect?(a, b)
          (0..2).all? do |axis|
            a[:min][axis] <= b[:max][axis] && a[:max][axis] >= b[:min][axis]
          end
        end

        def stringify_box(value)
          {
            'min' => Array(value[:min] || value['min']).map { |item| Float(item) },
            'max' => Array(value[:max] || value['max']).map { |item| Float(item) }
          }.freeze
        end

        def normalize_point(value)
          values = Array(value)
          raise ArgumentError, 'route node requires x, y, z' unless values.length >= 3
          [Float(values[0]), Float(values[1]), Float(values[2])]
        end
      end
    end
  end
end
