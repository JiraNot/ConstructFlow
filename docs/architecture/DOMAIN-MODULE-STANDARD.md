# ConstructFlow — Domain Module Standard

## 1. Module Architecture Standard

Domain modules encapsulate specific disciplines (Architecture, Structure, Roof, Interior, Electrical, Drainage, Surface, Costing). Core provides platform primitives; modules provide domain behavior.

## 2. Directory Layout Convention

Every domain package follows this standardized layout:

```text
modules/<module_name>/
├── <object>_definition.rb          # Domain definition & parameter validation
├── <object>_repository.rb          # Persistence mapping to Smart Object attributes
├── <object>_geometry.rb            # Deterministic SketchUp geometry creation
├── registration.rb                 # MANIFEST & primary install(runtime) entrypoint
├── representation_registration.rb  # Plan / 3D / detail representation integration
├── plan_representation_provider.rb # 2D plan graphic provider
├── tools/                          # Interactive SketchUp UI tools (Tool subclass)
│   └── <object>_tool.rb
├── validators/                     # Semantic rule validators
│   └── <object>_validator.rb
└── quantity/                       # Normalized quantity calculation provider
    └── <object>_quantity_provider.rb
```

## 3. Contract Rules

1. **Manifest Declaration**:
   Every module must declare a frozen `MANIFEST` containing `id`, `name`, `version`, `schema_version`, `requires`, `provides`, `objects`, `commands`, `events`, and `providers`.

2. **No Direct Mutation of Other Modules**:
   Module A must never write directly to Module B's attribute store or repository. All inter-module communication must use commands, capabilities, or events.

3. **Normalized Quantity Records**:
   Quantity providers must return normalized hashes with `quantity_id`, `category`, `unit`, and `quantity` fields.

4. **Independent Testability**:
   Definitions, repositories, validators, and quantity calculators must be testable in pure Ruby without requiring SketchUp GUI initialization.
