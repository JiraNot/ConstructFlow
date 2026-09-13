# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module Tools
        class ExtensionSceneGenerator
          SCENE_DEFINITIONS = [
            {
              id: '01_arch_plan',
              name: 'CF_01_แปลนสถาปัตย์_ต่อเติม',
              view: :top,
              description: 'แปลนพื้นสถาปัตย์ มุมมองบนลงล่าง ขนานพื้น (Parallel Projection)',
              hide_tags: ['CF_ROOF', 'CF_CEILING']
            },
            {
              id: '02_structure_plan',
              name: 'CF_02_แปลนโครงสร้างและฐานราก',
              view: :top,
              description: 'แปลนโครงสร้าง แสดงเสาเข็ม ฐานราก คาน และเสา',
              hide_tags: ['CF_WALL', 'CF_ROOF', 'CF_DOOR_WINDOW', 'CF_FINISH']
            },
            {
              id: '03_roof_plan',
              name: 'CF_03_แปลนหลังคาและระบายน้ำ',
              view: :top,
              description: 'แปลนหลังคา แสดงทิศทางลาดเอียง รางน้ำฝน และท่อระบายน้ำ',
              hide_tags: ['CF_CEILING']
            },
            {
              id: '04_elevation_front',
              name: 'CF_04_รูปด้าน_ต่อเติม',
              view: :front,
              description: 'รูปด้านมุมมองตั้งฉาก แสดงรอยต่ออาคารเดิม',
              hide_tags: []
            },
            {
              id: '05_section',
              name: 'CF_05_รูปตัด_A_ระดับพื้น',
              view: :right,
              description: 'รูปตัดขวาง แสดงระดับพื้นลดหลั่นและโครงหลังคา',
              hide_tags: []
            }
          ].freeze

          def self.generate(runtime)
            model = runtime&.active_model || (defined?(Sketchup) ? Sketchup.active_model : nil)
            return { status: 'error', message: 'No active SketchUp model' } unless model

            pages = model.pages
            created_count = 0

            # Ensure model has a safe bounds
            bounds = model.bounds
            center = bounds.center
            diag = [bounds.diagonal, 10.0].max

            model.start_operation('Generate Extension LayOut Scenes', true)
            begin
              SCENE_DEFINITIONS.each do |defn|
                # Find or create page
                page = pages[defn[:name]] || pages.add(defn[:name])
                
                # Setup Camera
                camera = page.camera
                camera.perspective = false if camera.respond_to?(:perspective=)

                # Set standard eye & target
                eye = Geom::Point3d.new(center.x, center.y, center.z + diag)
                target = Geom::Point3d.new(center.x, center.y, center.z)
                up = Geom::Vector3d.new(0, 1, 0)

                case defn[:view]
                when :top
                  eye = Geom::Point3d.new(center.x, center.y, center.z + diag)
                  target = Geom::Point3d.new(center.x, center.y, center.z)
                  up = Geom::Vector3d.new(0, 1, 0)
                when :front
                  eye = Geom::Point3d.new(center.x, center.y - diag, center.z)
                  target = Geom::Point3d.new(center.x, center.y, center.z)
                  up = Geom::Vector3d.new(0, 0, 1)
                when :right
                  eye = Geom::Point3d.new(center.x + diag, center.y, center.z)
                  target = Geom::Point3d.new(center.x, center.y, center.z)
                  up = Geom::Vector3d.new(0, 0, 1)
                end

                camera.set(eye, target, up) if camera.respond_to?(:set)
                page.update if page.respond_to?(:update)
                created_count += 1
              end

              model.commit_operation
              {
                status: 'success',
                created_count: created_count,
                scenes: SCENE_DEFINITIONS.map { |d| d[:name] }
              }
            rescue StandardError => e
              model.abort_operation
              { status: 'error', message: e.message }
            end
          end
        end
      end
    end
  end
end
