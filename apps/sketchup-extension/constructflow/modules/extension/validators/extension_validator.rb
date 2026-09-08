# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Extension
      module Validators
        class ExtensionValidator
          def validate(definition)
            definition.errors.map do |message|
              {
                rule_id: 'extension.zone.validity',
                severity: 'error',
                message: message
              }.freeze
            end.freeze
          end
        end
      end
    end
  end
end
