# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class RubyLayoutBackend
        def add_page(document, name = nil)
          page = document.pages.add(name.to_s.empty? ? nil : name.to_s)
          raise RuntimeError, 'LayOut failed to add page' unless page
          page
        end

        def name_page(page, name)
          return page unless page && page.respond_to?(:name=)
          page.name = name.to_s
          page
        end
      end
    end
  end
end
