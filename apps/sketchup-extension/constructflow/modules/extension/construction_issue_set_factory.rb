# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Extension
      class ConstructionIssueSetFactory
        FAMILY_ORDER = %w[architecture structure roof plumbing surface interior electrical].freeze
        PRESETS = {
          'architecture' => 'architecture.construction',
          'structure' => 'structure.construction',
          'roof' => 'roof.construction',
          'plumbing' => 'plumbing.construction',
          'surface' => 'surface.construction',
          'interior' => 'interior.construction',
          'electrical' => 'electrical.construction'
        }.freeze
        SHEET_NUMBERS = {
          'architecture' => 'A-101',
          'structure' => 'S-101',
          'roof' => 'R-101',
          'plumbing' => 'P-101',
          'surface' => 'L-101',
          'interior' => 'I-101',
          'electrical' => 'E-101'
        }.freeze
        FAMILY_OWNERS = {
          'structure' => %w[constructflow.structure],
          'roof' => %w[constructflow.roof],
          'plumbing' => %w[constructflow.drainage],
          'surface' => %w[constructflow.surface],
          'interior' => %w[constructflow.interior],
          'electrical' => %w[constructflow.electrical]
        }.freeze
        ARCHITECTURE_CONTEXT_OWNERS = %w[
          constructflow.architecture
          constructflow.opening
          constructflow.door_window
        ].freeze

        def initialize(runtime:)
          @runtime = runtime
        end

        def build(extension_id:, revision: 'P01', issue_status: 'working', project_name: '', project_number: '',
                  drawn_by: '', checked_by: '', template_scope_id: '', template_use_case: 'construction')
          source = resolve_extension(extension_id)
          families = active_families(source)
          families = %w[structure roof surface] if families.empty?
          sheets = families.map do |family|
            Core::DrawingIssueSheetRequest.new(
              preset_id: PRESETS.fetch(family),
              options: {
                sheet_number: SHEET_NUMBERS.fetch(family),
                project_name: project_name,
                project_number: project_number,
                drawn_by: drawn_by,
                checked_by: checked_by
              }
            )
          end

          Core::DrawingIssueSet.new(
            id: "construction.#{source.id}.#{revision}",
            name: "Construction Set - #{source.display_name}",
            revision: revision,
            issue_status: issue_status,
            sheets: sheets,
            template_scope_id: template_scope_id,
            template_use_case: template_use_case
          )
        end

        def active_families(source)
          FAMILY_ORDER.select { |family| !object_ids_for_family(extension_id: source.id, family: family).empty? }.freeze
        end

        def object_ids_for_family(extension_id:, family:)
          source = resolve_extension(extension_id)
          key = family.to_s
          objects = if key == 'architecture'
                      architecture_objects_for(source)
                    else
                      owners = FAMILY_OWNERS.fetch(key) { [] }
                      related_objects(source).select { |object| owners.include?(object.owner_module.to_s) }
                    end
          objects.map { |object| object.id.to_s }.reject(&:empty?).uniq.sort.freeze
        end

        private

        def resolve_extension(extension_id)
          source = @runtime.smart_objects.fetch_by_id(extension_id.to_s)
          return source if source && source.type == 'extension.zone'
          raise ArgumentError, 'extension zone not found'
        end

        # Architecture sheets intentionally include ordinary project Architecture,
        # Opening and Door/Window context, but generated context from another
        # Extension must never leak into the selected Extension's construction set.
        def architecture_objects_for(source)
          @runtime.smart_objects.all.select do |object|
            next false unless ARCHITECTURE_CONTEXT_OWNERS.include?(object.owner_module.to_s)

            extension_sources = extension_source_relationships(object)
            extension_sources.empty? || extension_sources.any? do |relationship|
              relationship_target(relationship) == source.id.to_s
            end
          end
        end

        def extension_source_relationships(object)
          Array(object.relationships).select do |relationship|
            relationship_kind(relationship) == 'generated_from' &&
              relationship_role(relationship) == 'extension_source'
          end
        end

        def relationship_kind(relationship)
          (relationship['kind'] || relationship[:kind]).to_s
        end

        def relationship_role(relationship)
          (relationship['role'] || relationship[:role]).to_s
        end

        def relationship_target(relationship)
          (relationship['target_id'] || relationship[:target_id]).to_s
        end

        def related_objects(source)
          @runtime.smart_objects.all.select do |object|
            Array(object.relationships).any? do |relationship|
              relationship_kind(relationship) == 'generated_from' &&
                relationship_target(relationship) == source.id.to_s
            end
          end
        end
      end
    end
  end
end
