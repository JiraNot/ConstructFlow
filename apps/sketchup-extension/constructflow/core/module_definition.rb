# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      # Represents a formal domain module definition containing its manifest,
      # primary installer callable, and optional secondary integrations.
      class ModuleDefinition
        attr_reader :id, :manifest, :installer, :integrations

        def initialize(id: nil, manifest:, installer: nil, integrations: [])
          @manifest = manifest.dup.freeze
          @id = (id || manifest[:id] || manifest['id']).to_s
          @installer = installer
          @integrations = Array(integrations).freeze
          freeze
        end

        def requires
          Array(@manifest[:requires] || @manifest['requires']).map(&:to_s)
        end
      end
    end
  end
end
