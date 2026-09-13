# frozen_string_literal: true

require 'json'
require_relative 'units'
require_relative 'structural_profile_catalog'

module JiraNot
  module ConstructFlow
    module Core
      class CustomProfileStore
        STORAGE_FILE = File.expand_path('constructflow_custom_profiles.json', Dir.home)

        def self.load_profiles
          return {} unless File.exist?(STORAGE_FILE)
          begin
            JSON.parse(File.read(STORAGE_FILE, encoding: 'UTF-8'))
          rescue StandardError
            {}
          end
        end

        def self.save_profiles(hash)
          File.write(STORAGE_FILE, JSON.pretty_generate(hash), encoding: 'UTF-8')
        end

        # Extracts 2D cross-section points in mm from a SketchUp Face
        def self.extract_profile_from_face(face, anchor: :bottom_left)
          return nil unless (defined?(Sketchup::Face) && face.is_a?(Sketchup::Face)) || (face.respond_to?(:outer_loop) && face.respond_to?(:normal))

          verts = face.outer_loop.vertices
          return nil if verts.length < 3

          # Project vertices onto the face plane 2D coordinate system (u, v)
          p0 = verts[0].position
          p1 = verts[1].position
          p2 = verts[2].position

          v_u = (p1 - p0)
          v_u.normalize!
          norm = face.normal
          v_v = norm * v_u
          v_v.normalize!

          raw_uv = verts.map do |v|
            vec = v.position - p0
            u_mm = Core::Units.su_to_mm(vec % v_u)
            v_mm = Core::Units.su_to_mm(vec % v_v)
            [u_mm, v_mm]
          end

          # Compute bounding box of the 2D profile
          min_u = raw_uv.map(&:first).min
          max_u = raw_uv.map(&:first).max
          min_v = raw_uv.map(&:last).min
          max_v = raw_uv.map(&:last).max

          width_mm = max_u - min_u
          depth_mm = max_v - min_v

          # Shift according to anchor
          anchor_u = case anchor.to_sym
                     when :top_left, :middle_left, :bottom_left then min_u
                     when :top_center, :center, :bottom_center then (min_u + max_u) / 2.0
                     else max_u
                     end

          anchor_v = case anchor.to_sym
                     when :bottom_left, :bottom_center, :bottom_right then min_v
                     when :middle_left, :center, :middle_right then (min_v + max_v) / 2.0
                     else max_v
                     end

          normalized_points = raw_uv.map do |u, v|
            [(u - anchor_u).round(2), (v - anchor_v).round(2)]
          end

          {
            points_mm: normalized_points,
            width_mm: width_mm.round(2),
            depth_mm: depth_mm.round(2),
            anchor: anchor.to_s
          }
        end

        # Saves a new profile into the store and registers it with the catalog
        def self.add_profile(code, name, points_mm, width_mm, depth_mm, category: 'custom')
          profiles = load_profiles
          profiles[code] = {
            'code' => code,
            'name' => name,
            'points_mm' => points_mm,
            'width_mm' => width_mm,
            'depth_mm' => depth_mm,
            'category' => category
          }
          save_profiles(profiles)
          sync_with_catalog
          profiles[code]
        end

        # Synchronizes saved custom profiles into StructuralProfileCatalog
        def self.sync_with_catalog
          profiles = load_profiles
          profiles.each do |code, data|
            StructuralProfileCatalog.register_custom_profile(code, {
              code: code,
              name: data['name'],
              category: (data['category'] || 'custom').to_sym,
              width_mm: data['width_mm'],
              depth_mm: data['depth_mm'],
              points_mm: data['points_mm']
            })
          end
        end

        # Sweeps a profile along an array of SketchUp Edges
        def self.sweep_along_edges(edges, profile_code, model = Sketchup.active_model)
          pts_3d = extract_ordered_path_from_edges(edges)
          return false if pts_3d.length < 2

          catalog_entry = StructuralProfileCatalog.find_profile(profile_code)
          profile_pts = catalog_entry ? catalog_entry[:points_mm] : nil

          path_mm = pts_3d.map { |pt| [Core::Units.su_to_mm(pt.x), Core::Units.su_to_mm(pt.y), Core::Units.su_to_mm(pt.z)] }

          model.start_operation('Sweep Custom Profile', true)
          definition = Architecture::ProfileSweepDefinition.new(
            path_mm: path_mm,
            profile_code: profile_code,
            profile_points_mm: profile_pts
          )
          group = Architecture::ProfileSweepGeometry.build(model, definition)
          model.commit_operation
          group
        end

        # Helper to sort connected edges into an ordered chain of 3D points
        def self.extract_ordered_path_from_edges(edges)
          valid_edges = edges.select { |e| e.is_a?(Sketchup::Edge) }
          return [] if valid_edges.empty?

          # Find an end vertex (a vertex with only 1 connected edge in the set)
          vert_count = Hash.new(0)
          valid_edges.each do |e|
            vert_count[e.start] += 1
            vert_count[e.end] += 1
          end

          start_vert = vert_count.find { |_v, c| c == 1 }&.first || valid_edges.first.start

          path = [start_vert.position]
          curr_vert = start_vert
          remaining = valid_edges.dup

          while !remaining.empty?
            next_edge = remaining.find { |e| e.start == curr_vert || e.end == curr_vert }
            break unless next_edge

            remaining.delete(next_edge)
            next_vert = (next_edge.start == curr_vert) ? next_edge.end : next_edge.start
            path << next_vert.position
            curr_vert = next_vert
          end

          path
        end
      end
    end
  end
end

# Ensure custom profiles sync on load
JiraNot::ConstructFlow::Core::CustomProfileStore.sync_with_catalog rescue nil
