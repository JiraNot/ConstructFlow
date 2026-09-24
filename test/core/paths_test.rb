# frozen_string_literal: true

require_relative '../test_helper'

class CorePathsTest < Minitest::Test
  def test_user_output_dir_prefers_userprofile
    ENV['USERPROFILE'] = '/tmp/cf-user'
    ENV['HOME'] = '/tmp/cf-home'

    assert_equal '/tmp/cf-user', JiraNot::ConstructFlow::Core::Paths.user_output_dir
  ensure
    ENV.delete('USERPROFILE')
    ENV.delete('HOME')
  end

  def test_user_output_dir_falls_back_to_home
    ENV.delete('USERPROFILE')
    ENV['HOME'] = '/tmp/cf-home-only'

    assert_equal '/tmp/cf-home-only', JiraNot::ConstructFlow::Core::Paths.user_output_dir
  ensure
    ENV.delete('HOME')
  end

  def test_user_output_dir_falls_back_to_tempdir
    ENV.delete('USERPROFILE')
    ENV.delete('HOME')

    assert_equal Dir.tmpdir, JiraNot::ConstructFlow::Core::Paths.user_output_dir
  end

  def test_user_output_dir_never_contains_user_names
    ENV.delete('USERPROFILE')
    ENV.delete('HOME')

    refute_includes JiraNot::ConstructFlow::Core::Paths.user_output_dir, 'Dulla'
  end

  def test_user_output_dir_ignores_blank_env_values
    ENV['USERPROFILE'] = '   '
    ENV.delete('HOME')

    assert_equal Dir.tmpdir, JiraNot::ConstructFlow::Core::Paths.user_output_dir
  ensure
    ENV.delete('USERPROFILE')
  end

  def test_desktop_dir_uses_real_desktop_when_present
    dir = JiraNot::ConstructFlow::Core::Paths.desktop_dir

    assert_kind_of String, dir
    refute_empty dir
  end

  def test_temp_dir_is_created_and_reusable
    path = JiraNot::ConstructFlow::Core::Paths.temp_dir

    assert File.directory?(path)
    assert_includes path, 'ConstructFlow'
  end

  def test_debug_log_path_lives_under_temp_dir
    path = JiraNot::ConstructFlow::Core::Paths.debug_log_path

    assert_equal 'constructflow_debug.log', File.basename(path)
    assert File.directory?(File.dirname(path))
    refute_includes path, 'Dulla'
  end

  def test_ensure_dir_creates_missing_directory
    base = File.join(Dir.tmpdir, "cf_paths_test_#{Process.pid}")
    target = File.join(base, 'nested', 'dir')

    assert_equal target, JiraNot::ConstructFlow::Core::Paths.ensure_dir!(target)
    assert File.directory?(target)
  ensure
    FileUtils.rm_rf(base)
  end
end
