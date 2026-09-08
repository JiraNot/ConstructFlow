# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Opening
      module Validators
        class OpeningValidator
          RULE_ID = 'opening.hosted.validity'

          def initialize(host_capability:)
            @host_capability = host_capability
          end

          def validate(definition, host_object:)
            issues = definition.errors.map { |message| issue(message) }
            unless @host_capability.compatible_host?(host_object)
              issues << issue('opening requires a compatible host')
              return issues.freeze
            end

            @host_capability.validate_opening(
              host_object,
              definition.host_descriptor
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
