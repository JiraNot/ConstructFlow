# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Structure
      module Validators
        class StructureValidator
          def validate_column(definition)
            issues = definition.errors.map { |message| issue('structure.column.validity', 'error', message) }
            issues << preliminary_notice(definition.engineering_status)
            issues.compact.freeze
          end

          def validate_foundation(definition)
            issues = definition.errors.map { |message| issue('structure.foundation.validity', 'error', message) }
            issues << issue(
              'structure.foundation.support_missing',
              'warning',
              'foundation has no supported structural object relation'
            ) if definition.supported_object_id.to_s.empty?
            issues << preliminary_notice(definition.engineering_status)
            issues.compact.freeze
          end

          def validate_rebar_set(definition)
            issues = definition.errors.map { |message| issue('structure.rebar.validity', 'error', message) }
            issues << preliminary_notice(definition.engineering_status)
            issues.compact.freeze
          end

          private

          def preliminary_notice(status)
            return nil unless status.to_s == 'preliminary'

            issue(
              'structure.engineering_status.preliminary',
              'info',
              'structural object is modeling/preliminary information and is not engineering approval'
            )
          end

          def issue(rule_id, severity, message, extra = {})
            { rule_id: rule_id, severity: severity, message: message }.merge(extra).freeze
          end
        end
      end
    end
  end
end
