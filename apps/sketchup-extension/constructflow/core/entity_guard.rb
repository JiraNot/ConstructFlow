# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module EntityGuard
        module_function

        def valid!(entity, label: 'entity')
          raise ArgumentError, "#{label} is required" unless entity
          if entity.respond_to?(:valid?) && !entity.valid?
            raise ArgumentError, "#{label} is invalid"
          end
          if entity.respond_to?(:deleted?) && entity.deleted?
            raise ArgumentError, "#{label} is deleted"
          end

          entity
        end

        def valid?(entity)
          return false unless entity
          return false if entity.respond_to?(:valid?) && !entity.valid?
          return false if entity.respond_to?(:deleted?) && entity.deleted?

          true
        end
      end
    end
  end
end
