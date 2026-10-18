# frozen_string_literal: true

require 'json'
require 'securerandom'
require 'base64'
require 'tmpdir'

module JiraNot
  module ConstructFlow
    module Core
      # Asset transfer adapter. Authored geometry is read without changing the SKP.
      module FamilyAssetExport
        module_function

        def export_selected
          selected = Sketchup.active_model.selection.to_a
          raise ArgumentError, 'เลือก Component หรือ Group ที่จะส่งออกก่อน' if selected.empty?
          values = UI.inputbox(['ชื่อ Family', 'หมวด (furniture/door/window/generic)'], ['Family ของฉัน', 'furniture'], 'ส่งออก Family ไป ConstructFlow')
          return unless values
          name, category = values.map(&:to_s)
          raise ArgumentError, 'หมวดต้องเป็น furniture, door, window หรือ generic' unless %w[furniture door window generic].include?(category)
          path = UI.savepanel('บันทึก ConstructFlow Family', nil, "#{name}.cffamily")
          return unless path
          path += '.cffamily' unless path.downcase.end_with?('.cffamily')
          parts, edges, notes = [], [], []
          Dir.mktmpdir('constructflow-family-') do |directory|
            writer = Sketchup.create_texture_writer
            walk(selected, Geom::Transformation.new, nil, parts, edges, notes, writer, directory, 0, nil)
          end
          raise ArgumentError, 'ไม่พบ Face ในสิ่งที่เลือก' if parts.empty?
          raise ArgumentError, 'โมเดลเกิน 300,000 จุดหรือสามเหลี่ยม กรุณาลดรายละเอียด' if parts.sum { |p| p[:vertices].length } > 300_000 || parts.sum { |p| p[:faces].length } > 300_000
          points = parts.flat_map { |p| p[:vertices] }
          min = 3.times.map { |axis| points.map { |p| p[axis] }.min }
          max = 3.times.map { |axis| points.map { |p| p[axis] }.max }
          size = 3.times.map { |axis| max[axis] - min[axis] }
          raise ArgumentError, 'โมเดลต้องมีความกว้าง ลึก และสูง' if size.any? { |v| v <= 0.001 }
          parts.each do |part|
            part[:vertices].each { |p| 3.times { |axis| p[axis] -= min[axis] } }
            part[:scale] = ["W/#{size[0]}", "D/#{size[1]}", "H/#{size[2]}"]
          end
          paths = edges.uniq.map.with_index do |segment, index|
            { id: "edge-#{index}", points: segment.map { |p| ["W*#{(p[0] - min[0]) / size[0]}", "D*#{(p[1] - min[1]) / size[1]}"] }, closed: false, view: 'plan', layer: 'SketchUp edges', color: '#475569', lineweight_mm: 0.18 }
          end
          raise ArgumentError, 'รูปแปลนเกิน 20,000 เส้น กรุณาซ่อนรายละเอียดก่อนส่งออก' if paths.length > 20_000
          family = {
            schema_version: 1, id: SecureRandom.uuid, name: name, category: category,
            parameters: %w[W D H].each_with_index.map { |key, axis| { name: key, label: %w[กว้าง ลึก สูง][axis], value: size[axis], scope: 'instance', min: 1 } },
            types: [{ id: SecureRandom.uuid, name: 'มาตรฐาน', values: {} }],
            paths: paths, extrusions: [], meshes: parts,
            source: { filename: Sketchup.active_model.title.to_s + '.skp', format: 'SketchUp Component', skipped_entities: 0, notes: notes.uniq + ['Mesh ผูกกับ W/D/H; แก้สัญลักษณ์ 2D และเพิ่มรูปทรงพารามิเตอร์ได้ใน Family Studio'] }
          }
          source = JSON.generate(family)
          raise ArgumentError, 'Family เกิน 60 MB กรุณาลด texture หรือจำนวนหน้า' if source.bytesize > 60 * 1024 * 1024
          File.write(path, source)
          UI.messagebox("ส่งออก Family แล้ว\nเปิด ConstructFlow → Family / CAD → นำเข้า Family\n#{path}")
        rescue StandardError => error
          UI.messagebox("ส่งออก Family ไม่สำเร็จ: #{error.message}")
        end

        def walk(entities, transform, inherited_material, parts, edges, notes, writer, directory, depth, part_name)
          raise ArgumentError, 'Component ซ้อนลึกเกิน 32 ระดับ' if depth > 32
          entities.each do |entity|
            next if entity.respond_to?(:hidden?) && entity.hidden?
            next if entity.respond_to?(:layer) && !entity.layer.visible?
            if entity.is_a?(Sketchup::Group) || entity.is_a?(Sketchup::ComponentInstance)
              children = entity.is_a?(Sketchup::Group) ? entity.entities : entity.definition.entities
              own_name = if entity.respond_to?(:name) && !entity.name.to_s.strip.empty?
                           entity.name.to_s.strip
                         elsif entity.respond_to?(:definition) && !entity.definition.name.to_s.strip.empty?
                           entity.definition.name.to_s.strip
                         end
              next_part_name = [part_name, own_name].compact.uniq.join(' / ')[0, 120]
              walk(children, transform * entity.transformation, entity.material || inherited_material, parts, edges, notes, writer, directory, depth + 1, next_part_name)
            elsif entity.is_a?(Sketchup::Face)
              mesh = entity.mesh(7)
              material = entity.material || inherited_material
              color = material ? format('#%02x%02x%02x', material.color.red, material.color.green, material.color.blue) : '#cbd5e1'
              vertices = mesh.points.map { |point| p = point.transform(transform); [p.x.to_f * 25.4, p.y.to_f * 25.4, p.z.to_f * 25.4] }
              faces = mesh.polygons.flat_map { |polygon| ids = polygon.map { |i| i.abs - 1 }; (1...(ids.length - 1)).map { |i| [ids[0], ids[i], ids[i + 1]] } }
              # Merge consecutive untextured faces sharing a material to keep part count bounded.
              textured = entity.material && entity.material.texture
              material_name = material.respond_to?(:name) ? material.name.to_s.strip : ''
              mesh_name = [part_name, material_name].reject(&:empty?).uniq.join(' / ')[0, 120]
              part = { id: SecureRandom.uuid, name: mesh_name.empty? ? "Mesh #{parts.length + 1}" : mesh_name, vertices: vertices, faces: faces, scale: [1, 1, 1], offset: [0, 0, 0], color: color }
              if textured
                writer.load(entity, true)
                image_path = File.join(directory, "#{part[:id]}.png")
                if writer.write(entity, true, image_path).zero? && File.size(image_path) <= 9 * 1024 * 1024
                  part[:texture_data_url] = 'data:image/png;base64,' + Base64.strict_encode64(File.binread(image_path))
                  part[:uvs] = (1..mesh.count_points).map { |i| uvq = mesh.uv_at(i, true); q = uvq.z.zero? ? 1.0 : uvq.z; [uvq.x / q, 1.0 - uvq.y / q] }
                else
                  notes << 'บาง texture ส่งออกไม่ได้หรือเกิน 9 MB จึงเก็บสีวัสดุ'
                end
              elsif inherited_material && inherited_material.texture
                notes << 'Texture ที่ลงบน Group เก็บเป็นสี; ลงวัสดุที่ Face เพื่อส่งออก UV'
              end
              if !part[:texture_data_url] && parts.last && !parts.last[:texture_data_url] && parts.last[:color] == color && parts.last[:name] == part[:name]
                offset = parts.last[:vertices].length
                parts.last[:vertices].concat(vertices)
                parts.last[:faces].concat(faces.map { |face| face.map { |i| i + offset } })
              else
                parts << part
              end
              raise ArgumentError, 'ชิ้นส่วนวัสดุเกิน 1,000 ชิ้น กรุณารวมวัสดุ' if parts.length > 1000
            elsif entity.is_a?(Sketchup::Edge) && !entity.soft? && !entity.hidden?
              a, b = [entity.start.position, entity.end.position].map { |p| p.transform(transform) }
              next if Math.hypot(a.x - b.x, a.y - b.y) < 0.001
              segment = [a, b].map { |p| [p.x.to_f * 25.4, p.y.to_f * 25.4] }.sort
              edges << segment
            end
          end
        end
      end
    end
  end
end
