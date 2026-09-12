# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Costing
      class Repository
        DICTIONARY = 'constructflow.costing'
        RATE_LIBRARIES_KEY = 'rate_libraries'
        ESTIMATES_KEY = 'estimates'
        SNAPSHOTS_KEY = 'estimate_snapshots'

        def initialize(model = nil)
          @model = model
        end

        def attach_model(model)
          @model = model
          self
        end

        def write_rate_library(model, library)
          raise ArgumentError, 'RateLibrary required' unless library.is_a?(RateLibrary)
          ensure_model!(model)
          libs = read_json(model, RATE_LIBRARIES_KEY) || {}
          libs[library.id] = library.to_h
          write_json(model, RATE_LIBRARIES_KEY, libs)
          library
        end

        def read_rate_library(model, id)
          ensure_model!(model)
          libs = read_json(model, RATE_LIBRARIES_KEY) || {}
          data = libs[id.to_s.strip]
          data ? RateLibrary.from_h(data) : nil
        end

        def write_estimate(model, estimate)
          raise ArgumentError, 'CostEstimate required' unless estimate.is_a?(CostEstimate)
          ensure_model!(model)
          ests = read_json(model, ESTIMATES_KEY) || {}
          ests[estimate.estimate_id] = estimate.to_h
          write_json(model, ESTIMATES_KEY, ests)
          estimate
        end

        def read_estimate(model, id)
          ensure_model!(model)
          ests = read_json(model, ESTIMATES_KEY) || {}
          data = ests[id.to_s.strip]
          data ? CostEstimate.from_h(data) : nil
        end

        def write_snapshot(model, snapshot)
          raise ArgumentError, 'EstimateSnapshot required' unless snapshot.is_a?(EstimateSnapshot)
          ensure_model!(model)
          snaps = read_json(model, SNAPSHOTS_KEY) || {}
          snaps[snapshot.snapshot_id] = snapshot.to_h
          write_json(model, SNAPSHOTS_KEY, snaps)
          snapshot
        end

        def read_snapshot(model, id)
          ensure_model!(model)
          snaps = read_json(model, SNAPSHOTS_KEY) || {}
          data = snaps[id.to_s.strip]
          data ? EstimateSnapshot.from_h(data) : nil
        end

        private

        def ensure_model!(model)
          target = model || @model
          raise ArgumentError, 'active model required for persistence' unless target
        end

        def read_json(model, key)
          target = model || @model
          Core::AttributeStore.new(target).read_json(key, nil, dictionary: DICTIONARY)
        end

        def write_json(model, key, payload)
          target = model || @model
          Core::AttributeStore.new(target).write_json(key, payload, dictionary: DICTIONARY)
        end
      end
    end
  end
end
