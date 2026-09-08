# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Interior
      module Validators
        class InteriorValidator
          MIN_FILLER_MM = 15.0

          def validate_cabinet(definition)
            issues = definition.errors.map { |message| issue('interior.cabinet.validity', 'error', message) }
            if definition.left_filler_mm.positive? && definition.left_filler_mm < MIN_FILLER_MM
              issues << issue('interior.cabinet.left_filler_small', 'warning', "left filler #{definition.left_filler_mm.round(1)} mm is very small")
            end
            if definition.right_filler_mm.positive? && definition.right_filler_mm < MIN_FILLER_MM
              issues << issue('interior.cabinet.right_filler_small', 'warning', "right filler #{definition.right_filler_mm.round(1)} mm is very small")
            end
            definition.modules.each do |mod|
              if Float(mod['width_mm']) < CabinetRunDefinition::MIN_MODULE_WIDTH_MM
                issues << issue('interior.cabinet.module_narrow', 'warning', "module #{mod['id']} is narrower than #{CabinetRunDefinition::MIN_MODULE_WIDTH_MM.round} mm")
              end
            end
            issues.freeze
          end

          def validate_part_set(part_set, cabinet_definition:)
            issues = part_set.errors.map { |message| issue('interior.parts.validity', 'error', message) }
            part_set.parts.each do |part|
              if Float(part['length_mm']) > [cabinet_definition.width_mm, cabinet_definition.height_mm, cabinet_definition.depth_mm].max + 1.0
                issues << issue('interior.parts.oversize', 'warning', "part #{part['id']} exceeds cabinet envelope maximum dimension")
              end
            end
            issues.freeze
          end

          private

          def issue(rule_id, severity, message)
            { rule_id: rule_id, severity: severity, message: message }.freeze
          end
        end
      end
    end
  end
end
