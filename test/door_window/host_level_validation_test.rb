# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'door_window', 'registration')
require File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'opening', 'registration')

class DoorWindowHostLevelValidationTest < Minitest::Test
  Architecture = JiraNot::ConstructFlow::Architecture
  Registration = JiraNot::ConstructFlow::DoorWindow::Registration
  OpeningRegistration = JiraNot::ConstructFlow::Opening::Registration

  Host = Struct.new(:id, :entity, :level_refs)
  OpeningObject = Struct.new(:entity)
  SmartObjects = Struct.new(:host) do
    def fetch_by_id(id)
      host if host.id.to_s == id.to_s
    end
  end
  Runtime = Struct.new(:smart_objects)

  class WallHostCapability
    def compatible_host?(object)
      object.is_a?(Host)
    end

    def locate(_host, _point)
      { segment_index: 0, distance_along_mm: 500.0 }
    end

    def validate_opening(_host, _descriptor)
      []
    end
  end

  class OpeningHostCapability
    def compatible_host?(object)
      object.is_a?(Host)
    end
  end

  class OpeningValidator
    def validate(_definition, host_object:)
      []
    end
  end

  def setup
    entity = FakeEntity.new
    Architecture::WallRepository.new.write(
      entity,
      Architecture::WallDefinition.new(
        path_mm: [[0, 0, 0], [3000, 0, 0]], base_level_id: 'level.1'
      )
    )
    @host = Host.new('wall-1', entity, [])
    @runtime = Runtime.new(SmartObjects.new(@host))
    @wall_host = WallHostCapability.new
    opening_entity = FakeEntity.new
    JiraNot::ConstructFlow::Opening::OpeningRepository.new.write(
      opening_entity,
      JiraNot::ConstructFlow::Opening::OpeningDefinition.new(
        host_object_id: @host.id, segment_index: 0, start_offset_mm: 500
      )
    )
    @opening = OpeningObject.new(opening_entity)
  end

  def input(level_id)
    {
      host_object_id: @host.id,
      level_id: level_id,
      point_mm: [500, 0, 0],
      width_mm: 900,
      height_mm: 2100,
      sill_mm: 0
    }
  end

  def test_rejects_host_on_a_different_requested_level
    errors = Registration.place_on_wall_validation_errors(input('level.2'), @runtime, @wall_host)

    assert_equal ['host Smart Wall is not on the requested plan level'], errors
  end

  def test_allows_host_on_the_requested_level_and_validates_opening
    errors = Registration.place_on_wall_validation_errors(input('level.1'), @runtime, @wall_host)

    assert_empty errors
  end

  def test_create_opening_rejects_a_host_on_a_different_requested_level
    errors = OpeningRegistration.create_validation_errors(
      input('level.2'), @runtime, OpeningHostCapability.new, OpeningValidator.new
    )

    assert_equal ['host Smart Wall is not on the requested plan level'], errors
  end

  def test_create_opening_allows_a_host_on_the_requested_level
    errors = OpeningRegistration.create_validation_errors(
      input('level.1'), @runtime, OpeningHostCapability.new, OpeningValidator.new
    )

    assert_empty errors
  end

  def test_opening_level_check_fails_closed_when_host_definition_cannot_be_read
    broken_entity = Class.new(FakeEntity) do
      def get_attribute(*)
        raise IOError, 'host definition read failed'
      end
    end.new
    broken_host = Host.new('broken-wall', broken_entity, [])

    error = OpeningRegistration.host_level_error(input('level.1'), broken_host)

    assert_match(/unable to verify host Smart Wall level: host definition read failed/, error)
  end

  def test_door_window_infill_level_check_rejects_a_different_host_level
    error = Registration.opening_host_level_error(input('level.2'), @opening, @runtime)

    assert_equal 'Opening host wall is not on the requested plan level', error
  end

  def test_door_window_infill_level_check_allows_the_host_level
    error = Registration.opening_host_level_error(input('level.1'), @opening, @runtime)

    assert_nil error
  end
end
