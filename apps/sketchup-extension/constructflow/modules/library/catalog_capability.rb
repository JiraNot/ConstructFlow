# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Library
      class CatalogCapability
        def initialize(runtime)
          @runtime = runtime
        end

        def store
          CatalogStore.new(@runtime.active_model)
        end

        def search(**filters)
          store.search(**filters)
        end

        def asset(asset_id, version: nil)
          store.asset(asset_id, version: version)
        end

        def project_snapshot(snapshot_id)
          store.project_snapshot(snapshot_id)
        end
      end
    end
  end
end
