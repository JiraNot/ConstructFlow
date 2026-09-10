# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module EntityGuard
        module_function

        def usable?(entity)
          return false if entity.nil?
          return false if entity.respond_to?(:deleted?) && entity.deleted?
          return false if entity.respond_to?(:valid?) && !entity.valid?
          true
        end

        def require!(entity, label: 'entity')
          raise ArgumentError, "#{label} is unavailable or invalid" unless usable?(entity)
          entity
        end
      end
    end
  end
end
