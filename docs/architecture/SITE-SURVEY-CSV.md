# Site Survey CSV Import

The project menu imports surveyed points from CSV into the project-level `site_survey` record. Coordinates are converted to canonical millimetres. The import keeps each point's measured/assumed status and source reference; it does not infer accuracy or convert assumed coordinates into field measurements.

## Required columns

```csv
id,name,x,y,elevation,source_status,source_reference,boundary_id,boundary_name,units,coordinate_system
P1,North west,0,0,1.20,measured,Field book 12 station A,LOT-9,Parcel,m,local-grid-01
P2,North east,10,0,1.22,measured,Field book 12 station B,LOT-9,Parcel,m,local-grid-01
P3,South east,10,8,,assumed,Deed sketch estimate,LOT-9,Parcel,m,local-grid-01
```

`id`, `name`, `x`, `y`, `source_status`, `source_reference`, `units`, and `coordinate_system` are required for every point. `elevation` is optional. `boundary_id` and `boundary_name` are optional; points with the same boundary ID form one ordered boundary in file row order. A boundary must contain at least three distinct points.

Units must be consistent for the whole file and may be `mm`, `cm`, or `m`. The coordinate-system value must also be consistent for the whole file and should identify the actual survey grid or reference system. `source_status` is exactly `measured` or `assumed`; `source_reference` should name the field-book entry, deed sketch, or other source for that point.

Import uses `UpdateSiteSurvey`, so the full survey update participates in project undo/redo and `.cfproj` save/reopen. Importing a replacement CSV replaces the project's current survey record as one command.
