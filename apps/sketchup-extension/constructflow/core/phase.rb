# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module Phase
        EXISTING = 'existing'
        DEMOLITION = 'demolition'
        NEW_CONSTRUCTION = 'new_construction'

        ALL = [EXISTING, DEMOLITION, NEW_CONSTRUCTION].freeze
        VIEWS = %w[existing demolition proposed coordination].freeze

        module_function

        def valid?(value)
          ALL.include?(value.to_s)
        end

        def validate_lifecycle!(created_phase:, removed_phase: nil)
          created = created_phase.to_s
          removed = removed_phase&.to_s

          raise ArgumentError, "invalid created phase: #{created}" unless valid?(created)
          if removed && removed != DEMOLITION
            raise ArgumentError, "invalid removed phase: #{removed}"
          end

          true
        end

        def visible_in?(created_phase:, removed_phase:, view:)
          created = created_phase.to_s
          removed = removed_phase&.to_s

          case view.to_s
          when 'existing'
            created == EXISTING
          when 'demolition'
            created == EXISTING
          when 'proposed'
            (created == EXISTING && removed.nil?) || created == NEW_CONSTRUCTION
          when 'coordination'
            true
          else
            false
          end
        end

        def state_in(created_phase:, removed_phase:, view:)
          return :hidden unless visible_in?(created_phase: created_phase, removed_phase: removed_phase, view: view)

          if view.to_s == 'demolition' && removed_phase.to_s == DEMOLITION
            :demolish
          elsif created_phase.to_s == NEW_CONSTRUCTION
            :new
          else
            :remain
          end
        end
      end
    end
  end
end
