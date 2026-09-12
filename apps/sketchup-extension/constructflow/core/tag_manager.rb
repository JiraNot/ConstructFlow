# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class TagManager
        TAG_MAPPING = {
          'structure.column'     => 'CF_Structure_Column',
          'structure.beam'       => 'CF_Structure_Beam',
          'structure.foundation' => 'CF_Structure_Foundation',
          'structure.grid'       => 'CF_Structure_Grid',
          'architecture.wall'    => 'CF_Architecture_Wall',
          'architecture.floor'   => 'CF_Architecture_Floor',
          'architecture.ceiling' => 'CF_Architecture_Ceiling',
          'architecture.profile_sweep' => 'CF_Architecture_Molding',
          'architecture.roof'    => 'CF_Architecture_Roof',
          'opening.door_window'  => 'CF_Architecture_DoorWindow',
          'opening.window'       => 'CF_Architecture_Window',
          'opening.door'         => 'CF_Architecture_Door',
          'mep.conduit'          => 'CF_MEP_Electrical',
          'mep.panelboard'       => 'CF_MEP_Electrical',
          'mep.pipe'             => 'CF_MEP_Drainage',
          'mep.manhole'          => 'CF_MEP_Drainage',
          'interior.cabinet'     => 'CF_Interior_Joinery',
          'interior.wardrobe'    => 'CF_Interior_Joinery'
        }.freeze

        def self.tag_for_type(type)
          TAG_MAPPING[type.to_s] || "CF_#{type.to_s.split('.').first.capitalize}"
        end

        def self.assign_tag(model, entity, type)
          return unless model && entity && entity.respond_to?(:layer=)
          return unless model.respond_to?(:layers) && model.layers

          tag_name = tag_for_type(type)
          layers = model.layers
          tag = if layers.respond_to?(:[]) && layers[tag_name]
                  layers[tag_name]
                elsif layers.respond_to?(:add)
                  layers.add(tag_name)
                end
          entity.layer = tag if tag
          tag
        rescue StandardError
          nil
        end
      end
    end
  end
end
