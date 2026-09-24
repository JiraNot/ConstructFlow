# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module DoorWindow
      # Per-project favorites for the door/window gallery. A favorite stores a
      # full type snapshot (construction parameters included) so the same
      # configuration can be re-placed later without retyping values.
      #
      # Storage: model attributes under the door_window dictionary, so it
      # follows the project file and is read-only data for the gallery.
      module UserFavorites
        DICTIONARY = 'constructflow.door_window'
        KEY = 'user_favorites'
        ID_PREFIX = 'USER:'

        module_function

        # Returns all favorites as arrays of [favorite_id, type_hash].
        def all(model)
          raw = Core::AttributeStore.new(model).read_json(KEY, {}, dictionary: DICTIONARY) || {}
          raw.keys.sort.map { |id| [id, raw[id]] }
        rescue StandardError
          []
        end

        def count(model)
          all(model).size
        end

        def favorite?(model, favorite_id)
          !find(model, favorite_id).nil?
        end

        def find(model, favorite_id)
          raw = Core::AttributeStore.new(model).read_json(KEY, {}, dictionary: DICTIONARY) || {}
          payload = raw[favorite_id.to_s]
          payload && [favorite_id.to_s, payload]
        rescue StandardError
          nil
        end

        # Persists a favorite. The type hash is rounded-tripped through
        # DoorWindowType.from_h so stored data always matches the schema.
        def save(model, favorite_id, type)
          raise ArgumentError, 'favorite id required' if favorite_id.to_s.strip.empty?
          raise ArgumentError, 'DoorWindowType required' unless type.is_a?(DoorWindowType)
          raise ArgumentError, type.errors.join('; ') unless type.valid?

          store = Core::AttributeStore.new(model)
          raw = store.read_json(KEY, {}, dictionary: DICTIONARY) || {}
          raw[favorite_id.to_s] = type.to_h
          store.write_json(KEY, raw, dictionary: DICTIONARY)
          favorite_id.to_s
        end

        def delete(model, favorite_id)
          store = Core::AttributeStore.new(model)
          raw = store.read_json(KEY, {}, dictionary: DICTIONARY) || {}
          removed = raw.delete(favorite_id.to_s)
          store.write_json(KEY, raw, dictionary: DICTIONARY)
          !removed.nil?
        end

        # Rebuilds an immutable type from a stored favorite. The rebuilt type
        # carries the favorite id so placements register it as its own model
        # type instead of colliding with the base catalog type it came from.
        def build_type(model, favorite_id)
          found = find(model, favorite_id)
          return nil unless found

          DoorWindowType.from_h(found[1].merge('id' => found[0]))
        end

        def next_id(model, base_name)
          base = "USER:#{base_name.to_s.strip.empty? ? 'custom' : base_name.to_s.strip}"
          candidate = base
          suffix = 1
          while favorite?(model, candidate)
            suffix += 1
            candidate = "#{base}-#{suffix}"
          end
          candidate
        end
      end
    end
  end
end
