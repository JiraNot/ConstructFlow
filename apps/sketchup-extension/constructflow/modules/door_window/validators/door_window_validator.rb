# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module DoorWindow
      module Validators
        class DoorWindowValidator
          RULE_ID = 'door_window.opening_fit'

          def initialize(opening_host_capability:)
            @opening_host_capability = opening_host_capability
          end

          def validate(instance_definition:, type:, opening_object:, infill_id: 'pending')
            issues = []
            instance_definition.errors.each { |message| issues << issue(message) }
            type.errors.each { |message| issues << issue(message) }

            unless @opening_host_capability.compatible_host?(opening_object)
              issues << issue('door/window requires a compatible Opening host')
              return issues.freeze
            end

            @opening_host_capability.validate_infill(
              opening_object,
              infill_id: infill_id,
              width_mm: type.width_mm,
              height_mm: type.height_mm
            ).each { |message| issues << issue(message) }
            issues.freeze
          end

          private

          def issue(message)
            {
              rule_id: RULE_ID,
              severity: 'error',
              message: message.to_s
            }.freeze
          end
        end
      end
    end
  end
end
