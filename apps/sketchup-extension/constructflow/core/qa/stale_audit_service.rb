# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module QA
        class StaleAuditResult
          attr_reader :dirty_objects, :stale_drawings, :stale_quantities, :stale_estimates

          def initialize(dirty_objects: [], stale_drawings: [], stale_quantities: [], stale_estimates: false)
            @dirty_objects = Array(dirty_objects).freeze
            @stale_drawings = Array(stale_drawings).map(&:to_s).uniq.sort.freeze
            @stale_quantities = Array(stale_quantities).map(&:to_s).uniq.sort.freeze
            @stale_estimates = !!stale_estimates
            freeze
          end

          def up_to_date?
            dirty_objects.empty? && stale_drawings.empty? && stale_quantities.empty? && !stale_estimates
          end

          def to_h
            {
              'up_to_date' => up_to_date?,
              'dirty_objects_count' => dirty_objects.length,
              'dirty_objects' => dirty_objects,
              'stale_drawings' => stale_drawings,
              'stale_quantities' => stale_quantities,
              'stale_estimates' => stale_estimates
            }
          end
        end

        class StaleAuditService
          DOMAIN_DEPENDENCY_RULES = {
            'architecture.wall' => {
              drawings: %w[A-101 A-201 A-301],
              quantities: %w[architecture]
            },
            'opening' => {
              drawings: %w[A-101 A-601],
              quantities: %w[opening]
            },
            'door_window' => {
              drawings: %w[A-101 A-601],
              quantities: %w[door_window]
            },
            'structure.column' => {
              drawings: %w[S-101],
              quantities: %w[structure]
            },
            'structure.foundation' => {
              drawings: %w[S-101],
              quantities: %w[structure]
            },
            'surface' => {
              drawings: %w[L-101],
              quantities: %w[surface]
            },
            'drainage.pipe' => {
              drawings: %w[P-101],
              quantities: %w[drainage]
            },
            'drainage.manhole' => {
              drawings: %w[P-101],
              quantities: %w[drainage]
            },
            'electrical' => {
              drawings: %w[E-101 E-102],
              quantities: %w[electrical]
            },
            'interior.cabinet' => {
              drawings: %w[IN-101 IN-501],
              quantities: %w[interior]
            }
          }.freeze

          def audit(smart_objects)
            dirty_list = []
            stale_drawings = []
            stale_quantities = []
            stale_estimates = false

            objects = smart_objects.respond_to?(:to_a) ? smart_objects.to_a : Array(smart_objects)

            objects.each do |obj|
              is_dirty_drawing = check_dirty(obj, :dirty_drawing)
              is_dirty_quantity = check_dirty(obj, :dirty_quantity)

              next unless is_dirty_drawing || is_dirty_quantity

              obj_type = get_val(obj, :type).to_s
              obj_id = get_val(obj, :id) || 'unknown'

              dirty_list << {
                object_id: obj_id,
                type: obj_type,
                dirty_drawing: is_dirty_drawing,
                dirty_quantity: is_dirty_quantity
              }

              rule = match_rule(obj_type)
              if rule
                stale_drawings.concat(rule[:drawings]) if is_dirty_drawing
                if is_dirty_quantity
                  stale_quantities.concat(rule[:quantities])
                  stale_estimates = true
                end
              else
                # Default fallback
                stale_drawings << 'A-101' if is_dirty_drawing
                if is_dirty_quantity
                  stale_quantities << 'generic'
                  stale_estimates = true
                end
              end
            end

            StaleAuditResult.new(
              dirty_objects: dirty_list,
              stale_drawings: stale_drawings,
              stale_quantities: stale_quantities,
              stale_estimates: stale_estimates
            )
          end

          private

          def check_dirty(obj, flag)
            if obj.respond_to?(:dirty?)
              obj.dirty?(flag.to_s)
            elsif obj.is_a?(Hash)
              !!(obj[flag] || obj[flag.to_s])
            else
              false
            end
          end

          def match_rule(type_str)
            DOMAIN_DEPENDENCY_RULES.each do |prefix, rule|
              return rule if type_str.start_with?(prefix)
            end
            nil
          end

          def get_val(obj, key)
            if obj.respond_to?(key)
              obj.public_send(key)
            elsif obj.is_a?(Hash)
              obj[key] || obj[key.to_s]
            end
          end
        end
      end
    end
  end
end
