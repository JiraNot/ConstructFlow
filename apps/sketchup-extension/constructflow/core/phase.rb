# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module Phase
        EXISTING = 'existing'
        DEMOLITION = 'demolition'
        NEW_CONSTRUCTION = 'new_construction'

        ALL = [EXISTING, DEMOLITION, NEW_CONSTRUCTION].freeze

        module_function

        def valid?(value)
          ALL.include?(value.to_s)
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
            created != DEMOLITION && removed != DEMOLITION
          when 'coordination'
            true
          else
            false
          end
        end
      end
    end
  end
end
